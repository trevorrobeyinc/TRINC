"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  STATUS, collectSearchCoverage, summarizeCoverage, buildSearchCoverageLedger
} = require("../../openclaw-bridge/monetization/search-coverage-ledger.js");

function fakeReader(map) {
  return (p) => {
    if (Object.prototype.hasOwnProperty.call(map, p)) return map[p];
    throw new Error("ENOENT " + p);
  };
}

const MIXED = [
  { source: "PubMed", query: "drug X heart failure", status: "returned", records: 5 },
  { source: "PubMed", query: "drug X mortality", status: "returned", records: 7 },
  { source: "ClinicalTrials.gov", query: "drug X phase 3", status: "empty", records: 0 },
  { source: "ChEMBL", query: "target Z", status: "failed", records: 0 },
  { source: "OpenTargets", query: "", status: "skipped", records: 0 }
];

describe("search-coverage-ledger", () => {
  describe("summarizeCoverage", () => {
    it("counts real searches, excludes skipped, splits zero vs failed", () => {
      const s = summarizeCoverage(MIXED);
      assert.equal(s.searches, 4);          // 2 returned + 1 empty + 1 failed (skipped excluded)
      assert.equal(s.skipped, 1);
      assert.equal(s.records_total, 12);    // 5 + 7
      assert.equal(s.zero_result, 1);       // the empty CT.gov search
      assert.equal(s.failed, 1);            // the ChEMBL transport failure
      assert.equal(s.sources_count, 3);     // PubMed, ClinicalTrials.gov, ChEMBL (OpenTargets was skipped)
    });

    it("per-source rows are sorted deterministically", () => {
      const s = summarizeCoverage(MIXED);
      assert.deepEqual(s.by_source.map((b) => b.source), ["ChEMBL", "ClinicalTrials.gov", "PubMed"]);
      const pubmed = s.by_source.find((b) => b.source === "PubMed");
      assert.equal(pubmed.searches, 2);
      assert.equal(pubmed.records, 12);
    });

    it("treats an unknown/malformed status conservatively as zero-result — never invents a hit", () => {
      const s = summarizeCoverage([{ source: "X", query: "q", status: "weird", records: 99 }]);
      assert.equal(s.zero_result, 1);       // unknown status counted as a zero, not a returned hit
      // records_total still reflects the raw number, but it is NOT booked as a returned search
      assert.equal(s.by_source[0].zero, 1);
    });
  });

  describe("buildSearchCoverageLedger", () => {
    it("emits nothing when there are no real searches (packager then skips it)", () => {
      assert.equal(buildSearchCoverageLedger([]).markdown, "");
      assert.equal(buildSearchCoverageLedger([{ source: "X", status: "skipped" }]).markdown, "");
    });

    it("renders the honest-negative section listing every zero-result query", () => {
      const { markdown, summary } = buildSearchCoverageLedger(MIXED, { topic: "drug X in HFrEF" });
      assert.match(markdown, /# Search-Coverage Ledger/);
      assert.match(markdown, /drug X in HFrEF/);
      assert.match(markdown, /Zero-result searches \(honest-negative record\)/);
      assert.match(markdown, /ClinicalTrials\.gov.*drug X phase 3.*0 records/);
      assert.match(markdown, /Failed searches \(source unreachable\)/);
      assert.match(markdown, /ChEMBL.*target Z/);
      assert.equal(summary.zero_result, 1);
    });

    it("is fully deterministic — identical input yields byte-identical markdown", () => {
      const a = buildSearchCoverageLedger(MIXED, { topic: "T" }).markdown;
      const b = buildSearchCoverageLedger(MIXED.slice(), { topic: "T" }).markdown;
      assert.equal(a, b);
    });

    it("an all-zero run (INSUFFICIENT_EVIDENCE case) still ships a truthful ledger", () => {
      const allZero = [
        { source: "PubMed", query: "q1", status: "empty", records: 0 },
        { source: "ClinicalTrials.gov", query: "q2", status: "empty", records: 0 }
      ];
      const { markdown, summary } = buildSearchCoverageLedger(allZero, { topic: "obscure indication" });
      assert.equal(summary.searches, 2);
      assert.equal(summary.records_total, 0);
      assert.equal(summary.zero_result, 2);
      assert.match(markdown, /0 record\(s\) retrieved/);
      assert.match(markdown, /2 returned zero/);
    });
  });

  describe("collectSearchCoverage", () => {
    it("unions coverage across subtask sidecars and is fail-soft on unreadable ones", () => {
      const read = fakeReader({
        a: JSON.stringify({ search_coverage: [{ source: "PubMed", status: "returned", records: 3 }] }),
        b: JSON.stringify({ search_coverage: [{ source: "ChEMBL", status: "empty", records: 0 }] }),
        c: JSON.stringify({ /* no search_coverage key */ fetched_citation_ids: ["12345678"] })
      });
      const recs = collectSearchCoverage(
        [{ metadata_path: "a" }, { metadata_path: "b" }, { metadata_path: "c" }, { metadata_path: "missing" }],
        read
      );
      assert.equal(recs.length, 2);
      assert.equal(summarizeCoverage(recs).sources_count, 2);
    });
  });

  it("exposes a frozen STATUS enum", () => {
    assert.equal(STATUS.EMPTY, "empty");
    assert.ok(Object.isFrozen(STATUS));
  });
});
