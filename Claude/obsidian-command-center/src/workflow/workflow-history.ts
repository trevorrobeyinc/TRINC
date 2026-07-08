import { readdirSync } from "fs";
import { join } from "path";
import type { WorkflowState } from "../types";
import { readJsonFile } from "../util/json-reader";
import { PathResolver } from "../util/path-resolver";

export interface WorkflowHistoryEntry {
  workflowId: string;
  templateId: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
  inputs: Record<string, string>;
}

/**
 * Scan the OpenClaw workspace for past workflow runs.
 * Returns entries sorted by creation date (newest first).
 */
export function getWorkflowHistory(
  openclawPath: string,
  limit = 20
): WorkflowHistoryEntry[] {
  const resolver = new PathResolver(openclawPath);
  const workflowsDir = resolver.workflowsDir;

  let dirs: string[];
  try {
    dirs = readdirSync(workflowsDir).filter((d) =>
      d.startsWith("workflow-")
    );
  } catch {
    return [];
  }

  const entries: WorkflowHistoryEntry[] = [];

  for (const dir of dirs) {
    const stateFile = join(workflowsDir, dir, "workflow.json");
    const state = readJsonFile<WorkflowState>(stateFile);
    if (!state) continue;

    entries.push({
      workflowId: state.workflow_id,
      templateId: state.template_id,
      status: state.status,
      createdAt: state.created_at,
      completedAt: state.completed_at,
      inputs: state.inputs,
    });
  }

  return entries
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}
