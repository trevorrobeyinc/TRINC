"use strict";

// T2-16 (2026-11-16): EudraCT and ISRCTN trial ids and PMCIDs are read, grounded by type, marked,
// re-resolved at their registries and, for a PMCID, retraction-screened through the PMID (or DOI) its
// PMC record lists. Before this, SYSTEM-REALITY.md's tagline row named them among the citation forms
// that were not checked at all. The registry answers the resolvers rest on were read live, read-only,
// on 2026-11-15 and are pinned here from tests/fixtures/registry-probe-2026-11-15/.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { extractCitations, extractCitationSpans, crossCheckCitations, groundingKey } = require("../../openclaw-bridge/core/citation-extractor.js");
const { annotateUngrounded, checkRetractions } = require("../../openclaw-bridge/core/citation-gate.js");
const { createCitationReresolver, hostFor } = require("../../openclaw-bridge/mcp/citation-reresolver/citation-reresolver.js");
const { createPubmedRetraction } = require("../../openclaw-bridge/mcp/pubmed-retraction/pubmed-retraction.js");
const { buildReproducibilityManifest, renderManifestMarkdown } = require("../../openclaw-bridge/core/reproducibility-manifest.js");

const FIXTURES = path.join(__dirname, "..", "fixtures", "registry-probe-2026-11-15");
const fixture = (name) => fs.readFileSync(path.join(FIXTURES, name), "utf8");
const ids = (text, type) => extractCitations(text).filter((c) => c.type === type).map((c) => c.id);

// A fetch stub that answers each URL fragment with a status and a raw body (JSON, XML or text).
function fetchStub(routes) {
  return async (url) => {
    for (const r of routes) {
      if (url.includes(r.match)) {
        if (r.throw) throw new Error("network down");
        return {
          status: r.status,
          ok: r.status >= 200 && r.status < 300,
          json: async () => JSON.parse(r.body),
          text: async () => r.body
        };
      }
    }
    throw new Error(`no stub route for ${url}`);
  };
}
const resolver = (routes) => createCitationReresolver({ fetchImpl: fetchStub(routes), nowIso: () => "2026-11-16T00:00:00Z", sleep: async () => {} });

describe("T2-16: the extractor reads EudraCT, ISRCTN and PMCID ids", () => {
  it("ISRCTN: bare, spaced, hyphenated and in an isrctn.com URL, normalized", () => {
    assert.deepEqual(ids("Registered as ISRCTN50189673.", "ISRCTN"), ["ISRCTN50189673"]);
    assert.deepEqual(ids("ISRCTN 50189673", "ISRCTN"), ["ISRCTN50189673"]);
    assert.deepEqual(ids("ISRCTN-50189673", "ISRCTN"), ["ISRCTN50189673"]);
    assert.deepEqual(ids("https://www.isrctn.com/ISRCTN50189673", "ISRCTN"), ["ISRCTN50189673"]);
  });

  it("PMCID: the PMC token, a 'PMCID:' label with or without the prefix, and the PMC and Europe PMC URLs", () => {
    for (const text of ["Full text: PMC7383595.", "PMCID: PMC7383595", "PMCID: 7383595",
      "https://pmc.ncbi.nlm.nih.gov/articles/PMC7383595/", "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7383595/",
      "https://europepmc.org/article/PMC/PMC7383595"]) {
      assert.deepEqual(ids(text, "PMCID"), ["PMC7383595"], text);
    }
    assert.deepEqual(extractCitationSpans("PMCID: PMC7383595").length, 1, "one mention, one span");
  });

  it("EudraCT: only after an 'EudraCT' label or inside an EU register URL (D6)", () => {
    for (const text of ["EudraCT 2020-001113-21", "EudraCT number: 2020-001113-21", "EudraCT No. 2020-001113-21", "(EudraCT, 2020-001113-21)",
      "https://www.clinicaltrialsregister.eu/ctr-search/trial/2020-001113-21/GB",
      "https://www.clinicaltrialsregister.eu/ctr-search/search?query=2020-001113-21"]) {
      assert.deepEqual(ids(text, "EudraCT"), ["2020-001113-21"], text);
    }
  });

  it("guards: no bare dash number, no EU CT number cut, no longer run, no placeholder, no prose 'PMC'", () => {
    assert.deepEqual(ids("Grant 2015-001234-56 funded it.", "EudraCT"), [], "a bare dash number in prose is never read");
    assert.deepEqual(ids("EudraCT 2023-503456-12-00 (an EU CT number)", "EudraCT"), [], "an EU CT number is never cut");
    assert.deepEqual(ids("ISRCTN123456789", "ISRCTN"), [], "a longer run is dropped, never cut");
    assert.deepEqual(ids("ISRCTN00000000 and PMC0000000", "ISRCTN").concat(ids("ISRCTN00000000 and PMC0000000", "PMCID")), []);
    assert.deepEqual(ids("Europe PMC 2023 update; EPMC12345", "PMCID"), []);
    assert.deepEqual(ids("PMC7383595", "PMID"), [], "a PMCID's digits are never a PMID");
  });

  it("typed grounding: a PMCID is grounded only by a retrieved PMCID, never by its paper's PMID", () => {
    const evidence = "Trial registration: ISRCTN50189673. Full text PMC7383595. PMID: 32678530.";
    const knownKeys = extractCitations(evidence).map(groundingKey);
    const x = crossCheckCitations("RECOVERY (ISRCTN50189673) and PMC7383595.", [], { knownKeys });
    assert.equal(x.verified_count, 2);
    const y = crossCheckCitations("Full text PMC7383595.", [], { knownKeys: ["PMID:32678530"] });
    assert.deepEqual(y.unverified, [{ type: "PMCID", id: "PMC7383595" }]);
  });

  it("marks: an untraced ISRCTN and EudraCT number are flagged at every mention, after a whole URL", () => {
    const out = annotateUngrounded(
      "See https://www.isrctn.com/ISRCTN98765432 and EudraCT 2020-999999-98.",
      [{ type: "ISRCTN", id: "ISRCTN98765432" }, { type: "EudraCT", id: "2020-999999-98" }]
    );
    assert.equal(out.split("\n\n## ⚠️ Citation Verification")[0],
      "See https://www.isrctn.com/ISRCTN98765432 [UNVERIFIED] and EudraCT 2020-999999-98 [UNVERIFIED].");
  });
});

describe("T2-16: each id is re-resolved at its registry (fixtures from the 2026-11-15 probe)", () => {
  it("PMCID: an echoed docsum is VERIFIED; PMC's 'cannot get document summary' is UNRESOLVED", async () => {
    const real = await resolver([{ match: "db=pmc", status: 200, body: fixture("pmc-esummary-real-7383595.json") }]).resolveOne({ type: "PMCID", id: "PMC7383595" });
    assert.equal(real.status, "VERIFIED");
    const invented = await resolver([{ match: "db=pmc", status: 200, body: fixture("pmc-esummary-invented-99999999.json") }]).resolveOne({ type: "PMCID", id: "PMC99999999" });
    assert.equal(invented.status, "UNRESOLVED");
    assert.equal(invented.evidence.reason, "cannot_get_document_summary");
    const throttled = await resolver([{ match: "db=pmc", status: 503, body: "" }]).resolveOne({ type: "PMCID", id: "PMC7383595" });
    assert.equal(throttled.status, "UNCHECKED");
    assert.equal(hostFor("PMCID"), "eutils", "PMCIDs share the paced NCBI lane with PMIDs");
  });

  it("ISRCTN: the query API's echo is VERIFIED; totalCount 0 is UNRESOLVED (D7); anything else is UNCHECKED", async () => {
    const real = await resolver([{ match: "isrctn.com/api/query", status: 200, body: fixture("isrctn-api-real-ISRCTN50189673.xml") }]).resolveOne({ type: "ISRCTN", id: "ISRCTN50189673" });
    assert.equal(real.status, "VERIFIED");
    const invented = await resolver([{ match: "isrctn.com/api/query", status: 200, body: fixture("isrctn-api-invented-ISRCTN98765432.xml") }]).resolveOne({ type: "ISRCTN", id: "ISRCTN98765432" });
    assert.equal(invented.status, "UNRESOLVED");
    assert.equal(invented.evidence.reason, "isrctn_not_found");
    const html = await resolver([{ match: "isrctn.com/api/query", status: 200, body: "<html><body>maintenance</body></html>" }]).resolveOne({ type: "ISRCTN", id: "ISRCTN50189673" });
    assert.equal(html.status, "UNCHECKED", "a bare 200 is never sufficient");
    const other = await resolver([{ match: "isrctn.com/api/query", status: 200, body: fixture("isrctn-api-real-ISRCTN50189673.xml") }]).resolveOne({ type: "ISRCTN", id: "ISRCTN12345678" });
    assert.equal(other.status, "UNCHECKED", "a record that does not echo the cited id proves nothing about it");
  });

  it("EudraCT: the EU register's echo is VERIFIED; an empty answer is UNCHECKED, never UNRESOLVED (D7)", async () => {
    const real = await resolver([{ match: "clinicaltrialsregister.eu", status: 200, body: fixture("euctr-download-real-2020-001113-21.txt") }]).resolveOne({ type: "EudraCT", id: "2020-001113-21" });
    assert.equal(real.status, "VERIFIED");
    const empty = await resolver([{ match: "clinicaltrialsregister.eu", status: 200, body: fixture("euctr-download-invented-2020-999999-98.txt") }]).resolveOne({ type: "EudraCT", id: "2020-999999-98" });
    assert.equal(empty.status, "UNCHECKED");
    assert.equal(empty.evidence.reason, "registry_no_definitive_answer");
  });
});

describe("T2-16: a cited PMCID is retraction-screened through its PMC record (D8)", () => {
  it("resolvePmcidsToIds reads the PMID and DOI a PMC record lists, and PMC's definitive 'no such record'", async () => {
    const pm = createPubmedRetraction({
      fetchImpl: fetchStub([{ match: "id=7383595", status: 200, body: fixture("pmc-esummary-real-7383595.json") },
        { match: "id=99999999", status: 200, body: fixture("pmc-esummary-invented-99999999.json") }])
    });
    assert.deepEqual(await pm.resolvePmcidsToIds(["PMC7383595"]),
      [{ pmcid: "PMC7383595", pmid: "32678530", doi: "10.1056/NEJMoa2021436", resolved: true, in_pmc: true }]);
    assert.deepEqual(await pm.resolvePmcidsToIds(["PMC99999999"]),
      [{ pmcid: "PMC99999999", pmid: null, doi: null, resolved: true, in_pmc: false }]);
    const down = createPubmedRetraction({ fetchImpl: fetchStub([{ match: "db=pmc", throw: true }]) });
    assert.deepEqual(await down.resolvePmcidsToIds(["PMC7383595"]),
      [{ pmcid: "PMC7383595", pmid: null, doi: null, resolved: false, in_pmc: null }]);
  });

  const map = (rows) => async (list) => list.map((pmcid) => rows[pmcid] || { pmcid, pmid: null, doi: null, resolved: false, in_pmc: null });

  it("a PMCID whose paper PubMed marks retracted blocks, named as the PMCID", async () => {
    const checked = [];
    const r = await checkRetractions(
      "As shown (PMC1111111).",
      async () => [],
      async (pmids) => { checked.push(...pmids); return pmids.map((pmid) => ({ pmid, retracted: true, is_notice: false, checked: true })); },
      async () => [],
      map({ PMC1111111: { pmcid: "PMC1111111", pmid: "9500320", doi: null, resolved: true, in_pmc: true } })
    );
    assert.deepEqual(r.retracted, ["PMC1111111"]);
    assert.deepEqual(r.retracted_pmcids, ["PMC1111111"]);
    assert.deepEqual(r.retracted_pmids, [], "the report never cited that PMID directly");
    assert.deepEqual(checked, ["9500320"]);
  });

  it("a clean PMCID is screened; one with no PMID or DOI, one PMC does not hold, or an unwired lookup is named unscreened", async () => {
    const clean = await checkRetractions("PMC2222222.", async () => [],
      async (pmids) => pmids.map((pmid) => ({ pmid, retracted: false, is_notice: false, checked: true })), async () => [],
      map({ PMC2222222: { pmcid: "PMC2222222", pmid: "32678530", doi: null, resolved: true, in_pmc: true } }));
    assert.equal(clean.checked, true);
    assert.equal(clean.pmcids_checked, 1);
    const gaps = await checkRetractions("PMC3333333 and PMC4444444.", async () => [], async () => [], async () => [],
      map({ PMC3333333: { pmcid: "PMC3333333", pmid: null, doi: null, resolved: true, in_pmc: true },
        PMC4444444: { pmcid: "PMC4444444", pmid: null, doi: null, resolved: true, in_pmc: false } }));
    assert.equal(gaps.checked, false);
    assert.deepEqual(gaps.unscreened_ids, ["PMCID:PMC3333333", "PMCID:PMC4444444"]);
    const unwired = await checkRetractions("PMC5555555.", async () => [], async () => []);
    assert.deepEqual(unwired.unscreened_ids, ["PMCID:PMC5555555"]);
  });

  it("a PMC record with no PMID is screened through its DOI on Crossref, and a verdict already fetched is reused", async () => {
    const doiCalls = [];
    const r = await checkRetractions("PMC6666666; doi: 10.1000/known.1", async (dois) => { doiCalls.push(...dois); return dois.map((doi) => ({ doi, retracted: false, checked: true, in_crossref: true })); },
      async () => [], async (dois) => dois.map((doi) => ({ doi, pmids: [], resolved: true })),
      map({ PMC6666666: { pmcid: "PMC6666666", pmid: null, doi: "10.1000/known.1", resolved: true, in_pmc: true } }));
    assert.equal(r.pmcids_checked, 1);
    assert.deepEqual(doiCalls, ["10.1000/known.1"], "the cited DOI's Crossref verdict was reused for the PMCID");
  });
});

describe("T2-16: the manifest counts the new types and blocks on a retracted PMCID", () => {
  it("by_type gains PMCID, ISRCTN and EudraCT rows, and an UNCHECKED EudraCT flags but never blocks", () => {
    const m = buildReproducibilityManifest({
      reresolved: [
        { type: "PMCID", id: "PMC7383595", status: "VERIFIED" },
        { type: "ISRCTN", id: "ISRCTN50189673", status: "VERIFIED" },
        { type: "EudraCT", id: "2020-001113-21", status: "UNCHECKED", evidence: { reason: "registry_no_definitive_answer" } }
      ],
      retraction: { checked: true, retracted_dois: [], retracted_pmids: [] }
    });
    assert.deepEqual(Object.keys(m.summary.by_type).sort(), ["EudraCT", "ISRCTN", "PMCID"]);
    assert.equal(m.summary.delivery_decision, "DELIVER_WITH_FLAGS");
    assert.equal(m.summary.retraction_screen.retracted_pmcids, undefined, "absent unless a PMCID was retracted");
  });

  it("a retracted PMCID blocks with its own reason and its own count", () => {
    const m = buildReproducibilityManifest({
      reresolved: [{ type: "PMCID", id: "PMC1111111", status: "VERIFIED" }],
      retraction: { checked: true, retracted_dois: [], retracted_pmids: [], retracted_pmcids: ["PMC1111111"] }
    });
    assert.equal(m.summary.delivery_decision, "BLOCK");
    assert.ok(m.summary.block_reasons.includes("retracted_pmcid"));
    assert.match(renderManifestMarkdown(m), /retracted PMCIDs: 1/);
  });
});
