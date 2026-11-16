"use strict";

// integrity-rating.js — Slice 3: the Citation Integrity & Provenance ledger.
//
// Turns the citation gate's verification (grounded vs unverified vs retracted) into the
// deliverable's audit-trail artifact — the product's defensible spine. Per the cost-cutting
// research brief, "the deliverable IS the audit trail": a black-box vendor can't show per-claim
// provenance, so this ledger is the moat. It is DETERMINISTIC (no LLM narration), so the
// integrity claim is itself verifiable.

const { MAX_SCREEN_IDS_PER_CLASS } = require("../core/citation-gate.js");
// What a section searched since 2026-11-15, as the scholarly search names it ("Europe PMC and Crossref").
const { SEARCHED: SCHOLARLY_SEARCH } = require("../mcp/scholarly-search/scholarly-search.js");

// How the ledger names an editorial notice and who recorded it (T2-2, 2026-11-16).
const EDITORIAL_LABELS = Object.freeze({
  pubmed_retraction_link: "PubMed links a retraction notice to it, but its record is not marked retracted (a partial retraction, or an update not yet made)"
});
const SOURCE_LABELS = Object.freeze({ "retraction-watch": "Crossref", pubmed: "PubMed" });

/** "mission-abc:subtask:1" → "subtask 1"; plain ids pass through. */
function shortSection(id) {
  const s = String(id || "section");
  const parts = s.split(":");
  return parts.length > 1 ? parts.slice(1).join(" ") : s;
}

/** True when a source of the section's search answered on no pass (section-gate.js unanswered_sources). */
function searchedOnOneSource(s) {
  return Array.isArray(s && s.unanswered_sources) && s.unanswered_sources.length > 0;
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
      : `INCOMPLETE: ${unscreenedCount}${screenCited !== null ? ` of ${screenCited}` : ""} cited DOIs, PMIDs and PMCIDs not screened`;
  const coverageSentence = !screenKnown
    ? "This report's record does not state whether every cited DOI, PMID and PMCID could be screened."
    : screenComplete
      ? "Every cited DOI, PMID and PMCID was retraction-screened."
      : `${unscreenedCount}${screenCited !== null ? ` of ${screenCited}` : ""} cited DOIs, PMIDs and PMCIDs could not be screened; they are listed under "Retraction screen" below.`;
  // Tier 1 review (2026-11-14): DOIs Crossref holds whose PubMed cross-check reached no verdict count as
  // screened (the spec's rule), but against Crossref alone, so the ledger says so.
  const crossrefOnly = Number.isFinite(cv.retraction_dois_crossref_only) ? cv.retraction_dois_crossref_only : 0;
  const crossrefOnlySentence = crossrefOnly > 0
    ? ` For ${crossrefOnly} cited DOI${crossrefOnly === 1 ? "" : "s"} the PubMed cross-check reached no verdict, so ${crossrefOnly === 1 ? "it was" : "they were"} screened against Crossref alone.`
    : "";

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
    "Every identifier cited in this report is checked, at generation time, against the records retrieved for this report. A citation is **grounded** only if it appears in evidence this report fetched; identifiers not in that set are flagged **unverified**; any source flagged **retracted** (Crossref for DOIs, PubMed for PMIDs, with a DOI→PMID cross-check, and a PMCID through the PMID or DOI its PMC record lists) blocks the report. "
      // Tier 1 review (2026-11-14): the bound states the screen's real limits. Cited PMIDs go to PubMed
      // only (there is no PMID→DOI leg), so a retraction only Crossref records is missed for a paper
      // cited by PMID alone; and an identifier listed as not screened was not checked at all.
      + `${coverageSentence}${crossrefOnlySentence} Coverage bound: the Retraction Watch bulk dataset is not used. Crossref's own retraction entries, including those it carries from that dataset, are read for each cited DOI that Crossref holds, and cited PMIDs are checked in PubMed only; a cited PMCID is checked through the PMID its PMC record lists (or, with none, its DOI). A retraction recorded in neither place, or recorded only in Crossref for a paper cited by PMID alone, would not be caught, and an identifier listed as not screened was not checked at all. Trial registrations (NCT, ISRCTN and EudraCT numbers) carry no retraction record and are not screened. This ledger is the audit trail — the report's defensible spine.`,
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
      `Retraction screen: INCOMPLETE, ${unscreenedCount}${screenCited !== null ? ` of ${screenCited}` : ""} cited DOIs, PMIDs and PMCIDs not screened. Each one below could not be checked against a retraction source (the source was unreachable, holds no record of it, or the id was past the screen's ${MAX_SCREEN_IDS_PER_CLASS}-per-type limit); none is known to be retracted:`,
      "",
      ...unscreenedIds.map((s) => `- ${s}`)
    );
  }
  // Operator default D3 (2026-11-14): a partial retraction, withdrawal or expression of concern on a
  // cited work is recorded here and never blocks; only an exact retraction blocks. T2-2 (2026-11-16): PubMed's
  // notices too, and a "Retraction in" link on a PubMed record not marked retracted (operator default D14).
  const editorial = Array.isArray(cv.retraction_editorial_flags) ? cv.retraction_editorial_flags : [];
  if (editorial.length > 0) {
    lines.push(
      "",
      "## Editorial notices on cited works (not blocking)",
      "",
      ...editorial.map((e) => `- ${e.id}: ${EDITORIAL_LABELS[e.type] || String(e.type).replace(/_/g, " ")}${e.source ? ` (recorded by ${SOURCE_LABELS[e.source] || e.source})` : ""}`)
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
    // T1-9 (2026-11-14): the section gate counts distinct primary-source hits for a search on the
    // section's key terms (searxng-mcp/section-gate.js); it never checks that they support it.
    // S1 review (2026-11-15): the sentence names the search the run actually used. Every section
    // records it (`searched`, "Europe PMC and Crossref" since 2026-11-15); a run without that record
    // (before that date, or a non-science topic on SearXNG) keeps the web-search wording.
    const labels = new Set(coverage.map((s) => (s && typeof s.searched === "string" ? s.searched : "")));
    const scholarly = labels.size === 1 && labels.has(SCHOLARLY_SEARCH);
    const anchored = coverage.some((s) => s && s.subject_anchored === true);
    const how = scholarly
      ? `a search of Europe PMC and Crossref on ${anchored ? "the report's subject and " : ""}the section's key terms`
      : "a web search on the section's key terms";
    lines.push(
      "",
      "## Source coverage by section",
      "",
      `Independent primary-source coverage retrieved for each report section at generation time. **Sparse / Moderate / Comprehensive** reflects how many distinct primary sources ${how} returned; this does not check that they support the section. A section marked *not checked* could not be searched (e.g. the search backend was unreachable) and was not failed on that basis.`,
      "",
      "| Section | Coverage | Distinct primary sources |",
      "| --- | --- | --- |"
    );
    let anyPartial = false;
    for (const s of coverage) {
      const label = shortSection(s && s.section_id);
      if (s && s.checked === false) {
        lines.push(`| ${label} | not checked | — |`);
      } else {
        const tier = (s && s.coverage_tier) || (s && s.gate_status === "fail" ? "None" : "—");
        const n = s && Number.isFinite(s.distinct_source_count) ? s.distinct_source_count : 0;
        const mark = searchedOnOneSource(s) ? " †" : "";
        if (mark) anyPartial = true;
        lines.push(`| ${label} | ${tier}${mark} | ${n} |`);
      }
    }
    if (anyPartial) {
      lines.push(
        "",
        "† Only one of the two sources (Europe PMC, Crossref) could be searched for this section, so its count comes from that source alone."
      );
    }
  }

  lines.push("");
  return { grade, verdict, markdown: lines.join("\n") };
}

module.exports = { buildIntegrityReport };
