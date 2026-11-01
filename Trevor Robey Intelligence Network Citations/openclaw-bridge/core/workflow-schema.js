"use strict";

const { z } = require("zod");
const { PROFILES } = require("./research-profiles.js");

const WORKFLOW_SCHEMA_VERSION = "phase30-workflow-v1";

const WORKFLOW_STATUSES = Object.freeze([
  "draft",
  "running",
  "completed",
  "failed",
  "cancelled"
]);

const PIPELINE_STEP_TYPES = Object.freeze([
  "mission",
  "dataset",
  "offer",
  "approve",
  "export",
  "quality_audit"
]);

const PipelineStepSchema = z.object({
  step_id: z.string().min(1).max(64).regex(/^[a-z0-9_-]+$/),
  type: z.enum(PIPELINE_STEP_TYPES),
  depends_on: z.array(z.string().min(1).max(64)).default([]),
  mission_template_id: z.string().min(1).max(128).optional(),
  description_template: z.string().min(1).max(4096).optional(),
  mission_type: z.enum(["research_only", "research_to_dataset"]).optional(),
  dataset_type: z.string().min(1).max(128).optional(),
  target_schema: z.string().min(1).max(128).optional(),
  quality_threshold: z.number().min(0).max(1).optional(),
  product_line: z.string().min(1).max(128).optional(),
  tier: z.string().min(1).max(64).optional(),
  targets: z.array(z.string().min(1).max(64)).optional(),
  delivery_targets: z.array(z.string().min(1).max(64)).optional(),
  format: z.enum(["zip", "folder"]).optional(),
  confidence_threshold: z.number().min(0).max(1).optional(),
  verification_tools: z.array(z.string().min(1).max(128)).optional()
}).strict();

const InputPropertySchema = z.object({
  type: z.enum(["string", "number", "boolean", "array"]),
  description: z.string().max(512).optional(),
  default: z.any().optional()
}).passthrough();

const ProviderPreferenceSchema = z.object({
  primary: z.string().min(1).max(64),
  fallback: z.string().min(1).max(64).optional()
}).strict().optional();

const WorkflowTemplateSchema = z.object({
  schema_version: z.literal(WORKFLOW_SCHEMA_VERSION),
  workflow_template_id: z.string().min(1).max(128).regex(/^[a-z0-9_-]+$/),
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  auto_approve: z.boolean().default(false),
  provider_preference: ProviderPreferenceSchema,
  // Research domain (core/research-profiles.js). Omitted = biomedical, the behaviour of every
  // template written before 2026-10-21.
  research_profile: z.enum(Object.keys(PROFILES)).optional(),
  input_schema: z.object({
    required: z.array(z.string()).default([]),
    properties: z.record(z.string(), InputPropertySchema).default({})
  // A function default hands every template its own `required` array and `properties` object.
  // zod 4 only shallow-copies a value default, so a plain object here would be shared by every
  // template that omits input_schema; zod 3 rebuilt it on each parse.
  }).default(() => ({ required: [], properties: {} })),
  pipeline: z.array(PipelineStepSchema).min(1).max(20)
}).strict();

function detectCircularDependencies(steps) {
  const stepIds = new Set(steps.map((step) => step.step_id));
  const visited = new Set();
  const visiting = new Set();

  function visit(stepId) {
    if (visiting.has(stepId)) {
      return true;
    }
    if (visited.has(stepId)) {
      return false;
    }
    visiting.add(stepId);
    const step = steps.find((s) => s.step_id === stepId);
    if (step) {
      for (const dep of step.depends_on || []) {
        if (visit(dep)) {
          return true;
        }
      }
    }
    visiting.delete(stepId);
    visited.add(stepId);
    return false;
  }

  for (const stepId of stepIds) {
    if (visit(stepId)) {
      return true;
    }
  }
  return false;
}

function validateWorkflowDefinition(raw) {
  const parsed = WorkflowTemplateSchema.parse(raw);

  const stepIds = new Set();
  for (const step of parsed.pipeline) {
    if (stepIds.has(step.step_id)) {
      throw new Error(`Duplicate step_id '${step.step_id}' in workflow pipeline`);
    }
    stepIds.add(step.step_id);
  }

  for (const step of parsed.pipeline) {
    for (const dep of step.depends_on || []) {
      if (!stepIds.has(dep)) {
        throw new Error(`Step '${step.step_id}' depends on unknown step '${dep}'`);
      }
    }
  }

  if (detectCircularDependencies(parsed.pipeline)) {
    throw new Error("Circular dependency detected in workflow pipeline");
  }

  for (const step of parsed.pipeline) {
    if (step.type === "mission" && !step.mission_template_id) {
      throw new Error(`Mission step '${step.step_id}' requires mission_template_id`);
    }
    if (step.type === "offer" && !step.product_line) {
      throw new Error(`Offer step '${step.step_id}' requires product_line`);
    }
    if (step.type === "offer" && !step.tier) {
      throw new Error(`Offer step '${step.step_id}' requires tier`);
    }
  }

  return parsed;
}

function resolveTemplateVariables(template, inputs) {
  if (typeof template !== "string") {
    return template;
  }
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key) => {
    const value = inputs && inputs[key];
    return value !== undefined && value !== null ? String(value) : `{{${key}}}`;
  });
}

/** A value that is itself still a template placeholder, e.g. "{{topic}}" passed through verbatim. */
const UNRESOLVED_PLACEHOLDER_RE = /^\{\{\w+\}\}$/;

/**
 * Required inputs a caller did not actually supply.
 *
 * Templates have always DECLARED `input_schema.required`, but nothing enforced it: the engine
 * applied `properties[].default` and moved on, and `resolveTemplateVariables` leaves an
 * unsubstituted key as the literal `{{key}}`. A run missing `topic` therefore spent full
 * compute researching the string "{{topic}}" — declared-but-unenforced, and newly reachable
 * by agents that construct inputs themselves (2026-08-20).
 *
 * A required input counts as supplied when, after schema defaults are applied, it is present,
 * non-null, and not blank/whitespace — and is not an unresolved placeholder.
 *
 * @returns {Array<{key: string, reason: "absent"|"blank"|"unresolved_placeholder"}>} empty when valid.
 */
function findMissingRequiredInputs(workflowDef, inputs) {
  const schema = workflowDef && workflowDef.input_schema;
  const required = Array.isArray(schema && schema.required) ? schema.required : [];
  if (required.length === 0) {
    return [];
  }
  const properties = (schema && schema.properties) || {};
  const supplied = inputs && typeof inputs === "object" ? inputs : {};
  const missing = [];

  for (const key of required) {
    let value = supplied[key];
    if (value === undefined || value === null) {
      // Schema defaults satisfy a required input — mirrors applyInputSchemaDefaults.
      const fallback = properties[key] && properties[key].default;
      if (fallback !== undefined && fallback !== null) {
        value = fallback;
      }
    }
    if (value === undefined || value === null) {
      missing.push({ key, reason: "absent" });
      continue;
    }
    const text = String(value).trim();
    if (text === "") {
      missing.push({ key, reason: "blank" });
      continue;
    }
    if (UNRESOLVED_PLACEHOLDER_RE.test(text)) {
      missing.push({ key, reason: "unresolved_placeholder" });
    }
  }

  return missing;
}

/** Operator/agent-facing message for findMissingRequiredInputs() output. */
function formatMissingRequiredInputs(workflowDef, missing) {
  const templateId = (workflowDef && workflowDef.workflow_template_id) || "workflow";
  const schema = (workflowDef && workflowDef.input_schema) || {};
  const required = Array.isArray(schema.required) ? schema.required : [];
  const properties = schema.properties || {};
  const detail = missing
    .map(({ key, reason }) => {
      const description = properties[key] && properties[key].description;
      return `  - ${key} (${reason})${description ? `: ${description}` : ""}`;
    })
    .join("\n");
  return (
    `Workflow '${templateId}' is missing required input(s):\n${detail}\n` +
    `Required inputs for this template: ${required.length > 0 ? required.join(", ") : "(none)"}. ` +
    "Supply every required input as a non-empty value and re-run — nothing was executed."
  );
}

module.exports = {
  WORKFLOW_SCHEMA_VERSION,
  WORKFLOW_STATUSES,
  PIPELINE_STEP_TYPES,
  WorkflowTemplateSchema,
  PipelineStepSchema,
  validateWorkflowDefinition,
  resolveTemplateVariables,
  findMissingRequiredInputs,
  formatMissingRequiredInputs,
  detectCircularDependencies
};
