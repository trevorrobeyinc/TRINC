"use strict";

// The design-benchmark fetcher feeds both the competitive_intel_analyst's prompt (through
// tool-prefetch) and the deterministic design-benchmark deliverable. These pin the record shape it
// builds from a ClinicalTrials.gov v2 response — offline, through an injected fetch.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  createCtgovDesignBenchmark,
  SELECTION_RULE,
  COHORT_SORT
} = require("../../openclaw-bridge/mcp/ctgov-supplemental/ctgov-design-benchmark.js");

function study(overrides = {}) {
  return {
    protocolSection: {
      identificationModule: { nctId: "NCT00000010", briefTitle: "Fixture trial" },
      statusModule: {
        overallStatus: "RECRUITING",
        startDateStruct: { date: "2027-03-02", type: "ESTIMATED" },
        primaryCompletionDateStruct: { date: "2032-09-30", type: "ESTIMATED" }
      },
      sponsorCollaboratorsModule: { leadSponsor: { name: "National Cancer Institute (NCI)", class: "NIH" } },
      designModule: {
        phases: ["PHASE3"],
        designInfo: { allocation: "RANDOMIZED", interventionModel: "PARALLEL", primaryPurpose: "TREATMENT", maskingInfo: { masking: "NONE" } },
        enrollmentInfo: { count: 1210, type: "ESTIMATED" }
      },
      armsInterventionsModule: {
        armGroups: [{ label: "A" }, { label: "B" }],
        interventions: [{ type: "DRUG", name: "Example drug" }, { type: "OTHER", name: "" }]
      },
      outcomesModule: { primaryOutcomes: [{ measure: "Disease-free survival", timeFrame: "Up to 5 years" }] },
      ...overrides
    }
  };
}

function fetchReturning(payload, seen = []) {
  return async (url) => {
    seen.push(String(url));
    return { ok: true, status: 200, json: async () => payload };
  };
}

describe("ctgov-design-benchmark fetcher", () => {
  it("requests interventions and keeps date types, sponsor, design and outcomes", async () => {
    const seen = [];
    const bench = createCtgovDesignBenchmark({ fetchImpl: fetchReturning({ totalCount: 675, studies: [study()] }, seen) });
    const records = await bench.searchDesignCohort({ condition: "fixture disease" });

    assert.equal(seen.length, 1);
    const params = new URL(seen[0]).searchParams;
    assert.ok(params.get("fields").includes("protocolSection.armsInterventionsModule.interventions"), "interventions are requested in the same call");
    assert.equal(params.get("sort"), COHORT_SORT);

    assert.equal(records.length, 1);
    const r = records[0];
    assert.equal(r.sponsor, "National Cancer Institute (NCI)");
    assert.equal(r.sponsorClass, "NIH");
    assert.equal(r.enrollmentCount, 1210);
    assert.equal(r.armCount, 2);
    assert.deepEqual(r.interventions, [{ type: "DRUG", name: "Example drug" }], "nameless interventions are dropped");
    assert.equal(r.startDate, "2027-03-02");
    assert.equal(r.startDateType, "ESTIMATED");
    assert.equal(r.primaryCompletionDate, "2032-09-30");
    assert.equal(r.primaryCompletionDateType, "ESTIMATED");
    assert.equal(records.eligibleTotal, 675);
    assert.equal(records.selectionRule, SELECTION_RULE);
    assert.ok(!Object.keys(records).includes("eligibleTotal"), "the denominator stays non-enumerable");
  });

  it("reports a null enrollment count and an empty arm list as not reported, never as 0", async () => {
    const s = study();
    s.protocolSection.designModule.enrollmentInfo = { count: null, type: "ESTIMATED" };
    s.protocolSection.armsInterventionsModule.armGroups = [];
    const bench = createCtgovDesignBenchmark({ fetchImpl: fetchReturning({ totalCount: 1, studies: [s] }) });
    const [r] = await bench.searchDesignCohort({ condition: "fixture disease" });

    assert.equal(r.enrollmentCount, null, "Number(null) is 0; a missing count must not become a real 0");
    assert.equal(r.armCount, null, "no arm groups listed is not 0 arms");
  });

  it("keeps a genuine enrollment of 0 (a withdrawn trial that enrolled nobody)", async () => {
    const s = study();
    s.protocolSection.designModule.enrollmentInfo = { count: 0, type: "ACTUAL" };
    const bench = createCtgovDesignBenchmark({ fetchImpl: fetchReturning({ totalCount: 1, studies: [s] }) });
    const [r] = await bench.searchDesignCohort({ condition: "fixture disease" });
    assert.equal(r.enrollmentCount, 0);
  });
});
