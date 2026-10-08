"use strict";

// Overlapping runtime-state writers must not lose each other's updates. Found 2026-10-08 while
// verifying a different change: `phase18 agent spawner ... single index` failed once in a full-suite
// run (a stale open loop, `1 !== 0`) and never in 80 isolated runs, because the cause is an
// interleaving, not a timing threshold.
//
// registerOpenLoop / resolveOpenLoop / upsertMissionRuntime / appendRecentDecision are each
// load -> mutate -> save on ONE json file. The temp-file + rename in writeRuntimeStateFile keeps the
// file from tearing, but it cannot stop two cycles from loading the same old state: both write, the
// later rename wins, and the other writer's change is gone. In the engine the overlap is real: the
// orchestrator resolves a subtask's open loop while the spawner upserts the mission's status, and
// independent subtasks in parallel lanes resolve their loops at the same moment.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const store = require("../../openclaw-bridge/state/persistent-store.js");

function freshStatePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "runtime-state-race-"));
  return path.join(dir, "state", "runtime", "state.json");
}

describe("runtime state - overlapping writers lose nothing", () => {
  it("keeps every open loop when many are registered at once", async () => {
    const opts = { path: freshStatePath() };
    const ids = Array.from({ length: 25 }, (_, i) => `sub-${String(i).padStart(2, "0")}`);
    await Promise.all(ids.map((loopId) => store.registerOpenLoop({ loopId, missionId: "m" }, opts)));
    const { state } = await store.loadRuntimeState(opts);
    assert.deepEqual(state.openLoops.map((l) => l.loopId), ids);
  });

  it("resolves both loops when two subtasks finish together (parallel lanes)", async () => {
    const opts = { path: freshStatePath() };
    await store.registerOpenLoop({ loopId: "sub-a", missionId: "m" }, opts);
    await store.registerOpenLoop({ loopId: "sub-b", missionId: "m" }, opts);
    await Promise.all([store.resolveOpenLoop("sub-a", opts), store.resolveOpenLoop("sub-b", opts)]);
    const { state } = await store.loadRuntimeState(opts);
    assert.deepEqual(state.openLoops, []);
  });

  it("neither strands a loop nor drops the mission record when a resolve overlaps a mission upsert", async () => {
    // The orchestrator's final resolveOpenLoop and the spawner's completed-status upsert.
    const opts = { path: freshStatePath() };
    await store.registerOpenLoop({ loopId: "sub-a", missionId: "m" }, opts);
    await Promise.all([
      store.resolveOpenLoop("sub-a", opts),
      store.upsertMissionRuntime({ mission_id: "m", status: "completed" }, opts)
    ]);
    const { state } = await store.loadRuntimeState(opts);
    assert.deepEqual(state.openLoops, []);
    assert.equal(state.missions.m.status, "completed");
  });

  it("gives concurrent recent-decision appends distinct sequence numbers", async () => {
    // The next sequence is derived from the state just loaded, so two overlapping appends used to both
    // take the same number (and one entry disappeared).
    const opts = { path: freshStatePath() };
    await Promise.all(Array.from({ length: 10 }, (_, i) => store.appendRecentDecision({ type: "t", result: `r${i}` }, opts)));
    const { state } = await store.loadRuntimeState(opts);
    assert.deepEqual(state.recentDecisions.map((d) => d.sequence), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("is not stalled by a writer that fails: the next one still runs", async () => {
    const opts = { path: freshStatePath() };
    fs.mkdirSync(path.dirname(opts.path), { recursive: true });
    fs.writeFileSync(opts.path, "{ this is not json");
    const outcomes = await Promise.allSettled([
      store.registerOpenLoop({ loopId: "sub-a", missionId: "m" }, opts),
      store.resolveOpenLoop("sub-a", opts)
    ]);
    assert.deepEqual(outcomes.map((o) => o.status), ["rejected", "rejected"]);
    assert.ok(outcomes.every((o) => o.reason && o.reason.code === "PHASE17_RUNTIME_STATE_CORRUPTED"));
    fs.rmSync(opts.path);
    await store.registerOpenLoop({ loopId: "sub-b", missionId: "m" }, opts);
    const { state } = await store.loadRuntimeState(opts);
    assert.deepEqual(state.openLoops.map((l) => l.loopId), ["sub-b"]);
  });

  it("leaves writers to different files independent of each other", async () => {
    const a = { path: freshStatePath() };
    const b = { path: freshStatePath() };
    await Promise.all([
      store.registerOpenLoop({ loopId: "only-in-a", missionId: "m" }, a),
      store.registerOpenLoop({ loopId: "only-in-b", missionId: "m" }, b)
    ]);
    assert.deepEqual((await store.loadRuntimeState(a)).state.openLoops.map((l) => l.loopId), ["only-in-a"]);
    assert.deepEqual((await store.loadRuntimeState(b)).state.openLoops.map((l) => l.loopId), ["only-in-b"]);
  });

  it("still behaves exactly as before when calls do not overlap", async () => {
    const opts = { path: freshStatePath() };
    await store.registerOpenLoop({ loopId: "sub-a", missionId: "m" }, opts);
    const resolved = await store.resolveOpenLoop("sub-a", opts);
    assert.deepEqual(resolved, { ok: true, resolved: true, loopId: "sub-a" });
    const again = await store.resolveOpenLoop("sub-a", opts);
    assert.equal(again.resolved, false);
    const record = await store.upsertMissionRuntime({ mission_id: "m", status: "running" }, opts);
    assert.equal(record.status, "running");
    assert.equal((await store.loadMissionRuntime("m", opts)).status, "running");
  });
});
