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
  // T1-3 (2026-11-14): every untraced identifier (the full `ungrounded_ids` list), not a 25-item
  // sample; a record that predates the full list falls back to its sample.
  const ungroundedSample = Array.isArray(cv.ungrounded_ids) ? cv.ungrounded_ids
    : Array.isArray(cv.ungrounded_sample) ? cv.ungrounded_sample : [];

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

  // T1-7 (2026-11-14): the retraction screen's coverage. `retraction_screen_checked` is absent only on
  // a record that predates it, in which case coverage is unknown and nothing is claimed either way.
  const screenKnown = typeof cv.retraction_screen_checked === "boolean";
  const screenComplete = cv.retraction_screen_checked === true;
  const unscreenedIds = Array.isArray(cv.unscreened_ids) ? cv.unscreened_ids : [];
  const screenCited = Number.isFinite(cv.retraction_screen_cited) ? cv.retraction_screen_cited : null;
  const unscreenedCount = Number.isFinite(cv.unscreened) ? cv.unscreened : unscreenedIds.length;
  const screenRow = !screenKnown
    ? "not recorded for this report"
    : screenComplete
      ? "complete"
      : `INCOMPLETE: ${unscreenedCount}${screenCited !== null ? ` of ${screenCited}` : ""} cited DOIs and PMIDs not screened`;
  const coverageSentence = !screenKnown
    ? "This report's record does not state whether every cited DOI and PMID could be screened."
    : screenComplete
      ? "Every cited DOI and PMID was retraction-screened."
      : `${unscreenedCount}${screenCited !== null ? ` of ${screenCited}` : ""} cited DOIs and PMIDs could not be screened; they are listed under "Retraction screen" below.`;

  const pct = cited > 0 ? Math.round(ratio * 100) : 0;
  const lines = [
    "# Citation Integrity & Provenance",
    "",
    `**Integrity grade: ${grade}** — ${verdict}`,
    "",
    // The live screen is Crossref for DOIs (a work's own retraction relation, or an `updated-by`
    // retraction entry, which is where Crossref serves the Retraction Watch data, read since T1-7)
    // plus PubMed pubtype for PMIDs, with a DOI→PMID escalation. The Retraction Watch database itself
    // is not queried. Never name a source we do not query.
    "Every identifier cited in this report is checked, at generation time, against the source records actually retrieved for it. A citation is **grounded** only if it appears in evidence this report fetched; identifiers not in that set are flagged **unverified**; any source flagged **retracted** (Crossref for DOIs, PubMed for PMIDs, with a DOI→PMID cross-check) blocks the report. "
      + `${coverageSentence} Coverage bound: the Retraction Watch bulk dataset is not used; Crossref's own retraction entries, including those it carries from that dataset, are read for every DOI Crossref holds, so a retraction recorded in neither Crossref nor PubMed would not be caught. This ledger is the audit trail — the report's defensible spine.`,
    "",
    "| Metric | Value |",
    "| --- | --- |",
    `| Citations | ${cited} |`,
    `| Grounded in fetched evidence | ${grounded} (${pct}%) |`,
    `| Unverified (treat as unconfirmed) | ${ungrounded} |`,
    `| Retracted | ${retracted.length} |`,
    `| Retraction screen | ${screenRow} |`
  ];
  // T1-5 (2026-11-14): which matching rule grounded the citations. "type_and_id": a cited id counts as
  // grounded only if a retrieved record has the same identifier type and number; "id_only": an evidence
  // record from this run carried no identifier types, so numbers were matched alone.
  if (cv.grounding_match === "type_and_id") {
    lines.push("| Matched on | identifier type and number (type_and_id) |");
  } else if (cv.grounding_match === "id_only") {
    lines.push("| Matched on | identifier number only (id_only): an evidence record from this run carried no identifier types |");
  }
  if (retracted.length > 0) {
    lines.push("", "## ⛔ Retracted sources (report blocked from release)", "", ...retracted.map((d) => `- ${d}`));
  }
  if (screenKnown && !screenComplete && unscreenedIds.length > 0) {
    lines.push(
      "",
      "## Retraction screen: not screened",
      "",
      `Retraction screen: INCOMPLETE, ${unscreenedCount}${screenCited !== null ? ` of ${screenCited}` : ""} cited DOIs and PMIDs not screened. Each one below could not be checked against a retraction source (the source was unreachable, or holds no record of it); none is known to be retracted:`,
      "",
      ...unscreenedIds.map((s) => `- ${s}`)
    );
  }
  // Operator default D3 (2026-11-14): a partial retraction, withdrawal or expression of concern on a
  // cited work is recorded here and never blocks; only an exact retraction blocks.
  const editorial = Array.isArray(cv.retraction_editorial_flags) ? cv.retraction_editorial_flags : [];
  if (editorial.length > 0) {
    lines.push(
      "",
      "## Editorial notices on cited works (not blocking)",
      "",
      ...editorial.map((e) => `- ${e.id}: ${String(e.type).replace(/_/g, " ")}${e.source ? ` (recorded by ${e.source === "retraction-watch" ? "Crossref" : e.source})` : ""}`)
    );
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
