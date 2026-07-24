"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { createCtgovSupplemental } = require("../../openclaw-bridge/mcp/ctgov-supplemental/ctgov-supplemental.js");

function mockFetch(payload, { ok = true, status = 200 } = {}) {
  const calls = [];
  const fn = async (url) => { calls.push({ url }); return { ok, status, json: async () => payload }; };
  fn.calls = calls;
  return fn;
}

const SAMPLE = {
  studies: [
    { protocolSection: {
        identificationModule: { nctId: "NCT02123992", briefTitle: "Astora device trial" },
        statusModule: { overallStatus: "TERMINATED", whyStopped: "Astora business is closing" },
        designModule: { phases: ["PHASE2"] } } },
    { protocolSection: {
        identificationModule: { nctId: "NCT01234567", briefTitle: "Withdrawn study" },
        statusModule: { overallStatus: "WITHDRAWN", whyStopped: "Lack of funding" },
        designModule: { phases: ["PHASE3"] } } },
    { protocolSection: { identificationModule: { briefTitle: "No NCT id — skipped" }, statusModule: {} } }
  ]
};

describe("ctgov-supplemental — searchStoppedTrials (stop-reason archaeology)", () => {
  it("parses stopped trials into records (nctId/whyStopped/status/phase) and skips records without an nctId", async () => {
    const fetchImpl = mockFetch(SAMPLE);
    const ct = createCtgovSupplemental({ fetchImpl });
    const recs = await ct.searchStoppedTrials({ condition: "cardiovascular", pageSize: 6 });
    assert.equal(recs.length, 2);
    assert.equal(recs[0].nctId, "NCT02123992");
    assert.equal(recs[0].whyStopped, "Astora business is closing");
    assert.equal(recs[0].status, "TERMINATED");
    assert.equal(recs[0].phase, "PHASE2");
    // Built the right query: stopped-status filter + condition + the whyStopped field projection.
    const url = fetchImpl.calls[0].url;
    assert.match(url, /filter\.overallStatus=TERMINATED/);
    assert.match(url, /query\.cond=cardiovascular/);
    assert.match(url, /whyStopped/);
  });

  // REGRESSION (2026-07-24): the prefetch map bound this fetcher with `condition:"{{indication}}"`
  // only, and `indication` exists in exactly ONE of the six workflow templates
  // (drug-discovery-full). On the other five the arg resolved to "", tool-prefetch dropped it as
  // empty, and the whole source was skipped — so `deliverables/graveyard-memo.md`, the
  // deterministic failed-trial artifact that is the stated reason AdisInsight was declined, came
  // out SILENTLY EMPTY on 5/6 templates. Silent because the memo is fail-soft by design: an empty
  // indication simply omits it and never blocks a passing report. The fetcher must therefore
  // accept every key a template actually uses to name an indication.
  const CONDITION_ALIASES = [
    ["indication", "drug-discovery-full"],
    ["disease_context", "target-validation-pack"],
    ["disease_name", "rare-disease-brief"],
    ["therapeutic_area", "clinical-trial-landscape"]
  ];
  for (const [key, template] of CONDITION_ALIASES) {
    it(`accepts '${key}' as the condition (used by ${template})`, async () => {
      // includeHistory:false isolates the SEARCH call — with history on, each returned record
      // triggers an extra /history request and the call count stops being a clean signal.
      const fetchImpl = mockFetch(SAMPLE);
      const ct = createCtgovSupplemental({ fetchImpl, includeHistory: false });
      const recs = await ct.searchStoppedTrials({ [key]: "breast cancer", pageSize: 4 });
      assert.equal(recs.length, 2, `expected records when driven by '${key}'`);
      assert.equal(fetchImpl.calls.length, 1, `expected exactly one CT.gov search for '${key}'`);
      assert.match(fetchImpl.calls[0].url, /query\.cond=breast\+cancer/);
    });
  }

  it("still returns [] when every condition alias is empty, without making a request", async () => {
    const fetchImpl = mockFetch(SAMPLE);
    const ct = createCtgovSupplemental({ fetchImpl });
    assert.deepEqual(await ct.searchStoppedTrials({
      condition: "", indication: "", disease_context: "", disease_name: "", therapeutic_area: ""
    }), []);
    assert.equal(fetchImpl.calls.length, 0);
  });

  it("returns [] for an empty condition without making a request", async () => {
    const fetchImpl = mockFetch(SAMPLE);
    const ct = createCtgovSupplemental({ fetchImpl });
    assert.deepEqual(await ct.searchStoppedTrials({ condition: "" }), []);
    assert.equal(fetchImpl.calls.length, 0);
  });

  it("is fail-soft: returns [] on a non-ok HTTP response", async () => {
    const ct = createCtgovSupplemental({ fetchImpl: mockFetch({}, { ok: false, status: 503 }) });
    assert.deepEqual(await ct.searchStoppedTrials({ condition: "sepsis" }), []);
  });

  it("returns [] when the response carries no studies", async () => {
    const ct = createCtgovSupplemental({ fetchImpl: mockFetch({ studies: [] }) });
    assert.deepEqual(await ct.searchStoppedTrials({ condition: "sepsis" }), []);
  });
});

describe("ctgov-supplemental — change-history enrichment", () => {
  function routingFetch() {
    const calls = [];
    const fn = async (url) => {
      calls.push({ url });
      if (/\/history$/.test(url)) {
        return { ok: true, status: 200, json: async () => ({ changes: [
          { version: 0, date: "2014-04-01", moduleLabels: [] },
          { version: 1, date: "2014-09-01", moduleLabels: ["Study Status", "Eligibility"] },
          { version: 2, date: "2015-02-01", moduleLabels: ["Eligibility", "Outcome Measures"] }
        ] }) };
      }
      return { ok: true, status: 200, json: async () => SAMPLE };
    };
    fn.calls = calls;
    return fn;
  }

  it("enriches stopped trials with version count + most-amended modules + date span", async () => {
    const fetchImpl = routingFetch();
    const ct = createCtgovSupplemental({ fetchImpl, maxHistory: 2 });
    const recs = await ct.searchStoppedTrials({ condition: "cardiovascular" });
    assert.equal(recs[0].changeSummary.versions, 3);
    assert.ok(recs[0].changeSummary.amended_modules.includes("Eligibility"));
    assert.equal(recs[0].changeSummary.first, "2014-04-01");
    assert.equal(recs[0].changeSummary.last, "2015-02-01");
    // 1 search + 2 history calls (maxHistory: 2) = 3
    assert.equal(fetchImpl.calls.length, 3);
  });

  it("getChangeHistory is fail-soft (returns null when there are no changes)", async () => {
    const ct = createCtgovSupplemental({ fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({}) }) });
    assert.equal(await ct.getChangeHistory("NCT00000000"), null);
  });
});
