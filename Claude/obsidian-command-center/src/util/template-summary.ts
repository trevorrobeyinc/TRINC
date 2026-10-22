import type { WorkflowTemplate } from "../types";

// Pure (no fs, no relative runtime imports) so `npm test` can load it under strip-types.

export interface OptionalInput {
  name: string;
  description: string;
  default?: unknown;
}

export interface TemplateSummary {
  id: string;
  name: string;
  description: string;
  /** "biomedical" (default) or "business" — which engine lane the template runs on. */
  researchProfile: string;
  requiredInputs: string[];
  /**
   * The template's other inputs, so a chat client can pass them. On the business lane these
   * decide which sources fire (SEC filings only run when `company` or `competitors` names one).
   * `input_dir` is left out: it is an engine filesystem path, not something to ask a chat for.
   */
  optionalInputs: OptionalInput[];
}

const HIDDEN_INPUTS = new Set(["input_dir"]);

export function summarizeTemplate(t: WorkflowTemplate): TemplateSummary {
  const required = t.input_schema?.required || [];
  const properties = t.input_schema?.properties || {};
  const optionalInputs: OptionalInput[] = Object.entries(properties)
    .filter(([name]) => !required.includes(name) && !HIDDEN_INPUTS.has(name))
    .map(([name, prop]) => ({
      name,
      description: prop?.description ?? "",
      ...(prop && prop.default !== undefined && prop.default !== "" ? { default: prop.default } : {}),
    }));
  return {
    id: t.workflow_template_id,
    name: t.name ?? t.workflow_template_id,
    description: t.description ?? "",
    researchProfile: t.research_profile ?? "biomedical",
    requiredInputs: required,
    optionalInputs,
  };
}
