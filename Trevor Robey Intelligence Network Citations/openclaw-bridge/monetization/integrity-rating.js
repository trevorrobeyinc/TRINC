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
// T2-6: how the manifest names the deliverables an identifier appears in.
const { sectionLabel, sectionOrder } = require("../core/reproducibility-manifest.js");

// T2-4 (2026-11-16): the grade's rubric, and the rest of the record printed under it. The grade
// measures grounding alone (the share of cited identifiers found in the evidence this report
// retrieved). The registry check, the delivery decision and the attribution check are separate
// results, so the ledger prints them beside the grade and a reader never takes an A for the whole
// record: all seven ledgers sealed before Tier 1 read A, including two whose retraction screen was
// incomplete and three with UNCHECKED identifiers.
const FLOOR_DEFAULT = 0.75;
const GRADE_A_MIN = 0.9;
const GRADE_C_MIN = 0.5;

/** The citation gate's floor as the record states it. A floor recorded below 0.75 (before T1-6) never loosens a grade. */
function recordedFloor(cv) {
  const f = Number(cv && cv.min_grounded_ratio);
  return Number.isFinite(f) && f >= FLOOR_DEFAULT && f <= 1 ? f : FLOOR_DEFAULT;
}

const pctText = (x) => `${Math.round(x * 100)}%`;

function gradeRubric(floor) {
  const aMin = Math.max(GRADE_A_MIN, floor);
  const ab = floor < GRADE_A_MIN
    ? `**A**: ${pctText(GRADE_A_MIN)} or more of the cited identifiers grounded in the evidence retrieved for this report. **B**: from the citation gate's floor (${pctText(floor)}) to below ${pctText(GRADE_A_MIN)}.`
    : `**A**: the citation gate's floor (${pctText(aMin)}) or more of the cited identifiers grounded in the evidence retrieved for this report. (B does not apply: the floor is at or above ${pctText(GRADE_A_MIN)}.)`;
  return `Grade rubric: ${ab} **C** (${pctText(GRADE_C_MIN)} to below the floor) and **D** (below ${pctText(GRADE_C_MIN)}) are below the floor, and the gate does not let such a report ship. **F**: a cited source is retracted, which blocks the report. The grade measures grounding only; the registry check, the delivery decision and the attribution check are separate results, in the table below.`;
}

// Plain words for the manifest's reason codes. A code not listed is printed with its underscores as spaces.
const REASON_LABELS = Object.freeze({
  rate_limited: "the registry throttled the request",
  timeout: "the registry timed out",
  network_error: "the registry was unreachable",
  http_5xx: "registry error",
  unexpected_status: "unexpected registry answer",
  unparseable: "unreadable registry answer",
  reresolution_error: "the re-resolution pass failed",
  no_resolver: "no resolver for this identifier type",
  no_api_key: "no API key for this registry",
  registry_no_definitive_answer: "the register gave no definitive answer"
});
const DECISION_FLAG_LABELS = Object.freeze({
  unchecked_over_threshold: "some identifiers are UNCHECKED",
  attribution_mismatch: "an author or year written beside a cited work does not match its registry record",
  retraction_screen_incomplete: "the retraction screen could not screen every cited DOI, PMID and PMCID",
  unresolved_present: "an identifier did not resolve at its registry",
  retracted_doi: "a cited DOI is retracted",
  retracted_pmid: "a cited PMID is retracted",
  retracted_pmcid: "a cited PMCID is retracted",
  gate_fail: "the citation gate failed"
});
const reasonText = (code) => REASON_LABELS[code] || String(code).replace(/_/g, " ");

/** "29 VERIFIED · 0 UNRESOLVED · 2 UNCHECKED (the registry throttled the request: 2)". */
function registryCounts(counts, reasons) {
  const k = counts || {};
  const why = Object.entries(reasons || {}).sort(([a], [b]) => a.localeCompare(b)).map(([r, n]) => `${reasonText(r)}: ${n}`);
  return `${k.verified || 0} VERIFIED · ${k.unresolved || 0} UNRESOLVED · ${k.unchecked || 0} UNCHECKED${why.length > 0 ? ` (${why.join("; ")})` : ""}`;
}

/**
 * The table rows for the registry check, the delivery decision and the attribution check, from the
 * reproducibility manifest the record carries. None for a record without one (a bundle that never
 * went through the research path, or a record from before the manifest existed).
 */
function recordRows(cv) {
  const manifest = cv && cv.reproducibility_manifest && typeof cv.reproducibility_manifest === "object" ? cv.reproducibility_manifest : null;
  const s = (manifest && manifest.summary) || (cv && cv.reproducibility) || null;
  if (!s || typeof s !== "object" || !s.counts) return [];
  const rows = [];
  const bySection = s.by_section && typeof s.by_section === "object" ? s.by_section : null;
  const citations = manifest && Array.isArray(manifest.citations) ? manifest.citations : [];
  // Reasons for each identifier the registry did not confirm, per deliverable (an untagged row is the report's).
  const reasonsFor = (section) => {
    const out = {};
    for (const c of citations) {
      if (!c || c.status === "VERIFIED") continue;
      const secs = Array.isArray(c.sections) ? c.sections : ["report"];
      if (!secs.includes(section)) continue;
      const r = (c.evidence && c.evidence.reason) || "unknown";
      out[r] = (out[r] || 0) + 1;
    }
    return out;
  };
  if (s.reresolution_completed === false) {
    rows.push("| Re-resolved at the issuing registry | not completed this run: no identifier was looked up, and the report is not cleared for delivery |");
  } else {
    const reportCounts = bySection && bySection.report ? bySection.report : s.counts;
    rows.push(`| Re-resolved at the issuing registry${bySection ? " (this report's identifiers)" : ""} | ${registryCounts(reportCounts, reasonsFor("report"))} |`);
    if (bySection) {
      const others = sectionOrder(bySection).filter((sec) => sec !== "report")
        .map((sec) => `${sectionLabel(sec)}: ${bySection[sec].total || 0} (${registryCounts(bySection[sec], reasonsFor(sec))})`);
      if (others.length > 0) rows.push(`| Re-resolved at the issuing registry (NCT numbers the other deliverables list) | ${others.join("; ")} |`);
    }
  }
  const decision = typeof s.delivery_decision === "string" && s.delivery_decision ? s.delivery_decision : null;
  if (decision) {
    const codes = decision === "BLOCK"
      ? (Array.isArray(s.block_reasons) ? s.block_reasons : [])
      : (Array.isArray(s.flag_reasons) ? s.flag_reasons : []);
    const why = codes.map((c) => DECISION_FLAG_LABELS[c] || reasonText(c));
    rows.push(`| Delivery decision | ${decision}${why.length > 0 ? `: ${why.join("; ")}` : ""} |`);
  }
  const ac = s.attribution_check && typeof s.attribution_check === "object" ? s.attribution_check : null;
  if (ac) {
    if (ac.checked !== true) {
      rows.push(`| Attribution check | not completed${ac.error ? ` (${ac.error})` : ""}: no attribution is asserted either way |`);
    } else {
      const k = ac.counts || {};
      const works = Number.isFinite(k.mismatched_works) && k.mismatched_works > 0 && k.mismatched_works !== k.mismatched
        ? ` (${k.mismatched_works} cited work${k.mismatched_works === 1 ? "" : "s"})` : "";
      rows.push(`| Attribution check | ${k.checked || 0} checked · ${k.matched || 0} match · ${k.mismatched || 0} mismatch${works} · ${k.not_checked || 0} not checkable |`);
    }
  }
  return rows;
}

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

  // T2-4: the A and B bounds read the floor the record states (0.75 unless configured higher).
  const floor = recordedFloor(cv);
  let grade;
  let verdict;
  if (retracted.length > 0) {
    grade = "F";
    verdict = "BLOCKED — cites one or more RETRACTED sources";
  } else if (cited === 0) {
    grade = "N/A";
    verdict = "no extractable citations to verify";
  } else if (ratio >= Math.max(GRADE_A_MIN, floor)) {
    grade = "A";
    verdict = "High integrity — nearly all citations grounded in fetched evidence";
  } else if (ratio >= floor) {
    grade = "B";
    verdict = "Strong integrity — most citations grounded; review the unverified";
  } else if (ratio >= GRADE_C_MIN) {
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
    // T2-4: what the grade measures, with the floor this report's gate applied.
    gradeRubric(floor),
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
  // T2-4: the registry check, the delivery decision and the attribution check, when the record carries a manifest.
  lines.push(...recordRows(cv));
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
