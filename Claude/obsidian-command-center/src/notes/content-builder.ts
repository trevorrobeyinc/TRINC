import type { WorkflowState, PipelineStep, QualityReport, CitationVerification } from "../types";
import { STEP_TYPE_LABELS } from "../constants";

/**
 * Summarize the runtime citation-INTEGRITY gate for display. Returns null when
 * no verification record is present. This is the TRUTH gate (cited IDs grounded
 * in the evidence actually fetched) — the number that backs the zero-fabrication
 * guarantee — as opposed to the citation-density heuristic in QualityReport.
 */
export function summarizeCitationIntegrity(
  cv: CitationVerification | undefined
): {
  verdict: string;
  ok: boolean;
  cited: number;
  grounded: number;
  ungrounded: number;
  groundedPct: number;
  floorPct: number;
  retracted: number;
} | null {
  if (!cv || typeof cv.cited !== "number") return null;
  const cited = cv.cited || 0;
  const grounded = cv.grounded || 0;
  const ratio =
    typeof cv.grounded_ratio === "number" ? cv.grounded_ratio : cited > 0 ? grounded / cited : 0;
  const floor = typeof cv.min_grounded_ratio === "number" ? cv.min_grounded_ratio : 0.75;
  return {
    verdict: cv.verdict || (cv.pass ? "PASS" : "FAIL"),
    ok: cv.pass === true,
    cited,
    grounded,
    ungrounded: typeof cv.ungrounded === "number" ? cv.ungrounded : Math.max(0, cited - grounded),
    groundedPct: Math.round(ratio * 100),
    floorPct: Math.round(floor * 100),
    retracted: Array.isArray(cv.retracted) ? cv.retracted.length : 0,
  };
}

/**
 * Build the markdown body for each note type.
 */

export function buildWorkflowOverview(
  state: WorkflowState,
  agentNotes: Array<{ role: string; noteName: string }>,
  qualityNoteName: string | null,
  datasetNoteName: string | null
): string {
  const lines: string[] = [];
  const inputLabel = Object.values(state.inputs || {}).join(" / ");
  lines.push(`# ${state.template_id} — ${inputLabel}`);
  lines.push("");

  // Summary
  lines.push("## Summary");
  lines.push("");
  lines.push(`| Field | Value |`);
  lines.push(`|-------|-------|`);
  lines.push(`| Template | ${state.template_id} |`);
  lines.push(`| Status | ${state.status} |`);
  lines.push(`| Created | ${state.created_at} |`);
  if (state.completed_at) {
    lines.push(`| Completed | ${state.completed_at} |`);
  }
  for (const [key, val] of Object.entries(state.inputs || {})) {
    lines.push(`| ${key} | ${val} |`);
  }
  lines.push("");

  // Pipeline progress
  lines.push("## Pipeline");
  lines.push("");
  lines.push(`| Step | Type | Status |`);
  lines.push(`|------|------|--------|`);
  for (const step of state.pipeline_progress.steps) {
    const icon = stepStatusIcon(step.status);
    const label = STEP_TYPE_LABELS[step.type] || step.type;
    lines.push(`| ${step.step_id} | ${label} | ${icon} ${step.status} |`);
  }
  lines.push("");

  // Agent outputs
  if (agentNotes.length > 0) {
    lines.push("## Agent Outputs");
    lines.push("");
    for (const a of agentNotes) {
      lines.push(`- [[${a.noteName}|${capitalize(a.role)}]]`);
    }
    lines.push("");
  }

  // Quality
  if (qualityNoteName) {
    lines.push("## Quality");
    lines.push("");
    // The citation-INTEGRITY gate (truth-based: cited IDs grounded in fetched
    // evidence) — the number that actually backs the zero-fabrication guarantee.
    const ci = summarizeCitationIntegrity(state.artifacts?.citation_verification);
    if (ci) {
      lines.push(
        `**Citation integrity: ${ci.verdict}** — ${ci.grounded}/${ci.cited} cited IDs grounded (${ci.groundedPct}%, ${ci.ungrounded} unverified, ${ci.retracted} retracted; floor ${ci.floorPct}%)`
      );
    }
    // The citation-DENSITY heuristic (writing coverage, NOT verification).
    const qr = state.artifacts?.quality_report;
    if (qr) {
      const density = qr.citation_density_raw ?? (qr.total_claims > 0 ? qr.verified_claims / qr.total_claims : 0);
      lines.push(
        `Citation density: ${density.toFixed(2)} (${qr.verified_claims}/${qr.total_claims} lines carry an inline citation — a writing heuristic, not verification)`
      );
    }
    lines.push(`See: [[${qualityNoteName}]]`);
    lines.push("");
  }

  // Dataset
  if (datasetNoteName) {
    lines.push("## Dataset");
    lines.push("");
    lines.push(`See: [[${datasetNoteName}]]`);
    lines.push("");
  }

  // Artifacts
  lines.push("## Artifacts");
  lines.push("");
  if (state.artifacts?.mission_id) {
    lines.push(`- Mission: \`${state.artifacts.mission_id}\``);
  }
  if (state.artifacts?.dataset_id) {
    lines.push(`- Dataset: \`${state.artifacts.dataset_id}\``);
  }
  if (state.artifacts?.offer_id) {
    lines.push(`- Offer: \`${state.artifacts.offer_id}\``);
  }
  if (state.artifacts?.export_path) {
    lines.push(`- Export: \`${state.artifacts.export_path}\``);
  }
  lines.push("");

  return lines.join("\n");
}

export function buildAgentNote(
  role: string,
  content: string,
  workflowNoteName: string,
  tokenCount: number,
  provider: string,
  model: string,
  taskId?: string
): string {
  const lines: string[] = [];
  lines.push(`# ${capitalize(role)} Output`);
  lines.push("");
  lines.push(
    `> Workflow: [[${workflowNoteName}]] | Provider: ${provider} (${model}) | Tokens: ${tokenCount.toLocaleString()}`
  );
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(sanitizeForVault(content, role));
  lines.push("");
  if (taskId) {
    lines.push("---");
    lines.push("");
    lines.push(
      `> Full output: \`workspace/research-output/${taskId}/output.md\``
    );
    lines.push("");
  }
  return lines.join("\n");
}

export function buildQualityNote(
  workflowId: string,
  qr: QualityReport,
  workflowNoteName: string,
  cv?: CitationVerification
): string {
  const lines: string[] = [];
  lines.push("# Quality Audit");
  lines.push("");
  lines.push(`Workflow: [[${workflowNoteName}]]`);
  lines.push("");

  // 1. Citation INTEGRITY \u2014 the truth gate (cited IDs grounded vs fetched
  //    evidence). This is the number that backs the zero-fabrication guarantee.
  const ci = summarizeCitationIntegrity(cv);
  if (ci) {
    const barLen = 20;
    const filled = Math.round((ci.groundedPct / 100) * barLen);
    const bar = "\u2588".repeat(filled) + "\u2591".repeat(barLen - filled);
    lines.push("## Citation integrity (verification gate)");
    lines.push("");
    lines.push(
      `**${ci.verdict}** \u2014 every cited identifier cross-checked against the evidence actually fetched at runtime.`
    );
    lines.push("");
    lines.push(`Grounded: ${ci.groundedPct}% \`${bar}\``);
    lines.push("");
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Verdict | ${ci.verdict} |`);
    lines.push(`| Cited IDs grounded | ${ci.grounded} / ${ci.cited} (${ci.groundedPct}%) |`);
    lines.push(`| Unverified (ungrounded) | ${ci.ungrounded} |`);
    lines.push(`| Retracted | ${ci.retracted} |`);
    lines.push(`| Grounded floor to pass | ${ci.floorPct}% |`);
    lines.push("");
  }

  // 2. Citation DENSITY \u2014 a cheap writing-coverage heuristic, NOT verification.
  const density = qr.citation_density_raw ?? (qr.total_claims > 0 ? qr.verified_claims / qr.total_claims : 0);
  lines.push("## Citation density (writing heuristic \u2014 not verification)");
  lines.push("");
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Citation density | ${density.toFixed(2)} |`);
  lines.push(`| Lines with an inline citation | ${qr.verified_claims} / ${qr.total_claims} |`);
  lines.push(`| Density check | ${qr.pass ? "pass" : "fail"} |`);
  lines.push("");
  lines.push(
    `> Density measures how citation-dense the writing is (lines matching a citation pattern). It is **not** a confidence or verification score \u2014 the verification gate above is the one that backs the zero-fabrication guarantee.`
  );
  lines.push("");

  return lines.join("\n");
}

export function buildDatasetNote(
  datasetId: string,
  workflowNoteName: string,
  rowCount?: number
): string {
  const lines: string[] = [];
  lines.push("# Dataset Card");
  lines.push("");
  lines.push(`Workflow: [[${workflowNoteName}]]`);
  lines.push("");
  lines.push(`| Field | Value |`);
  lines.push(`|-------|-------|`);
  lines.push(`| Dataset ID | \`${datasetId}\` |`);
  if (rowCount !== undefined) {
    lines.push(`| Row count | ${rowCount} |`);
  }
  lines.push("");
  return lines.join("\n");
}

function stepStatusIcon(status: string): string {
  switch (status) {
    case "completed":
      return "\u2713";
    case "running":
      return "\u25CB";
    case "failed":
      return "\u2717";
    default:
      return "\u2022";
  }
}

/**
 * Sanitize raw agent output for vault indexing.
 *
 * Strips infrastructure noise (code blocks, ToolUniverse source lines,
 * retrieval timestamps, handoff boilerplate, live data summary tables)
 * while preserving research findings, citations, and analysis.
 */
export function sanitizeForVault(content: string, role?: string): string {
  let lines = content.split("\n");

  // 1. Remove fenced code blocks — convert small ones (< 5 lines) to
  //    blockquotes, strip large ones entirely
  lines = collapseCodeBlocks(lines);

  // 2. Remove ToolUniverse source attribution lines
  lines = lines.filter(
    (l) =>
      !l.match(/^\*\*Source\*\*:\s*ToolUniverse/i) &&
      !l.match(/^\*\*Source\*\*:.*findTool-/i)
  );

  // 3. Remove retrieval timestamps inline
  lines = lines.map((l) =>
    l.replace(/\s*\(Retrieved:\s*\d{4}-\d{2}-\d{2}T[\d:]+Z\)/g, "")
  );

  // 4. Remove handoff boilerplate at end of notes
  lines = stripTrailingHandoff(lines);

  // 5. Remove "Live Data Source Summary" sections (operational metadata)
  lines = stripSection(lines, /^#+\s*\d*\.?\s*Live Data Source Summary/i);

  // 6. For scout role, also strip full tool description sections —
  //    keep only Executive Summary and key findings
  if (role === "scout") {
    lines = stripScoutToolCatalog(lines);
  }

  // 7. Collapse runs of 3+ blank lines to 2
  const result: string[] = [];
  let blankRun = 0;
  for (const line of lines) {
    if (line.trim() === "") {
      blankRun++;
      if (blankRun <= 2) result.push(line);
    } else {
      blankRun = 0;
      result.push(line);
    }
  }

  return result.join("\n").trim();
}

/**
 * Convert small code blocks (< 5 lines) to blockquotes.
 * Remove large code blocks entirely.
 */
function collapseCodeBlocks(lines: string[]): string[] {
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    if (lines[i].match(/^```/)) {
      // Collect the block
      const blockLines: string[] = [];
      i++; // skip opening fence
      while (i < lines.length && !lines[i].match(/^```/)) {
        blockLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // skip closing fence

      // Convert small blocks to blockquotes, drop large ones
      if (blockLines.length > 0 && blockLines.length < 5) {
        for (const bl of blockLines) {
          result.push(`> ${bl}`);
        }
      }
      // Large blocks (>= 5 lines) are silently dropped
    } else {
      result.push(lines[i]);
      i++;
    }
  }

  return result;
}

/**
 * Remove trailing handoff boilerplate (agent-to-agent instructions).
 */
function stripTrailingHandoff(lines: string[]): string[] {
  // Work backwards from end, strip italic handoff lines
  let end = lines.length;
  while (end > 0) {
    const trimmed = lines[end - 1].trim();
    if (trimmed === "" || trimmed === "---") {
      end--;
      continue;
    }
    if (
      trimmed.startsWith("*") &&
      trimmed.endsWith("*") &&
      /handoff|output complete|hand off/i.test(trimmed)
    ) {
      end--;
      continue;
    }
    break;
  }
  return lines.slice(0, end);
}

/**
 * Strip an entire markdown section by header pattern.
 * Removes from the matching header through to the next same-level-or-higher header.
 */
function stripSection(lines: string[], headerPattern: RegExp): string[] {
  const result: string[] = [];
  let skipping = false;
  let skipLevel = 0;

  for (const line of lines) {
    const headerMatch = line.match(/^(#+)\s/);

    if (skipping) {
      if (headerMatch && headerMatch[1].length <= skipLevel) {
        skipping = false;
        result.push(line);
      }
      // else skip the line
    } else if (headerPattern.test(line) && headerMatch) {
      skipping = true;
      skipLevel = headerMatch[1].length;
    } else {
      result.push(line);
    }
  }

  return result;
}

/**
 * For scout outputs, keep only the Executive Summary and any explicitly
 * research-focused sections. Strip all numbered tool catalog sections
 * (1. Compound..., 2. Drug Classification..., 3. ADMET..., etc.)
 * since these are ToolUniverse reference material, not research findings.
 */
function stripScoutToolCatalog(lines: string[]): string[] {
  const result: string[] = [];
  let inNumberedSection = false;
  let sectionLevel = 0;

  for (const line of lines) {
    const headerMatch = line.match(/^(#+)\s/);

    if (inNumberedSection) {
      // Exit when we hit a same-or-higher-level header that isn't numbered
      if (headerMatch && headerMatch[1].length <= sectionLevel) {
        // Check if this new header is also a numbered tool section
        if (/^#+\s*\d+\./.test(line)) {
          // Still a numbered section — keep skipping
          continue;
        }
        inNumberedSection = false;
        result.push(line);
      }
      // Else skip (still inside numbered section)
    } else if (headerMatch && /^#+\s*\d+\.\s/.test(line)) {
      // Entering a numbered section (e.g., "## 1. Compound Identification...")
      inNumberedSection = true;
      sectionLevel = headerMatch[1].length;
    } else {
      result.push(line);
    }
  }

  return result;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
