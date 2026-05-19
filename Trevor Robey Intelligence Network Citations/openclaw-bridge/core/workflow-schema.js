"use strict";

const { z } = require("zod");

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
  input_schema: z.object({
    required: z.array(z.string()).default([]),
    properties: z.record(InputPropertySchema).default({})
  }).default({ required: [], properties: {} }),
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

module.exports = {
  WORKFLOW_SCHEMA_VERSION,
  WORKFLOW_STATUSES,
  PIPELINE_STEP_TYPES,
  WorkflowTemplateSchema,
  PipelineStepSchema,
  validateWorkflowDefinition,
  resolveTemplateVariables,
  detectCircularDependencies
};
