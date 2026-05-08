"use strict";

const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const fs = require("node:fs");
const path = require("node:path");

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

function makeMockResearchRuntime(overrides = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "phase30-engine-test-"));
  fs.mkdirSync(path.join(tmpDir, "workspace", "workflows"), { recursive: true });
  return {
    rootDir: tmpDir,
    config: { defaultProvider: "mock", defaultModel: "mock-model" },
    agentSpawner: {
      spawnMission: async () => ({ ok: true, subtask_results: [] })
    },
    ...overrides
  };
}

function makeMockMonetizationRuntime() {
  const tmpBundleDir = fs.mkdtempSync(path.join(os.tmpdir(), "phase30-bundle-"));
  fs.writeFileSync(path.join(tmpBundleDir, "offer.json"), JSON.stringify({ offer_id: "offer-test-001" }));
  return {
    offerBuilder: {
      buildOffer(opts) {
        return {
          ok: true,
          offer: { offer_id: "offer-test-001", product_line: opts.product_line, tier: opts.tier },
          source_context: { source: opts.source }
        };
      }
    },
    deliverablePackager: {
      createBundleWorkspace() { return tmpBundleDir; },
      writeDeliverables() { return []; },
      writeBundleRoot() {},
      finalizeBundle() {},
      commitBundle() { return tmpBundleDir; }
    },
    submissionPackGenerator: {
      generateSubmissionPacks() { return { submission_refs: [], publisher_adapter_snapshot: {} }; }
    },
    releaseApprovalManager: {
      approveRelease() { return { ok: true, approval_id: "apr-001" }; },
      validateApprovedRelease() {
        return {
          ok: true,
          bundle_dir: tmpBundleDir,
          approval: { approved_platform_targets: ["datarade"] }
        };
      }
    },
    submissionEvidenceManager: {
      buildExportArtifactRef: async () => ({ ref: "ref-001" }),
      recordExportEvent: async () => ({ ok: true, event: {} })
    }
  };
}

function makeValidWorkflowDef() {
  return {
    schema_version: "phase30-workflow-v1",
    workflow_template_id: "wf-engine-test-001",
    name: "Engine Integration Test",
    auto_approve: true,
    pipeline: [
      { step_id: "step_research", type: "mission", mission_template_id: "biomedical_drug_discovery", depends_on: [] }
    ]
  };
}

function makeMultiStepWorkflowDef() {
  return {
    schema_version: "phase30-workflow-v1",
    workflow_template_id: "wf-multi-step-test",
    name: "Multi-Step Order Test",
    auto_approve: true,
    pipeline: [
      { step_id: "step_a", type: "mission", mission_template_id: "biomedical_drug_discovery", depends_on: [] },
      { step_id: "step_b", type: "mission", mission_template_id: "biomedical_drug_discovery", depends_on: ["step_a"] }
    ]
  };
}

describe("Phase 30: Workflow Engine — createWorkflowEngine factory", () => {
  it("rejects missing researchRuntime", () => {
    assert.throws(
      () => createWorkflowEngine({
        researchRuntime: null,
        monetizationRuntime: makeMockMonetizationRuntime(),
        logger: makeMockLogger()
      }),
      (err) => err.message.includes("researchRuntime")
    );
  });

  it("rejects missing monetizationRuntime", () => {
    assert.throws(
      () => createWorkflowEngine({
        researchRuntime: makeMockResearchRuntime(),
        monetizationRuntime: null,
        logger: makeMockLogger()
      }),
      (err) => err.message.includes("monetizationRuntime")
    );
  });

  it("returns an engine with expected methods", () => {
    const engine = createWorkflowEngine({
      researchRuntime: makeMockResearchRuntime(),
      monetizationRuntime: makeMockMonetizationRuntime(),
      logger: makeMockLogger()
    });
    assert.equal(typeof engine.executeWorkflow, "function");
    assert.equal(typeof engine.getWorkflowStatus, "function");
    assert.equal(typeof engine.cancelWorkflow, "function");
  });
});

describe("Phase 30: Workflow Engine — executeWorkflow", () => {
  let engine;
  let researchRuntime;
  let logger;

  beforeEach(() => {
    researchRuntime = makeMockResearchRuntime();
    logger = makeMockLogger();
    engine = createWorkflowEngine({
      researchRuntime,
      monetizationRuntime: makeMockMonetizationRuntime(),
      logger
    });
  });

  it("validates the workflow definition (rejects bad schema)", async () => {
    const bad = { schema_version: "wrong", workflow_template_id: "x", pipeline: [] };
    await assert.rejects(
      () => engine.executeWorkflow(bad),
      (err) => err.message !== undefined
    );
  });

  it("runs steps in topological order", async () => {
    const executionOrder = [];
    let callCount = 0;
    const customResearch = makeMockResearchRuntime({
      agentSpawner: {
        spawnMission: async () => {
          callCount += 1;
          executionOrder.push(`mission_${callCount}`);
          return { ok: true, subtask_results: [] };
        }
      }
    });

    const eng = createWorkflowEngine({
      researchRuntime: customResearch,
      monetizationRuntime: makeMockMonetizationRuntime(),
      logger: makeMockLogger()
    });

    const result = await eng.executeWorkflow(makeMultiStepWorkflowDef());
    assert.equal(result.ok, true);
    assert.equal(executionOrder.length, 2);
    assert.equal(executionOrder[0], "mission_1");
    assert.equal(executionOrder[1], "mission_2");
  });

  it("writes workflow state to filesystem", async () => {
    const result = await engine.executeWorkflow(makeValidWorkflowDef());
    const workflowDir = path.join(researchRuntime.rootDir, "workspace", "workflows", result.workflow_id);
    const statePath = path.join(workflowDir, "workflow.json");
    assert.ok(fs.existsSync(statePath), `Workflow state file should exist at ${statePath}`);

    const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    assert.equal(state.workflow_id, result.workflow_id);
  });

  it("returns ok:true on successful completion", async () => {
    const result = await engine.executeWorkflow(makeValidWorkflowDef());
    assert.equal(result.ok, true);
    assert.ok(result.workflow_id.startsWith("workflow-"));
    assert.equal(result.status, "completed");
  });

  it("returns ok:false when a step fails", async () => {
    const failingResearch = makeMockResearchRuntime({
      agentSpawner: {
        spawnMission: async () => { throw new Error("mission failed"); }
      }
    });

    const eng = createWorkflowEngine({
      researchRuntime: failingResearch,
      monetizationRuntime: makeMockMonetizationRuntime(),
      logger: makeMockLogger()
    });

    const result = await eng.executeWorkflow(makeValidWorkflowDef());
    assert.equal(result.ok, false);
    assert.ok(result.error);
    assert.equal(result.status, "failed");
  });
});

describe("Phase 30: Workflow Engine — getWorkflowStatus", () => {
  it("returns null for unknown workflow", () => {
    const engine = createWorkflowEngine({
      researchRuntime: makeMockResearchRuntime(),
      monetizationRuntime: makeMockMonetizationRuntime(),
      logger: makeMockLogger()
    });
    const status = engine.getWorkflowStatus("wf-does-not-exist");
    assert.equal(status, null);
  });
});

describe("Phase 30: Workflow Engine — cancelWorkflow", () => {
  it("throws for unknown workflow", () => {
    const engine = createWorkflowEngine({
      researchRuntime: makeMockResearchRuntime(),
      monetizationRuntime: makeMockMonetizationRuntime(),
      logger: makeMockLogger()
    });
    assert.throws(
      () => engine.cancelWorkflow("wf-not-found"),
      (err) => err.message.includes("not found")
    );
  });
});
