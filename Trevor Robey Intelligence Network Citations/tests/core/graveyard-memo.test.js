"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { buildGraveyardMemo, buildAmendmentRisk } = require("../../openclaw-bridge/monetization/graveyard-memo.js");

const TRIALS = [
  {
    title: "A Study of Foo in Bar", nctId: "NCT00000001", status: "TERMINATED", phase: "PHASE2",
    whyStopped: "Insufficient enrollment",
    changeSummary: { versions: 12, amended_modules: ["Eligibility", "Outcomes"], first: "2018", last: "2021" }
  },
  {
    title: "Foo Extension", nctId: "NCT00000002", status: "WITHDRAWN", phase: "PHASE1",
    whyStopped: "",
    changeSummary: { versions: 4, amended_modules: ["Eligibility"], first: "2019", last: "2020" }
  },
  { title: "No-history trial", nctId: "NCT00000003", status: "SUSPENDED", phase: "", whyStopped: "Business decision" }
];

describe("graveyard-memo", () => {
  describe("buildGraveyardMemo", () => {
    it("renders one NCT-traced entry per stopped trial with its stop reason + source URL", () => {
      const memo = buildGraveyardMemo(TRIALS, { indication: "Bar disease" });
      assert.equal(memo.count, 3);
      assert.ok(memo.markdown.includes("Bar disease"), "indication named");
      assert.ok(memo.markdown.includes("NCT00000001"));
      assert.ok(memo.markdown.includes("Insufficient enrollment"));
      assert.ok(memo.markdown.includes("https://clinicaltrials.gov/study/NCT00000003"), "resolvable source link");
      assert.ok(memo.markdown.includes("**Protocol churn:** 12 versions"), "change-history surfaced when present");
    });

    it("states a stop reason was not given rather than fabricating one", () => {
      const memo = buildGraveyardMemo([TRIALS[1]]);
      assert.ok(memo.markdown.includes("none stated by sponsor"));
    });

    it("filters out records lacking an nctId and reports an honest empty memo", () => {
      const memo = buildGraveyardMemo([{ title: "junk", whyStopped: "x" }, null, { nctId: "" }]);
      assert.equal(memo.count, 0);
      assert.ok(memo.markdown.includes("No terminated/withdrawn/suspended trials"));
    });

    it("tolerates a non-array input (fail-soft → empty)", () => {
      assert.equal(buildGraveyardMemo(undefined).count, 0);
      assert.equal(buildGraveyardMemo(null).count, 0);
    });
  });

  describe("buildAmendmentRisk", () => {
    it("computes median/max + most-amended modules + a risk band from change-history", () => {
      const risk = buildAmendmentRisk(TRIALS);
      assert.equal(risk.sampled, 2, "only trials with version history are sampled");
      assert.equal(risk.median, 12); // [4,12] → index floor(2/2)=1 → 12
      assert.equal(risk.max, 12);
      assert.equal(risk.band, "HIGH"); // median 12 >= 10
      assert.ok(risk.markdown.includes("Eligibility (2)"), "Eligibility amended in both sampled trials");
    });

    it("bands LOW/MODERATE by median churn", () => {
      const low = buildAmendmentRisk([{ nctId: "N1", changeSummary: { versions: 2, amended_modules: [] } }]);
      assert.equal(low.band, "LOW");
      const mod = buildAmendmentRisk([
        { nctId: "N1", changeSummary: { versions: 5, amended_modules: [] } },
        { nctId: "N2", changeSummary: { versions: 6, amended_modules: [] } }
      ]);
      assert.equal(mod.band, "MODERATE"); // median 6 → MODERATE
    });

    it("returns empty (no markdown) when no trial carries version history", () => {
      const risk = buildAmendmentRisk([{ nctId: "N1", whyStopped: "x" }]);
      assert.equal(risk.sampled, 0);
      assert.equal(risk.markdown, "");
    });
  });
});

// ---------------------------------------------------------------------------
// Coverage copy (2026-07-30). The memo's honesty is the deliverable, so the
// branches are pinned: "complete" must be unreachable unless the run earned it.
// ---------------------------------------------------------------------------
describe("graveyard-memo — derived coverage copy", () => {
  const withMeta = (arr, m) => {
    for (const [k, v] of Object.entries(m)) {
      Object.defineProperty(arr, k, { value: v, enumerable: false, configurable: true });
    }
    return arr;
  };
  const rec = (n, versions) => ({
    nctId: n, title: "T" + n, status: "TERMINATED", phase: "PHASE3", whyStopped: "Slow accrual",
    changeSummary: versions ? { versions, amended_modules: ["Eligibility", "Outcomes"] } : undefined
  });
  const base = { historySelectionRule: "the first N in registry order.", conditionQuery: "glioblastoma" };

  it("says COMPLETE only when the census actually reached countTotal", () => {
    const md = buildGraveyardMemo(
      withMeta([rec("NCT1"), rec("NCT2")], { ...base, eligibleTotal: 2, censusComplete: true, pagesExhausted: true, fetchError: false, droppedNoNct: 0, droppedDuplicate: 0 }),
      { indication: "glioblastoma" }
    ).markdown;
    assert.match(md, /Complete retrieval for the ClinicalTrials\.gov condition query/);
    assert.match(md, /2 of 2 record\(s\)/);
  });

  it("never claims completeness on a clean-but-short walk, and names what it cannot know", () => {
    const md = buildGraveyardMemo(
      withMeta([rec("NCT1")], { ...base, eligibleTotal: 100, censusComplete: false, pagesExhausted: true, fetchError: false, droppedNoNct: 1, droppedDuplicate: 2 }),
      { indication: "glioblastoma" }
    ).markdown;
    assert.doesNotMatch(md, /Complete retrieval/);
    assert.match(md, /cannot distinguish which/);
  });

  it("labels a fetch-error run PARTIAL and never says 'every'", () => {
    const md = buildGraveyardMemo(
      withMeta([rec("NCT1")], { ...base, eligibleTotal: 100, censusComplete: false, pagesExhausted: false, fetchError: true, droppedNoNct: 0, droppedDuplicate: 0 }),
      { indication: "glioblastoma" }
    ).markdown;
    assert.match(md, /PARTIAL retrieval/);
    assert.doesNotMatch(md, /\bevery record\b/);
  });

  it("does not print a null denominator when the fetcher supplied no coverage metadata", () => {
    // Number(null) is 0 and Number.isFinite(0) is true, so a bare finite-check let a missing
    // denominator through and rendered "1 of null record(s)".
    const md = buildGraveyardMemo([rec("NCT1")], { indication: "glioblastoma" }).markdown;
    assert.doesNotMatch(md, /of null/);
    assert.match(md, /Coverage metadata was not supplied/);
  });

  it("always carries the term-based search caveat, on every branch", () => {
    for (const m of [
      { ...base, eligibleTotal: 1, censusComplete: true, pagesExhausted: true, fetchError: false, droppedNoNct: 0, droppedDuplicate: 0 },
      { ...base, eligibleTotal: 99, censusComplete: false, pagesExhausted: false, fetchError: true, droppedNoNct: 0, droppedDuplicate: 0 }
    ]) {
      const md = buildGraveyardMemo(withMeta([rec("NCT1")], m), { indication: "x" }).markdown;
      assert.match(md, /term-based/);
    }
  });

  it("keeps the most-amended-modules sentence and all three band limits", () => {
    // The most-amended sentence was silently dropped by an earlier draft of this change, leaving
    // topModules computed and unused — a content regression inside an honesty fix.
    const risk = buildAmendmentRisk(withMeta([rec("NCT1", 12), rec("NCT2", 11)], { ...base, eligibleTotal: 40 }));
    assert.match(risk.markdown, /Most-amended protocol modules/);
    assert.match(risk.markdown, /sample-size sensitive/);
    assert.match(risk.markdown, /survivorship-inverted/);
    assert.match(risk.markdown, /no published basis/);
    assert.match(risk.markdown, /of the \*\*40\*\* stopped program/);
  });
});

// ---------------------------------------------------------------------------
// Amendment-risk AVAILABILITY (2026-10-08). The first real run found the registry's change-history
// endpoint refusing every request (HTTP 403). buildAmendmentRisk filtered to trials carrying history,
// found none, and returned an empty string - so the shipped memo simply had no amendment section and
// said nothing about why. For a product whose promise is "a gap is named, never hidden", an absent
// section that reads like a clean LOW is the same failure as an invented number.
// ---------------------------------------------------------------------------
describe("graveyard-memo - amendment-risk availability is disclosed, never silent", () => {
  const withMeta = (arr, m) => {
    for (const [k, v] of Object.entries(m)) {
      Object.defineProperty(arr, k, { value: v, enumerable: false, configurable: true });
    }
    return arr;
  };
  const rec = (n, versions) => ({
    nctId: n, title: "T" + n, status: "TERMINATED", phase: "PHASE3", whyStopped: "Slow accrual",
    changeSummary: versions ? { versions, amended_modules: ["Eligibility"] } : undefined
  });
  const meta = (extra) => ({
    historySelectionRule: "the first N in registry order.", conditionQuery: "glioblastoma", eligibleTotal: 40, ...extra
  });

  it("says so when version history was requested and none came back", () => {
    const risk = buildAmendmentRisk(withMeta([rec("NCT1"), rec("NCT2")],
      meta({ historyAttempted: 2, historySucceeded: 0, historyFailed: 2, historyFirstError: "HTTP 403" })));
    assert.equal(risk.status, "unavailable");
    assert.equal(risk.sampled, 0);
    assert.equal(risk.band, null);
    assert.match(risk.markdown, /## Protocol Amendment-Risk Signal/);
    assert.match(risk.markdown, /Not available for this run/);
    assert.match(risk.markdown, /\*\*2\*\* stopped program/);
    assert.match(risk.markdown, /\*\*2\*\* request\(s\) failed/);
    assert.match(risk.markdown, /HTTP 403/);
  });

  it("never lets an unavailable signal read as a LOW result", () => {
    const md = buildAmendmentRisk(withMeta([rec("NCT1")],
      meta({ historyAttempted: 1, historySucceeded: 0, historyFailed: 1, historyFirstError: "HTTP 403" }))).markdown;
    assert.doesNotMatch(md, /Amendment-risk: (LOW|MODERATE|HIGH)/);
    assert.match(md, /not a LOW result/i);
  });

  it("tells a registry that answered with no versions apart from a request that failed", () => {
    const md = buildAmendmentRisk(withMeta([rec("NCT1"), rec("NCT2")],
      meta({ historyAttempted: 2, historySucceeded: 0, historyFailed: 0, historyFirstError: "" }))).markdown;
    assert.match(md, /Not available for this run/);
    assert.match(md, /no recorded protocol versions/);
    assert.doesNotMatch(md, /request\(s\) failed/);
  });

  it("discloses a partial retrieval beside the band it still computes", () => {
    const risk = buildAmendmentRisk(withMeta([rec("NCT1", 12), rec("NCT2", 11), rec("NCT3")],
      meta({ historyAttempted: 3, historySucceeded: 2, historyFailed: 1, historyFirstError: "HTTP 429" })));
    assert.equal(risk.status, "partial");
    assert.equal(risk.sampled, 2);
    assert.equal(risk.band, "HIGH", "the band is still computed from the trials that returned history");
    assert.match(risk.markdown, /Retrieval gap/);
    assert.match(risk.markdown, /requested for \*\*3\*\*/);
    assert.match(risk.markdown, /\*\*1\*\* request\(s\) failed/);
    assert.match(risk.markdown, /HTTP 429/);
  });

  it("adds no gap notice when every requested history came back", () => {
    const risk = buildAmendmentRisk(withMeta([rec("NCT1", 12), rec("NCT2", 11)],
      meta({ historyAttempted: 2, historySucceeded: 2, historyFailed: 0, historyFirstError: "" })));
    assert.equal(risk.status, "ok");
    assert.doesNotMatch(risk.markdown, /Retrieval gap/);
  });

  it("stays silent when nothing was requested (history switched off, or no coverage metadata)", () => {
    const off = buildAmendmentRisk(withMeta([rec("NCT1")], meta({ historyAttempted: 0 })));
    assert.equal(off.status, "not_computed");
    assert.equal(off.markdown, "");
    const bare = buildAmendmentRisk([rec("NCT1")]);
    assert.equal(bare.status, "not_computed");
    assert.equal(bare.markdown, "");
  });
});
