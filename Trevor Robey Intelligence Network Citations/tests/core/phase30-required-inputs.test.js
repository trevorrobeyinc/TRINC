"use strict";

// Required-input enforcement (2026-08-20).
//
// Templates have always DECLARED `input_schema.required`, but nothing enforced it: the engine
// applied schema defaults and moved on, and `resolveTemplateVariables` renders an unsupplied key
// as the literal "{{key}}". A run missing `topic` therefore spent full compute — a real mission,
// real provider spend, and a consumed one-shot operator token — researching the string
// "{{topic}}". These tests pin the enforcement at both layers: the pure helper, and the engine's
// refusal to execute a single step without the declared inputs.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const fs = require("node:fs");
const path = require("node:path");

const {
  findMissingRequiredInputs,
  formatMissingRequiredInputs,
  resolveTemplateVariables
} = require("../../openclaw-bridge/core/workflow-schema.js");
const { createWorkflowEngine } = require("../../openclaw-bridge/core/workflow-engine.js");

function makeTemplate(overrides = {}) {
  return {
    schema_version: "phase30-workflow-v1",
    workflow_template_id: "wf-required-inputs-test",
    name: "Required Inputs Test",
    auto_approve: true,
    input_schema: {
      required: ["topic"],
      properties: { topic: { type: "string", description: "Research topic" } }
    },
    pipeline: [
      {
        step_id: "step_research",
        type: "mission",
        mission_template_id: "biomedical_drug_discovery",
        description_template: "Research {{topic}}",
        depends_on: []
      }
    ],
    ...overrides
  };
}

describe("Phase 30: required-input enforcement — findMissingRequiredInputs", () => {
  it("passes when every required input is supplied", () => {
    assert.deepEqual(findMissingRequiredInputs(makeTemplate(), { topic: "NSCLC" }), []);
  });

  it("passes when the template declares no required inputs", () => {
    const template = makeTemplate({ input_schema: { required: [], properties: {} } });
    assert.deepEqual(findMissingRequiredInputs(template, {}), []);
  });

  it("flags an absent required input", () => {
    assert.deepEqual(findMissingRequiredInputs(makeTemplate(), {}), [
      { key: "topic", reason: "absent" }
    ]);
  });

  it("flags a null required input", () => {
    assert.deepEqual(findMissingRequiredInputs(makeTemplate(), { topic: null }), [
      { key: "topic", reason: "absent" }
    ]);
  });

  it("flags a blank / whitespace-only required input", () => {
    assert.deepEqual(findMissingRequiredInputs(makeTemplate(), { topic: "   " }), [
      { key: "topic", reason: "blank" }
    ]);
  });

  it("flags a value that is itself an unresolved placeholder", () => {
    // An agent (or a copy-pasted command) can pass the template's own placeholder through.
    assert.deepEqual(findMissingRequiredInputs(makeTemplate(), { topic: "{{topic}}" }), [
      { key: "topic", reason: "unresolved_placeholder" }
    ]);
  });

  it("accepts a schema default as satisfying a required input", () => {
    const template = makeTemplate({
      input_schema: {
        required: ["topic"],
        properties: { topic: { type: "string", default: "oncology" } }
      }
    });
    assert.deepEqual(findMissingRequiredInputs(template, {}), []);
  });

  it("tolerates missing/!object inputs and a template without input_schema", () => {
    assert.deepEqual(findMissingRequiredInputs(makeTemplate(), undefined), [
      { key: "topic", reason: "absent" }
    ]);
    assert.deepEqual(findMissingRequiredInputs({ workflow_template_id: "x" }, {}), []);
  });

  it("reports every missing key, not just the first", () => {
    const template = makeTemplate({
      input_schema: {
        required: ["compound_name", "indication"],
        properties: {}
      }
    });
    const missing = findMissingRequiredInputs(template, { compound_name: "" });
    assert.deepEqual(missing.map((m) => m.key), ["compound_name", "indication"]);
  });

  it("formats an actionable message naming the template, keys, reasons and requirements", () => {
    const template = makeTemplate();
    const message = formatMissingRequiredInputs(
      template,
      findMissingRequiredInputs(template, {})
    );
    assert.match(message, /wf-required-inputs-test/);
    assert.match(message, /topic \(absent\)/);
    assert.match(message, /Research topic/);
    assert.match(message, /Required inputs for this template: topic/);
    assert.match(message, /nothing was executed/);
  });

  it("documents the defect being prevented: an unsupplied key renders literally", () => {
    // This is why the check exists — the renderer does not fail, it emits the placeholder.
    assert.equal(resolveTemplateVariables("Research {{topic}}", {}), "Research {{topic}}");
    assert.equal(resolveTemplateVariables("Research {{topic}}", { topic: "NSCLC" }), "Research NSCLC");
  });
});

describe("Phase 30: required-input enforcement — executeWorkflow", () => {
  function makeMocks() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "phase30-required-inputs-"));
    fs.mkdirSync(path.join(tmpDir, "workspace", "workflows"), { recursive: true });
    const spawnCalls = [];
    const logs = [];
    return {
      tmpDir,
      spawnCalls,
      logs,
      researchRuntime: {
        rootDir: tmpDir,
        config: { defaultProvider: "mock", defaultModel: "mock-model" },
        agentSpawner: {
          spawnMission: async (envelope) => {
            spawnCalls.push(envelope);
            return { ok: true, subtask_results: [] };
          }
        }
      },
      monetizationRuntime: {
        offerBuilder: { buildOffer: () => ({ ok: true, offer: {}, source_context: {} }) },
        deliverablePackager: {
          createBundleWorkspace: () => tmpDir,
          writeDeliverables: () => [],
          writeBundleRoot: () => {},
          finalizeBundle: () => {},
          commitBundle: () => tmpDir
        },
        submissionPackGenerator: {
          generateSubmissionPacks: () => ({ submission_refs: [], publisher_adapter_snapshot: {} })
        },
        releaseApprovalManager: {
          approveRelease: () => ({ ok: true, approval_id: "apr-001" }),
          validateApprovedRelease: () => ({ ok: true, bundle_dir: tmpDir, approval: {} })
        },
        submissionEvidenceManager: {
          buildExportArtifactRef: async () => ({ ref: "ref-001" }),
          recordExportEvent: async () => ({ ok: true, event: {} })
        }
      },
      logger: {
        info(data) { logs.push({ level: "info", data }); },
        warn(data) { logs.push({ level: "warn", data }); },
        error(data) { logs.push({ level: "error", data }); }
      }
    };
  }

  it("refuses to execute a workflow whose required inputs are missing, and spawns nothing", async () => {
    const mocks = makeMocks();
    const engine = createWorkflowEngine({
      researchRuntime: mocks.researchRuntime,
      monetizationRuntime: mocks.monetizationRuntime,
      logger: mocks.logger
    });

    await assert.rejects(
      () => engine.executeWorkflow(makeTemplate(), { inputs: {} }),
      (err) => {
        assert.equal(err.code, "PHASE30_MISSING_REQUIRED_INPUT");
        assert.match(err.message, /topic \(absent\)/);
        return true;
      }
    );

    // The whole point: no mission was spawned, so no provider spend and no wasted operator token.
    assert.equal(mocks.spawnCalls.length, 0);
    assert.ok(
      mocks.logs.some((l) => l.level === "error" && l.data.event === "phase30_missing_required_input"),
      "expected a phase30_missing_required_input error log"
    );
  });

  it("records the refusal in workflow.json so state files never misreport a prior run", async () => {
    const mocks = makeMocks();
    const engine = createWorkflowEngine({
      researchRuntime: mocks.researchRuntime,
      monetizationRuntime: mocks.monetizationRuntime,
      logger: mocks.logger
    });

    await assert.rejects(() => engine.executeWorkflow(makeTemplate(), { inputs: { topic: "  " } }));

    const workflowsDir = path.join(mocks.tmpDir, "workspace", "workflows");
    const dirs = fs.readdirSync(workflowsDir).filter((d) => d.startsWith("workflow-"));
    assert.equal(dirs.length, 1, "expected exactly one workflow dir for the refused run");
    const state = JSON.parse(
      fs.readFileSync(path.join(workflowsDir, dirs[0], "workflow.json"), "utf8")
    );
    assert.equal(state.status, "failed");
    assert.equal(state.error.code, "PHASE30_MISSING_REQUIRED_INPUT");
    assert.match(state.error.message, /topic \(blank\)/);
    assert.equal(state.pipeline_progress.completed_steps, 0);
    assert.ok(state.completed_at, "terminal state must carry completed_at");
  });

  it("executes normally when the required input is present", async () => {
    const mocks = makeMocks();
    const engine = createWorkflowEngine({
      researchRuntime: mocks.researchRuntime,
      monetizationRuntime: mocks.monetizationRuntime,
      logger: mocks.logger
    });

    // The mission itself fails downstream in this minimal harness (no grounded citations);
    // what matters here is that validation did NOT block it and the mission WAS spawned.
    await engine.executeWorkflow(makeTemplate(), { inputs: { topic: "NSCLC" } }).catch(() => {});
    assert.equal(mocks.spawnCalls.length, 1, "expected the mission to be spawned");
    assert.match(String(mocks.spawnCalls[0].description || ""), /Research NSCLC/);
  });
});
