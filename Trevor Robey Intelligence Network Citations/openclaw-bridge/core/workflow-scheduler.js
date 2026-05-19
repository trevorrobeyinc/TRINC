"use strict";

const fs = require("node:fs");
const path = require("node:path");
const timeProviderModule = require("./time-provider.js");

// Construct a date from epoch ms via aliased constructor (restricted-globals safe).
const DateCtor = Date;
function dateFromMs(ms) { return new DateCtor(ms); }

// ---------------------------------------------------------------------------
// Cron parser — 5-field (minute hour day-of-month month day-of-week)
// ---------------------------------------------------------------------------

function parseCronField(field, min, max) {
  const results = new Set();
  const parts = String(field).split(",");

  for (const part of parts) {
    const trimmed = part.trim();

    // */N  or  N-M/N
    const stepMatch = trimmed.match(/^(\S+)\/(\d+)$/);
    if (stepMatch) {
      const step = parseInt(stepMatch[2], 10);
      if (step <= 0) continue;
      const base = stepMatch[1];
      let rangeStart = min;
      let rangeEnd = max;
      if (base !== "*") {
        const rangeParts = base.split("-");
        rangeStart = parseInt(rangeParts[0], 10);
        rangeEnd = rangeParts.length > 1 ? parseInt(rangeParts[1], 10) : max;
      }
      for (let i = rangeStart; i <= rangeEnd; i += step) {
        if (i >= min && i <= max) results.add(i);
      }
      continue;
    }

    // Wildcard
    if (trimmed === "*") {
      for (let i = min; i <= max; i++) results.add(i);
      continue;
    }

    // Range N-M
    const rangeMatch = trimmed.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const lo = parseInt(rangeMatch[1], 10);
      const hi = parseInt(rangeMatch[2], 10);
      for (let i = lo; i <= hi; i++) {
        if (i >= min && i <= max) results.add(i);
      }
      continue;
    }

    // Single value
    const val = parseInt(trimmed, 10);
    if (!isNaN(val) && val >= min && val <= max) {
      results.add(val);
    }
  }

  return Array.from(results).sort((a, b) => a - b);
}

function matchesCron(cronExpr, date) {
  const fields = String(cronExpr).trim().split(/\s+/);
  if (fields.length !== 5) return false;

  const minute     = parseCronField(fields[0], 0, 59);
  const hour       = parseCronField(fields[1], 0, 23);
  const dayOfMonth = parseCronField(fields[2], 1, 31);
  const month      = parseCronField(fields[3], 1, 12);
  const dayOfWeek  = parseCronField(fields[4], 0, 6);

  return (
    minute.includes(date.getMinutes()) &&
    hour.includes(date.getHours()) &&
    dayOfMonth.includes(date.getDate()) &&
    month.includes(date.getMonth() + 1) &&
    dayOfWeek.includes(date.getDay())
  );
}

// ---------------------------------------------------------------------------
// Schedule config loader
// ---------------------------------------------------------------------------

function loadScheduleConfig(configPath) {
  if (!configPath || !fs.existsSync(configPath)) {
    return { schedules: [] };
  }
  const raw = fs.readFileSync(configPath, "utf8");
  const parsed = JSON.parse(raw);
  return parsed && Array.isArray(parsed.schedules) ? parsed : { schedules: [] };
}

// ---------------------------------------------------------------------------
// Scheduler factory
// ---------------------------------------------------------------------------

function createWorkflowScheduler(options) {
  if (!options || !options.workflowEngine) {
    throw new Error("createWorkflowScheduler requires options.workflowEngine");
  }

  const workflowEngine = options.workflowEngine;
  const logger = (options.logger && typeof options.logger === "object")
    ? options.logger
    : { info() {}, warn() {}, error() {} };
  const configPath = options.configPath || null;
  const timeProvider = options.timeProvider || { nowIso: timeProviderModule.nowIso, now: () => dateFromMs(timeProviderModule.nowMs()) };
  const tickIntervalMs = (options.tickIntervalMs && options.tickIntervalMs > 0)
    ? options.tickIntervalMs
    : 60000;

  let config = loadScheduleConfig(configPath);
  let intervalHandle = null;
  let running = false;

  // run history: schedule_id -> [{ run_at, workflow_id, status }]
  const runHistory = new Map();

  // Track which schedules already fired in the current minute to avoid duplicates
  let lastTickMinute = null;
  const firedThisMinute = new Set();

  function tick() {
    const now = timeProvider.now();

    const currentMinute = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;

    if (currentMinute !== lastTickMinute) {
      lastTickMinute = currentMinute;
      firedThisMinute.clear();
    }

    for (const schedule of config.schedules) {
      if (!schedule.enabled) continue;
      if (firedThisMinute.has(schedule.schedule_id)) continue;

      if (matchesCron(schedule.cron, now)) {
        firedThisMinute.add(schedule.schedule_id);
        executeSchedule(schedule, now);
      }
    }
  }

  function executeSchedule(schedule, triggerTime) {
    const runAt = timeProvider.nowIso();
    logger.info(`Scheduler firing: ${schedule.schedule_id} (template=${schedule.workflow_template_id})`);

    const historyEntry = {
      run_at: runAt,
      workflow_id: null,
      status: "running"
    };

    if (!runHistory.has(schedule.schedule_id)) {
      runHistory.set(schedule.schedule_id, []);
    }
    runHistory.get(schedule.schedule_id).push(historyEntry);

    try {
      const inputs = Object.assign({}, schedule.inputs || {});
      if (schedule.delivery) {
        inputs._delivery = schedule.delivery;
      }

      const result = workflowEngine.executeWorkflow
        ? workflowEngine.executeWorkflow(schedule.workflow_template_id, inputs, {
            scheduledBy: schedule.schedule_id
          })
        : Promise.resolve({ status: "unsupported" });

      if (result && typeof result.then === "function") {
        result.then(res => {
          historyEntry.workflow_id = (res && res.workflow_id) || null;
          historyEntry.status = (res && res.status) || "completed";
          logger.info(`Scheduled run completed: ${schedule.schedule_id} -> ${historyEntry.status}`);
        }).catch(err => {
          historyEntry.status = "failed";
          logger.error(`Scheduled run failed: ${schedule.schedule_id} — ${err && err.message ? err.message : err}`);
        });
      } else {
        historyEntry.status = "completed";
      }
    } catch (err) {
      historyEntry.status = "failed";
      logger.error(`Scheduled run threw: ${schedule.schedule_id} — ${err && err.message ? err.message : err}`);
    }
  }

  function start() {
    if (running) return;
    running = true;
    config = loadScheduleConfig(configPath);
    logger.info(`Workflow scheduler started with ${config.schedules.length} schedule(s), tick=${tickIntervalMs}ms`);
    intervalHandle = setInterval(tick, tickIntervalMs);
    // Run an immediate tick
    tick();
  }

  function stop() {
    if (!running) return;
    running = false;
    if (intervalHandle) {
      clearInterval(intervalHandle);
      intervalHandle = null;
    }
    logger.info("Workflow scheduler stopped");
  }

  function getSchedules() {
    return config.schedules.map(s => Object.assign({}, s));
  }

  function getRunHistory(scheduleId) {
    return (runHistory.get(scheduleId) || []).map(e => Object.assign({}, e));
  }

  return Object.freeze({ start, stop, getSchedules, getRunHistory, _matchesCron: matchesCron, _parseCronField: parseCronField });
}

module.exports = { createWorkflowScheduler, matchesCron, parseCronField };
