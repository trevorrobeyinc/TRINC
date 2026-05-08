"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  WORKFLOW_SCHEMA_VERSION,
  WORKFLOW_STATUSES,
  PIPELINE_STEP_TYPES,
  validateWorkflowDefinition,
  resolveTemplateVariables,
  detectCircularDependencies
} = require("../../openclaw-bridge/core/workflow-schema.js");

const VALID_WORKFLOW = {
  schema_version: "phase30-workflow-v1",
  workflow_template_id: "wf-test-001",
  name: "Test Workflow",
  pipeline: [
    { step_id: "step_a", type: "mission", mission_template_id: "biomedical_drug_discovery", depends_on: [] },
    { step_id: "step_b", type: "dataset", depends_on: ["step_a"] },
    { step_id: "step_c", type: "offer", product_line: "research_packs", tier: "standard", depends_on: ["step_b"] }
  ]
};

describe("Phase 30: Workflow Schema — constants", () => {
  it("exports correct schema version", () => {
    assert.equal(WORKFLOW_SCHEMA_VERSION, "phase30-workflow-v1");
  });

  it("exports expected workflow statuses", () => {
    assert.deepStrictEqual(WORKFLOW_STATUSES, ["draft", "running", "completed", "failed", "cancelled"]);
  });

  it("exports expected pipeline step types", () => {
    assert.deepStrictEqual(PIPELINE_STEP_TYPES, ["mission", "dataset", "offer", "approve", "export", "quality_audit"]);
  });
});

describe("Phase 30: Workflow Schema — validateWorkflowDefinition", () => {
  it("accepts a valid workflow definition", () => {
    const result = validateWorkflowDefinition(VALID_WORKFLOW);
    assert.equal(result.schema_version, "phase30-workflow-v1");
    assert.equal(result.pipeline.length, 3);
  });

  it("rejects missing schema_version", () => {
    const bad = { ...VALID_WORKFLOW, schema_version: undefined };
    assert.throws(() => validateWorkflowDefinition(bad));
  });

  it("rejects invalid step_id format (uppercase)", () => {
    const bad = structuredClone(VALID_WORKFLOW);
    bad.pipeline[0].step_id = "StepA";
    assert.throws(() => validateWorkflowDefinition(bad));
  });

  it("rejects invalid step_id format (special chars)", () => {
    const bad = structuredClone(VALID_WORKFLOW);
    bad.pipeline[0].step_id = "step@bad!";
    assert.throws(() => validateWorkflowDefinition(bad));
  });

  it("detects circular dependency", () => {
    const bad = structuredClone(VALID_WORKFLOW);
    bad.pipeline[0].depends_on = ["step_c"];
    assert.throws(() => validateWorkflowDefinition(bad));
  });

  it("rejects unknown depends_on step", () => {
    const bad = structuredClone(VALID_WORKFLOW);
    bad.pipeline[1].depends_on = ["nonexistent"];
    assert.throws(() => validateWorkflowDefinition(bad));
  });

  it("rejects duplicate step_id", () => {
    const bad = structuredClone(VALID_WORKFLOW);
    bad.pipeline[1].step_id = "step_a";
    assert.throws(() => validateWorkflowDefinition(bad));
  });

  it("rejects mission step without mission_template_id", () => {
    const bad = structuredClone(VALID_WORKFLOW);
    delete bad.pipeline[0].mission_template_id;
    assert.throws(() => validateWorkflowDefinition(bad));
  });

  it("rejects offer step without product_line or tier", () => {
    const bad = structuredClone(VALID_WORKFLOW);
    delete bad.pipeline[2].product_line;
    assert.throws(() => validateWorkflowDefinition(bad));
  });
});

describe("Phase 30: Workflow Schema — resolveTemplateVariables", () => {
  it("replaces template variables correctly", () => {
    const tpl = "Hello {{name}}, welcome to {{project}}!";
    const result = resolveTemplateVariables(tpl, { name: "Researcher", project: "OpenClaw" });
    assert.equal(result, "Hello Researcher, welcome to OpenClaw!");
  });

  it("leaves unreplaced variables as-is", () => {
    const tpl = "Value: {{known}} and {{unknown}}";
    const result = resolveTemplateVariables(tpl, { known: "42" });
    assert.equal(result, "Value: 42 and {{unknown}}");
  });
});

describe("Phase 30: Workflow Schema — detectCircularDependencies", () => {
  it("returns false for a valid DAG", () => {
    const steps = [
      { step_id: "a", depends_on: [] },
      { step_id: "b", depends_on: ["a"] },
      { step_id: "c", depends_on: ["a", "b"] }
    ];
    assert.equal(detectCircularDependencies(steps), false);
  });

  it("returns true when a cycle exists", () => {
    const steps = [
      { step_id: "a", depends_on: ["c"] },
      { step_id: "b", depends_on: ["a"] },
      { step_id: "c", depends_on: ["b"] }
    ];
    assert.equal(detectCircularDependencies(steps), true);
  });
});
