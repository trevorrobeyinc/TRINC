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

// ---------------------------------------------------------------------------
// Census mode + prompt-path clamp (2026-07-30). Each test below pins a defect an
// adversarial review found in the plan for this change; none of them is hypothetical.
// ---------------------------------------------------------------------------
describe("ctgov-supplemental — census walk and prompt-path ceiling", () => {
  const ok = (body) => ({ ok: true, status: 200, json: async () => body });
  const study = (n) => ({
    protocolSection: {
      identificationModule: { nctId: n, briefTitle: "T" + n },
      statusModule: { overallStatus: "TERMINATED" },
      designModule: { phases: ["PHASE3"] }
    }
  });
  const quiet = { info() {}, warn() {} };

  it("PROMPT mode clamps pageSize to 50 even when far more is requested", async () => {
    // The prompt path injects records into an agent prompt, so 50 is a COST ceiling. The census
    // ceiling of 1000 must never raise it: 1,000 records measures ~228KB / ~57K tokens, roughly
    // 18% of one template's documented budget from a single sub-source.
    let seen = null;
    const ct = createCtgovSupplemental({
      logger: quiet, includeHistory: false,
      fetchImpl: async (url) => { seen = new URL(url).searchParams.get("pageSize"); return ok({ totalCount: 5000, studies: [study("NCT1")] }); }
    });
    await ct.searchStoppedTrials({ condition: "x", pageSize: 1000 });
    assert.equal(seen, "50");
  });

  it("PROMPT mode defaults to 8 and never walks pages", async () => {
    let calls = 0;
    const ct = createCtgovSupplemental({
      logger: quiet, includeHistory: false,
      fetchImpl: async (url) => {
        calls += 1;
        assert.equal(new URL(url).searchParams.get("pageSize"), "8");
        return ok({ totalCount: 900, studies: [study("NCT1")], nextPageToken: "MORE" });
      }
    });
    const recs = await ct.searchStoppedTrials({ condition: "x" });
    assert.equal(calls, 1, "prompt mode must not follow nextPageToken");
    assert.equal(recs.mode, "prompt");
  });

  it("CENSUS terminates when the page token never advances (no forward progress)", async () => {
    // Duplicate-dropping means a page can add ZERO records while still returning a token, so a
    // records.length-based guard can never fire. Without the no-progress break this loops forever.
    let calls = 0;
    const ct = createCtgovSupplemental({
      logger: quiet, includeHistory: false,
      fetchImpl: async () => { calls += 1; return ok({ totalCount: 9999, studies: [study("NCT1")], nextPageToken: "SAME" }); }
    });
    const recs = await ct.searchStoppedTrials({ condition: "x", census: true });
    assert.ok(calls < 10, `expected early termination, got ${calls} calls`);
    assert.equal(recs.censusComplete, false);
  });

  it("CENSUS reports NOT complete when the walk is clean but N < M", async () => {
    // Walking to the end is not sufficient — records are dropped for a missing NCT id or a
    // duplicate. Claiming "complete" beside "2 of 100" would be self-contradicting.
    const ct = createCtgovSupplemental({
      logger: quiet, includeHistory: false,
      fetchImpl: async () => ok({ totalCount: 100, studies: [study("NCT1"), study("NCT2")] })
    });
    const recs = await ct.searchStoppedTrials({ condition: "x", census: true });
    assert.equal(recs.length, 2);
    assert.equal(recs.eligibleTotal, 100);
    assert.equal(recs.censusComplete, false);
  });

  it("CENSUS reports complete only when the collected count reaches countTotal", async () => {
    const ct = createCtgovSupplemental({
      logger: quiet, includeHistory: false,
      fetchImpl: async () => ok({ totalCount: 2, studies: [study("NCT1"), study("NCT2")] })
    });
    const recs = await ct.searchStoppedTrials({ condition: "x", census: true });
    assert.equal(recs.censusComplete, true);
    assert.equal(recs.droppedNoNct, 0);
  });

  it("a fetch error mid-walk fails soft, keeps the partial page, and refuses to claim complete", async () => {
    let n = 0;
    const ct = createCtgovSupplemental({
      logger: quiet, includeHistory: false,
      fetchImpl: async () => {
        n += 1;
        if (n > 1) throw new Error("boom");
        return ok({ totalCount: 100, studies: [study("NCT1")], nextPageToken: "P2" });
      }
    });
    const recs = await ct.searchStoppedTrials({ condition: "x", census: true });
    assert.equal(recs.length, 1);
    assert.equal(recs.fetchError, true);
    assert.equal(recs.censusComplete, false);
  });

  it("the session cache never serves a prompt array to a census caller or vice versa", async () => {
    const ct = createCtgovSupplemental({
      logger: quiet, includeHistory: false,
      fetchImpl: async (url) => {
        const size = Number(new URL(url).searchParams.get("pageSize"));
        return ok({ totalCount: 2, studies: size > 50 ? [study("NCT1"), study("NCT2")] : [study("NCT1")] });
      }
    });
    const prompt = await ct.searchStoppedTrials({ condition: "same", pageSize: 1 });
    const census = await ct.searchStoppedTrials({ condition: "same", census: true });
    assert.notEqual(prompt.length, census.length, "cache key must carry mode + sizes");
    assert.equal((await ct.searchStoppedTrials({ condition: "same", pageSize: 1 })).length, prompt.length);
  });
});

// ---------------------------------------------------------------------------
// Change-history ACCOUNTING (2026-10-08). The first real run found that the registry's undocumented
// /history endpoint now answers HTTP 403. getChangeHistory swallowed that to null, enrichHistory
// skipped the record, and `historySampled` reported the number ATTEMPTED - so a run in which every
// history request failed was indistinguishable, in the metadata, from one in which every request
// succeeded. Downstream, buildAmendmentRisk then omitted the whole section without a word.
// ---------------------------------------------------------------------------
describe("ctgov-supplemental - change-history accounting", () => {
  const quiet = { info() {}, warn() {}, error() {} };
  const FIRST_NCT = "NCT02123992"; // SAMPLE's first record
  const history = (changes) => ({ ok: true, status: 200, json: async () => ({ changes }) });
  const TWO_VERSIONS = history([
    { version: 0, date: "2014-04-01", moduleLabels: [] },
    { version: 1, date: "2014-09-01", moduleLabels: ["Eligibility"] }
  ]);
  const FORBIDDEN = { ok: false, status: 403, json: async () => ({}) };

  // /history requests go to `onHistory(url)`; the search request returns SAMPLE (two usable records).
  function historyFetch(onHistory) {
    const fn = async (url) => (/\/history$/.test(url)
      ? onHistory(url)
      : { ok: true, status: 200, json: async () => SAMPLE });
    return fn;
  }

  it("counts a refused history endpoint (HTTP 403) as FAILED, not as sampled", async () => {
    const ct = createCtgovSupplemental({ logger: quiet, maxHistory: 2, fetchImpl: historyFetch(() => FORBIDDEN) });
    const recs = await ct.searchStoppedTrials({ condition: "cardiovascular" });
    assert.equal(recs.length, 2);
    assert.equal(recs.historyAttempted, 2);
    assert.equal(recs.historySucceeded, 0);
    assert.equal(recs.historyFailed, 2);
    assert.equal(recs.historyFirstError, "HTTP 403");
    assert.ok(recs.every((r) => !r.changeSummary), "no record may carry a summary the registry never sent");
  });

  it("counts a thrown request the same way, and names the first error", async () => {
    const ct = createCtgovSupplemental({
      logger: quiet, maxHistory: 2,
      fetchImpl: historyFetch(() => { throw new Error("socket hang up"); })
    });
    const recs = await ct.searchStoppedTrials({ condition: "cardiovascular" });
    assert.equal(recs.historyFailed, 2);
    assert.equal(recs.historyFirstError, "socket hang up");
  });

  it("treats an answered-but-empty history as neither a success nor a failure", async () => {
    const ct = createCtgovSupplemental({ logger: quiet, maxHistory: 2, fetchImpl: historyFetch(() => history([])) });
    const recs = await ct.searchStoppedTrials({ condition: "cardiovascular" });
    assert.equal(recs.historyAttempted, 2);
    assert.equal(recs.historySucceeded, 0);
    assert.equal(recs.historyFailed, 0);
    assert.equal(recs.historyFirstError, "");
  });

  it("counts a mixed result exactly and attaches a summary only where the registry sent one", async () => {
    const ct = createCtgovSupplemental({
      logger: quiet, maxHistory: 2,
      fetchImpl: historyFetch((url) => (url.includes(FIRST_NCT) ? TWO_VERSIONS : FORBIDDEN))
    });
    const recs = await ct.searchStoppedTrials({ condition: "cardiovascular" });
    assert.equal(recs.historyAttempted, 2);
    assert.equal(recs.historySucceeded, 1);
    assert.equal(recs.historyFailed, 1);
    assert.equal(recs[0].changeSummary.versions, 2);
    assert.equal(recs[1].changeSummary, undefined);
  });

  it("attempts nothing when history is switched off", async () => {
    const ct = createCtgovSupplemental({ logger: quiet, includeHistory: false, fetchImpl: historyFetch(() => FORBIDDEN) });
    const recs = await ct.searchStoppedTrials({ condition: "cardiovascular" });
    assert.equal(recs.historyAttempted, 0);
    assert.equal(recs.historyFailed, 0);
  });

  it("keeps the accounting out of the enumerable record data, so nothing reaches a prompt", async () => {
    const ct = createCtgovSupplemental({ logger: quiet, maxHistory: 2, fetchImpl: historyFetch(() => FORBIDDEN) });
    const recs = await ct.searchStoppedTrials({ condition: "cardiovascular" });
    assert.doesNotMatch(JSON.stringify(recs), /historyFailed|historyAttempted|historyFirstError/);
  });

  it("getChangeHistory keeps its public contract: null on a failure", async () => {
    const ct = createCtgovSupplemental({ logger: quiet, fetchImpl: historyFetch(() => FORBIDDEN) });
    assert.equal(await ct.getChangeHistory(FIRST_NCT), null);
  });
});
