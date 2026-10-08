// Keeps `obsidian_openclaw_status` small after a finished run (2026-10-08).
//
// The engine's workflow.json embeds each step's whole `result` inline, and a finished research step carries every
// rendered deliverable: run #2 held a 428 KB graveyard memo, the design benchmark and the citation-verification
// record, so ONE status call after the run was 518 KB and swamped the caller (Claude Code had to read it from a
// saved file; a Copilot agent chat would simply drown). The content is served by dedicated tools, so status replaces
// any oversized step result or artifact with a size summary unless the caller passes verbose:true. Pure functions,
// no Obsidian or Node APIs, so they are unit-tested under `npm test`.

export const DEFAULT_MAX_CHARS = 4000;

type Json = Record<string, unknown>;

const HINT =
  "Too large for a status reply. Content: obsidian_openclaw_results, obsidian_openclaw_artifacts, " +
  "obsidian_openclaw_citation_integrity, or call obsidian_openclaw_status with verbose:true.";

function chars(value: unknown): number {
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return 0;
  }
}

function isRecord(value: unknown): value is Json {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** A stand-in for a value that is too large: how big it was, and (for an object) how big each field was. */
function summarize(value: unknown, size: number): Json {
  const fields: Record<string, number> = {};
  if (isRecord(value)) for (const [k, v] of Object.entries(value)) fields[k] = chars(v);
  return { trimmed: true, chars: size, fields, hint: HINT };
}

/**
 * Returns `state` with every `pipeline_progress.steps[].result` and every top-level `artifacts` entry larger than
 * `maxChars` (JSON length) replaced by a summary. Everything else, including each step's id, type, status and error,
 * is untouched. Never mutates its input; returns the same object when nothing needed trimming.
 */
export function compactWorkflowState(state: Json, maxChars: number = DEFAULT_MAX_CHARS): Json {
  let next = state;

  const progress = state.pipeline_progress;
  if (isRecord(progress) && Array.isArray(progress.steps)) {
    let changed = false;
    const steps = progress.steps.map((step: unknown) => {
      if (!isRecord(step) || !("result" in step)) return step;
      const size = chars(step.result);
      if (size <= maxChars) return step;
      changed = true;
      return { ...step, result: summarize(step.result, size) };
    });
    if (changed) next = { ...next, pipeline_progress: { ...progress, steps } };
  }

  const artifacts = state.artifacts;
  if (isRecord(artifacts)) {
    let changed = false;
    const out: Json = {};
    for (const [key, value] of Object.entries(artifacts)) {
      const size = chars(value);
      if (size > maxChars) {
        changed = true;
        out[key] = summarize(value, size);
      } else {
        out[key] = value;
      }
    }
    if (changed) next = { ...next, artifacts: out };
  }

  return next;
}
