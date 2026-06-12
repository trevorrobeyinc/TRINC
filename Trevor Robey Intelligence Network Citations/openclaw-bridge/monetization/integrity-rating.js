"use strict";

// integrity-rating.js — Slice 3: the Citation Integrity & Provenance ledger.
//
// Turns the citation gate's verification (grounded vs unverified vs retracted) into the
// deliverable's audit-trail artifact — the product's defensible spine. Per the cost-cutting
// research brief, "the deliverable IS the audit trail": a black-box vendor can't show per-claim
// provenance, so this ledger is the moat. It is DETERMINISTIC (no LLM narration), so the
// integrity claim is itself verifiable.

function buildIntegrityReport(citationVerification = {}) {
  const cv = citationVerification || {};
  const cited = Math.max(0, Number(cv.cited) || 0);
  const grounded = Math.max(0, Number(cv.grounded) || 0);
  const ungrounded = Math.max(0, Number(cv.ungrounded) || 0);
  const ratio = Number(cv.grounded_ratio) || 0;
  const retracted = Array.isArray(cv.retracted) ? cv.retracted : [];
  const ungroundedSample = Array.isArray(cv.ungrounded_sample) ? cv.ungrounded_sample : [];

  let grade;
  let verdict;
  if (retracted.length > 0) {
    grade = "F";
    verdict = "BLOCKED — cites one or more RETRACTED sources";
  } else if (cited === 0) {
    grade = "N/A";
    verdict = "no extractable citations to verify";
  } else if (ratio >= 0.9) {
    grade = "A";
    verdict = "High integrity — nearly all citations grounded in fetched evidence";
  } else if (ratio >= 0.75) {
    grade = "B";
    verdict = "Strong integrity — most citations grounded; review the unverified";
  } else if (ratio >= 0.5) {
    grade = "C";
    verdict = "Moderate integrity — a meaningful share unverified; review before relying";
  } else {
    grade = "D";
    verdict = "Low integrity — many citations not grounded in fetched evidence";
  }

  const pct = cited > 0 ? Math.round(ratio * 100) : 0;
  const lines = [
    "# Citation Integrity & Provenance",
    "",
    `**Integrity grade: ${grade}** — ${verdict}`,
    "",
    "Every identifier cited in this report is checked, at generation time, against the source records actually retrieved for it. A citation is **grounded** only if it appears in evidence this report fetched; identifiers not in that set are flagged **unverified**; any source flagged **retracted** (Crossref / Retraction Watch) blocks the report. This ledger is the audit trail — the report's defensible spine.",
    "",
    "| Metric | Value |",
    "| --- | --- |",
    `| Citations | ${cited} |`,
    `| Grounded in fetched evidence | ${grounded} (${pct}%) |`,
    `| Unverified (treat as unconfirmed) | ${ungrounded} |`,
    `| Retracted | ${retracted.length} |`
  ];
  if (retracted.length > 0) {
    lines.push("", "## ⛔ Retracted sources (report blocked from release)", "", ...retracted.map((d) => `- ${d}`));
  }
  if (ungroundedSample.length > 0) {
    lines.push(
      "",
      "## ⚠️ Unverified citations",
      "",
      "These appear in the report but were not in the runtime-fetched evidence — treat as unconfirmed until independently checked:",
      "",
      ...ungroundedSample.map((s) => `- ${s}`)
    );
  }
  lines.push("");
  return { grade, verdict, markdown: lines.join("\n") };
}

module.exports = { buildIntegrityReport };
