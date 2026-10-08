"use strict";

// The orchestrator's time guards must nest, so a watchdog can never kill a healthy slow call.
//
// Found by the fifth real run (2026-10-08, the first with the research runtime on a real clock): the mission
// was paused with PHASE18_MISSION_STALLED exactly 120.06 s after a role call was dispatched, while that call
// was healthy and still working. The orchestrator measures its stall watchdog and its runtime cap with
// `nowMs()`, which reads the injected clock; until the research root was given a real clock that clock was frozen
// at 0 in production, so `currentMs - lastProgressAtMs` was always 0 and BOTH guards were dead code. The configured
// stallIntervalMs of 120000 had therefore never met a real model call (60-300 s per role call; the first call of
// run #5 took 115 s, the second ran past 120 s and was cut off).
//
// The four numbers form a ladder, innermost first, and each rung must outlast the one inside it:
//   model call (llm-providers.json claude-code.executionTimeoutMs)  - one `claude -p` process
//   defaultSubtaskTimeoutMs                                         - one subtask, which wraps a model call
//   stallIntervalMs                                                 - no subtask has FINISHED while work is queued
//   maxRuntimeMs                                                    - the whole mission
// A stall interval shorter than a subtask's own timeout makes that timeout meaningless and kills runs that are
// merely slow. 0 means "guard off" for the last three (the orchestrator treats it so).

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const spawner = JSON.parse(fs.readFileSync(path.join(ROOT, "config", "agent-spawner.json"), "utf8"));
const providers = JSON.parse(fs.readFileSync(path.join(ROOT, "config", "llm-providers.json"), "utf8"));

const { maxRuntimeMs, defaultSubtaskTimeoutMs, stallIntervalMs } = spawner.missionExecution;
const modelCallTimeoutMs = (providers.providers || providers)["claude-code"].executionTimeoutMs;
const minutes = (ms) => `${(ms / 60000).toFixed(1)} min`;
const ladder = `model call ${minutes(modelCallTimeoutMs)}, subtask ${minutes(defaultSubtaskTimeoutMs)}, stall ${minutes(stallIntervalMs)}, mission ${minutes(maxRuntimeMs)}`;

describe("mission execution guards nest, innermost first", () => {
  it("reads real values (so the ordering checks below cannot pass on missing keys)", () => {
    for (const [name, value] of Object.entries({ modelCallTimeoutMs, defaultSubtaskTimeoutMs, stallIntervalMs, maxRuntimeMs })) {
      assert.ok(Number.isFinite(value) && value >= 0, `${name} must be a non-negative number, got ${value}`);
    }
  });

  it("a subtask's timeout covers the model call it wraps", () => {
    assert.ok(defaultSubtaskTimeoutMs >= modelCallTimeoutMs, `the subtask would time out before its model call can: ${ladder}`);
  });

  it("the stall watchdog fires only after a subtask's own timeout (or is off)", () => {
    assert.ok(
      stallIntervalMs === 0 || stallIntervalMs > defaultSubtaskTimeoutMs,
      `a stall interval below the subtask timeout kills healthy slow role calls (run #5 was cut off at 120 s): ${ladder}`
    );
  });

  it("the mission runtime cap outlasts the stall watchdog (or one of them is off)", () => {
    assert.ok(
      maxRuntimeMs === 0 || stallIntervalMs === 0 || maxRuntimeMs > stallIntervalMs,
      `the stall watchdog could never fire before the mission cap: ${ladder}`
    );
  });

  it("the stall watchdog outlasts the longest role call the engine documents (5 minutes)", () => {
    assert.ok(stallIntervalMs === 0 || stallIntervalMs > 5 * 60 * 1000, `${ladder}`);
  });
});
