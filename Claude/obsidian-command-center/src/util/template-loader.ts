import { readdirSync } from "fs";
import { join } from "path";
import type { WorkflowTemplate } from "../types";
import { readJsonFile } from "./json-reader";

export interface TemplateSummary {
  id: string;
  name: string;
  description: string;
  requiredInputs: string[];
}

/**
 * Single template loader for the modal and the bridge (previously duplicated
 * in main.ts and workflow-modal.ts). `name` is optional in the template
 * schema, so sorting falls back to the id — a name-less template used to
 * crash both loaders via localeCompare(undefined).
 */
export function loadTemplates(openclawPath: string): WorkflowTemplate[] {
  const templatesDir = join(openclawPath, "config", "workflow-templates");
  try {
    const files = readdirSync(templatesDir).filter((f) => f.endsWith(".json"));
    const templates: WorkflowTemplate[] = [];
    for (const file of files) {
      const t = readJsonFile<WorkflowTemplate>(join(templatesDir, file));
      if (t && t.workflow_template_id) templates.push(t);
    }
    return templates.sort((a, b) =>
      (a.name ?? a.workflow_template_id).localeCompare(b.name ?? b.workflow_template_id)
    );
  } catch {
    return [];
  }
}

export function listTemplateSummaries(openclawPath: string): TemplateSummary[] {
  return loadTemplates(openclawPath).map((t) => ({
    id: t.workflow_template_id,
    name: t.name ?? t.workflow_template_id,
    description: t.description ?? "",
    requiredInputs: t.input_schema?.required || [],
  }));
}
