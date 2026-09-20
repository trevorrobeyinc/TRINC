"use strict";

// integrity-rating.js — Slice 3: the Citation Integrity & Provenance ledger.
//
// Turns the citation gate's verification (grounded vs unverified vs retracted) into the
// deliverable's audit-trail artifact — the product's defensible spine. Per the cost-cutting
// research brief, "the deliverable IS the audit trail": a black-box vendor can't show per-claim
// provenance, so this ledger is the moat. It is DETERMINISTIC (no LLM narration), so the
// integrity claim is itself verifiable.

/** "mission-abc:subtask:1" → "subtask 1"; plain ids pass through. */
function shortSection(id) {
  const s = String(id || "section");
  const parts = s.split(":");
  return parts.length > 1 ? parts.slice(1).join(" ") : s;
}

function buildIntegrityReport(citationVerification = {}, sectionCoverage = []) {
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
    // Retraction Watch is NOT screened anywhere in this engine — its bulk dataset is recorded in
    // SYSTEM-REALITY.md as an unbuilt residual gap. The live screen is Crossref for DOIs plus
    // PubMed pubtype for PMIDs, with a DOI→PMID escalation. Never name a source we do not query.
    "Every identifier cited in this report is checked, at generation time, against the source records actually retrieved for it. A citation is **grounded** only if it appears in evidence this report fetched; identifiers not in that set are flagged **unverified**; any source flagged **retracted** (Crossref for DOIs, PubMed for PMIDs, with a DOI→PMID cross-check) blocks the report. This ledger is the audit trail — the report's defensible spine.",
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
  // Per-section external primary-source coverage (from the SearXNG citation-coverage gate). Surfaces
  // the Sparse/Moderate/Comprehensive tier for each report section into the customer-facing ledger —
  // "how well-corroborated is each section" is a selling point, not just an internal artifact.
  const coverage = Array.isArray(sectionCoverage) ? sectionCoverage : [];
  if (coverage.length > 0) {
    lines.push(
      "",
      "## Source coverage by section",
      "",
      "Independent primary-source coverage retrieved for each report section at generation time. **Sparse / Moderate / Comprehensive** reflects how many distinct primary sources corroborate the section; a section marked *not checked* could not be verified against live search (e.g. the search backend was unreachable) and was not failed on that basis.",
      "",
      "| Section | Coverage | Distinct primary sources |",
      "| --- | --- | --- |"
    );
    for (const s of coverage) {
      const label = shortSection(s && s.section_id);
      if (s && s.checked === false) {
        lines.push(`| ${label} | not checked | — |`);
      } else {
        const tier = (s && s.coverage_tier) || (s && s.gate_status === "fail" ? "None" : "—");
        const n = s && Number.isFinite(s.distinct_source_count) ? s.distinct_source_count : 0;
        lines.push(`| ${label} | ${tier} | ${n} |`);
      }
    }
  }

  lines.push("");
  return { grade, verdict, markdown: lines.join("\n") };
}

module.exports = { buildIntegrityReport };
