"use strict";

// 2026-11-15 (operator decision): the quality audit's section citation-coverage gate searches Europe PMC
// and Crossref directly for the "science" topic instead of SearXNG's science category. Offline: every
// HTTP response below is a stub shaped like the real APIs' JSON.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { createScholarlySearch, europePmcRows, crossrefRows, europePmcQuery, normalizeDoi } = require("../../openclaw-bridge/mcp/scholarly-search/scholarly-search.js");
const { createSearchFn } = require("../../openclaw-bridge/mcp/searxng-mcp/searchfn.js");
const { runCitationGate } = require("../../openclaw-bridge/mcp/searxng-mcp/index.js");
const { runSectionGate, assertCoverageOrThrow } = require("../../openclaw-bridge/mcp/searxng-mcp/section-gate.js");
const { buildIntegrityReport } = require("../../openclaw-bridge/monetization/integrity-rating.js");

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

// A route's response is a body (200), a status number, an Error (thrown), or an array of those, used
// one per call (the last one repeats), so a test can make a source answer differently on the retry.
function stubHttp(routes) {
  const calls = [];
  const seen = new Map();
  const impl = async (url) => {
    calls.push(url);
    for (const [prefix, spec] of routes) {
      if (url.startsWith(prefix)) {
        const n = seen.get(prefix) || 0;
        seen.set(prefix, n + 1);
        const response = Array.isArray(spec) ? spec[Math.min(n, spec.length - 1)] : spec;
        if (response instanceof Error) throw response;
        if (typeof response === "number") return { ok: false, status: response, headers: { get: () => null }, json: async () => ({}) };
        return { ok: true, status: 200, json: async () => response };
      }
    }
    throw new Error(`unexpected URL ${url}`);
  };
  return { impl, calls };
}

const EPMC_PREFIX = "https://www.ebi.ac.uk/europepmc/webservices/rest/search?";
const CROSSREF_PREFIX = "https://api.crossref.org/works?";
const EPMC_EMPTY = { hitCount: 0, resultList: { result: [] } };
const CROSSREF_EMPTY = { status: "ok", message: { "total-results": 0, items: [] } };

// No real waits in tests: Crossref pacing runs on a fake clock that a sleep advances.
function fakeClock() {
  let t = 0;
  const sleeps = [];
  return { nowMs: () => t, sleep: async (ms) => { sleeps.push(ms); t += ms; }, sleeps, advance: (ms) => { t += ms; } };
}
const instant = (impl, extra = {}) => {
  const clock = fakeClock();
  return createScholarlySearch({ httpImpl: impl, nowMs: clock.nowMs, sleep: clock.sleep, ...extra });
};

describe("scholarly search (Europe PMC + Crossref, free and keyless)", () => {
  it("turns Europe PMC hits into record-identity rows: PMID, DOI and PMCID, preprints tagged", () => {
    const rows = europePmcRows(EPMC);
    assert.equal(rows.length, 3);
    assert.deepEqual(rows[0].citations, [
      { type: "pmid", id: "38000001", source: "metadata" },
      { type: "doi", id: "10.1001/jama.2024.1234", source: "metadata" }
    ]);
    // A DOI links to doi.org, Crossref's URL for the same work, so the gate's clustering merges them.
    assert.equal(rows[0].url, "https://doi.org/10.1001/jama.2024.1234");
    assert.ok(rows[1].citations.every((c) => c.subtype === "preprint"), "a PPR record is a preprint");
    assert.equal(rows[2].url, "https://europepmc.org/article/PMC/PMC77");
    assert.deepEqual(rows[2].citations, [{ type: "pmcid", id: "PMC7700000", source: "metadata" }]);
    const pmidOnly = europePmcRows({ resultList: { result: [{ id: "1", source: "MED", pmid: "1", title: "PMID 1" }] } });
    assert.equal(pmidOnly[0].url, "https://pubmed.ncbi.nlm.nih.gov/1/", "no DOI: the PubMed record");
    // Type-based tagging: a PPR record whose DOI is on no preprint prefix list is still a preprint.
    const ppr = europePmcRows({ resultList: { result: [{ id: "PPR1", source: "PPR", doi: "10.64898/2026.01.01.1", title: "p" }] } });
    assert.equal(ppr[0].citations[0].subtype, "preprint");
  });

  it("builds a Europe PMC query anchored on the subject in title/abstract, over PubMed records and preprints", () => {
    assert.equal(
      europePmcQuery("alcohol use disorder Novo Nordisk Semaglutide GLP-1 STEER", "alcohol use disorder"),
      'TITLE_ABS:"alcohol use disorder" AND (TITLE_ABS:"novo" OR TITLE_ABS:"nordisk" OR TITLE_ABS:"semaglutide" OR TITLE_ABS:"glp-1" OR TITLE_ABS:"steer") AND (SRC:MED OR SRC:PPR)'
    );
    assert.equal(europePmcQuery("alcohol use disorder", "alcohol use disorder"), 'TITLE_ABS:"alcohol use disorder" AND (SRC:MED OR SRC:PPR)');
    assert.equal(europePmcQuery('semaglutide "AUD" (STEER)', ""), '(TITLE_ABS:"semaglutide" OR TITLE_ABS:"aud" OR TITLE_ABS:"steer") AND (SRC:MED OR SRC:PPR)', "quotes and brackets never reach the query");
  });

  it("the breadth retry's Europe PMC query is broader: key terms in any field, the subject still in title/abstract", () => {
    assert.equal(
      europePmcQuery("alcohol use disorder Novo Nordisk", "alcohol use disorder", { broad: true }),
      'TITLE_ABS:"alcohol use disorder" AND ("novo" OR "nordisk") AND (SRC:MED OR SRC:PPR)'
    );
    assert.equal(europePmcQuery("alcohol use disorder", "alcohol use disorder", { broad: true }), '"alcohol use disorder" AND (SRC:MED OR SRC:PPR)', "the subject alone, anywhere");
    assert.equal(europePmcQuery("semaglutide steer", "", { broad: true }), '("semaglutide" OR "steer") AND (SRC:MED OR SRC:PPR)');
    // Past 8 key terms, dropping the last word (reformulate.js) left pass 2 byte-identical before.
    const q = "alcohol use disorder one two three four five six seven eight nine";
    assert.notEqual(europePmcQuery(q, "alcohol use disorder", { broad: true }), europePmcQuery(q, "alcohol use disorder"));
  });

  it("turns Crossref items into DOI rows; only titled works of the kept types, preprints tagged by type or prefix", () => {
    const rows = crossrefRows(CROSSREF);
    assert.equal(rows.length, 3, "the untitled grant and the report are dropped");
    assert.ok(!rows.some((r) => /10\.46540|10\.64239/.test(r.url)));
    assert.equal(rows[1].url, "https://doi.org/10.1016/j.drugalcdep.2023.110000");
    assert.equal(rows[1].content, "Drug Alcohol Depend, 2023");
    assert.equal(rows[2].citations[0].subtype, "preprint");
    assert.equal(normalizeDoi("https://doi.org/10.1001/JAMA.2024.1234."), "10.1001/jama.2024.1234");
    const edge = crossrefRows({ message: { items: [
      { DOI: "10.1000/untitled", type: "journal-article" }, // a kept type with no title: dropped
      { DOI: "10.1000/blank", title: ["  "], type: "journal-article" }, // a blank title: dropped
      { DOI: "10.64898/2026.01.01.2", title: ["A preprint on an unlisted prefix"], type: "posted-content" }
    ] } });
    assert.equal(edge.length, 1);
    assert.equal(edge[0].citations[0].subtype, "preprint", "posted-content is a preprint whatever its prefix");
  });

  it("merges both sources, keeps one row per work, and caps the list", async () => {
    const { impl, calls } = stubHttp([[EPMC_PREFIX, EPMC], [CROSSREF_PREFIX, CROSSREF]]);
    const out = await instant(impl).search({ query: "alcohol use disorder semaglutide", max_results: 4, primary_subject: "alcohol use disorder" });
    assert.equal(calls.length, 2);
    assert.equal(new URL(calls[0]).searchParams.get("query"), 'TITLE_ABS:"alcohol use disorder" AND (TITLE_ABS:"semaglutide") AND (SRC:MED OR SRC:PPR)');
    assert.equal(new URL(calls[1]).searchParams.get("query.bibliographic"), "alcohol use disorder semaglutide");
    assert.equal(new URL(calls[1]).searchParams.get("rows"), "8", "twice the rows, for the work-type filter");
    assert.equal(out.results.length, 4);
    const dois = out.results.flatMap((r) => r.citations.filter((c) => c.type === "doi").map((c) => c.id));
    assert.equal(dois.filter((d) => d === "10.1001/jama.2024.1234").length, 1, "the same work from both sources is one row");
    assert.deepEqual(out.sources, { europepmc: "ok", crossref: "ok" });
    assert.equal(out.searched, "Europe PMC and Crossref");
  });

  it("one source failing while the other returns rows returns those rows, and names the failure", async () => {
    const { impl } = stubHttp([[EPMC_PREFIX, 503], [CROSSREF_PREFIX, CROSSREF]]);
    const out = await instant(impl).search({ query: "semaglutide" });
    assert.equal(out.results.length, 3);
    assert.equal(out.sources.europepmc, "HTTP 503");
  });

  it("both sources failing throws, so the gate marks the section UNCHECKED, never zero-coverage", async () => {
    const { impl } = stubHttp([[EPMC_PREFIX, new Error("socket hang up")], [CROSSREF_PREFIX, 500]]);
    const err = await instant(impl).search({ query: "semaglutide" }).then(() => null, (e) => e);
    assert.match(String(err && err.message), /scholarly search unreachable: europepmc: socket hang up; crossref: HTTP 500/);
    assert.equal(err.searched, "Europe PMC and Crossref", "an UNCHECKED section still records what it would have searched");
  });

  it("one source down while the other answers with no hits throws (UNCHECKED), in both directions", async () => {
    for (const [routes, re] of [
      [[[EPMC_PREFIX, EPMC_EMPTY], [CROSSREF_PREFIX, 503]], /scholarly search incomplete: crossref: HTTP 503; europepmc answered with no hits/],
      [[[EPMC_PREFIX, 429], [CROSSREF_PREFIX, CROSSREF_EMPTY]], /scholarly search incomplete: europepmc: HTTP 429; crossref answered with no hits/]
    ]) {
      const { impl } = stubHttp(routes);
      await assert.rejects(instant(impl).search({ query: "alcohol use disorder semaglutide", primary_subject: "alcohol use disorder" }), re);
    }
  });

  it("a 200 whose body lacks the result list is a failure of that source, never a zero", async () => {
    const { impl } = stubHttp([[EPMC_PREFIX, { hitCount: 0 }], [CROSSREF_PREFIX, CROSSREF_EMPTY]]);
    await assert.rejects(instant(impl).search({ query: "semaglutide" }), /europepmc: unexpected response: no resultList\.result; crossref answered with no hits/);
    const both = stubHttp([[EPMC_PREFIX, EPMC], [CROSSREF_PREFIX, { message: {} }]]);
    const out = await instant(both.impl).search({ query: "semaglutide" });
    assert.equal(out.sources.crossref, "unexpected response: no message.items");
    assert.equal(out.results.length, 3);
  });

  it("an empty query throws; a query with no Europe PMC term still searches Crossref", async () => {
    const { impl, calls } = stubHttp([[EPMC_PREFIX, EPMC], [CROSSREF_PREFIX, CROSSREF]]);
    await assert.rejects(instant(impl).search({ query: "  " }), /empty query/);
    assert.equal(calls.length, 0, "no request for an empty query");
    const out = await instant(impl).search({ query: "ok" });
    assert.equal(calls.length, 1, "Crossref only");
    assert.ok(calls[0].startsWith(CROSSREF_PREFIX));
    assert.match(out.sources.europepmc, /^skipped/);
    assert.equal(out.results.length, 3);
    const none = stubHttp([[CROSSREF_PREFIX, CROSSREF_EMPTY]]);
    await assert.rejects(instant(none.impl).search({ query: "ok" }), /europepmc: skipped .*; crossref answered with no hits/);
  });

  it("a request that hangs past timeoutMs is aborted and counts as that source failing", async () => {
    const hanging = (url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => reject(new Error("This operation was aborted")));
    });
    await assert.rejects(instant(hanging, { timeoutMs: 20 }).search({ query: "semaglutide" }), /europepmc: timed out after 20 ms; crossref: timed out after 20 ms/);
  });

  it("Crossref requests are paced one second apart, and a 429 is retried once", async () => {
    const clock = fakeClock();
    const { impl, calls } = stubHttp([[EPMC_PREFIX, EPMC], [CROSSREF_PREFIX, [CROSSREF, 429, CROSSREF]]]);
    const s = createScholarlySearch({ httpImpl: impl, nowMs: clock.nowMs, sleep: clock.sleep });
    await s.search({ query: "semaglutide" });
    assert.deepEqual(clock.sleeps, [], "the first request never waits");
    clock.advance(300);
    const out = await s.search({ query: "semaglutide" });
    // 700 ms to make one second since the last Crossref request, then the 429's window (1 s; no
    // Retry-After header) before the single retry, which answers.
    assert.deepEqual(clock.sleeps, [700, 1000]);
    assert.equal(calls.filter((u) => u.startsWith(CROSSREF_PREFIX)).length, 3);
    assert.equal(out.sources.crossref, "ok");
    const twice = stubHttp([[EPMC_PREFIX, EPMC], [CROSSREF_PREFIX, 429]]);
    const out2 = await instant(twice.impl).search({ query: "semaglutide" });
    assert.equal(out2.sources.crossref, "HTTP 429", "a second 429 is that source failing; no third try");
    assert.equal(twice.calls.filter((u) => u.startsWith(CROSSREF_PREFIX)).length, 2);
  });

  it("both sources answering with nothing is a genuine zero (an empty list, not a throw)", async () => {
    const { impl } = stubHttp([[EPMC_PREFIX, EPMC_EMPTY], [CROSSREF_PREFIX, CROSSREF_EMPTY]]);
    const out = await instant(impl).search({ query: "xyzzy" });
    assert.deepEqual(out.results, []);
    assert.deepEqual(out.sources, { europepmc: "ok", crossref: "ok" });
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

  it("the section gate hands the report's subject to the search, and the retry asks it to broaden; the SearXNG connector sees neither", async () => {
    const params = [];
    const connectorParams = [];
    const searchFn = createSearchFn({
      scholarly: () => ({ search: async (p) => { params.push(p); return { results: [] }; } }),
      connector: () => async (p) => { connectorParams.push(p); return { results: [] }; }
    });
    await runSectionGate({ subtasks: [{ subtask_id: "s1" }], primarySubject: "alcohol use disorder", searchFn, runGate: runCitationGate });
    assert.equal(params[0].primary_subject, "alcohol use disorder");
    assert.equal(params[0].breadth_retry, undefined, "pass 1 is the normal search");
    assert.equal(params[1].breadth_retry, true, "the breadth retry");
    await runSectionGate({ subtasks: [{ subtask_id: "s1" }], primarySubject: "logistics", searchFn, runGate: runCitationGate, topic: "general" });
    assert.ok(connectorParams.length > 0 && connectorParams.every((p) => !("primary_subject" in p) && !("breadth_retry" in p)));
  });

  it("grades the rows: peer-reviewed records are A, preprints B, and the work found twice counts once", async () => {
    const { impl } = stubHttp([[EPMC_PREFIX, EPMC], [CROSSREF_PREFIX, CROSSREF]]);
    const scholarly = instant(impl);
    const searchFn = createSearchFn({ scholarly: () => scholarly, connector: () => { throw new Error("SearXNG must not be called"); } });
    const out = await runCitationGate({ query: "semaglutide alcohol use disorder", step_type: "breadth", section_id: "s1", topic: "science", max_results: 8 }, { searchFn });
    assert.equal(out.gate_status, "pass");
    const byTitle = Object.fromEntries(out.results.map((r) => [r.title, r.grade]));
    assert.equal(byTitle["Semaglutide and alcohol intake: a randomized trial"], "A");
    assert.equal(byTitle["GLP-1 agonists and drinking (preprint)"], "B");
    assert.equal(byTitle["Incretins in alcohol use disorder"], "A");
    // 3 Europe PMC rows + 3 Crossref rows, one of them the same JAMA work: 5 distinct sources.
    assert.equal(out.distinct_source_count, 5);
    assert.ok(!out.results.some((r) => r.engine === "crossref" && r.url.includes("10.1001/jama.2024.1234")), "Crossref's copy of the JAMA work is merged away");
    assert.equal(out.coverage_tier, "Comprehensive");
    assert.deepEqual(out.source_errors, []);
    assert.equal(out.searched, "Europe PMC and Crossref");
  });

  it("a half outage: a section with rows from one source passes, recorded, logged and marked in the ledger; with none it is UNCHECKED", async () => {
    const one = { resultList: { result: [EPMC.resultList.result[0]] } };
    const warnings = [];
    const log = { warn: (e) => warnings.push(e) };
    const { impl } = stubHttp([[EPMC_PREFIX, one], [CROSSREF_PREFIX, 503]]);
    const scholarly = instant(impl);
    const searchFn = createSearchFn({ scholarly: () => scholarly, connector: () => { throw new Error("SearXNG must not be called"); } });
    const cov = await runSectionGate({ subtasks: [{ subtask_id: "m:subtask:1" }], primarySubject: "alcohol use disorder", searchFn, runGate: runCitationGate, log });
    const s = cov.section_coverage[0];
    assert.equal(s.checked, true);
    assert.equal(s.gate_status, "pass");
    assert.equal(s.coverage_tier, "Sparse");
    assert.deepEqual(s.source_errors, ["crossref: HTTP 503", "retry crossref: HTTP 503"]);
    assert.deepEqual(s.unanswered_sources, ["crossref"]);
    assert.equal(s.searched, "Europe PMC and Crossref");
    assert.equal(s.subject_anchored, true);
    assert.equal(cov.failing.length, 0);
    assert.ok(warnings.some((w) => w.event === "section_gate_partial_search"));
    const ledger = buildIntegrityReport({ cited: 2, grounded: 2, grounded_ratio: 1, retracted: [] }, cov.section_coverage).markdown;
    assert.match(ledger, /\| subtask 1 \| Sparse † \| 1 \|/);
    assert.match(ledger, /† Only one of the two sources \(Europe PMC, Crossref\) could be searched for this section/);
    assert.match(ledger, /a search of Europe PMC and Crossref on the report's subject and the section's key terms returned/);

    const empty = stubHttp([[EPMC_PREFIX, EPMC_EMPTY], [CROSSREF_PREFIX, 503]]);
    const scholarly2 = instant(empty.impl);
    const searchFn2 = createSearchFn({ scholarly: () => scholarly2, connector: () => { throw new Error("SearXNG must not be called"); } });
    const cov2 = await runSectionGate({ subtasks: [{ subtask_id: "s1" }], primarySubject: "alcohol use disorder", searchFn: searchFn2, runGate: runCitationGate });
    assert.equal(cov2.section_coverage[0].checked, false, "one source down and the other empty is not a genuine zero");
    assert.match(cov2.section_coverage[0].skip_reason, /scholarly search incomplete: crossref: HTTP 503; europepmc answered with no hits/);
    assert.equal(cov2.section_coverage[0].searched, "Europe PMC and Crossref");
    assert.equal(cov2.failing.length, 0);
    assert.doesNotThrow(() => assertCoverageOrThrow(cov2));
  });

  it("a work Europe PMC found on pass 1 and only Crossref found on the retry counts once", async () => {
    const one = { resultList: { result: [EPMC.resultList.result[0]] } };
    const jamaOnly = { message: { items: [CROSSREF.message.items[0]] } };
    const { impl } = stubHttp([[EPMC_PREFIX, [one, EPMC_EMPTY]], [CROSSREF_PREFIX, [503, jamaOnly]]]);
    const scholarly = instant(impl);
    const searchFn = createSearchFn({ scholarly: () => scholarly, connector: () => { throw new Error("SearXNG must not be called"); } });
    const out = await runCitationGate({ query: "alcohol use disorder semaglutide", step_type: "breadth", section_id: "s1", topic: "science", max_results: 8, search_params: { primary_subject: "alcohol use disorder" } }, { searchFn });
    assert.equal(out.retried, true);
    assert.equal(out.distinct_source_count, 1, "one work, not two");
    assert.deepEqual(out.source_errors, ["crossref: HTTP 503"]);
    assert.deepEqual(out.unanswered_sources, [], "Crossref answered on the retry");
  });

  it("an empty section query is UNCHECKED, never a genuine zero", async () => {
    const { impl, calls } = stubHttp([[EPMC_PREFIX, EPMC], [CROSSREF_PREFIX, CROSSREF]]);
    const scholarly = instant(impl);
    const searchFn = createSearchFn({ scholarly: () => scholarly, connector: () => { throw new Error("SearXNG must not be called"); } });
    const cov = await runSectionGate({ subtasks: [{ subtask_id: "s1" }], primarySubject: "", searchFn, runGate: runCitationGate });
    assert.equal(cov.section_coverage[0].checked, false);
    assert.match(cov.section_coverage[0].skip_reason, /empty query/);
    assert.equal(cov.failing.length, 0);
    assert.equal(calls.length, 0);
  });
});
