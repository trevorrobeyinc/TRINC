"use strict";

// citation-gate.js — Slice 1 of the post-research engine: the report-level citation gate.
//
// Verifies the assembled mission report against the UNION of runtime-fetched identifiers (the
// live ToolUniverse records, persisted per-task as metadata.fetched_citation_ids by
// agent-engine), and HARD-FAILS when too many cited identifiers are "ungrounded" — present in
// the report but absent from anything actually fetched, the signature of a model-introduced
// (hallucinated) citation. This is the enforcement backbone of the zero-fabrication brand
// promise: a report whose citations can't be traced to fetched evidence does not ship.
//
// Safety invariant: the gate only FAILS when there IS fetched ground truth (fetched_id_count > 0)
// AND the report cites identifiers AND too few are grounded. A missing/empty fetch yields no
// ground truth, so it can never hard-fail here (that case is surfaced separately as
// tool_prefetch_zero_docs) — preventing false failures when prefetch returned nothing.

const fs = require("node:fs");
const { extractCitations, deduplicateCitations, crossCheckCitations } = require("./citation-extractor.js");

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Union of live-fetched identifiers across every subtask's metadata sidecar.
function collectFetchedIds(subtaskResults, readFile = fs.readFileSync) {
  const ids = new Set();
  for (const st of Array.isArray(subtaskResults) ? subtaskResults : []) {
    if (!st || !st.metadata_path) continue;
    try {
      const meta = JSON.parse(readFile(st.metadata_path, "utf8"));
      const list = Array.isArray(meta.fetched_citation_ids) ? meta.fetched_citation_ids : [];
      for (const id of list) ids.add(String(id).toUpperCase());
    } catch { /* fail-soft: an unreadable sidecar just contributes no ground truth */ }
  }
  return [...ids];
}

// Concatenate all subtask outputs into the assembled report text.
function collectReportText(subtaskResults, readFile = fs.readFileSync) {
  const parts = [];
  for (const st of Array.isArray(subtaskResults) ? subtaskResults : []) {
    if (!st || !st.output_path) continue;
    try { parts.push(readFile(st.output_path, "utf8")); } catch { /* fail-soft */ }
  }
  return parts.join("\n\n");
}

// Inline-mark each ungrounded identifier with [UNVERIFIED] and append a verification summary.
function annotateUngrounded(reportText, ungroundedList) {
  let out = String(reportText || "");
  const seen = new Set();
  for (const c of Array.isArray(ungroundedList) ? ungroundedList : []) {
    const id = String(c.id);
    if (seen.has(id)) continue;
    seen.add(id);
    out = out.replace(new RegExp(escapeRegExp(id) + "(?!\\s*\\[UNVERIFIED\\])"), `${id} [UNVERIFIED]`);
  }
  if (Array.isArray(ungroundedList) && ungroundedList.length > 0) {
    out += "\n\n## ⚠️ Citation Verification\n\n" +
      "The following cited identifiers were NOT found in the evidence fetched at runtime and are flagged **UNVERIFIED**. " +
      "Per the zero-fabrication policy, treat each as unconfirmed until independently checked — they must not be presented as verified citations.\n\n" +
      ungroundedList.map((c) => `- ${c.type}: ${c.id}`).join("\n") + "\n";
  }
  return out;
}

// Annotate each subtask's output file in place so the SHIPPED bundle carries the [UNVERIFIED]
// marks (each section checked against the union of fetched ids). Fail-soft; returns count.
function annotateSubtaskOutputs(subtaskResults, fetchedIds, opts = {}) {
  const readFile = opts.readFile || fs.readFileSync;
  const writeFile = opts.writeFile || fs.writeFileSync;
  let annotated = 0;
  for (const st of Array.isArray(subtaskResults) ? subtaskResults : []) {
    if (!st || !st.output_path) continue;
    try {
      const text = readFile(st.output_path, "utf8");
      const x = crossCheckCitations(text, fetchedIds);
      if (x.unverified_count > 0) {
        writeFile(st.output_path, annotateUngrounded(text, x.unverified));
        annotated++;
      }
    } catch { /* fail-soft */ }
  }
  return annotated;
}

// Verify an assembled report's citations against the fetched ground-truth set.
function verifyReportCitations(opts = {}) {
  const subtaskResults = opts.subtaskResults;
  const readFile = opts.readFile;
  const threshold = Number.isFinite(opts.minGroundedRatio) ? opts.minGroundedRatio : 0.5;
  const fetchedIds = collectFetchedIds(subtaskResults, readFile);
  const reportText = collectReportText(subtaskResults, readFile);
  const x = crossCheckCitations(reportText, fetchedIds);
  const pass = fetchedIds.length === 0 || x.total === 0 || x.verified_ratio >= threshold;
  return {
    pass,
    cited: x.total,
    grounded: x.verified_count,
    ungrounded: x.unverified_count,
    grounded_ratio: x.verified_ratio,
    min_grounded_ratio: threshold,
    fetched_id_count: fetchedIds.length,
    ungrounded_list: x.unverified,
    fetchedIds,
    reportText,
    annotatedReport: annotateUngrounded(reportText, x.unverified)
  };
}

// Literature-integrity check: extract the report's cited DOIs and ask `checkDois` (a Crossref
// retraction checker) which are retracted. Fail-soft — any error yields no retractions, so a
// network problem can never wrongly flag the report. A confirmed-retracted citation is a
// critical integrity failure (the gate treats it as a hard stop).
async function checkRetractions(reportText, checkDois) {
  if (typeof checkDois !== "function") return { checked: false, retracted: [] };
  const dois = [...new Set(
    extractCitations(String(reportText || "")).filter((c) => c.type === "DOI").map((c) => c.id)
  )];
  if (dois.length === 0) return { checked: true, retracted: [], dois_checked: 0 };
  let results;
  try {
    results = await checkDois(dois.slice(0, 50));
  } catch {
    return { checked: false, retracted: [] };
  }
  const retracted = (Array.isArray(results) ? results : [])
    .filter((r) => r && r.retracted).map((r) => String(r.doi));
  return { checked: true, retracted, dois_checked: dois.length };
}

module.exports = {
  collectFetchedIds,
  collectReportText,
  annotateUngrounded,
  annotateSubtaskOutputs,
  verifyReportCitations,
  checkRetractions
};
