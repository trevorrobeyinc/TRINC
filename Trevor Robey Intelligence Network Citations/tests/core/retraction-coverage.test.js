"use strict";

// T1-7 (2026-11-14): the retraction screen covers every cited DOI and PMID, in chunks of 50 up to a
// ceiling of 500 per class, and NAMES what it could not screen. A DOI counts as screened only if
// Crossref holds it, or if PubMed resolved it to at least one PMID with a definitive verdict (operator
// default D2: a DOI no retraction source holds is unscreened and named). An incomplete screen never
// blocks; a retraction found always does.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { checkRetractions, SCREEN_CHUNK, MAX_SCREEN_IDS_PER_CLASS } = require("../../openclaw-bridge/core/citation-gate.js");

const doiList = (n, prefix = "10.5555/cov") => Array.from({ length: n }, (_, i) => `${prefix}.${i + 1}`);
const report = (dois, pmids = []) => [...dois.map((d) => `doi: ${d}`), ...pmids.map((p) => `PMID: ${p}`)].join("; ");
const crossrefHolds = (dois) => dois.map((doi) => ({ doi, retracted: false, checked: true, in_crossref: true }));

describe("retraction screen coverage (T1-7)", () => {
  it("screens all 120 cited DOIs, in three chunks of at most 50", async () => {
    const sizes = [];
    const checkDois = async (batch) => { sizes.push(batch.length); return crossrefHolds(batch); };
    const out = await checkRetractions(report(doiList(120)), checkDois);
    assert.equal(SCREEN_CHUNK, 50);
    assert.deepEqual(sizes, [50, 50, 20]);
    assert.equal(out.dois_checked, 120);
    assert.equal(out.checked, true);
    assert.deepEqual(out.unscreened_ids, []);
  });

  it("a DOI with a Crossref 404 and no PubMed record is unscreened, counted and named", async () => {
    const checkDois = async (batch) => batch.map((doi) => (doi === "10.4444/missing"
      ? { doi, retracted: false, checked: true, in_crossref: false }
      : { doi, retracted: false, checked: true, in_crossref: true }));
    const notInPubmed = async (dois) => dois.map((doi) => ({ doi, pmids: [], resolved: true }));
    const out = await checkRetractions(report(["10.4444/missing", "10.4444/held"]), checkDois, async () => [], notInPubmed);
    assert.equal(out.checked, false);
    assert.equal(out.dois_without_retraction_source, 1);
    assert.deepEqual(out.unscreened_ids, ["DOI:10.4444/missing"]);
    assert.deepEqual(out.retracted, [], "unscreened is never retracted");
  });

  it("a Crossref 404 that PubMed resolves to a clean PMID with a definitive verdict counts as screened", async () => {
    const checkDois = async (batch) => batch.map((doi) => ({ doi, retracted: false, checked: true, in_crossref: false }));
    const toPmid = async (dois) => dois.map((doi) => ({ doi, pmids: ["31000001"], resolved: true }));
    const checkPmids = async (pmids) => pmids.map((pmid) => ({ pmid, retracted: false, is_notice: false, checked: true }));
    const out = await checkRetractions(report(["10.4444/pubmed-only"]), checkDois, checkPmids, toPmid);
    assert.equal(out.checked, true);
    assert.equal(out.dois_without_retraction_source, 0);
  });

  it("a Crossref retraction flag during a PubMed outage still marks the DOI retracted", async () => {
    const checkDois = async (batch) => batch.map((doi) => ({ doi, retracted: true, checked: true, in_crossref: true }));
    const outage = async () => { throw new Error("NCBI 503"); };
    const out = await checkRetractions(report(["10.4444/retracted"]), checkDois, outage, outage);
    assert.deepEqual(out.retracted_dois, ["10.4444/retracted"]);
  });

  it("ids beyond the 500-per-class ceiling are unscreened and named, never dropped", async () => {
    const checked = [];
    const checkDois = async (batch) => { checked.push(...batch); return crossrefHolds(batch); };
    const all = doiList(MAX_SCREEN_IDS_PER_CLASS + 3);
    const out = await checkRetractions(report(all), checkDois);
    assert.equal(checked.length, MAX_SCREEN_IDS_PER_CLASS);
    assert.equal(out.checked, false);
    assert.deepEqual(out.unscreened_ids, all.slice(MAX_SCREEN_IDS_PER_CLASS).map((d) => `DOI:${d}`));
  });

  it("a PMID without a definitive PubMed verdict is unscreened and named", async () => {
    const checkPmids = async (pmids) => pmids.map((pmid) => ({ pmid, retracted: false, is_notice: false, checked: pmid !== "20000002" }));
    const out = await checkRetractions(report([], ["20000001", "20000002"]), null, checkPmids);
    assert.equal(out.checked, false);
    assert.deepEqual(out.unscreened_ids, ["PMID:20000002"]);
  });

  it("a chunk whose checker throws leaves its ids unscreened; the other chunks still run", async () => {
    let call = 0;
    const checkDois = async (batch) => { call += 1; if (call === 2) throw new Error("timeout"); return crossrefHolds(batch); };
    const out = await checkRetractions(report(doiList(120)), checkDois);
    assert.equal(out.dois_checked, 70);
    assert.equal(out.unscreened, 50);
  });
});
