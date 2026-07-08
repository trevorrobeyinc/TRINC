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
