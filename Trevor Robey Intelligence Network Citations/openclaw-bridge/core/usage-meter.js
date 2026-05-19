"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { z } = require("zod");
const timeProviderModule = require("./time-provider.js");

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const UsageEntrySchema = z.object({
  api_key: z.string().min(1),
  workflow_id: z.string().min(1),
  template_id: z.string().min(1),
  tool_calls: z.number().int().min(0),
  tokens_used: z.number().int().min(0),
  duration_ms: z.number().int().min(0)
});

const DateRangeSchema = z.object({
  start: z.string().regex(/^\d{4}-\d{2}$/),
  end: z.string().regex(/^\d{4}-\d{2}$/)
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function usageDir(stateDir, apiKey) {
  return path.join(stateDir, "usage", apiKey);
}

function usageFilePath(stateDir, apiKey, month) {
  return path.join(usageDir(stateDir, apiKey), `${month}.jsonl`);
}

function monthsBetween(start, end) {
  const months = [];
  const [sy, sm] = start.split("-").map(Number);
  const [ey, em] = end.split("-").map(Number);
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return months;
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, "utf8").split("\n").filter(l => l.trim());
  const records = [];
  for (const line of lines) {
    try {
      records.push(JSON.parse(line));
    } catch (_) {
      // skip malformed lines
    }
  }
  return records;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

function createUsageMeter(options) {
  if (!options || !options.stateDir) {
    throw new Error("createUsageMeter requires options.stateDir");
  }

  const stateDir = options.stateDir;
  const logger = (options.logger && typeof options.logger === "object")
    ? options.logger
    : { info() {}, warn() {}, error() {} };
  const timeProvider = options.timeProvider || timeProviderModule;

  function recordUsage(entry) {
    const parsed = UsageEntrySchema.safeParse(entry);
    if (!parsed.success) {
      const issues = parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new Error(`Invalid usage entry: ${issues}`);
    }

    const data = parsed.data;
    const timestamp = timeProvider.nowIso();
    const month = timestamp.slice(0, 7); // yyyy-mm

    const dir = usageDir(stateDir, data.api_key);
    ensureDir(dir);

    const record = Object.assign({ timestamp }, data);
    const filePath = usageFilePath(stateDir, data.api_key, month);
    fs.appendFileSync(filePath, JSON.stringify(record) + "\n", "utf8");

    logger.info(`Usage recorded: ${data.api_key} workflow=${data.workflow_id}`);
    return record;
  }

  function getUsage(apiKey, dateRange) {
    const rangeParsed = DateRangeSchema.safeParse(dateRange);
    if (!rangeParsed.success) {
      throw new Error("Invalid date range — expected { start: 'YYYY-MM', end: 'YYYY-MM' }");
    }

    const months = monthsBetween(rangeParsed.data.start, rangeParsed.data.end);
    const records = [];
    for (const month of months) {
      const fp = usageFilePath(stateDir, apiKey, month);
      records.push(...readJsonl(fp));
    }
    return records;
  }

  function exportBillingReport(apiKey, month) {
    if (!/^\d{4}-\d{2}$/.test(month)) {
      throw new Error("Invalid month — expected 'YYYY-MM'");
    }

    const records = readJsonl(usageFilePath(stateDir, apiKey, month));
    let totalToolCalls = 0;
    let totalTokens = 0;
    let totalDurationMs = 0;

    for (const r of records) {
      totalToolCalls += (r.tool_calls || 0);
      totalTokens += (r.tokens_used || 0);
      totalDurationMs += (r.duration_ms || 0);
    }

    return {
      api_key: apiKey,
      month,
      total_workflows: records.length,
      total_tool_calls: totalToolCalls,
      total_tokens: totalTokens,
      total_duration_ms: totalDurationMs,
      records
    };
  }

  return Object.freeze({ recordUsage, getUsage, exportBillingReport });
}

module.exports = { createUsageMeter };
