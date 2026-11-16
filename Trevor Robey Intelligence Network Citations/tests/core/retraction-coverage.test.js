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

  // Tier 1 review (2026-11-14, operator pick D2-wording): the spec's coverage rule stands (a DOI Crossref
  // holds counts as screened), and the screen counts those whose PubMed cross-check reached no verdict,
  // so no copy names PubMed for them.
  it("counts the Crossref-held DOIs whose PubMed cross-check reached no verdict; 'not in PubMed' is a verdict", async () => {
    const outage = async () => { throw new Error("NCBI 503"); };
    const out = await checkRetractions(report(["10.4444/a", "10.4444/b"]), async (batch) => crossrefHolds(batch), outage, outage);
    assert.equal(out.checked, true, "the spec's rule: Crossref holds both, so both count as screened");
    assert.equal(out.dois_crossref_only, 2);
    const notIndexed = async (dois) => dois.map((doi) => ({ doi, pmids: [], resolved: true }));
    const answered = await checkRetractions(report(["10.4444/a"]), async (batch) => crossrefHolds(batch), async () => [], notIndexed);
    assert.equal(answered.dois_crossref_only, 0, "PubMed answered: it does not index the DOI");
  });

  it("a chunk whose checker throws leaves its ids unscreened; the other chunks still run", async () => {
    let call = 0;
    const checkDois = async (batch) => { call += 1; if (call === 2) throw new Error("timeout"); return crossrefHolds(batch); };
    // T2-1 would retry the failed chunk; this test pins T1-7's chunk isolation on its own.
    const out = await checkRetractions(report(doiList(120)), checkDois, undefined, undefined, undefined, { retry: false });
    assert.equal(out.dois_checked, 70);
    assert.equal(out.unscreened, 50);
  });
});

// T2-1 (2026-11-16): one deferred retry. Only the ids that got no definitive answer are asked again, after
// one injected pause; a definitive answer (a verdict, "not held here") never triggers a retry.
describe("retraction screen: one deferred retry (T2-1)", () => {
  const pauses = [];
  const sleep = async (ms) => { pauses.push(ms); };

  it("a chunk that timed out is asked again once, after a 2,000 ms pause, and is then screened", async () => {
    pauses.length = 0;
    let call = 0;
    const asked = [];
    const checkDois = async (batch) => { call += 1; asked.push(batch.length); if (call === 2) throw new Error("timeout"); return crossrefHolds(batch); };
    const out = await checkRetractions(report(doiList(120)), checkDois, undefined, undefined, undefined, { sleep });
    assert.deepEqual(pauses, [2000]);
    assert.deepEqual(asked, [50, 50, 20, 50], "only the failed chunk's 50 DOIs are asked again");
    assert.equal(out.dois_checked, 120);
    assert.equal(out.checked, true);
    assert.equal(out.retried, true);
  });

  it("a PMID that still has no verdict after the retry stays unscreened and named", async () => {
    pauses.length = 0;
    const asked = [];
    const checkPmids = async (pmids) => { asked.push(...pmids); return pmids.map((pmid) => ({ pmid, retracted: false, is_notice: false, checked: pmid !== "20000002" })); };
    const out = await checkRetractions(report([], ["20000001", "20000002"]), null, checkPmids, undefined, undefined, { sleep });
    assert.deepEqual(pauses, [2000]);
    assert.deepEqual(asked, ["20000001", "20000002", "20000002"]);
    assert.deepEqual(out.unscreened_ids, ["PMID:20000002"]);
  });

  it("a definitive 'not held here' answer is never retried, and no pause is taken", async () => {
    pauses.length = 0;
    const checkDois = async (batch) => batch.map((doi) => ({ doi, retracted: false, checked: true, in_crossref: false }));
    const notInPubmed = async (dois) => dois.map((doi) => ({ doi, pmids: [], resolved: true }));
    const out = await checkRetractions(report(["10.4444/missing"]), checkDois, async () => [], notInPubmed, undefined, { sleep });
    assert.deepEqual(pauses, []);
    assert.equal(out.retried, undefined);
    assert.deepEqual(out.unscreened_ids, ["DOI:10.4444/missing"]);
  });
});
