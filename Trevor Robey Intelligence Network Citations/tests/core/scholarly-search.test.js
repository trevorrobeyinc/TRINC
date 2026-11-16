"use strict";

// 2026-11-15 (operator decision): the quality audit's section citation-coverage gate searches Europe PMC
// and Crossref directly for the "science" topic instead of SearXNG's science category. Offline: every
// HTTP response below is a stub shaped like the real APIs' JSON.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { createScholarlySearch, europePmcRows, crossrefRows, europePmcQuery, normalizeDoi } = require("../../openclaw-bridge/mcp/scholarly-search/scholarly-search.js");
const { createSearchFn } = require("../../openclaw-bridge/mcp/searxng-mcp/searchfn.js");
const { runCitationGate } = require("../../openclaw-bridge/mcp/searxng-mcp/index.js");
const { runSectionGate } = require("../../openclaw-bridge/mcp/searxng-mcp/section-gate.js");

const EPMC = {
  resultList: {
    result: [
      { id: "38000001", source: "MED", pmid: "38000001", doi: "10.1001/JAMA.2024.1234", title: "Semaglutide and alcohol intake: a randomized trial", journalTitle: "JAMA", pubYear: "2024" },
      { id: "PPR900", source: "PPR", doi: "10.1101/2025.01.01.999999", title: "GLP-1 agonists and drinking (preprint)", pubYear: "2025" },
      { id: "PMC77", source: "PMC", pmcid: "PMC7700000", title: "A record with no PMID or DOI", pubYear: "2023" }
    ]
  }
};
const CROSSREF = {
  message: {
    items: [
      { DOI: "10.1001/jama.2024.1234", title: ["Semaglutide and alcohol intake"], "container-title": ["JAMA"], issued: { "date-parts": [[2024]] }, type: "journal-article" },
      { DOI: "10.1016/j.drugalcdep.2023.110000", title: ["Incretins in alcohol use disorder"], "container-title": ["Drug Alcohol Depend"], issued: { "date-parts": [[2023]] }, type: "journal-article" },
      { DOI: "10.31234/osf.io/abcde", title: ["A posted preprint"], type: "posted-content" },
      // What Crossref's relevance search also returns for these words (seen live 2026-11-15): an untitled
      // grant and a news "report". Neither is a citable work.
      { DOI: "10.46540/4309-00113b", type: "grant" },
      { DOI: "10.64239/pi-qt7903", title: ["Semaglutide for Alcohol Use Disorder: New RCT Data"], type: "report" }
    ]
  }
};

function stubHttp(routes) {
  const calls = [];
  const impl = async (url) => {
    calls.push(url);
    for (const [prefix, response] of routes) {
      if (url.startsWith(prefix)) {
        if (response instanceof Error) throw response;
        if (typeof response === "number") return { ok: false, status: response, json: async () => ({}) };
        return { ok: true, status: 200, json: async () => response };
      }
    }
    throw new Error(`unexpected URL ${url}`);
  };
  return { impl, calls };
}

const EPMC_PREFIX = "https://www.ebi.ac.uk/europepmc/webservices/rest/search?";
const CROSSREF_PREFIX = "https://api.crossref.org/works?";

describe("scholarly search (Europe PMC + Crossref, free and keyless)", () => {
  it("turns Europe PMC hits into record-identity rows: PMID, DOI and PMCID, preprints tagged", () => {
    const rows = europePmcRows(EPMC);
    assert.equal(rows.length, 3);
    assert.deepEqual(rows[0].citations, [
      { type: "pmid", id: "38000001", source: "metadata" },
      { type: "doi", id: "10.1001/jama.2024.1234", source: "metadata" }
    ]);
    assert.equal(rows[0].url, "https://pubmed.ncbi.nlm.nih.gov/38000001/");
    assert.ok(rows[1].citations.every((c) => c.subtype === "preprint"), "a PPR record is a preprint");
    assert.equal(rows[2].url, "https://europepmc.org/article/PMC/PMC77");
    assert.deepEqual(rows[2].citations, [{ type: "pmcid", id: "PMC7700000", source: "metadata" }]);
  });

  it("builds a Europe PMC query anchored on the subject in title/abstract, over PubMed records and preprints", () => {
    assert.equal(
      europePmcQuery("alcohol use disorder Novo Nordisk Semaglutide GLP-1 STEER", "alcohol use disorder"),
      'TITLE_ABS:"alcohol use disorder" AND (TITLE_ABS:"novo" OR TITLE_ABS:"nordisk" OR TITLE_ABS:"semaglutide" OR TITLE_ABS:"glp-1" OR TITLE_ABS:"steer") AND (SRC:MED OR SRC:PPR)'
    );
    assert.equal(europePmcQuery("alcohol use disorder", "alcohol use disorder"), 'TITLE_ABS:"alcohol use disorder" AND (SRC:MED OR SRC:PPR)');
    assert.equal(europePmcQuery('semaglutide "AUD" (STEER)', ""), '(TITLE_ABS:"semaglutide" OR TITLE_ABS:"aud" OR TITLE_ABS:"steer") AND (SRC:MED OR SRC:PPR)', "quotes and brackets never reach the query");
  });

  it("turns Crossref items into DOI rows; only titled works are kept, and preprints are tagged", () => {
    const rows = crossrefRows(CROSSREF);
    assert.equal(rows.length, 3, "the untitled grant and the news report are dropped");
    assert.ok(!rows.some((r) => /10\.46540|10\.64239/.test(r.url)));
    assert.equal(rows[1].url, "https://doi.org/10.1016/j.drugalcdep.2023.110000");
    assert.equal(rows[1].content, "Drug Alcohol Depend, 2023");
    assert.equal(rows[2].citations[0].subtype, "preprint");
    assert.equal(normalizeDoi("https://doi.org/10.1001/JAMA.2024.1234."), "10.1001/jama.2024.1234");
  });

  it("merges both sources, keeps one row per work, and caps the list", async () => {
    const { impl, calls } = stubHttp([[EPMC_PREFIX, EPMC], [CROSSREF_PREFIX, CROSSREF]]);
    const out = await createScholarlySearch({ httpImpl: impl }).search({ query: "alcohol use disorder semaglutide", max_results: 4, primary_subject: "alcohol use disorder" });
    assert.equal(calls.length, 2);
    assert.equal(new URL(calls[0]).searchParams.get("query"), 'TITLE_ABS:"alcohol use disorder" AND (TITLE_ABS:"semaglutide") AND (SRC:MED OR SRC:PPR)');
    assert.equal(new URL(calls[1]).searchParams.get("query.bibliographic"), "alcohol use disorder semaglutide");
    assert.equal(new URL(calls[1]).searchParams.get("rows"), "8", "twice the rows, for the work-type filter");
    assert.equal(out.results.length, 4);
    const dois = out.results.flatMap((r) => r.citations.filter((c) => c.type === "doi").map((c) => c.id));
    assert.equal(dois.filter((d) => d === "10.1001/jama.2024.1234").length, 1, "the same work from both sources is one row");
    assert.deepEqual(out.sources, { europepmc: "ok", crossref: "ok" });
  });

  it("one source failing still returns the other source's rows", async () => {
    const { impl } = stubHttp([[EPMC_PREFIX, 503], [CROSSREF_PREFIX, CROSSREF]]);
    const out = await createScholarlySearch({ httpImpl: impl }).search({ query: "semaglutide" });
    assert.equal(out.results.length, 3);
    assert.equal(out.sources.europepmc, "HTTP 503");
  });

  it("both sources failing throws, so the gate marks the section UNCHECKED, never zero-coverage", async () => {
    const { impl } = stubHttp([[EPMC_PREFIX, new Error("timeout")], [CROSSREF_PREFIX, 500]]);
    await assert.rejects(createScholarlySearch({ httpImpl: impl }).search({ query: "semaglutide" }), /scholarly search unreachable: europepmc: timeout; crossref: HTTP 500/);
  });

  it("both sources answering with nothing is a genuine zero (an empty list, not a throw)", async () => {
    const { impl } = stubHttp([[EPMC_PREFIX, { resultList: { result: [] } }], [CROSSREF_PREFIX, { message: { items: [] } }]]);
    const out = await createScholarlySearch({ httpImpl: impl }).search({ query: "xyzzy" });
    assert.deepEqual(out.results, []);
  });
});

describe("the section gate on the scholarly search", () => {
  it("science goes to the scholarly search; any other topic to the SearXNG connector", async () => {
    const seen = [];
    const fn = createSearchFn({
      scholarly: () => ({ search: async (p) => { seen.push(["scholarly", p.topic, p.query]); return { results: [] }; } }),
      connector: () => async (p) => { seen.push(["connector", p.topic, p.query]); return { results: [] }; }
    });
    await fn("semaglutide", { topic: "science" });
    await fn("semaglutide", {});
    await fn("logistics costs", { topic: "general", primary_subject: "logistics" });
    assert.deepEqual(seen, [["scholarly", "science", "semaglutide"], ["scholarly", undefined, "semaglutide"], ["connector", "general", "logistics costs"]]);
  });

  it("the section gate hands the report's subject to the search; the SearXNG connector never sees it", async () => {
    const params = [];
    const connectorParams = [];
    const searchFn = createSearchFn({
      scholarly: () => ({ search: async (p) => { params.push(p); return { results: [] }; } }),
      connector: () => async (p) => { connectorParams.push(p); return { results: [] }; }
    });
    await runSectionGate({ subtasks: [{ subtask_id: "s1" }], primarySubject: "alcohol use disorder", searchFn, runGate: runCitationGate });
    assert.equal(params[0].primary_subject, "alcohol use disorder");
    await runSectionGate({ subtasks: [{ subtask_id: "s1" }], primarySubject: "logistics", searchFn, runGate: runCitationGate, topic: "general" });
    assert.ok(connectorParams.length > 0 && connectorParams.every((p) => !("primary_subject" in p)));
  });

  it("grades the rows: peer-reviewed records are A, preprints B, and the work found twice counts once", async () => {
    const { impl } = stubHttp([[EPMC_PREFIX, EPMC], [CROSSREF_PREFIX, CROSSREF]]);
    const scholarly = createScholarlySearch({ httpImpl: impl });
    const searchFn = createSearchFn({ scholarly: () => scholarly, connector: () => { throw new Error("SearXNG must not be called"); } });
    const out = await runCitationGate({ query: "semaglutide alcohol use disorder", step_type: "breadth", section_id: "s1", topic: "science", max_results: 8 }, { searchFn });
    assert.equal(out.gate_status, "pass");
    const byTitle = Object.fromEntries(out.results.map((r) => [r.title, r.grade]));
    assert.equal(byTitle["Semaglutide and alcohol intake: a randomized trial"], "A");
    assert.equal(byTitle["GLP-1 agonists and drinking (preprint)"], "B");
    assert.equal(byTitle["Incretins in alcohol use disorder"], "A");
    assert.equal(out.coverage_tier, "Comprehensive");
  });
});
