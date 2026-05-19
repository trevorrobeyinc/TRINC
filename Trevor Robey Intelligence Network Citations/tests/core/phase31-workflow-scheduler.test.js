"use strict";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { createWorkflowScheduler, matchesCron, parseCronField } = require("../../openclaw-bridge/core/workflow-scheduler.js");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockWorkflowEngine() {
  return {
    executeWorkflow: async (_templateId, _inputs, _ctx) => ({
      ok: true,
      workflow_id: "wf-sched-test",
      status: "completed"
    })
  };
}

function writeTempScheduleConfig(schedules) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "phase31-sched-"));
  const configPath = path.join(tmpDir, "scheduled-workflows.json");
  fs.writeFileSync(configPath, JSON.stringify({ schedules }), "utf8");
  return { tmpDir, configPath };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Phase 31 — Workflow Scheduler", () => {
  let tmpDir = null;

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  // ------------------------------------------------------------------
  // Factory
  // ------------------------------------------------------------------

  describe("createWorkflowScheduler", () => {
    it("creates scheduler with expected methods", () => {
      const { configPath, tmpDir: td } = writeTempScheduleConfig([]);
      tmpDir = td;

      const scheduler = createWorkflowScheduler({
        workflowEngine: createMockWorkflowEngine(),
        configPath
      });

      assert.equal(typeof scheduler.start, "function");
      assert.equal(typeof scheduler.stop, "function");
      assert.equal(typeof scheduler.getSchedules, "function");
      assert.equal(typeof scheduler.getRunHistory, "function");
    });

    it("rejects missing workflowEngine", () => {
      assert.throws(
        () => createWorkflowScheduler({}),
        { message: /requires options\.workflowEngine/ }
      );
    });

    it("rejects undefined options", () => {
      assert.throws(
        () => createWorkflowScheduler(),
        { message: /requires options\.workflowEngine/ }
      );
    });
  });

  // ------------------------------------------------------------------
  // getSchedules
  // ------------------------------------------------------------------

  describe("getSchedules", () => {
    it("returns loaded schedule config", () => {
      const schedules = [
        { schedule_id: "sched-1", cron: "0 9 * * 1", workflow_template_id: "weekly-report", enabled: true },
        { schedule_id: "sched-2", cron: "0 0 1 * *", workflow_template_id: "monthly-audit", enabled: false }
      ];
      const { configPath, tmpDir: td } = writeTempScheduleConfig(schedules);
      tmpDir = td;

      const scheduler = createWorkflowScheduler({
        workflowEngine: createMockWorkflowEngine(),
        configPath
      });

      const loaded = scheduler.getSchedules();
      assert.equal(loaded.length, 2);
      assert.equal(loaded[0].schedule_id, "sched-1");
      assert.equal(loaded[1].schedule_id, "sched-2");
    });

    it("returns empty array when config file missing", () => {
      const scheduler = createWorkflowScheduler({
        workflowEngine: createMockWorkflowEngine(),
        configPath: "/tmp/nonexistent-config-phase31.json"
      });
      assert.deepEqual(scheduler.getSchedules(), []);
    });
  });

  // ------------------------------------------------------------------
  // Cron parser
  // ------------------------------------------------------------------

  describe("matchesCron", () => {
    it("matches '* * * * *' for any date", () => {
      const now = new Date(2026, 2, 30, 14, 30, 0); // 2026-03-30 14:30
      assert.equal(matchesCron("* * * * *", now), true);
    });

    it("matches '* * * * *' for midnight Jan 1", () => {
      const midnight = new Date(2026, 0, 1, 0, 0, 0);
      assert.equal(matchesCron("* * * * *", midnight), true);
    });

    it("correctly rejects non-matching cron", () => {
      // 2026-03-30 is a Monday (day 1), hour 14, minute 30
      const now = new Date(2026, 2, 30, 14, 30, 0);
      // Cron: minute=0, hour=3, any day, any month, any weekday
      assert.equal(matchesCron("0 3 * * *", now), false);
    });

    it("matches specific minute and hour", () => {
      const date = new Date(2026, 2, 30, 9, 0, 0); // Monday 09:00
      assert.equal(matchesCron("0 9 * * *", date), true);
    });

    it("rejects invalid cron with wrong field count", () => {
      const now = new Date();
      assert.equal(matchesCron("* * *", now), false);
    });
  });

  describe("parseCronField", () => {
    it("parses wildcard", () => {
      const result = parseCronField("*", 0, 59);
      assert.equal(result.length, 60);
      assert.equal(result[0], 0);
      assert.equal(result[59], 59);
    });

    it("parses step syntax", () => {
      const result = parseCronField("*/15", 0, 59);
      assert.deepEqual(result, [0, 15, 30, 45]);
    });

    it("parses range", () => {
      const result = parseCronField("1-5", 0, 6);
      assert.deepEqual(result, [1, 2, 3, 4, 5]);
    });

    it("parses single value", () => {
      const result = parseCronField("30", 0, 59);
      assert.deepEqual(result, [30]);
    });
  });

  // ------------------------------------------------------------------
  // start / stop
  // ------------------------------------------------------------------

  describe("start and stop", () => {
    it("start and stop do not throw", () => {
      const { configPath, tmpDir: td } = writeTempScheduleConfig([]);
      tmpDir = td;

      const scheduler = createWorkflowScheduler({
        workflowEngine: createMockWorkflowEngine(),
        configPath,
        tickIntervalMs: 600000 // long interval so it won't fire during test
      });

      assert.doesNotThrow(() => scheduler.start());
      assert.doesNotThrow(() => scheduler.stop());
    });

    it("double start and double stop are safe", () => {
      const { configPath, tmpDir: td } = writeTempScheduleConfig([]);
      tmpDir = td;

      const scheduler = createWorkflowScheduler({
        workflowEngine: createMockWorkflowEngine(),
        configPath,
        tickIntervalMs: 600000
      });

      scheduler.start();
      assert.doesNotThrow(() => scheduler.start()); // idempotent
      scheduler.stop();
      assert.doesNotThrow(() => scheduler.stop()); // idempotent
    });
  });
});
