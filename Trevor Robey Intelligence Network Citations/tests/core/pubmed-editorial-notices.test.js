"use strict";

// T2-2 (2026-11-16): PubMed's editorial notices. T1-7 built the Crossref half (updated-by, exact types,
// editorial_updates in the ledger); the PubMed leg read only the publication type. PubMed records an
// expression of concern only as a docsum reference type ("Expression of concern in", the publication type
// unchanged), and a "Retraction in" link on a record not marked "Retracted Publication" may be a partial
// retraction or an update not yet made: PubMed marks neither apart (no publication type, no filter; the
// 2026-11-16 probe). Both are ledger flags and never block (operator defaults D3, D14). Docsums from
// tests/fixtures/registry-probe-2026-11-15/.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { createPubmedRetraction } = require("../../openclaw-bridge/mcp/pubmed-retraction/pubmed-retraction.js");
const { checkRetractions } = require("../../openclaw-bridge/core/citation-gate.js");
const { buildIntegrityReport } = require("../../openclaw-bridge/monetization/integrity-rating.js");

const FIXTURES = path.join(__dirname, "..", "fixtures", "registry-probe-2026-11-15");
const docsum = (name) => JSON.parse(fs.readFileSync(path.join(FIXTURES, name), "utf8"));

function pubmedWith(results) {
  return createPubmedRetraction({
    fetchImpl: async (url) => {
      const ids = decodeURIComponent((/[?&]id=([^&]+)/.exec(url) || [])[1] || "").split(",");
      const result = { uids: ids };
      for (const id of ids) result[id] = results[id] || { uid: id, error: "cannot get document summary" };
      return { ok: true, status: 200, json: async () => ({ result }) };
    }
  });
}

const EOC = docsum("pubmed-esummary-eoc-25065594.json").result["25065594"];
const RETRACTED = docsum("pubmed-esummary-retracted-9500320.json").result["9500320"];
// A record PubMed links to a retraction notice without marking it retracted (constructed: the shape a
// partial retraction or a not-yet-updated record takes).
const LINK_ONLY = { uid: "31000002", pubtype: ["Journal Article"], references: [{ reftype: "Retraction in", pmid: 31000003 }], title: "x" };
const COMMENTED = { uid: "31000004", pubtype: ["Journal Article"], references: [{ reftype: "Comment in", pmid: 31000005 }], title: "y" };

describe("T2-2: the PubMed leg reads editorial notices from the docsum's reference types", () => {
  it("an expression of concern is flagged, never retracted", async () => {
    const [row] = await pubmedWith({ 25065594: EOC }).checkPmids(["25065594"]);
    assert.equal(row.retracted, false);
    assert.deepEqual(row.editorial, ["expression_of_concern"]);
  });

  it("a retracted paper still blocks on its publication type; its 'Retraction in' adds no extra flag", async () => {
    const [row] = await pubmedWith({ 9500320: RETRACTED }).checkPmids(["9500320"]);
    assert.equal(row.retracted, true);
    assert.deepEqual(row.editorial, ["expression_of_concern"]);
  });

  it("'Retraction in' on a record not marked retracted is a flag, not a block (D14); 'Comment in' is nothing", async () => {
    const rows = await pubmedWith({ 31000002: LINK_ONLY, 31000004: COMMENTED }).checkPmids(["31000002", "31000004"]);
    assert.equal(rows[0].retracted, false);
    assert.deepEqual(rows[0].editorial, ["pubmed_retraction_link"]);
    assert.equal(rows[1].editorial, undefined, "a row with no editorial notice keeps its old shape");
  });
});

describe("T2-2: the screen lists PubMed's notices for a PMID, a DOI and a PMCID, and never blocks on them", () => {
  const pm = pubmedWith({ 25065594: EOC, 31000002: LINK_ONLY });

  it("flags each cited form once, with PubMed as the source", async () => {
    const out = await checkRetractions(
      "PMID: 25065594; doi: 10.1000/eoc.1; PMC1234567.",
      async (dois) => dois.map((doi) => ({ doi, retracted: false, checked: true, in_crossref: true })),
      (pmids) => pm.checkPmids(pmids),
      async (dois) => dois.map((doi) => ({ doi, pmids: ["25065594"], resolved: true })),
      async (list) => list.map((pmcid) => ({ pmcid, pmid: "31000002", doi: null, resolved: true, in_pmc: true }))
    );
    assert.deepEqual(out.retracted, []);
    assert.deepEqual(out.editorial_flags, [
      { id: "DOI:10.1000/eoc.1", type: "expression_of_concern", source: "pubmed" },
      { id: "PMID:25065594", type: "expression_of_concern", source: "pubmed" },
      { id: "PMCID:PMC1234567", type: "pubmed_retraction_link", source: "pubmed" }
    ]);
  });

  it("the ledger names PubMed's notices in plain words, under 'not blocking'", () => {
    const md = buildIntegrityReport({
      cited: 3, grounded: 3, ungrounded: 0, grounded_ratio: 1, retracted: [], retraction_screen_checked: true,
      retraction_editorial_flags: [
        { id: "PMID:25065594", type: "expression_of_concern", source: "pubmed" },
        { id: "PMCID:PMC1234567", type: "pubmed_retraction_link", source: "pubmed" }
      ]
    }).markdown;
    assert.match(md, /## Editorial notices on cited works \(not blocking\)/);
    assert.match(md, /- PMID:25065594: expression of concern \(recorded by PubMed\)/);
    assert.match(md, /- PMCID:PMC1234567: PubMed links a retraction notice to it, but its record is not marked retracted/);
  });
});
