"use strict";

// Regression coverage for the operator-approve wire (2026-06-10).
// Two halves of the contract:
//   1. role-router gate: execute_task is blocked unless context.operatorApproved === true.
//      Default-off / fail-closed must hold; the gate is NOT weakened.
//   2. workflow-engine threading: the CLI's --operator-approve (context.operatorApproved)
//      is forwarded into spawnMission's options so it reaches the dispatch context.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const fs = require("node:fs");
const path = require("node:path");

const { createRoleRouter } = require("../../openclaw-bridge/core/role-router.js");
const { createWorkflowEngine } = require("../../openclaw-bridge/core/workflow-engine.js");

function makeMockLogger() {
  const logs = [];
  return {
    info(data) { logs.push({ level: "info", data }); },
    warn(data) { logs.push({ level: "warn", data }); },
    error(data) { logs.push({ level: "error", data }); },
    logs
  };
}

function makeRouter() {
  // Mimics the real autonomy ladder for a research role: execute_task always
  // requires human approval (matches config/autonomy-ladder.json scout/analyst/etc.).
  const autonomyLadder = {
    canRolePerform: () => true,
    requireHumanApproval: (_role, action) => action === "execute_task"
  };
  const registry = {
    getRole: () => async () => ({ ran: true }),
    getAgent: () => null
  };
  // rootDir is isolated on purpose: role-router builds a session recorder rooted here, and the
  // default is process.cwd() — which for `npm test` is the repo root, so an allow-case dispatch
  // would write a session record into the LIVE config/agents/<role>/sessions/.
  return createRoleRouter({
    registry,
    autonomyLadder,
    logger: makeMockLogger(),
    rootDir: fs.mkdtempSync(path.join(os.tmpdir(), "phase30-opapprove-router-"))
  });
}

describe("operator-approve — role-router gate (fail-closed)", () => {
  const envelope = { role: "scout", actionType: "execute_task" };
  const baseContext = { supervisorDecision: { approved: true } };

  it("BLOCKS execute_task when operatorApproved is absent (default)", async () => {
    const router = makeRouter();
    await assert.rejects(
      () => router.dispatch(envelope, { ...baseContext }),
      (err) => err.code === "PHASE15_HUMAN_APPROVAL_REQUIRED"
    );
  });

  it("BLOCKS execute_task when operatorApproved is explicitly false", async () => {
    const router = makeRouter();
    await assert.rejects(
      () => router.dispatch(envelope, { ...baseContext, operatorApproved: false }),
      (err) => err.code === "PHASE15_HUMAN_APPROVAL_REQUIRED"
    );
  });

  it("PERMITS execute_task only when operatorApproved === true", async () => {
    const router = makeRouter();
    const result = await router.dispatch(envelope, { ...baseContext, operatorApproved: true });
    assert.equal(result.result.ran, true);
  });
});

function makeMockResearchRuntime(spawnMission) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "phase30-opapprove-"));
  fs.mkdirSync(path.join(tmpDir, "workspace", "workflows"), { recursive: true });
  return {
    rootDir: tmpDir,
    config: { defaultProvider: "mock", defaultModel: "mock-model" },
    agentSpawner: { spawnMission }
  };
}

function makeMockMonetizationRuntime() {
  return { offerBuilder: { buildOffer() { return { ok: true, offer: { offer_id: "o-1" }, source_context: {} }; } } };
}

function singleMissionWorkflow() {
  return {
    schema_version: "phase30-workflow-v1",
    workflow_template_id: "wf-opapprove-test",
    name: "Operator Approve Threading Test",
    auto_approve: true,
    pipeline: [
      { step_id: "step_research", type: "mission", mission_template_id: "biomedical_drug_discovery", depends_on: [] }
    ]
  };
}

describe("operator-approve — workflow-engine threading", () => {
  it("forwards operatorApproved:true into spawnMission options + logs the grant", async () => {
    let captured = null;
    const logger = makeMockLogger();
    const engine = createWorkflowEngine({
      researchRuntime: makeMockResearchRuntime(async (_env, opts) => { captured = opts; return { ok: true, subtask_results: [] }; }),
      monetizationRuntime: makeMockMonetizationRuntime(),
      logger
    });

    await engine.executeWorkflow(singleMissionWorkflow(), { inputs: {}, operatorApproved: true });

    assert.equal(captured.operatorApproved, true);
    assert.ok(
      logger.logs.some((l) => l.data && l.data.event === "phase15_operator_approval_granted"),
      "expected phase15_operator_approval_granted audit log"
    );
  });

  it("passes operatorApproved:false to spawnMission by default (fail-closed) + no grant log", async () => {
    let captured = null;
    const logger = makeMockLogger();
    const engine = createWorkflowEngine({
      researchRuntime: makeMockResearchRuntime(async (_env, opts) => { captured = opts; return { ok: true, subtask_results: [] }; }),
      monetizationRuntime: makeMockMonetizationRuntime(),
      logger
    });

    await engine.executeWorkflow(singleMissionWorkflow(), { inputs: {} });

    assert.equal(captured.operatorApproved, false);
    assert.ok(
      !logger.logs.some((l) => l.data && l.data.event === "phase15_operator_approval_granted"),
      "no grant log expected when flag is off"
    );
  });
});
