"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  createPubmedRetraction,
  isRetractedPubtype
} = require("../../openclaw-bridge/mcp/pubmed-retraction/pubmed-retraction.js");
const { checkRetractions } = require("../../openclaw-bridge/core/citation-gate.js");

// Fixtures captured from live E-utilities esummary on 2026-07-10.
//   9500320  — Wakefield 1998 (Lancet, retracted 2010). NOTE: Crossref reports this DOI as CLEAN
//              (relation:{}, no update-to), which is exactly why the PMID screen must exist.
//   32450107 — Surgisphere/Lancet HCQ 2020 (retracted). Crossref DOES flag this one.
//   31978945 — NEJM COVID paper. Clean control.
//   20137807 — The Lancet's RETRACTION NOTICE for Wakefield. pubtype ["Retraction Notice"].
//              Citing a notice is legitimate; it must NOT be flagged as a retracted paper.
//   20301295 — GeneReviews. Clean, and carries NO DOI at all (unscreenable by the Crossref path).
const ESUMMARY = {
  "9500320": {
    title: "Ileal-lymphoid-nodular hyperplasia, non-specific colitis...",
    pubtype: ["Journal Article", "Research Support, Non-U.S. Gov't", "Retracted Publication"]
  },
  "32450107": {
    title: "RETRACTED: Hydroxychloroquine or chloroquine...",
    pubtype: ["Journal Article", "Retracted Publication"]
  },
  "31978945": { title: "A Novel Coronavirus from Patients with Pneumonia in China, 2019", pubtype: ["Journal Article"] },
  "20137807": { title: "Retraction--Ileal-lymphoid-nodular hyperplasia...", pubtype: ["Retraction Notice"] },
  "20301295": { title: "GeneReviews", pubtype: ["Review"] }
};

// Mock esummary: parses the `id=` list out of the URL and returns the matching records.
function fetchEsummary(records = ESUMMARY, opts = {}) {
  return async (url) => {
    if (opts.throws) throw new Error("ECONNRESET");
    if (opts.status && opts.status !== 200) return { ok: false, status: opts.status, json: async () => ({}) };
    const ids = decodeURIComponent(String(url).match(/[?&]id=([^&]+)/)[1]).split(",");
    const result = { uids: ids };
    for (const id of ids) {
      if (opts.omit && opts.omit.includes(id)) continue;             // record missing from response
      if (records[id]) result[id] = { uid: id, ...records[id] };
      else result[id] = { uid: id, error: "cannot get document summary" };
    }
    if (opts.unparseable) return { ok: true, status: 200, json: async () => ({ nope: 1 }) };
    return { ok: true, status: 200, json: async () => ({ result }) };
  };
}

// Live-captured DOI→PMID mappings (esearch <doi>[AID]) as of 2026-07-10.
//   Wakefield DOI → its retracted PMID (Crossref reports the DOI as CLEAN — the whole point).
//   NEJM DOI      → clean PMID.
//   preprint DOI  → not in PubMed → empty idlist (a valid, definitive "resolved, no record").
const DOI_PMID = {
  "10.1016/S0140-6736(97)11096-0": ["9500320"],     // retracted paper
  "10.1016/S0140-6736(10)60175-4": ["20137807"],    // the retraction NOTICE (Crossref flags it too)
  "10.1056/NEJMoa2001017": ["31978945"],
  "10.1101/2020.preprint.only": []
};

// Combined E-utilities mock: routes esearch (DOI→PMID) and esummary (PMID→pubtype) by URL.
function fetchEutils(records = ESUMMARY, doiPmid = DOI_PMID, opts = {}) {
  return async (url) => {
    const u = String(url);
    if (u.includes("esearch.fcgi")) {
      if (opts.searchThrows) throw new Error("ECONNRESET");
      if (opts.searchStatus && opts.searchStatus !== 200) return { ok: false, status: opts.searchStatus, json: async () => ({}) };
      const term = decodeURIComponent(u.match(/[?&]term=([^&]+)/)[1]);   // "<doi>[AID]"
      const doi = term.replace(/\[AID\]$/i, "");
      const idlist = doiPmid[doi] || [];
      if (opts.searchUnparseable) return { ok: true, status: 200, json: async () => ({ nope: 1 }) };
      return { ok: true, status: 200, json: async () => ({ esearchresult: { count: String(idlist.length), idlist } }) };
    }
    return fetchEsummary(records, opts)(url);   // esummary path
  };
}

describe("pubmed-retraction — isRetractedPubtype (exact-match rule)", () => {
  it("flags 'Retracted Publication'", () => {
    assert.equal(isRetractedPubtype(["Journal Article", "Retracted Publication"]), true);
  });

  it("is case/whitespace insensitive", () => {
    assert.equal(isRetractedPubtype(["  retracted PUBLICATION "]), true);
  });

  it("does NOT flag 'Retraction Notice' — citing the notice is legitimate", () => {
    assert.equal(isRetractedPubtype(["Retraction Notice"]), false);
  });

  it("does NOT flag 'Retraction of Publication'", () => {
    assert.equal(isRetractedPubtype(["Retraction of Publication"]), false);
  });

  it("non-array pubtype → null (unknown, caller must treat as UNCHECKED)", () => {
    assert.equal(isRetractedPubtype(undefined), null);
    assert.equal(isRetractedPubtype("Retracted Publication"), null);
  });
});

describe("pubmed-retraction — isNoticePubtype", () => {
  it("flags 'Retraction Notice' exactly", () => {
    assert.equal(require("../../openclaw-bridge/mcp/pubmed-retraction/pubmed-retraction.js").isNoticePubtype(["Retraction Notice"]), true);
  });
  it("does NOT flag a retracted paper as a notice", () => {
    assert.equal(require("../../openclaw-bridge/mcp/pubmed-retraction/pubmed-retraction.js").isNoticePubtype(["Retracted Publication"]), false);
  });
  it("non-array → null", () => {
    assert.equal(require("../../openclaw-bridge/mcp/pubmed-retraction/pubmed-retraction.js").isNoticePubtype("Retraction Notice"), null);
  });
});

describe("pubmed-retraction — checkPmids", () => {
  it("marks a retraction notice with is_notice:true and retracted:false", async () => {
    const pr = createPubmedRetraction({ fetchImpl: fetchEsummary() });
    const [r] = await pr.checkPmids(["20137807"]);
    assert.equal(r.retracted, false);
    assert.equal(r.is_notice, true);
    assert.equal(r.checked, true);
  });
  it("marks a retracted paper with is_notice:false and retracted:true", async () => {
    const pr = createPubmedRetraction({ fetchImpl: fetchEsummary() });
    const [r] = await pr.checkPmids(["9500320"]);
    assert.equal(r.retracted, true);
    assert.equal(r.is_notice, false);
  });

  it("flags the Wakefield paper that Crossref reports as clean", async () => {
    const pr = createPubmedRetraction({ fetchImpl: fetchEsummary() });
    const [r] = await pr.checkPmids(["9500320"]);
    assert.equal(r.retracted, true);
    assert.equal(r.checked, true);
  });

  it("flags a modern retraction too", async () => {
    const pr = createPubmedRetraction({ fetchImpl: fetchEsummary() });
    assert.equal((await pr.checkPmid("32450107")).retracted, true);
  });

  it("clean paper → not retracted, checked:true", async () => {
    const pr = createPubmedRetraction({ fetchImpl: fetchEsummary() });
    const r = await pr.checkPmid("31978945");
    assert.equal(r.retracted, false);
    assert.equal(r.checked, true);
  });

  it("RETRACTION NOTICE → not retracted (must never hard-fail a report that cites the notice)", async () => {
    const pr = createPubmedRetraction({ fetchImpl: fetchEsummary() });
    const r = await pr.checkPmid("20137807");
    assert.equal(r.retracted, false);
    assert.equal(r.checked, true);
  });

  it("PMID with no DOI is still screenable (the whole point)", async () => {
    const pr = createPubmedRetraction({ fetchImpl: fetchEsummary() });
    const r = await pr.checkPmid("20301295");
    assert.equal(r.retracted, false);
    assert.equal(r.checked, true);
  });

  it("id absent from PubMed → checked:true, retracted:false (never a false retraction)", async () => {
    const pr = createPubmedRetraction({ fetchImpl: fetchEsummary() });
    const r = await pr.checkPmid("99999999");
    assert.equal(r.retracted, false);
    assert.equal(r.checked, true);
  });

  it("network error → fail-soft (checked:false, retracted:false)", async () => {
    const pr = createPubmedRetraction({ fetchImpl: fetchEsummary(ESUMMARY, { throws: true }) });
    const r = await pr.checkPmid("9500320");
    assert.equal(r.retracted, false);
    assert.equal(r.checked, false);
  });

  it("non-200 → fail-soft", async () => {
    // A sustained 429 also fails the one retry; `sleep` is injected so that retry costs no wall-clock time.
    const pr = createPubmedRetraction({ fetchImpl: fetchEsummary(ESUMMARY, { status: 429 }), sleep: async () => {} });
    const r = await pr.checkPmid("9500320");
    assert.equal(r.checked, false);
    assert.equal(r.retracted, false);
  });

  it("unparseable body → fail-soft", async () => {
    const pr = createPubmedRetraction({ fetchImpl: fetchEsummary(ESUMMARY, { unparseable: true }) });
    assert.equal((await pr.checkPmid("9500320")).checked, false);
  });

  it("record missing from an otherwise-good response → UNCHECKED for that id only", async () => {
    const pr = createPubmedRetraction({ fetchImpl: fetchEsummary(ESUMMARY, { omit: ["31978945"] }) });
    const rows = await pr.checkPmids(["9500320", "31978945"]);
    const byId = Object.fromEntries(rows.map((r) => [r.pmid, r]));
    assert.equal(byId["9500320"].retracted, true);
    assert.equal(byId["9500320"].checked, true);
    assert.equal(byId["31978945"].checked, false);
    assert.equal(byId["31978945"].retracted, false);
  });

  // NB: `fetchImpl: null` would fall through the `||` to Node's global fetch and make a LIVE
  // network call. Pass a truthy non-callable to exercise the guard offline.
  it("non-callable fetch implementation → every id UNCHECKED", async () => {
    const pr = createPubmedRetraction({ fetchImpl: {} });
    const rows = await pr.checkPmids(["9500320"]);
    assert.equal(rows[0].checked, false);
    assert.equal(rows[0].retracted, false);
  });

  it("empty input → empty output, no request", async () => {
    let calls = 0;
    const pr = createPubmedRetraction({ fetchImpl: async (...a) => { calls++; return fetchEsummary()(...a); } });
    assert.deepEqual(await pr.checkPmids([]), []);
    assert.equal(calls, 0);
  });

  it("dedupes ids and batches (one request per batchSize)", async () => {
    let calls = 0;
    const pr = createPubmedRetraction({
      batchSize: 2,
      fetchImpl: async (...a) => { calls++; return fetchEsummary()(...a); }
    });
    const rows = await pr.checkPmids(["9500320", "9500320", "31978945", "32450107", "20137807"]);
    assert.equal(rows.length, 4, "duplicates collapsed");
    assert.equal(calls, 2, "4 unique ids at batchSize 2 → 2 requests");
  });
});

describe("citation-gate — checkRetractions with the PMID screen", () => {
  // Must be a well-formed DOI: the extractor's regex requires `10.<4-9 digits>/…`, so a toy
  // value like "10.1/bad" is never even extracted and would silently vacuum out the assertion.
  const BAD_DOI = "10.1016/j.bad.2020.01.001";
  const OK_DOI = "10.1038/nature12373";
  const checkDois = async (dois) => dois.map((d) => ({ doi: d, retracted: d === BAD_DOI, checked: true }));
  const checkPmids = async (pmids) => {
    const pr = createPubmedRetraction({ fetchImpl: fetchEsummary() });
    return pr.checkPmids(pmids);
  };

  it("catches a retracted paper cited ONLY by PMID (the reported gap)", async () => {
    const report = "Prior work reported an association (PMID: 9500320).";
    const out = await checkRetractions(report, checkDois, checkPmids);
    assert.equal(out.checked, true);
    assert.deepEqual(out.retracted, ["9500320"]);
    assert.deepEqual(out.retracted_pmids, ["9500320"]);
    assert.deepEqual(out.retracted_dois, []);
    assert.equal(out.pmids_checked, 1);
  });

  it("does NOT flag a report that cites the retraction notice", async () => {
    const out = await checkRetractions("The paper was withdrawn (PMID: 20137807).", checkDois, checkPmids);
    assert.equal(out.checked, true);
    assert.deepEqual(out.retracted, []);
  });

  it("unions retracted DOIs and PMIDs", async () => {
    const report = `See doi: ${BAD_DOI} and PMID: 9500320 and PMID: 31978945.`;
    const out = await checkRetractions(report, checkDois, checkPmids);
    assert.deepEqual(out.retracted.sort(), [BAD_DOI, "9500320"].sort());
    assert.equal(out.dois_cited, 1);
    assert.equal(out.pmids_cited, 2);
  });

  it("a clean report passes both screens", async () => {
    const out = await checkRetractions(`PMID: 31978945 and doi: ${OK_DOI}`, checkDois, checkPmids);
    assert.deepEqual(out.retracted, []);
    assert.equal(out.checked, true);
    assert.equal(out.dois_checked, 1);
    assert.equal(out.pmids_checked, 1);
  });

  it("PMID screen throwing is fail-soft and never flags (checked:false, no retractions)", async () => {
    const boom = async () => { throw new Error("ECONNRESET"); };
    const out = await checkRetractions("PMID: 9500320", checkDois, boom);
    assert.equal(out.checked, false);
    assert.deepEqual(out.retracted, []);
  });

  it("a failing PMID screen does not suppress a real DOI retraction", async () => {
    const boom = async () => { throw new Error("ECONNRESET"); };
    const out = await checkRetractions(`doi: ${BAD_DOI} and PMID: 9500320`, checkDois, boom);
    assert.equal(out.checked, false, "overall screen is not fully checked");
    assert.deepEqual(out.retracted, [BAD_DOI], "the DOI retraction still surfaces");
  });

  it("backward compatible: a 2-arg caller still screens DOIs and still finds retractions", async () => {
    const out = await checkRetractions(`doi: ${BAD_DOI}`, checkDois);
    assert.equal(out.checked, true, "no PMIDs cited → nothing left unscreened");
    assert.deepEqual(out.retracted, [BAD_DOI]);
    assert.equal(out.pmids_checked, 0);
  });

  // The screens are fail-soft: on a 429/503/timeout the REAL checkers resolve rows carrying
  // checked:false — they never throw. `checked` must therefore key off definitive verdicts, not
  // off "the checker didn't throw", or a total outage renders as "Retraction screen: checked"
  // in the checksum-sealed Reproducibility Manifest while nothing was screened.
  describe("outage semantics — unknown must never read as clean", () => {
    const allUnchecked = async (ids) => ids.map((id) => ({ pmid: id, retracted: false, checked: false }));

    it("a screen that resolves with ZERO definitive verdicts is NOT 'checked'", async () => {
      const out = await checkRetractions("PMID: 9500320 and PMID: 32450107", null, allUnchecked);
      assert.equal(out.checked, false, "429 across the whole batch must not report as checked");
      assert.equal(out.pmids_checked, 0);
      assert.equal(out.pmids_cited, 2);
      assert.equal(out.unscreened, 2, "both cited PMIDs are unscreened");
      assert.deepEqual(out.retracted, []);
    });

    it("a PARTIALLY definitive screen is not 'checked', but still surfaces the retraction it found", async () => {
      const partial = async (ids) => ids.map((id) => id === "9500320"
        ? { pmid: id, retracted: true, checked: true }
        : { pmid: id, retracted: false, checked: false });
      const out = await checkRetractions("PMID: 9500320 and PMID: 31978945", null, partial);
      assert.equal(out.checked, false, "one id went unscreened");
      assert.deepEqual(out.retracted, ["9500320"], "a real retraction is never suppressed");
      assert.equal(out.unscreened, 1);
    });

    it("cited PMIDs with NO PMID screen wired → not 'checked' (they went unscreened)", async () => {
      const out = await checkRetractions(`PMID: 9500320 and doi: ${BAD_DOI}`, checkDois);
      assert.equal(out.checked, false, "a PMID was cited but never screened — that is not 'checked'");
      assert.deepEqual(out.retracted, [BAD_DOI], "the DOI retraction still surfaces");
      assert.equal(out.unscreened, 1);
    });

    it("a checker returning a non-array is treated as zero verdicts, not as clean", async () => {
      const garbage = async () => ({ oops: true });
      const out = await checkRetractions("PMID: 9500320", null, garbage);
      assert.equal(out.checked, false);
      assert.deepEqual(out.retracted, []);
    });

    it("real module under sustained HTTP 429 → checked:false (end-to-end, no hand-written rows)", async () => {
      // Sustained = the one bounded retry also draws a 429; `sleep` is injected so the retry costs no wall-clock time.
      const pr = createPubmedRetraction({ fetchImpl: fetchEsummary(ESUMMARY, { status: 429 }), sleep: async () => {} });
      const out = await checkRetractions("PMID: 9500320 and PMID: 32450107", null, pr.checkPmids);
      assert.equal(out.checked, false, "the real fail-soft checker resolves, never throws");
      assert.equal(out.pmids_checked, 0);
      assert.deepEqual(out.retracted, []);
    });
  });

  it("neither screen → checked:false, fail-soft", async () => {
    const out = await checkRetractions("PMID: 9500320", null, null);
    assert.equal(out.checked, false);
    assert.deepEqual(out.retracted, []);
  });

  // T1-7 (2026-11-14): every cited id is screened in chunks of 50; only ids beyond the 500-per-class
  // ceiling go unscreened, and those are named (tests/core/retraction-coverage.test.js).
  it("screens all 60 cited PMIDs (chunks of 50), none silently dropped", async () => {
    const many = Array.from({ length: 60 }, (_, i) => `PMID: ${100000 + i}`).join(" ");
    const sizes = [];
    const passthrough = async (ids) => { sizes.push(ids.length); return ids.map((id) => ({ pmid: id, retracted: false, checked: true })); };
    const out = await checkRetractions(many, null, passthrough);
    assert.equal(out.pmids_cited, 60);
    assert.deepEqual(sizes, [50, 10]);
    assert.equal(out.pmids_checked, 60);
    assert.equal(out.unscreened, 0);
    assert.equal(out.checked, true);
  });
});

describe("pubmed-retraction — resolveDoisToPmids (DOI→PMID reverse lookup)", () => {
  it("resolves a real DOI to its PMID", async () => {
    const pr = createPubmedRetraction({ fetchImpl: fetchEutils() });
    const [r] = await pr.resolveDoisToPmids(["10.1016/S0140-6736(97)11096-0"]);
    assert.deepEqual(r.pmids, ["9500320"]);
    assert.equal(r.resolved, true);
  });

  it("a DOI not in PubMed resolves to [] but is still 'resolved' (definitive: no record)", async () => {
    const pr = createPubmedRetraction({ fetchImpl: fetchEutils() });
    const [r] = await pr.resolveDoisToPmids(["10.1101/2020.preprint.only"]);
    assert.deepEqual(r.pmids, []);
    assert.equal(r.resolved, true);
  });

  it("network throw → resolved:false, no pmids (fail-soft, never fabricates a mapping)", async () => {
    const pr = createPubmedRetraction({ fetchImpl: fetchEutils(ESUMMARY, DOI_PMID, { searchThrows: true }) });
    const [r] = await pr.resolveDoisToPmids(["10.1016/S0140-6736(97)11096-0"]);
    assert.equal(r.resolved, false);
    assert.deepEqual(r.pmids, []);
  });

  it("non-200 → resolved:false", async () => {
    // A sustained 429 also fails the one retry; `sleep` is injected so that retry costs no wall-clock time.
    const pr = createPubmedRetraction({ fetchImpl: fetchEutils(ESUMMARY, DOI_PMID, { searchStatus: 429 }), sleep: async () => {} });
    const [r] = await pr.resolveDoisToPmids(["10.1056/NEJMoa2001017"]);
    assert.equal(r.resolved, false);
  });

  it("unparseable body → resolved:false", async () => {
    const pr = createPubmedRetraction({ fetchImpl: fetchEutils(ESUMMARY, DOI_PMID, { searchUnparseable: true }) });
    const [r] = await pr.resolveDoisToPmids(["10.1056/NEJMoa2001017"]);
    assert.equal(r.resolved, false);
  });

  it("empty input → empty output, no request", async () => {
    let calls = 0;
    const pr = createPubmedRetraction({ fetchImpl: async (...a) => { calls++; return fetchEutils()(...a); } });
    assert.deepEqual(await pr.resolveDoisToPmids([]), []);
    assert.equal(calls, 0);
  });

  it("non-callable fetch → every DOI resolved:false", async () => {
    const pr = createPubmedRetraction({ fetchImpl: {} });
    const rows = await pr.resolveDoisToPmids(["10.1056/NEJMoa2001017"]);
    assert.equal(rows[0].resolved, false);
  });
});

describe("citation-gate — DOI→PMID escalation (the Wakefield class)", () => {
  const WAKEFIELD_DOI = "10.1016/S0140-6736(97)11096-0";
  const CLEAN_DOI = "10.1056/NEJMoa2001017";
  // Crossref reports BOTH the Wakefield DOI and the clean DOI as not-retracted — the whole reason
  // the escalation exists. So the DOI screen never flags Wakefield; PubMed must.
  const checkDoisCrossrefBlind = async (dois) => dois.map((d) => ({ doi: d, retracted: false, checked: true }));
  const realPmidStack = () => {
    const pr = createPubmedRetraction({ fetchImpl: fetchEutils() });
    return { checkPmids: pr.checkPmids, resolveDoisToPmids: pr.resolveDoisToPmids };
  };

  it("catches a retracted paper cited ONLY by DOI that Crossref reports as clean", async () => {
    const { checkPmids, resolveDoisToPmids } = realPmidStack();
    const out = await checkRetractions(`Evidence: doi: ${WAKEFIELD_DOI}.`, checkDoisCrossrefBlind, checkPmids, resolveDoisToPmids);
    assert.deepEqual(out.retracted_dois, [WAKEFIELD_DOI], "the cited DOI is reported retracted");
    assert.deepEqual(out.retracted_dois_via_pmid, [WAKEFIELD_DOI], "…and attributed to the PubMed escalation");
    assert.deepEqual(out.retracted, [WAKEFIELD_DOI]);
    assert.equal(out.checked, true, "both legs ran to completion");
    assert.equal(out.dois_escalated_via_pmid, 1);
  });

  it("a clean DOI escalation flags nothing", async () => {
    const { checkPmids, resolveDoisToPmids } = realPmidStack();
    const out = await checkRetractions(`doi: ${CLEAN_DOI}`, checkDoisCrossrefBlind, checkPmids, resolveDoisToPmids);
    assert.deepEqual(out.retracted, []);
    assert.equal(out.checked, true);
  });

  it("a DOI not in PubMed → escalation resolves to nothing, still 'checked', flags nothing", async () => {
    const { checkPmids, resolveDoisToPmids } = realPmidStack();
    const out = await checkRetractions("doi: 10.1101/2020.preprint.only", checkDoisCrossrefBlind, checkPmids, resolveDoisToPmids);
    assert.deepEqual(out.retracted, []);
    assert.equal(out.checked, true, "a DOI absent from PubMed is definitively resolved, not incomplete");
  });

  it("a Crossref-flagged DOI is not double-escalated and is reported once", async () => {
    const checkDoisFlags = async (dois) => dois.map((d) => ({ doi: d, retracted: d === WAKEFIELD_DOI, checked: true }));
    const { checkPmids, resolveDoisToPmids } = realPmidStack();
    const out = await checkRetractions(`doi: ${WAKEFIELD_DOI}`, checkDoisFlags, checkPmids, resolveDoisToPmids);
    assert.deepEqual(out.retracted_dois, [WAKEFIELD_DOI], "reported exactly once");
    assert.deepEqual(out.retracted_dois_via_pmid, [], "not escalated — Crossref already flagged it");
  });

  it("escalation resolver throwing is fail-soft: no false retraction, real hits still surface", async () => {
    const boomResolve = async () => { throw new Error("ECONNRESET"); };
    // A separately-cited retracted PMID must still surface even though escalation failed.
    const checkPmidsWithHit = async (pmids) => (createPubmedRetraction({ fetchImpl: fetchEutils() })).checkPmids(pmids);
    const out = await checkRetractions(
      `doi: ${WAKEFIELD_DOI} and PMID: 9500320`, checkDoisCrossrefBlind, checkPmidsWithHit, boomResolve
    );
    assert.ok(out.retracted.includes("9500320"), "the directly-cited retracted PMID still surfaces");
    // T1-7: a DOI Crossref holds is screened by Crossref, so the failed escalation leaves no gap here.
    assert.equal(out.checked, true);
  });

  it("escalation resolver throwing on a DOI Crossref does NOT hold → coverage incomplete, the DOI named (T1-7)", async () => {
    const boomResolve = async () => { throw new Error("ECONNRESET"); };
    const crossref404 = async (dois) => dois.map((d) => ({ doi: d, retracted: false, checked: true, in_crossref: false }));
    const out = await checkRetractions(`doi: ${WAKEFIELD_DOI}`, crossref404, async () => [], boomResolve);
    assert.equal(out.checked, false, "no retraction source could screen it");
    assert.deepEqual(out.unscreened_ids, [`DOI:${WAKEFIELD_DOI}`]);
    assert.equal(out.dois_without_retraction_source, 0, "unknown, not 'held by none': PubMed never answered");
    assert.deepEqual(out.retracted, []);
  });

  it("3-arg caller (no resolver) is unchanged: DOI-only Wakefield passes, escalation not applicable", async () => {
    const { checkPmids } = realPmidStack();
    const out = await checkRetractions(`doi: ${WAKEFIELD_DOI}`, checkDoisCrossrefBlind, checkPmids);
    assert.deepEqual(out.retracted, [], "without the escalation this class is (still) missed");
    assert.equal(out.checked, true, "no PMIDs cited, DOI screened by Crossref → complete");
    assert.deepEqual(out.retracted_dois_via_pmid, []);
  });

  it("a resolved:false row carrying PMIDs must NOT manufacture a retraction (fail-soft guard)", async () => {
    // A hostile/buggy resolver: transport failed (resolved:false) yet returns a retracted PMID.
    const badResolver = async (dois) => dois.map((d) => ({ doi: d, pmids: ["9500320"], resolved: false }));
    const checkPmids = async (pmids) => (createPubmedRetraction({ fetchImpl: fetchEutils() })).checkPmids(pmids);
    const out = await checkRetractions(`doi: ${CLEAN_DOI}`, checkDoisCrossrefBlind, checkPmids, badResolver);
    assert.deepEqual(out.retracted, [], "unverified DOI→PMID mapping must never flag a clean DOI");
    // T1-7: Crossref holds this DOI, so it is screened even though the PubMed mapping failed.
    assert.equal(out.checked, true);
    const crossref404 = async (dois) => dois.map((d) => ({ doi: d, retracted: false, checked: true, in_crossref: false }));
    const missing = await checkRetractions(`doi: ${CLEAN_DOI}`, crossref404, checkPmids, badResolver);
    assert.deepEqual(missing.retracted, []);
    assert.equal(missing.checked, false, "the failed resolution of a DOI Crossref lacks is reported as incomplete");
  });

  it("does not fetch a PMID twice when it is cited both directly and via a co-cited DOI (dedup)", async () => {
    let checkPmidsCalls = [];
    const countingCheckPmids = async (pmids) => {
      checkPmidsCalls.push(pmids.slice());
      return (createPubmedRetraction({ fetchImpl: fetchEutils() })).checkPmids(pmids);
    };
    const { resolveDoisToPmids } = realPmidStack();   // WAKEFIELD_DOI → 9500320
    const out = await checkRetractions(
      `Both: PMID: 9500320 and doi: ${WAKEFIELD_DOI}`, checkDoisCrossrefBlind, countingCheckPmids, resolveDoisToPmids
    );
    const allChecked = checkPmidsCalls.flat();
    assert.equal(allChecked.filter((p) => p === "9500320").length, 1, "PMID 9500320 checked exactly once across both legs");
    // Still correctly flagged (once, as both a PMID and the DOI resolve to the same retracted record).
    assert.ok(out.retracted.includes("9500320"));
    assert.ok(out.retracted_dois.includes(WAKEFIELD_DOI));
  });
});

describe("pubmed-retraction — request throttle (no real delays; injected clock)", () => {
  it("spaces eutils requests by minRequestIntervalMs", async () => {
    // Fake monotonic clock + capturing sleep — asserts spacing without wall-clock delay.
    let clock = 0;
    const waits = [];
    const pr = createPubmedRetraction({
      fetchImpl: fetchEutils(),
      minRequestIntervalMs: 350,
      nowMs: () => clock,
      sleep: async (ms) => { waits.push(ms); clock += ms; }   // advancing the clock as if we slept
    });
    // 3 DOIs → 3 sequential esearch requests; the 2nd and 3rd must each wait ~350ms.
    await pr.resolveDoisToPmids([
      "10.1016/S0140-6736(97)11096-0", "10.1056/NEJMoa2001017", "10.1101/2020.preprint.only"
    ]);
    assert.equal(waits.length, 2, "first request immediate; next two throttled");
    assert.ok(waits.every((w) => w === 350), `each throttled wait is the full interval: ${JSON.stringify(waits)}`);
  });

  it("default (no interval set) does not throttle — offline tests stay instant", async () => {
    const waits = [];
    const pr = createPubmedRetraction({
      fetchImpl: fetchEutils(),
      sleep: async (ms) => { waits.push(ms); }
    });
    await pr.resolveDoisToPmids(["10.1056/NEJMoa2001017", "10.1016/S0140-6736(97)11096-0"]);
    assert.deepEqual(waits, [], "throttle is off by default");
  });
});

describe("pubmed-retraction — one bounded retry on a 429 (live 2026-10-08: 2 of 21 DOI lookups drew a 429 at the production spacing)", () => {
  // Wraps the normal E-utilities mock so the first `times` requests matching `path` answer 429.
  // `retryAfter` undefined = no headers object at all (the realistic worst case for a mock or a proxy).
  function rateLimited(path, retryAfter, times = 1) {
    const inner = fetchEutils();
    let left = times;
    const seen = { n: 0 };
    const fetchImpl = async (url, init) => {
      seen.n += 1;
      if (String(url).includes(path) && left > 0) {
        left -= 1;
        return {
          ok: false,
          status: 429,
          headers: retryAfter === undefined ? undefined : { get: (h) => (String(h).toLowerCase() === "retry-after" ? retryAfter : null) },
          json: async () => ({})
        };
      }
      return inner(url, init);
    };
    return { fetchImpl, seen };
  }
  function fakeClock() {
    const s = { clock: 0, waits: [] };
    return { s, nowMs: () => s.clock, sleep: async (ms) => { s.waits.push(ms); s.clock += ms; } };
  }
  const WAKEFIELD_DOI = "10.1016/S0140-6736(97)11096-0";

  it("a DOI lookup that draws a 429 waits Retry-After, retries once and resolves (the screen stays complete)", async () => {
    const { fetchImpl, seen } = rateLimited("esearch.fcgi", "2");
    const c = fakeClock();
    const pr = createPubmedRetraction({ fetchImpl, nowMs: c.nowMs, sleep: c.sleep });
    const [row] = await pr.resolveDoisToPmids([WAKEFIELD_DOI]);
    assert.equal(row.resolved, true);
    assert.deepEqual(row.pmids, ["9500320"]);
    assert.equal(seen.n, 2, "exactly one retry");
    assert.deepEqual(c.s.waits, [2000], "Retry-After: 2 means two seconds");
  });

  it("an esummary batch that draws a 429 is retried once, so the PMIDs are checked and a retraction is still caught", async () => {
    const { fetchImpl, seen } = rateLimited("esummary.fcgi");
    const c = fakeClock();
    const pr = createPubmedRetraction({ fetchImpl, nowMs: c.nowMs, sleep: c.sleep });
    const [r] = await pr.checkPmids(["9500320"]);   // Wakefield, retracted
    assert.equal(r.checked, true);
    assert.equal(r.retracted, true, "the retry must not cost a retraction its flag");
    assert.equal(seen.n, 2);
    assert.deepEqual(c.s.waits, [1000], "no Retry-After header: NCBI limits per second, so 1 s");
  });

  it("two 429s in a row stay fail-soft: unchecked, never a false 'clean' or 'retracted', and only ONE retry is made", async () => {
    const { fetchImpl, seen } = rateLimited("esummary.fcgi", "1", 2);
    const c = fakeClock();
    const pr = createPubmedRetraction({ fetchImpl, nowMs: c.nowMs, sleep: c.sleep });
    const [r] = await pr.checkPmids(["9500320"]);
    assert.equal(r.checked, false);
    assert.equal(r.retracted, false);
    assert.equal(seen.n, 2, "one retry, not a loop");
  });

  it("a Retry-After beyond the cap is not waited out: no retry, the DOI stays unresolved", async () => {
    const { fetchImpl, seen } = rateLimited("esearch.fcgi", "60");
    const c = fakeClock();
    const pr = createPubmedRetraction({ fetchImpl, nowMs: c.nowMs, sleep: c.sleep });
    const [row] = await pr.resolveDoisToPmids([WAKEFIELD_DOI]);
    assert.equal(row.resolved, false);
    assert.equal(seen.n, 1);
    assert.deepEqual(c.s.waits, [], "a server asking for a minute is not waited out mid-delivery");
  });

  it("a 5xx is not retried, and a clean first response makes exactly one request", async () => {
    let calls = 0;
    const c = fakeClock();
    const down = createPubmedRetraction({
      fetchImpl: async () => { calls += 1; return { ok: false, status: 503, json: async () => ({}) }; },
      nowMs: c.nowMs, sleep: c.sleep
    });
    const [row] = await down.resolveDoisToPmids([WAKEFIELD_DOI]);
    assert.equal(row.resolved, false);
    assert.equal(calls, 1, "only a 429 earns the retry");

    const { fetchImpl, seen } = rateLimited("never-matches", "1", 0);
    const ok = createPubmedRetraction({ fetchImpl, nowMs: c.nowMs, sleep: c.sleep });
    await ok.resolveDoisToPmids([WAKEFIELD_DOI]);
    assert.equal(seen.n, 1);
    assert.deepEqual(c.s.waits, []);
  });
});

describe("citation-gate — retraction-NOTICE disambiguation (Crossref false-positive)", () => {
  const NOTICE_DOI = "10.1016/S0140-6736(10)60175-4";   // Wakefield RETRACTION NOTICE
  const WAKEFIELD_DOI = "10.1016/S0140-6736(97)11096-0"; // the retracted paper itself
  // Crossref's `update-to:[retraction]` flags BOTH the retracted paper and the notice — it cannot
  // tell them apart. This mock reproduces that: it flags the notice DOI as retracted.
  const checkDoisFlagsNotice = async (dois) => dois.map((d) => ({ doi: d, retracted: d === NOTICE_DOI, checked: true }));
  const realPmidStack = () => {
    const pr = createPubmedRetraction({ fetchImpl: fetchEutils() });
    return { checkPmids: pr.checkPmids, resolveDoisToPmids: pr.resolveDoisToPmids };
  };

  it("un-flags a Crossref-flagged DOI that PubMed identifies as a retraction NOTICE", async () => {
    const { checkPmids, resolveDoisToPmids } = realPmidStack();
    const out = await checkRetractions(`See the notice doi: ${NOTICE_DOI}.`, checkDoisFlagsNotice, checkPmids, resolveDoisToPmids);
    assert.deepEqual(out.retracted, [], "citing a retraction notice must NOT hard-fail the report");
    assert.deepEqual(out.retracted_dois, []);
    assert.deepEqual(out.unflagged_notice_dois, [NOTICE_DOI], "recorded as a disambiguated notice");
    assert.equal(out.checked, true);
  });

  it("still flags the actual retracted paper even when the notice is also cited", async () => {
    const { checkPmids, resolveDoisToPmids } = realPmidStack();
    const out = await checkRetractions(
      `The paper doi: ${WAKEFIELD_DOI} was withdrawn — see notice doi: ${NOTICE_DOI}.`,
      checkDoisFlagsNotice, checkPmids, resolveDoisToPmids
    );
    assert.deepEqual(out.retracted_dois, [WAKEFIELD_DOI], "the retracted paper is flagged; the notice is not");
    assert.ok(!out.retracted.includes(NOTICE_DOI));
  });

  it("under a PubMed outage a Crossref flag STANDS (fail-closed on the retraction axis)", async () => {
    // doiToPmid throws → PubMed can't disambiguate → the Crossref flag is not overridden.
    const boom = async () => { throw new Error("ECONNRESET"); };
    const { checkPmids } = realPmidStack();
    const out = await checkRetractions(`doi: ${NOTICE_DOI}`, checkDoisFlagsNotice, checkPmids, boom);
    assert.deepEqual(out.retracted_dois, [NOTICE_DOI], "conservative: block rather than risk shipping a retraction");
    // T1-7: Crossref holds the DOI (it answered with a definitive record), so it was screened; the
    // PubMed outage only removed the chance to override the flag, which is why the flag stands.
    assert.equal(out.checked, true);
  });
});
