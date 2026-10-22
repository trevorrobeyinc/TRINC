// Unit tests for src/util/template-summary.ts. Run: npm test
//
// The run tool is the door Copilot chat and Claude Code start engine runs through; the template
// list is how they learn what to pass. Business-lane templates (2026-10-21) take one required
// input (topic) and several optional ones that decide which sources fire, so the summary must
// carry the optional inputs and the lane, not just `required`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeTemplate } from "../src/util/template-summary.ts";

const business = {
  schema_version: "phase30-workflow-v1",
  workflow_template_id: "cost-reduction-analysis",
  name: "Cost Reduction Analysis",
  auto_approve: true,
  research_profile: "business",
  input_schema: {
    required: ["topic"],
    properties: {
      topic: { type: "string", description: "The business question" },
      company: { type: "string", description: "Client or company, if public", default: "" },
      country: { type: "string", description: "ISO country code", default: "US" },
      input_dir: { type: "string", default: "workspace/research-input/sample/" },
    },
  },
  pipeline: [],
} as const;

const biomedical = {
  schema_version: "phase30-workflow-v1",
  workflow_template_id: "drug-discovery-full",
  name: "Drug Discovery",
  auto_approve: true,
  input_schema: { required: ["compound_name", "indication"], properties: {} },
  pipeline: [],
} as const;

test("business templates expose their lane and optional inputs", () => {
  const summary = summarizeTemplate(structuredClone(business) as never);
  assert.equal(summary.researchProfile, "business");
  assert.deepEqual(summary.requiredInputs, ["topic"]);
  assert.deepEqual(summary.optionalInputs, [
    { name: "company", description: "Client or company, if public" },
    { name: "country", description: "ISO country code", default: "US" },
  ]);
});

test("a template without a profile is biomedical, and input_dir is never offered", () => {
  const bio = summarizeTemplate(structuredClone(biomedical) as never);
  assert.equal(bio.researchProfile, "biomedical");
  assert.deepEqual(bio.optionalInputs, []);
  const biz = summarizeTemplate(structuredClone(business) as never);
  assert.ok(!biz.optionalInputs.some((i) => i.name === "input_dir"));
});
