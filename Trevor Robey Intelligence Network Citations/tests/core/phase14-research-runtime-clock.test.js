"use strict";

// The research runtime must hand its components a real clock. Found 2026-10-08.
//
// `scripts/run-workflow.js` builds the runtime as `buildWorkflowRuntime({ logger })`, and the legacy
// lane (`scripts/run-research-task.js`) as `buildPhase14Runtime({ config })` - neither passes a
// `timeProvider`, so `buildResearchRuntime` handed `undefined` to the ten components it builds, and
// each fell back to its own default clock: a FROZEN epoch, `1970-01-01T00:00:00.000Z` / `nowMs() = 0`.
// That default exists so unit tests stay deterministic; in production it meant:
//
//   1. `supervisor-authority.js` fed `nowMs() = 0` to its circuit breaker. A breaker that trips after
//      three failures half-opens only when `now - lastTransitionAt >= timeout`; with a clock stuck at 0
//      that is never true, so once OPEN it stayed OPEN for the life of the process (reproduced
//      2026-10-08 against the real modules). The retry instant it reported was 30 s past the epoch -
//      a time that cannot arrive.
//   2. Every stamp the runtime writes internally was 1970: supervisor decisions, task metadata,
//      mission checkpoints, agent inboxes, lane-queue events - and the live interaction log carried
//      `timestamp: 1970-01-01` with `duration_ms: 0` on 11 of 11 entries, which is the field the
//      throttling diagnostic in CLAUDE.md reads.
//
// Nothing here ships in a customer bundle (`phase30-customer-visible-clock.test.js` covers that), and
// today nothing on the production path calls `runApprovedTask` more than once per process, so the
// breaker could not actually trip - the defect was latent. The first test builds the runtime the way
// production does (no clock) and asserts the clock it hands the supervisor moves; the second pins the
// recovery lifecycle the fix relies on, with an injected clock, because waiting the real 30 s timeout
// has no place in the suite.

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const os = require("node:os");
const fsp = require("node:fs/promises");

const { buildResearchRuntime } = require("../../scripts/_research-runtime.js");
const { createSupervisorAuthority } = require("../../openclaw-bridge/core/supervisor-authority.js");
const { createMutableTimeProvider } = require("./_phase14-helpers.js");

const EPOCH_ISO = "1970-01-01T00:00:00.000Z";
const BREAKER_OPEN = "PHASE14_SUPERVISOR_BREAKER_OPEN";

async function buildProductionShapedRuntime() {
  // Mirrors the production roots: NO timeProvider. Only the write paths are redirected to a tmpdir;
  // config reads stay on the real rootDir (see phase18-runtime-compat.test.js for why).
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "openclaw-phase14-clock-"));
  await fsp.mkdir(path.join(dir, "input"));
  await fsp.mkdir(path.join(dir, "output"));
  return buildResearchRuntime({
    config: {
      inputDir: path.join(dir, "input"),
      outputDir: path.join(dir, "output"),
      interactionLogPath: path.join(dir, "interaction-log.json"),
      provider: "mock",
      model: "mock-v1"
    },
    spawnerConfig: {
      missionWorkspaceDir: path.join(dir, "missions"),
      runtimeStatePath: path.join(dir, "runtime", "state.json")
    }
  });
}

test("phase14 research runtime built without a clock hands the supervisor a moving one: decisions are dated, and a tripped breaker's retry instant lies in the future", async () => {
  const startedMs = Date.now();
  const runtime = await buildProductionShapedRuntime();
  const supervisor = runtime.supervisorAuthority;

  const task = { task_id: "task-clock-probe", description: "clock probe", type: "freeform" };
  const decision = await supervisor.requestApproval(task, { confirm: true, operatorId: "op" });
  assert.equal(decision.approved, true);

  // Trip the breaker. An envelope with an unknown task type makes the real engine's validation throw
  // inside the execute handler, which the supervisor records as a failure; the runtime configures
  // failureThreshold 3, so the fourth call is refused at the gate before the handler runs.
  const badEnvelope = { task_id: "task-clock-probe", description: "clock probe", type: "not-a-task-type" };
  for (let i = 0; i < 3; i += 1) {
    await assert.rejects(
      () => supervisor.runApprovedTask(badEnvelope, { supervisorDecision: decision, confirm: true }),
      (error) => Boolean(error) && error.code !== BREAKER_OPEN
    );
  }
  let refused = null;
  await assert.rejects(
    () => supervisor.runApprovedTask(badEnvelope, { supervisorDecision: decision, confirm: true }),
    (error) => {
      refused = error;
      return Boolean(error) && error.code === BREAKER_OPEN;
    }
  );
  assert.equal(supervisor.getStatus().breaker.state, "OPEN");

  const nextRetryAt = Number(refused.details && refused.details.next_retry_at);
  assert.ok(
    nextRetryAt > startedMs,
    `next_retry_at must be a real future instant so the breaker can half-open; got ${nextRetryAt} (${new Date(nextRetryAt).toISOString()})`
  );

  // The same frozen default dated the approval itself.
  assert.notEqual(decision.timestamp, EPOCH_ISO, "a supervisor decision must carry the real time, not the epoch default");
  assert.ok(Date.parse(decision.timestamp) >= startedMs - 1000, `decision timestamp ${decision.timestamp} predates this test`);
});

test("phase14 supervisor breaker recovers once the clock passes the timeout: OPEN -> HALF_OPEN on the next request, CLOSED after a success", async () => {
  const timeProvider = createMutableTimeProvider();
  let failing = true;
  const supervisor = createSupervisorAuthority({
    timeProvider,
    supervisorConfig: { failureThreshold: 3, successThreshold: 1, timeoutMs: 30000 },
    executeHandler: async () => {
      if (failing) {
        const error = new Error("forced failure");
        error.code = "FORCED_FAILURE";
        throw error;
      }
      return { ok: true };
    }
  });
  await supervisor.initialize();

  const task = { task_id: "task-recovery", description: "recovery", type: "freeform" };
  const decision = await supervisor.requestApproval(task, { confirm: true, operatorId: "op" });
  const context = { supervisorDecision: decision, confirm: true };

  for (let i = 0; i < 3; i += 1) {
    await assert.rejects(() => supervisor.runApprovedTask(task, context), (error) => error.code === "FORCED_FAILURE");
  }
  await assert.rejects(() => supervisor.runApprovedTask(task, context), (error) => error.code === BREAKER_OPEN);
  assert.equal(supervisor.getStatus().breaker.state, "OPEN");

  // Still inside the timeout: refused. Past it: the next request is admitted as the half-open probe,
  // and one success (successThreshold 1) closes the breaker again.
  timeProvider.advanceMs(29999);
  await assert.rejects(() => supervisor.runApprovedTask(task, context), (error) => error.code === BREAKER_OPEN);
  timeProvider.advanceMs(1);
  failing = false;
  const result = await supervisor.runApprovedTask(task, context);
  assert.equal(result.ok, true);
  assert.equal(supervisor.getStatus().breaker.state, "CLOSED");
});
