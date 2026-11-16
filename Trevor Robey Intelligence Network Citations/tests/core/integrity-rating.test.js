"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { buildIntegrityReport } = require("../../openclaw-bridge/monetization/integrity-rating.js");

describe("integrity-rating — buildIntegrityReport", () => {
  it("grade A for high grounding, with the provenance table", () => {
    const r = buildIntegrityReport({ cited: 20, grounded: 19, ungrounded: 1, grounded_ratio: 0.95, retracted: [] });
    assert.equal(r.grade, "A");
    assert.match(r.markdown, /Integrity grade: A/);
    assert.match(r.markdown, /Grounded in fetched evidence \| 19 \(95%\)/);
  });

  it("renders the per-section coverage table when section_coverage is supplied (and omits it otherwise)", () => {
    const cv = { cited: 20, grounded: 20, grounded_ratio: 1, retracted: [] };
    const sc = [
      { section_id: "mission-abc:subtask:1", checked: true, gate_status: "pass", coverage_tier: "Comprehensive", distinct_source_count: 4 },
      { section_id: "mission-abc:subtask:2", checked: true, gate_status: "pass", coverage_tier: "Moderate", distinct_source_count: 2 },
      { section_id: "mission-abc:subtask:3", checked: false, skip_reason: "SearXNG unreachable" },
    ];
    const withCov = buildIntegrityReport(cv, sc).markdown;
    assert.match(withCov, /## Source coverage by section/);
    assert.match(withCov, /\| subtask 1 \| Comprehensive \| 4 \|/);
    assert.match(withCov, /\| subtask 2 \| Moderate \| 2 \|/);
    assert.match(withCov, /\| subtask 3 \| not checked \| — \|/);
    // T1-9: the tiers count search hits; they never claim the sources support the section.
    assert.doesNotMatch(withCov, /corroborat/i);
    assert.match(withCov, /this does not check that they support the section/);
    // backward compatible: no arg (or empty) → no coverage section
    assert.doesNotMatch(buildIntegrityReport(cv).markdown, /Source coverage by section/);
    assert.doesNotMatch(buildIntegrityReport(cv, []).markdown, /Source coverage by section/);
    // A record without `searched` (before 2026-11-15, or SearXNG) keeps the web-search wording.
    assert.match(withCov, /a web search on the section's key terms returned/);
    assert.doesNotMatch(withCov, /†/);
  });

  it("names the scholarly search the run used, and marks a section counted from one source (S1 review)", () => {
    const cv = { cited: 20, grounded: 20, grounded_ratio: 1, retracted: [] };
    const sc = [
      { section_id: "m:subtask:1", checked: true, gate_status: "pass", coverage_tier: "Comprehensive", distinct_source_count: 8, searched: "Europe PMC and Crossref", subject_anchored: true },
      { section_id: "m:subtask:2", checked: true, gate_status: "pass", coverage_tier: "Sparse", distinct_source_count: 1, searched: "Europe PMC and Crossref", subject_anchored: true,
        source_errors: ["crossref: HTTP 503", "retry crossref: HTTP 503"], unanswered_sources: ["crossref"] },
      { section_id: "m:subtask:3", checked: true, gate_status: "pass", coverage_tier: "Moderate", distinct_source_count: 2, searched: "Europe PMC and Crossref", subject_anchored: true,
        source_errors: ["crossref: HTTP 429"] }, // answered on the retry: no mark
      { section_id: "m:subtask:4", checked: false, skip_reason: "scholarly search unreachable: …", searched: "Europe PMC and Crossref", subject_anchored: true }
    ];
    const md = buildIntegrityReport(cv, sc).markdown;
    assert.match(md, /reflects how many distinct primary sources a search of Europe PMC and Crossref on the report's subject and the section's key terms returned; this does not check that they support the section/);
    assert.doesNotMatch(md, /web search/);
    assert.match(md, /\| subtask 1 \| Comprehensive \| 8 \|/);
    assert.match(md, /\| subtask 2 \| Sparse † \| 1 \|/);
    assert.match(md, /\| subtask 3 \| Moderate \| 2 \|/);
    assert.match(md, /\| subtask 4 \| not checked \| — \|/);
    assert.match(md, /† Only one of the two sources \(Europe PMC, Crossref\) could be searched for this section, so its count comes from that source alone\./);
    // No subject (a template with none in the subject chain): the sentence does not claim one.
    const bare = sc.slice(0, 1).map((s) => ({ ...s, subject_anchored: false }));
    assert.match(buildIntegrityReport(cv, bare).markdown, /a search of Europe PMC and Crossref on the section's key terms returned/);
  });

  it("grades B / C / D by grounded ratio", () => {
    assert.equal(buildIntegrityReport({ cited: 10, grounded: 8, grounded_ratio: 0.8, retracted: [] }).grade, "B");
    assert.equal(buildIntegrityReport({ cited: 10, grounded: 6, grounded_ratio: 0.6, retracted: [] }).grade, "C");
    assert.equal(buildIntegrityReport({ cited: 10, grounded: 3, grounded_ratio: 0.3, retracted: [] }).grade, "D");
  });

  it("a retracted citation forces grade F regardless of grounding ratio", () => {
    const r = buildIntegrityReport({ cited: 20, grounded: 19, grounded_ratio: 0.95, retracted: ["10.1/retracted"] });
    assert.equal(r.grade, "F");
    assert.match(r.markdown, /BLOCKED/);
    assert.match(r.markdown, /10\.1\/retracted/);
  });

  it("no citations → N/A", () => {
    assert.equal(buildIntegrityReport({ cited: 0, grounded: 0, grounded_ratio: 0, retracted: [] }).grade, "N/A");
  });

  it("lists the unverified sample", () => {
    const r = buildIntegrityReport({
      cited: 5, grounded: 3, ungrounded: 2, grounded_ratio: 0.6, retracted: [],
      ungrounded_sample: ["PMID:99999999", "NCT00000000"]
    });
    assert.match(r.markdown, /Unverified citations/);
    assert.match(r.markdown, /PMID:99999999/);
  });

  // T1-5: the ledger records which matching rule grounded the citations.
  it("states the grounding match, and omits the row for a record that predates it", () => {
    const base = { cited: 4, grounded: 4, grounded_ratio: 1, retracted: [] };
    assert.match(buildIntegrityReport({ ...base, grounding_match: "type_and_id" }).markdown,
      /\| Matched on \| identifier type and number \(type_and_id\) \|/);
    assert.match(buildIntegrityReport({ ...base, grounding_match: "id_only" }).markdown,
      /\| Matched on \| identifier number only \(id_only\)/);
    assert.doesNotMatch(buildIntegrityReport(base).markdown, /Matched on/);
  });

  // T1-7: the ledger states the retraction screen's coverage and names what it could not screen.
  it("shows a complete screen, or INCOMPLETE with every unscreened id listed", () => {
    const base = { cited: 4, grounded: 4, grounded_ratio: 1, retracted: [] };
    const complete = buildIntegrityReport({ ...base, retraction_screen_checked: true, retraction_screen_cited: 4, unscreened: 0 }).markdown;
    assert.match(complete, /\| Retraction screen \| complete \|/);
    assert.match(complete, /Every cited DOI, PMID and PMCID was retraction-screened\./);
    const partial = buildIntegrityReport({
      ...base, retraction_screen_checked: false, retraction_screen_cited: 6, unscreened: 2,
      unscreened_ids: ["DOI:10.4444/missing", "PMID:20000002"]
    }).markdown;
    assert.match(partial, /\| Retraction screen \| INCOMPLETE: 2 of 6 cited DOIs, PMIDs and PMCIDs not screened \|/);
    assert.match(partial, /Retraction screen: INCOMPLETE, 2 of 6 cited DOIs, PMIDs and PMCIDs not screened/);
    assert.match(partial, /- DOI:10\.4444\/missing\n- PMID:20000002/);
    assert.doesNotMatch(partial, /was retraction-screened/);
    const unknown = buildIntegrityReport(base).markdown;
    assert.match(unknown, /\| Retraction screen \| not recorded for this report \|/);
  });

  it("lists partial retractions, withdrawals and expressions of concern as non-blocking notices (D3)", () => {
    const md = buildIntegrityReport({
      cited: 2, grounded: 2, grounded_ratio: 1, retracted: [], retraction_screen_checked: true,
      retraction_editorial_flags: [{ id: "DOI:10.9/work", type: "expression_of_concern", source: "publisher" }]
    }).markdown;
    assert.match(md, /## Editorial notices on cited works \(not blocking\)/);
    assert.match(md, /- DOI:10\.9\/work: expression of concern \(recorded by publisher\)/);
  });

  // Tier 1 review (2026-11-14): the coverage bound states the screen's real limits.
  it("the coverage bound says cited PMIDs are checked in PubMed only and unscreened ids were not checked", () => {
    const md = buildIntegrityReport({ cited: 2, grounded: 2, grounded_ratio: 1, retracted: [], retraction_screen_checked: true }).markdown;
    assert.match(md, /cited PMIDs are checked in PubMed only/);
    assert.match(md, /or recorded only in Crossref for a paper cited by PMID alone, would not be caught/);
    assert.match(md, /an identifier listed as not screened was not checked at all/);
    assert.doesNotMatch(md, /every DOI Crossref holds/);
    assert.match(md, /Retraction Watch bulk dataset is not used/);
  });

  it("names the DOIs screened against Crossref alone, and the per-type limit among the not-screened reasons", () => {
    const one = buildIntegrityReport({ cited: 3, grounded: 3, grounded_ratio: 1, retracted: [], retraction_screen_checked: true, retraction_dois_crossref_only: 1 }).markdown;
    assert.match(one, /For 1 cited DOI the PubMed cross-check reached no verdict, so it was screened against Crossref alone\./);
    const none = buildIntegrityReport({ cited: 3, grounded: 3, grounded_ratio: 1, retracted: [], retraction_screen_checked: true }).markdown;
    assert.doesNotMatch(none, /screened against Crossref alone/);
    const partial = buildIntegrityReport({
      cited: 2, grounded: 2, grounded_ratio: 1, retracted: [], retraction_screen_checked: false,
      retraction_screen_cited: 2, unscreened: 1, unscreened_ids: ["PMID:1"]
    }).markdown;
    assert.match(partial, /past the screen's 500-per-type limit/);
  });

  it("handles empty/missing input gracefully", () => {
    const r = buildIntegrityReport();
    assert.equal(r.grade, "N/A");
    assert.match(r.markdown, /Citation Integrity/);
  });
});

// T2-4 (2026-11-16): the ledger states the whole record under its grade. The grade measures grounding
// alone; the registry check, the delivery decision and the attribution check are printed beside it.
describe("T2-4: the record under the grade", () => {
  const manifestOf = (summary, citations = []) => ({ citations, summary });
  const row = (type, id, status, reason, sections) => ({
    id, type, status, evidence: reason ? { reason } : {}, ...(sections ? { sections } : {})
  });

  it("prints the rubric with the floor the record states, and the floor bounds A and B", () => {
    const md = buildIntegrityReport({ cited: 10, grounded: 8, grounded_ratio: 0.8, min_grounded_ratio: 0.75, retracted: [] }).markdown;
    assert.match(md, /Grade rubric: \*\*A\*\*: 90% or more of the cited identifiers grounded in the evidence retrieved for this report\. \*\*B\*\*: from the citation gate's floor \(75%\) to below 90%\. \*\*C\*\* \(50% to below the floor\) and \*\*D\*\* \(below 50%\) are below the floor, and the gate does not let such a report ship\. \*\*F\*\*: a cited source is retracted, which blocks the report\./);
    assert.match(md, /The grade measures grounding only/);
    // A floor configured higher (T1-6 allows 0.75 to 1) raises B's bound with it.
    const strict = buildIntegrityReport({ cited: 10, grounded: 8, grounded_ratio: 0.8, min_grounded_ratio: 0.85, retracted: [] });
    assert.equal(strict.grade, "C");
    assert.match(strict.markdown, /from the citation gate's floor \(85%\) to below 90%/);
    // A floor at or above 90% makes it A's bound too.
    const top = buildIntegrityReport({ cited: 10, grounded: 9, grounded_ratio: 0.93, min_grounded_ratio: 0.95, retracted: [] });
    assert.equal(top.grade, "C");
    assert.match(top.markdown, /\*\*A\*\*: the citation gate's floor \(95%\) or more .*B does not apply/);
    // A floor recorded below 0.75 (before T1-6) never loosens a grade.
    assert.equal(buildIntegrityReport({ cited: 10, grounded: 6, grounded_ratio: 0.6, min_grounded_ratio: 0.34, retracted: [] }).grade, "C");
  });

  it("states the registry result with reasons, the delivery decision and the attribution counts", () => {
    const summary = {
      counts: { total: 4, verified: 2, unresolved: 0, unchecked: 2 },
      delivery_decision: "DELIVER_WITH_FLAGS",
      block_reasons: [],
      flag_reasons: ["unchecked_over_threshold", "attribution_mismatch"],
      attribution_check: { checked: true, counts: { cited: 3, checked: 3, matched: 2, mismatched: 1, mismatched_works: 1, not_checked: 1 } }
    };
    const md = buildIntegrityReport({
      cited: 4, grounded: 4, grounded_ratio: 1, retracted: [], retraction_screen_checked: true,
      reproducibility: summary,
      reproducibility_manifest: manifestOf(summary, [
        row("PMID", "1", "VERIFIED"), row("DOI", "10.1/a", "VERIFIED"),
        row("PMID", "2", "UNCHECKED", "rate_limited"), row("NCT", "NCT00000102", "UNCHECKED", "timeout")
      ])
    }).markdown;
    assert.match(md, /Integrity grade: A/, "the grade stays tied to grounding");
    assert.match(md, /\| Re-resolved at the issuing registry \| 2 VERIFIED · 0 UNRESOLVED · 2 UNCHECKED \(the registry throttled the request: 1; the registry timed out: 1\) \|/);
    assert.match(md, /\| Delivery decision \| DELIVER_WITH_FLAGS: some identifiers are UNCHECKED; an author or year written beside a cited work does not match its registry record \|/);
    assert.match(md, /\| Attribution check \| 3 checked · 2 match · 1 mismatch · 1 not checkable \|/);
  });

  it("splits the report's own identifiers from the NCT numbers the other deliverables list (T2-6)", () => {
    const summary = {
      counts: { total: 3, verified: 3, unresolved: 0, unchecked: 0 },
      by_section: {
        report: { total: 1, verified: 1, unresolved: 0, unchecked: 0 },
        "graveyard-memo": { total: 3, verified: 3, unresolved: 0, unchecked: 0 }
      },
      delivery_decision: "DELIVER", block_reasons: [], flag_reasons: []
    };
    const md = buildIntegrityReport({ cited: 1, grounded: 1, grounded_ratio: 1, retracted: [], reproducibility_manifest: manifestOf(summary) }).markdown;
    assert.match(md, /\| Re-resolved at the issuing registry \(this report's identifiers\) \| 1 VERIFIED · 0 UNRESOLVED · 0 UNCHECKED \|/);
    assert.match(md, /\| Re-resolved at the issuing registry \(NCT numbers the other deliverables list\) \| graveyard memo: 3 \(3 VERIFIED · 0 UNRESOLVED · 0 UNCHECKED\) \|/);
    assert.match(md, /\| Delivery decision \| DELIVER \|/);
  });

  it("the F case: a retraction blocks, and the decision row says why", () => {
    const summary = {
      counts: { total: 2, verified: 2, unresolved: 0, unchecked: 0 },
      delivery_decision: "BLOCK", block_reasons: ["retracted_doi"], flag_reasons: []
    };
    const r = buildIntegrityReport({ cited: 2, grounded: 2, grounded_ratio: 1, retracted: ["10.1/retracted"], reproducibility_manifest: manifestOf(summary) });
    assert.equal(r.grade, "F");
    assert.match(r.markdown, /\| Delivery decision \| BLOCK: a cited DOI is retracted \|/);
  });

  it("a crashed re-resolution pass and an attribution check that could not run are stated, not hidden", () => {
    const summary = {
      counts: { total: 1, verified: 0, unresolved: 0, unchecked: 1 }, reresolution_completed: false,
      delivery_decision: "DELIVER_WITH_FLAGS", block_reasons: [], flag_reasons: ["unchecked_over_threshold"],
      attribution_check: { checked: false, error: "internal_error" }
    };
    const md = buildIntegrityReport({ cited: 1, grounded: 1, grounded_ratio: 1, retracted: [], reproducibility: summary }).markdown;
    assert.match(md, /\| Re-resolved at the issuing registry \| not completed this run: no identifier was looked up, and the report is not cleared for delivery \|/);
    assert.match(md, /\| Attribution check \| not completed \(internal_error\): no attribution is asserted either way \|/);
  });

  it("a record with no manifest still renders, with no registry, decision or attribution row", () => {
    const md = buildIntegrityReport({ cited: 3, grounded: 3, grounded_ratio: 1, retracted: [] }).markdown;
    assert.match(md, /Integrity grade: A/);
    assert.match(md, /Grade rubric:/);
    assert.doesNotMatch(md, /Re-resolved at the issuing registry|Delivery decision|Attribution check/);
  });
});
