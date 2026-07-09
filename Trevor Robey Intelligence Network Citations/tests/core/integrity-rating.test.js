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

  it("handles empty/missing input gracefully", () => {
    const r = buildIntegrityReport();
    assert.equal(r.grade, "N/A");
    assert.match(r.markdown, /Citation Integrity/);
  });
});
