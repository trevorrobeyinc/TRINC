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
    // backward compatible: no arg (or empty) → no coverage section
    assert.doesNotMatch(buildIntegrityReport(cv).markdown, /Source coverage by section/);
    assert.doesNotMatch(buildIntegrityReport(cv, []).markdown, /Source coverage by section/);
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
    assert.match(complete, /Every cited DOI and PMID was retraction-screened\./);
    const partial = buildIntegrityReport({
      ...base, retraction_screen_checked: false, retraction_screen_cited: 6, unscreened: 2,
      unscreened_ids: ["DOI:10.4444/missing", "PMID:20000002"]
    }).markdown;
    assert.match(partial, /\| Retraction screen \| INCOMPLETE: 2 of 6 cited DOIs and PMIDs not screened \|/);
    assert.match(partial, /Retraction screen: INCOMPLETE, 2 of 6 cited DOIs and PMIDs not screened/);
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

  it("handles empty/missing input gracefully", () => {
    const r = buildIntegrityReport();
    assert.equal(r.grade, "N/A");
    assert.match(r.markdown, /Citation Integrity/);
  });
});
