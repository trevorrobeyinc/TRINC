import type { WorkflowState, QualityReport } from "../types";

/**
 * Build YAML frontmatter for different note types.
 * All properties are Dataview-compatible.
 */

export function workflowFrontmatter(state: WorkflowState): string {
  const qr = state.artifacts?.quality_report;
  const fields: Record<string, unknown> = {
    type: "openclaw/workflow",
    workflow_id: state.workflow_id,
    template: state.template_id,
    status: state.status,
    created: state.created_at,
    completed: state.completed_at,
    inputs: state.inputs,
    mission_id: state.artifacts?.mission_id || null,
    dataset_id: state.artifacts?.dataset_id || null,
    offer_id: state.artifacts?.offer_id || null,
    quality_confidence: qr?.overall_confidence ?? null,
    quality_pass: qr?.pass ?? null,
    verified_claims: qr?.verified_claims ?? null,
    total_claims: qr?.total_claims ?? null,
    tags: buildTags(state),
  };
  return renderYaml(fields);
}

export function agentFrontmatter(opts: {
  missionId: string;
  role: string;
  agentId: string;
  taskId: string;
  provider: string;
  model: string;
  tokenCount: number;
  workflowNoteLink: string;
  missionNoteLink: string;
}): string {
  const fields: Record<string, unknown> = {
    type: "openclaw/agent-output",
    mission_id: opts.missionId,
    agent_role: opts.role,
    agent_id: opts.agentId,
    task_id: opts.taskId,
    provider: opts.provider,
    model: opts.model,
    token_count: opts.tokenCount,
    workflow: `"${opts.workflowNoteLink}"`,
    mission: `"${opts.missionNoteLink}"`,
    tags: ["openclaw", "agent-output", opts.role],
  };
  return renderYaml(fields);
}

export function qualityFrontmatter(
  workflowId: string,
  qr: QualityReport
): string {
  const fields: Record<string, unknown> = {
    type: "openclaw/quality-report",
    workflow_id: workflowId,
    confidence: qr.overall_confidence,
    citation_density: qr.citation_density_raw,
    total_claims: qr.total_claims,
    verified_claims: qr.verified_claims,
    pass: qr.pass,
    tags: ["openclaw", "quality"],
  };
  return renderYaml(fields);
}

export function datasetFrontmatter(
  workflowId: string,
  datasetId: string,
  rowCount?: number
): string {
  const fields: Record<string, unknown> = {
    type: "openclaw/dataset",
    workflow_id: workflowId,
    dataset_id: datasetId,
    row_count: rowCount ?? null,
    tags: ["openclaw", "dataset"],
  };
  return renderYaml(fields);
}

function buildTags(state: WorkflowState): string[] {
  const tags = ["openclaw", state.template_id.replace(/-/g, "_")];
  for (const val of Object.values(state.inputs || {})) {
    if (typeof val === "string" && val.length < 40 && !val.includes("/")) {
      tags.push(val.toLowerCase().replace(/\s+/g, "_"));
    }
  }
  return tags;
}

function renderYaml(fields: Record<string, unknown>): string {
  const lines: string[] = ["---"];
  for (const [key, value] of Object.entries(fields)) {
    lines.push(renderYamlLine(key, value));
  }
  lines.push("---");
  return lines.join("\n");
}

function renderYamlLine(key: string, value: unknown, indent = 0): string {
  const prefix = "  ".repeat(indent);
  if (value === null || value === undefined) {
    return `${prefix}${key}: null`;
  }
  if (typeof value === "boolean") {
    return `${prefix}${key}: ${value}`;
  }
  if (typeof value === "number") {
    return `${prefix}${key}: ${value}`;
  }
  if (typeof value === "string") {
    // Already a wikilink reference
    if (value.startsWith('"[[')) {
      return `${prefix}${key}: ${value}`;
    }
    // Needs quoting if contains special chars
    if (value.includes(":") || value.includes("#") || value.includes('"')) {
      return `${prefix}${key}: "${value.replace(/"/g, '\\"')}"`;
    }
    return `${prefix}${key}: ${value}`;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return `${prefix}${key}: []`;
    const items = value.map((v) => `${prefix}  - ${v}`).join("\n");
    return `${prefix}${key}:\n${items}`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => renderYamlLine(k, v, indent + 1))
      .join("\n");
    return `${prefix}${key}:\n${entries}`;
  }
  return `${prefix}${key}: ${String(value)}`;
}
