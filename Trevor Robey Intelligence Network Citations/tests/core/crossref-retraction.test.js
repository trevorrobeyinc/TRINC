"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createCrossrefRetraction, classifyCrossrefRecord } = require("../../openclaw-bridge/mcp/crossref-retraction/crossref-retraction.js");
const { checkRetractions } = require("../../openclaw-bridge/core/citation-gate.js");

// Route the mock by which DOI substring is in the URL.
function fetchReturning(map) {
  return async (url) => {
    for (const key of Object.keys(map)) {
      if (url.includes(encodeURIComponent(key)) || url.includes(key)) {
        const v = map[key];
        if (v.__status) return { ok: false, status: v.__status, json: async () => ({}) };
        return { ok: true, status: 200, json: async () => ({ message: v }) };
      }
    }
    return { ok: true, status: 200, json: async () => ({ message: {} }) };
  };
}

describe("crossref-retraction — checkDoi", () => {
  it("flags retracted via relation.is-retracted-by", async () => {
    const cr = createCrossrefRetraction({ fetchImpl: fetchReturning({
      "10.1/retracted": { relation: { "is-retracted-by": [{ id: "10.1/notice" }] }, title: ["Bad paper"] }
    }) });
    const r = await cr.checkDoi("10.1/retracted");
    assert.equal(r.retracted, true);
    assert.equal(r.checked, true);
  });

  // T1-7 (2026-11-14): `update-to` is written by the record that DOES the updating. A retraction
  // entry naming ANOTHER work means this record is the notice; citing a notice never blocks.
  it("update-to type retraction naming another work → a NOTICE, not retracted", async () => {
    const cr = createCrossrefRetraction({ fetchImpl: fetchReturning({
      "10.2/x": { "update-to": [{ type: "retraction", id: "10.2/original" }] }
    }) });
    const r = await cr.checkDoi("10.2/x");
    assert.equal(r.retracted, false);
    assert.equal(r.is_notice, true);
    assert.deepEqual(r.notice_for, ["10.2/original"]);
  });

  it("update-to type retraction naming the work itself (an in-place retraction) → retracted", async () => {
    const cr = createCrossrefRetraction({ fetchImpl: fetchReturning({
      "10.2/inplace": { DOI: "10.2/inplace", "update-to": [{ type: "retraction", DOI: "10.2/INPLACE" }] }
    }) });
    const r = await cr.checkDoi("10.2/inplace");
    assert.equal(r.retracted, true);
    assert.equal(r.is_notice, false);
    assert.equal(r.retraction_evidence[0].via, "update-to (in place)");
  });

  it("clean work → not retracted, checked:true", async () => {
    const cr = createCrossrefRetraction({ fetchImpl: fetchReturning({
      "10.3/ok": { title: ["Good paper"], relation: {} }
    }) });
    const r = await cr.checkDoi("10.3/ok");
    assert.equal(r.retracted, false);
    assert.equal(r.checked, true);
  });

  it("404 → not retracted, checked, and in_crossref:false (Crossref holds no record of it)", async () => {
    const cr = createCrossrefRetraction({ fetchImpl: fetchReturning({ "10.4/missing": { __status: 404 } }) });
    const r = await cr.checkDoi("10.4/missing");
    assert.deepEqual(r, { doi: "10.4/missing", retracted: false, checked: true, in_crossref: false });
  });

  it("a 200 record says in_crossref:true", async () => {
    const cr = createCrossrefRetraction({ fetchImpl: fetchReturning({ "10.3/ok": { title: ["Good paper"], relation: {} } }) });
    assert.equal((await cr.checkDoi("10.3/ok")).in_crossref, true);
  });

  it("network error → fail-soft (checked:false, retracted:false)", async () => {
    const cr = createCrossrefRetraction({ fetchImpl: async () => { throw new Error("ECONNRESET"); } });
    const r = await cr.checkDoi("10.5/err");
    assert.equal(r.retracted, false);
    assert.equal(r.checked, false);
  });
});

// T1-7: the two records the 2026-11-14 read-only probe printed (tests/fixtures/crossref-probe-2026-11-14/).
describe("crossref-retraction — the probed Lancet records (T1-7)", () => {
  const fixture = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "fixtures", "crossref-probe-2026-11-14", name), "utf8"));
  const original = fixture("retracted-original-work.json");
  const notice = fixture("retraction-notice-work.json");
  const replay = (f) => async () => ({ ok: true, status: 200, json: async () => f.body });

  it("the retracted 1998 paper is caught through updated-by (source retraction-watch); its correction entry is not a retraction", async () => {
    const r = await createCrossrefRetraction({ fetchImpl: replay(original) }).checkDoi(original.queried_doi);
    assert.equal(r.retracted, true);
    assert.equal(r.in_crossref, true);
    assert.equal(r.retraction_evidence.length, 1, "only the exact 'retraction' entry counts");
    assert.deepEqual(r.retraction_evidence[0], {
      via: "updated-by", source: "retraction-watch", record_id: "4036",
      notice_doi: "10.1016/s0140-6736(10)60175-4", date: "2010-02-06T00:00:00Z"
    });
    assert.deepEqual(r.editorial_updates, [], "a correction is not an editorial flag under D3");
  });

  it("its 2010 retraction notice is a NOTICE and is not retracted", async () => {
    const r = await createCrossrefRetraction({ fetchImpl: replay(notice) }).checkDoi(notice.queried_doi);
    assert.equal(r.retracted, false);
    assert.equal(r.is_notice, true);
    assert.deepEqual(r.notice_for, ["10.1016/s0140-6736(97)11096-0"]);
  });

  it("partial_retraction, expression_of_concern and withdrawal never mark a work retracted (D3); they are recorded", () => {
    for (const type of ["partial_retraction", "expression_of_concern", "withdrawal", "correction"]) {
      const r = classifyCrossrefRecord({ "updated-by": [{ DOI: "10.9/notice", type, source: "publisher" }] }, "10.9/work");
      assert.equal(r.retracted, false, type);
      assert.equal(r.editorial_updates.length, type === "correction" ? 0 : 1, type);
    }
  });

  it("with the PubMed leg throwing, the 1998 paper is still caught by the Crossref leg alone", async () => {
    const checkDois = createCrossrefRetraction({ fetchImpl: replay(original) }).checkDois;
    const boom = async () => { throw new Error("NCBI down"); };
    const out = await checkRetractions(`Cited: doi: ${original.queried_doi}.`, checkDois, boom, boom);
    assert.deepEqual(out.retracted_dois, [original.queried_doi]);
  });

  // Critic #15: a cited notice that PubMed does not index used to hard-fail the report.
  it("citing the notice alone never trips the block, even when PubMed does not index it", async () => {
    const checkDois = createCrossrefRetraction({ fetchImpl: replay(notice) }).checkDois;
    const notIndexed = async (dois) => dois.map((doi) => ({ doi, pmids: [], resolved: true }));
    const out = await checkRetractions(`See the notice, doi: ${notice.queried_doi}.`, checkDois, async () => [], notIndexed);
    assert.deepEqual(out.retracted, []);
    assert.deepEqual(out.crossref_notice_dois, [notice.queried_doi]);
    assert.equal(out.checked, true, "Crossref holds the notice, so it was screened");
  });
});

describe("citation-gate — checkRetractions", () => {
  it("extracts the report's DOIs and returns the retracted ones", async () => {
    const report = "Evidence: doi: 10.1016/j.example.2020.01.001 and doi: 10.1038/nature12373.";
    const checkDois = async (dois) => dois.map((d) => ({ doi: d, retracted: d === "10.1016/j.example.2020.01.001", checked: true }));
    const out = await checkRetractions(report, checkDois);
    assert.equal(out.checked, true);
    assert.deepEqual(out.retracted, ["10.1016/j.example.2020.01.001"]);
    assert.equal(out.dois_checked, 2);
  });

  it("no checker → not checked, no retractions (fail-soft)", async () => {
    const out = await checkRetractions("doi: 10.1038/nature12373", null);
    assert.equal(out.checked, false);
    assert.deepEqual(out.retracted, []);
  });

  it("report with no DOIs → checked, empty", async () => {
    const out = await checkRetractions("No citations here.", async () => []);
    assert.equal(out.checked, true);
    assert.deepEqual(out.retracted, []);
  });
});
