"use strict";

// Evidence Desk (2026-10-21): the business lane's official-statistics sources (BLS, Eurostat, and the
// dormant Census / EIA), their identifier grammar and re-resolvers, the reviewed series map, the
// extractive passage condenser, the prefetch `requires` / `local_only` rules, the deterministic
// evidence brief that writes the business scout section, and the citation gate's model-text-only
// ratio. Everything runs offline against injected fakes; the fake bodies reproduce the shapes the
// live APIs returned when probed on 2026-10-21.

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

process.env.OPENCLAW_INPUT_ROOTS = os.tmpdir();

const ROOT_DIR = path.resolve(__dirname, "../..");

const { createPoliteHttp } = require("../../openclaw-bridge/mcp/business-sources/polite-http.js");
const seriesMapModule = require("../../openclaw-bridge/mcp/business-sources/series-map.js");
const { createBls, SERIES_RE } = require("../../openclaw-bridge/mcp/business-sources/bls.js");
const { createEurostat, DATASET_RE } = require("../../openclaw-bridge/mcp/business-sources/eurostat.js");
const { createCensus } = require("../../openclaw-bridge/mcp/business-sources/census.js");
const { createEia } = require("../../openclaw-bridge/mcp/business-sources/eia.js");
const { condensePage, splitPassages, numericSignal } = require("../../openclaw-bridge/mcp/business-sources/passage-condenser.js");
const { createEvidenceDesk } = require("../../openclaw-bridge/mcp/business-sources/evidence-desk.js");
const { createWebEvidence } = require("../../openclaw-bridge/mcp/business-sources/web-evidence.js");
const { createWebSnapshotStore } = require("../../openclaw-bridge/mcp/business-sources/web-snapshot-store.js");
const { toSearchTerms } = require("../../openclaw-bridge/mcp/business-sources/search-terms.js");
const { extractCitations, deduplicateCitations } = require("../../openclaw-bridge/core/citation-extractor.js");
const { createCitationReresolver } = require("../../openclaw-bridge/mcp/citation-reresolver/citation-reresolver.js");
const { createToolPrefetch } = require("../../openclaw-bridge/core/tool-prefetch.js");
const { getResearchProfile, deriveBusinessInputs } = require("../../openclaw-bridge/core/research-profiles.js");
const { verifyReportCitations, isDeskAuthoredSubtask } = require("../../openclaw-bridge/core/citation-gate.js");

const logger = { info() {}, warn() {}, error() {} };
const UA = "Trevor Robey Intelligence Network Citations LLC trevor@trevorobeyinc.com";
const MAP = seriesMapModule.loadSeriesMap(ROOT_DIR);

// A fetch fake for polite-http-based sources: records every call, answers from `respond(url, init)`.
function fakeFetch(respond) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    const r = await respond(url, init);
    return {
      status: r.status,
      ok: r.status >= 200 && r.status < 300,
      headers: { get: (h) => (h.toLowerCase() === "content-type" ? r.contentType || "application/json" : null) },
      text: async () => (typeof r.body === "string" ? r.body : JSON.stringify(r.body))
    };
  };
  return { impl, calls };
}

// The reresolver's fetch fake: json() and text() both available.
function resolverFetch(respond) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    const r = await respond(url, init);
    return {
      status: r.status,
      json: async () => (typeof r.body === "string" ? JSON.parse(r.body) : r.body),
      text: async () => (typeof r.body === "string" ? r.body : JSON.stringify(r.body))
    };
  };
  return { impl, calls };
}

const BLS_OK = {
  status: "REQUEST_SUCCEEDED",
  message: ["Series does not exist for Series CES4349399999"],
  Results: {
    series: [
      {
        seriesID: "CES4349300003",
        data: [
          { year: "2026", period: "M08", periodName: "August", latest: "true", value: "26.83", footnotes: [{ code: "P", text: "preliminary" }] },
          { year: "2026", period: "M07", periodName: "July", value: "26.79", footnotes: [{}] }
        ]
      },
      { seriesID: "CES4349399999", data: [] }
    ]
  }
};

function jsonStat(value, { label = "Labour cost levels by NACE Rev. 2 activity", status } = {}) {
  return {
    version: "2.0",
    class: "dataset",
    label,
    updated: "2026-04-23T23:00:00+0200",
    value: { 0: value },
    ...(status ? { status: { 0: status } } : {}),
    id: ["freq", "unit", "lcstruct", "nace_r2", "geo", "time"],
    size: [1, 1, 1, 1, 1, 1],
    dimension: {
      freq: { category: { label: { A: "Annual" } } },
      unit: { category: { label: { EUR: "Euro" } } },
      lcstruct: { category: { label: { D1_D4_MD5: "Labour cost for LCI (compensation of employees plus taxes minus subsidies)" } } },
      nace_r2: { category: { label: { H: "Transportation and storage" } } },
      geo: { category: { label: { DE: "Germany" } } },
      time: { category: { label: { 2025: "2025" } } }
    }
  };
}

describe("series map (config/business-series-map.json)", () => {
  it("is reviewed: every id has the shape its fetcher accepts and every industry series is described", () => {
    assert.equal(MAP.schema_version, "business-series-map-v1");
    assert.ok(MAP.reviewed && MAP.reviewed.date, "review record present");
    const described = MAP.bls.series;
    for (const id of MAP.bls.default_series) assert.ok(described[id], `${id} described`);
    const keys = new Set();
    for (const entry of MAP.industries) {
      assert.ok(!keys.has(entry.key), `duplicate industry ${entry.key}`);
      keys.add(entry.key);
      assert.ok(entry.match.length > 0 && entry.bls.length > 0, entry.key);
      for (const id of entry.bls) {
        assert.match(id, SERIES_RE, id);
        assert.ok(described[id] && described[id].title && described[id].unit, `${id} has a title and unit`);
      }
    }
    for (const id of Object.keys(MAP.eurostat.datasets)) assert.match(id, DATASET_RE, id);
    for (const id of MAP.eia.default_series) assert.equal(MAP.eia.series[id].verified, false, `${id} must stay marked unverified until probed with a key`);
  });

  it("matches the industry input first, then the topic, and never guesses", () => {
    assert.equal(seriesMapModule.resolveIndustry(MAP, { industry: "warehousing and logistics" }).key, "warehousing");
    assert.equal(seriesMapModule.resolveIndustry(MAP, { topic: "Where can a mid-size US 3PL warehouse cut labour and energy cost?" }).key, "warehousing");
    assert.equal(seriesMapModule.resolveIndustry(MAP, { industry: "hospital systems", topic: "a 3PL question" }).key, "healthcare");
    assert.equal(seriesMapModule.resolveIndustry(MAP, { industry: "astrology", topic: "tarot pricing" }), null);
    // Word-start only: "hardware" contains "ware" mid-word and must match nothing.
    assert.equal(seriesMapModule.resolveIndustry(MAP, { industry: "hardware" }), null);
  });

  it("unmatched runs still get the defaults; the labour-cost filter falls back to the whole economy", () => {
    assert.deepEqual(seriesMapModule.blsSeriesFor(MAP, { industry: "astrology" }), MAP.bls.default_series);
    const warehouse = seriesMapModule.blsSeriesFor(MAP, { industry: "3PL warehousing" });
    assert.equal(warehouse[0], "CES4349300001");
    assert.ok(warehouse.includes("CUUR0000SA0"));
    const labour = seriesMapModule.eurostatQueriesFor(MAP, { industry: "astrology" }).find((q) => q.dataset === "lc_lci_lev");
    assert.equal(labour.filter.nace_r2, "B-S");
    assert.equal(seriesMapModule.censusNaicsFor(MAP, { industry: "astrology" }), "");
  });
});

describe("derived business inputs", () => {
  it("scopes the U.S. agencies and Eurostat by country", () => {
    assert.deepEqual(deriveBusinessInputs({ country: "US" }), { us_scope: "US", eurostat_geo: "" });
    assert.deepEqual(deriveBusinessInputs({ country: "usa" }), { us_scope: "US", eurostat_geo: "" });
    assert.deepEqual(deriveBusinessInputs({ country: "DE" }), { us_scope: "", eurostat_geo: "DE" });
    assert.deepEqual(deriveBusinessInputs({ country: "GRC" }), { us_scope: "", eurostat_geo: "EL" });
    assert.deepEqual(deriveBusinessInputs({ country: "EU" }), { us_scope: "", eurostat_geo: "EU27_2020" });
    assert.deepEqual(deriveBusinessInputs({ country: "JP" }), { us_scope: "", eurostat_geo: "" });
    assert.deepEqual(deriveBusinessInputs({}), { us_scope: "", eurostat_geo: "" });
  });

  it("the business profile carries the desk role, the science section gate and the new identifiers; biomedical is unchanged", () => {
    const business = getResearchProfile("business");
    assert.deepEqual([...business.deskAuthoredRoles], ["scout"]);
    assert.equal(business.sectionGate.topic, "science");
    assert.equal(business.identifierList, "WEB/SEC/WB/BLS/EUROSTAT/CENSUS/EIA/DOI");
    assert.match(business.citationInstruction, /BLS: CES4349300003/);
    const bio = getResearchProfile("biomedical");
    assert.deepEqual([...bio.deskAuthoredRoles], []);
    assert.equal(bio.sectionGate, null);
    assert.equal(bio.deriveInputs, null);
  });
});

describe("polite HTTP", () => {
  it("declares the requester on every request and tells JSON from an HTML page", async () => {
    const f = fakeFetch(() => ({ status: 200, body: "<html><title>Missing Key</title></html>", contentType: "text/html" }));
    const client = createPoliteHttp({ fetchImpl: f.impl });
    const res = await client.send("https://example.gov/x", { method: "POST", body: { a: 1 } });
    assert.equal(f.calls[0].init.headers["User-Agent"], UA);
    assert.equal(f.calls[0].init.body, JSON.stringify({ a: 1 }));
    assert.equal(res.status, 200);
    assert.equal(client.parseJson(res), undefined, "an HTML 200 is not data");
  });
});

describe("BLS fetcher", () => {
  it("one batched keyless v1 POST; values verbatim with period and footnote; a series without data is dropped", async () => {
    const f = fakeFetch(() => ({ status: 200, body: BLS_OK }));
    const bls = createBls({ logger, fetchImpl: f.impl, seriesMap: MAP });
    const recs = await bls.latestSeries({ series: "CES4349300003,CES4349399999" });
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].url, "https://api.bls.gov/publicAPI/v1/timeseries/data/");
    assert.equal(f.calls[0].init.method, "POST");
    assert.deepEqual(JSON.parse(f.calls[0].init.body), { seriesid: ["CES4349300003", "CES4349399999"] });
    assert.equal(f.calls[0].init.headers["User-Agent"], UA);
    assert.equal(recs.length, 1);
    assert.match(recs[0].text, /^BLS: CES4349300003\n/);
    assert.match(recs[0].text, /Value: 26\.83 \(August 2026 \(preliminary\); U\.S\. Bureau of Labor Statistics\)/);
    assert.equal(recs[0].stat.cite, "BLS: CES4349300003");
    assert.equal(recs[0].url, "https://data.bls.gov/timeseries/CES4349300003");
    await bls.latestSeries({ series: "CES4349300003,CES4349399999" });
    assert.equal(f.calls.length, 1, "session cache");
  });

  it("uses the map by industry, and v2 with the key in the body (never the URL) when keyed", async () => {
    const f = fakeFetch(() => ({ status: 200, body: { status: "REQUEST_SUCCEEDED", message: [], Results: { series: [] } } }));
    const bls = createBls({ logger, fetchImpl: f.impl, seriesMap: MAP, apiKey: "k-secret" });
    await bls.latestSeries({ industry: "warehousing" });
    assert.equal(f.calls[0].url, "https://api.bls.gov/publicAPI/v2/timeseries/data/");
    const body = JSON.parse(f.calls[0].init.body);
    assert.equal(body.registrationkey, "k-secret");
    assert.equal(body.seriesid[0], "CES4349300001");
    assert.ok(!f.calls[0].url.includes("k-secret"));
  });

  it("a refusal or HTTP error THROWS (recorded as failed, never as an honest zero)", async () => {
    const refused = fakeFetch(() => ({ status: 200, body: { status: "REQUEST_NOT_PROCESSED", message: ["daily threshold reached"] } }));
    await assert.rejects(createBls({ logger, fetchImpl: refused.impl, seriesMap: MAP }).latestSeries({}), /REQUEST_NOT_PROCESSED/);
    const down = fakeFetch(() => ({ status: 503, body: "" }));
    await assert.rejects(createBls({ logger, fetchImpl: down.impl, seriesMap: MAP }).latestSeries({}), /HTTP 503/);
  });
});

describe("Eurostat fetcher", () => {
  it("queries only a European geography, with the map's filter, and reads exactly one value", async () => {
    const f = fakeFetch(() => ({ status: 200, body: jsonStat(35.8, { status: "p" }) }));
    const eurostat = createEurostat({ logger, fetchImpl: f.impl, seriesMap: MAP });
    assert.deepEqual(await eurostat.latestValues({ geo: "", industry: "warehousing" }), []);
    assert.equal(f.calls.length, 0, "no request for a non-European run");
    const recs = await eurostat.latestValues({ geo: "DE", industry: "warehousing" });
    assert.equal(f.calls.length, 3, "two energy datasets + labour cost");
    const labourCall = f.calls.find((c) => c.url.includes("/lc_lci_lev?"));
    assert.match(labourCall.url, /geo=DE/);
    assert.match(labourCall.url, /nace_r2=H/);
    assert.match(labourCall.url, /lcstruct=D1_D4_MD5/);
    assert.match(labourCall.url, /lastTimePeriod=1/);
    assert.equal(labourCall.init.headers["User-Agent"], UA);
    const labour = recs.find((r) => r.text.startsWith("EUROSTAT: lc_lci_lev"));
    assert.match(labour.text, /Value: 35\.8 \(EUR per hour; .*Germany, 2025; flag p \(provisional\); Eurostat/);
    assert.match(labour.text, /nace_r2=Transportation and storage/);
  });

  it("skips a filter that yields several values, and throws only when every query failed", async () => {
    const several = fakeFetch(() => ({ status: 200, body: { ...jsonStat(1), value: { 0: 1, 1: 2 } } }));
    assert.deepEqual(await createEurostat({ logger, fetchImpl: several.impl, seriesMap: MAP }).latestValues({ geo: "FR" }), []);
    const refused = fakeFetch(() => ({ status: 400, body: { error: [{ status: 400, label: "INVALID_QUERY_DIMENSION" }] } }));
    await assert.rejects(createEurostat({ logger, fetchImpl: refused.impl, seriesMap: MAP }).latestValues({ geo: "FR" }), /all 3 queries failed/);
  });
});

describe("Census and EIA fetchers (P2, dormant until keyed)", () => {
  it("refuse to run without a key", async () => {
    await assert.rejects(createCensus({ logger, seriesMap: MAP }).businessPatterns({ industry: "warehousing" }), /CENSUS_API_KEY/);
    await assert.rejects(createEia({ logger, seriesMap: MAP }).latestPrices({}), /EIA_API_KEY/);
  });

  it("Census: reads a CBP row; the key never reaches a record; an HTML 200 is a failure, not data", async () => {
    const f = fakeFetch(() => ({
      status: 200,
      body: [["NAICS2017_LABEL", "ESTAB", "EMP", "PAYANN", "NAICS2017", "us"], ["Warehousing and storage", "21000", "1500000", "80000000", "493", "1"]]
    }));
    const census = createCensus({ logger, fetchImpl: f.impl, seriesMap: MAP, apiKey: "c-secret" });
    const recs = await census.businessPatterns({ industry: "warehousing" });
    assert.match(f.calls[0].url, /\/data\/2023\/cbp\?/);
    assert.match(f.calls[0].url, /NAICS2017=493/);
    assert.equal(recs.length, 1);
    assert.match(recs[0].text, /^CENSUS: cbp\/2023\/493\n/);
    assert.match(recs[0].text, /Annual payroll \(\$1,000\): 80000000/);
    assert.ok(!JSON.stringify(recs).includes("c-secret"), "key absent from records");
    assert.equal(recs[0].stat.length, 3);
    const html = fakeFetch(() => ({ status: 200, body: "<html>Missing Key</html>", contentType: "text/html" }));
    await assert.rejects(createCensus({ logger, fetchImpl: html.impl, seriesMap: MAP, apiKey: "c" }).businessPatterns({ industry: "warehousing" }), /without a JSON body/);
    const none = fakeFetch(() => ({ status: 200, body: [] }));
    assert.deepEqual(await createCensus({ logger, fetchImpl: none.impl, seriesMap: MAP, apiKey: "c" }).businessPatterns({ industry: "astrology" }), []);
    assert.equal(none.calls.length, 0, "no NAICS match → no request at all");
  });

  it("EIA: takes the latest row with a recognised value field and skips an unrecognised shape", async () => {
    const f = fakeFetch((url) => ({
      status: 200,
      body: url.includes("ELEC.PRICE.US-IND.M")
        ? { response: { data: [{ period: "2026-06", price: 8.1, "price-units": "cents per kilowatt-hour" }, { period: "2026-07", price: 8.4, "price-units": "cents per kilowatt-hour" }] } }
        : { response: { data: [{ period: "2026-07", mystery: 1 }] } }
    }));
    const recs = await createEia({ logger, fetchImpl: f.impl, seriesMap: MAP, apiKey: "e-secret" }).latestPrices({});
    assert.equal(recs.length, 1);
    assert.match(recs[0].text, /^EIA: ELEC\.PRICE\.US-IND\.M\n/);
    assert.match(recs[0].text, /Value: 8\.4 cents per kilowatt-hour \(2026-07;/);
    assert.ok(!JSON.stringify(recs).includes("e-secret"));
  });
});

describe("official-statistics identifier grammar", () => {
  it("captures BLS / EUROSTAT / CENSUS / EIA ids with their colon form", () => {
    const text = "Wages (BLS: CES4349300003), CPI (BLS: CUUR0000SA0). Power (EUROSTAT: nrg_pc_205; EUROSTAT: LC_LCI_LEV). "
      + "Payroll (CENSUS: cbp/2023/493, CENSUS: cbp/2023/31-33). Price (EIA: ELEC.PRICE.US-IND.M.) and EIA: NG.N3035US3.M)";
    const got = extractCitations(text).filter((c) => ["BLS", "EUROSTAT", "CENSUS", "EIA"].includes(c.type)).map((c) => `${c.type}:${c.id}`);
    assert.deepEqual(got, [
      "BLS:CES4349300003", "BLS:CUUR0000SA0",
      "EUROSTAT:nrg_pc_205", "EUROSTAT:lc_lci_lev",
      "CENSUS:cbp/2023/493", "CENSUS:cbp/2023/31-33",
      "EIA:ELEC.PRICE.US-IND.M", "EIA:NG.N3035US3.M"
    ]);
  });

  it("does not capture biomedical or everyday prose", () => {
    const prose = [
      "Staff completed BLS training. BLS CES4349300003 without a colon is prose.",
      "The EIA was positive; EIA: ELISA confirmed. An EIA test kit.",
      "The census found 493 sites; Census: cbp/2023/493 is not the uppercase label.",
      "Eurostat reported growth; EUROSTAT: Germany is not a dataset code.",
      "BLS: CONSUMERPRICES has no digit."
    ].join(" ");
    const got = extractCitations(prose).filter((c) => ["BLS", "EUROSTAT", "CENSUS", "EIA"].includes(c.type));
    assert.deepEqual(got, []);
  });
});

describe("official-statistics re-resolvers", () => {
  function reresolver(respond, extra = {}) {
    const f = resolverFetch(respond);
    return { r: createCitationReresolver({ logger, fetchImpl: f.impl, nowIso: () => "2026-10-21T00:00:00.000Z", ...extra }), calls: f.calls };
  }

  it("BLS: VERIFIED with data, UNRESOLVED on 'does not exist', UNCHECKED on a refusal; the key is masked", async () => {
    const ok = reresolver(() => ({ status: 200, body: { status: "REQUEST_SUCCEEDED", message: [], Results: { series: [{ seriesID: "CES4349300003", data: [{ value: "1" }] }] } } }));
    assert.equal((await ok.r.resolveOne({ type: "BLS", id: "CES4349300003" })).status, "VERIFIED");
    assert.equal(ok.calls[0].url, "https://api.bls.gov/publicAPI/v1/timeseries/data/CES4349300003");
    assert.equal(ok.calls[0].init.headers["User-Agent"], UA);
    const missing = reresolver(() => ({ status: 200, body: { status: "REQUEST_SUCCEEDED", message: ["Series does not exist for Series CES9999999999"], Results: { series: [{ seriesID: "CES9999999999", data: [] }] } } }));
    const m = await missing.r.resolveOne({ type: "BLS", id: "CES9999999999" });
    assert.equal(m.status, "UNRESOLVED");
    assert.equal(m.evidence.reason, "bls_series_not_found");
    const refused = reresolver(() => ({ status: 200, body: { status: "REQUEST_NOT_PROCESSED", message: ["daily threshold for total number of requests allocated is exceeded"] } }));
    const x = await refused.r.resolveOne({ type: "BLS", id: "CES4349300003" });
    assert.equal(x.status, "UNCHECKED");
    assert.equal(x.evidence.reason, "rate_limited");
    const keyed = reresolver(() => ({ status: 200, body: { status: "REQUEST_SUCCEEDED", message: [], Results: { series: [{ seriesID: "CES4349300003", data: [{}] }] } } }), { blsApiKey: "b-secret" });
    const k = await keyed.r.resolveOne({ type: "BLS", id: "CES4349300003" });
    assert.match(keyed.calls[0].url, /\/v2\/timeseries\/data\/CES4349300003\?registrationkey=b-secret/);
    assert.ok(!k.resolved_url.includes("b-secret"));
    assert.match(k.resolved_url, /registrationkey=\*\*\*/);
  });

  it("EUROSTAT: VERIFIED on the dataflow id, UNRESOLVED on 404", async () => {
    const ok = reresolver(() => ({ status: 200, body: '<m:Structure><s:Dataflows><s:Dataflow id="NRG_PC_205" agencyID="ESTAT">' }));
    const v = await ok.r.resolveOne({ type: "EUROSTAT", id: "nrg_pc_205" });
    assert.equal(v.status, "VERIFIED");
    assert.equal(ok.calls[0].url, "https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1/dataflow/ESTAT/nrg_pc_205");
    assert.equal(ok.calls[0].init.headers.Accept, "application/xml");
    const gone = reresolver(() => ({ status: 404, body: "<S:Fault><faultstring>ERR_NOT_FOUND_4: XX_NOTREAL_1</faultstring></S:Fault>" }));
    assert.equal((await gone.r.resolveOne({ type: "EUROSTAT", id: "xx_notreal_1" })).status, "UNRESOLVED");
  });

  it("CENSUS: UNCHECKED without a key; VERIFIED only on a JSON row echoing the NAICS; an HTML 200 is UNCHECKED", async () => {
    const nokey = reresolver(() => { throw new Error("must not be called"); });
    const n = await nokey.r.resolveOne({ type: "CENSUS", id: "cbp/2023/493" });
    assert.equal(n.status, "UNCHECKED");
    assert.equal(n.evidence.reason, "no_api_key");
    const ok = reresolver(() => ({ status: 200, body: [["NAICS2017_LABEL", "NAICS2017", "us"], ["Warehousing and storage", "493", "1"]] }), { censusApiKey: "c-secret" });
    const v = await ok.r.resolveOne({ type: "CENSUS", id: "cbp/2023/493" });
    assert.equal(v.status, "VERIFIED");
    assert.ok(!v.resolved_url.includes("c-secret"));
    const html = { status: 200, json: async () => { throw new Error("not json"); }, text: async () => "<html>Missing Key</html>" };
    const htmlR = createCitationReresolver({ logger, fetchImpl: async () => html, censusApiKey: "c", nowIso: () => "x" });
    assert.equal((await htmlR.resolveOne({ type: "CENSUS", id: "cbp/2023/493" })).status, "UNCHECKED");
    const d = { status: 204, json: async () => { throw new Error("empty"); }, text: async () => "" };
    const noDataR = createCitationReresolver({ logger, fetchImpl: async () => d, censusApiKey: "c", nowIso: () => "x" });
    assert.equal((await noDataR.resolveOne({ type: "CENSUS", id: "cbp/2031/493" })).status, "UNRESOLVED");
  });

  it("EIA: UNCHECKED without a key; VERIFIED with rows; UNRESOLVED on 404; empty is UNCHECKED, not a guess", async () => {
    assert.equal((await reresolver(() => ({ status: 200, body: {} })).r.resolveOne({ type: "EIA", id: "ELEC.PRICE.US-IND.M" })).evidence.reason, "no_api_key");
    const ok = reresolver(() => ({ status: 200, body: { response: { data: [{ period: "2026-07", price: 8.4 }] } } }), { eiaApiKey: "e-secret" });
    const v = await ok.r.resolveOne({ type: "EIA", id: "ELEC.PRICE.US-IND.M" });
    assert.equal(v.status, "VERIFIED");
    assert.match(v.resolved_url, /api_key=\*\*\*/);
    assert.equal((await reresolver(() => ({ status: 404, body: {} }), { eiaApiKey: "e" }).r.resolveOne({ type: "EIA", id: "XX.NOPE.M" })).status, "UNRESOLVED");
    assert.equal((await reresolver(() => ({ status: 200, body: { response: { data: [] } } }), { eiaApiKey: "e" }).r.resolveOne({ type: "EIA", id: "XX.NOPE.M" })).status, "UNCHECKED");
  });
});

describe("passage condenser", () => {
  const NAV = "Home | About | Services | Contact | Log in | Careers | Newsroom | Subscribe to our newsletter today";
  const PAGE = [
    NAV,
    "",
    "Our company was founded to help shippers everywhere and we love our customers very much indeed.",
    "",
    "In 2025, warehouse labor accounted for 55% of a 3PL's operating cost, at an average of $26.83 per hour, according to the survey.",
    "",
    "Energy retrofits such as LED lighting cut warehouse energy use by 30 percent in the sites studied.",
    "",
    "Cookie policy: we use cookies to improve your experience. © 2026 Example Logistics. All rights reserved."
  ].join("\n");
  const TERMS = toSearchTerms("Where can a mid-size US 3PL warehouse cut labour and energy cost?");

  it("every passage is an exact slice of the page, so its offsets locate it in the snapshot", () => {
    for (const p of splitPassages(PAGE)) {
      assert.ok(p.end > p.start);
      assert.equal(PAGE.slice(p.start, p.end).trim(), PAGE.slice(p.start, p.end), "trimmed exactly");
    }
    const { passages } = condensePage(PAGE, TERMS, { topK: 2 });
    for (const p of passages) assert.equal(PAGE.slice(p.start, p.end), p.text);
  });

  it("ranks the on-topic, figure-bearing passages over navigation and boilerplate, in document order", () => {
    const { passages, total } = condensePage(PAGE, TERMS, { topK: 2 });
    assert.equal(total, 5);
    assert.deepEqual(passages.map((p) => p.n), [3, 4]);
    assert.match(passages[0].text, /55%/);
    assert.match(passages[1].text, /LED/);
  });

  it("is deterministic, splits over-long lines within the limit, and boosts only figures", () => {
    assert.deepEqual(condensePage(PAGE, TERMS), condensePage(PAGE, TERMS));
    const longLine = "Warehouse labour costs rose again this year. ".repeat(40);
    for (const p of splitPassages(longLine, { maxChars: 300 })) assert.ok(p.end - p.start <= 300);
    assert.equal(numericSignal("no figures here"), 0);
    assert.ok(numericSignal("$5 and 10% of 2025") > numericSignal("2025"));
  });

  it("a short term matches a whole token, not a prefix ('per' never matches 'percent')", () => {
    const text = ["Per unit handling cost fell sharply across every site this year.", "", "Results were reported as a percent of revenue for the period overall."].join("\n");
    const { passages } = condensePage(text, ["per"], { topK: 1 });
    assert.equal(passages[0].n, 1);
  });
});

describe("web evidence with the condenser", () => {
  it("shows ranked verbatim passages with offsets into the stored snapshot; the WEB id is unchanged", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "desk-snap-"));
    const store = createWebSnapshotStore({ dir, nowIso: () => "2026-10-21T00:00:00.000Z" });
    const page = [
      "Menu Home Shop Account",
      "",
      "Mid-size 3PL warehouse operators cut labour cost per order by 18% with slotting changes, and energy cost by 12% with LED retrofits.",
      "",
      "Unrelated footer text about our newsletter and social media accounts for this warehouse blog."
    ].join("\n");
    const web = createWebEvidence({
      logger,
      snapshotStore: store,
      searchFn: async () => ({ results: [{ url: "https://good.example.com/3pl", title: "3PL costs" }] }),
      extractOne: async () => ({ raw_content: page, title: "3PL costs" })
    });
    const [rec] = await web.searchAndRead({ query: "Where can a mid-size US 3PL warehouse cut labour and energy cost?" });
    assert.match(rec.text, /^WEB: [0-9a-f]{12}\n/);
    assert.match(rec.text, /¶\d+ \[chars \d+–\d+\]/);
    const snap = store.get(rec.webSnapshotId);
    assert.equal(snap.text, page, "full page stored");
    for (const p of rec.passages) assert.equal(snap.text.slice(p.start, p.end), p.text);
    assert.ok(rec.passages.some((p) => /18%/.test(p.text)));
  });
});

describe("prefetch: requires, local_only and attached records", () => {
  it("skips an entry whose required input is empty or whose local fetcher is not wired, and records it as skipped", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "desk-map-"));
    fs.mkdirSync(path.join(tmp, "config"));
    fs.writeFileSync(path.join(tmp, "config", "tool-prefetch-map.business.json"), JSON.stringify({
      role_mappings: {
        scout: [
          { action: "executeTool", tool_name: "bls_series", local_only: true, requires: ["us_scope"], arguments: { industry: "{{industry}}" } },
          { action: "executeTool", tool_name: "census_business_patterns", local_only: true, arguments: { industry: "{{industry}}" } }
        ]
      }
    }));
    const called = [];
    const mcp = { execute: async (input) => { called.push(`tu:${input.tool_name}`); return { status: "success", data: [] }; } };
    const prefetch = createToolPrefetch({
      toolUniverseMcp: mcp,
      logger,
      rootDir: tmp,
      localFetchers: { bls_series: async () => { called.push("bls"); return [{ title: "t", text: "BLS: CES4349300003\nValue: 1" }]; } }
    });
    const nonUs = await prefetch.prefetchForRole("scout", { research_profile: "business", industry: "warehousing", us_scope: "" });
    assert.deepEqual(called, [], "nothing called: BLS needs us_scope, Census is not wired, and nothing goes to ToolUniverse");
    assert.deepEqual(nonUs.coverage.map((c) => c.status), ["skipped", "skipped"]);
    const us = await prefetch.prefetchForRole("scout", { research_profile: "business", industry: "warehousing", us_scope: "US" });
    assert.deepEqual(called, ["bls"]);
    assert.equal(us[0].records.length, 1, "structured records attached");
    assert.equal(us[0].tool_name, "bls_series");
    assert.ok(!("records" in JSON.parse(JSON.stringify(us[0]))), "records never serialize");
    assert.ok(!Object.keys(us[0]).includes("records"), "records never spread");
  });

  it("the shipped business map: statistics on the scout, gated; the vault read-back moved to the analyst, context only", () => {
    const map = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "config", "tool-prefetch-map.business.json"), "utf8")).role_mappings;
    const scoutTools = map.scout.map((e) => e.tool_name);
    for (const t of ["bls_series", "eurostat_series", "census_business_patterns", "eia_energy_prices"]) {
      const e = map.scout.find((x) => x.tool_name === t);
      assert.ok(e && e.local_only === true && Array.isArray(e.requires) && e.requires.length === 1, t);
    }
    assert.ok(!scoutTools.includes("obsidian_prior_research"), "a deterministic brief never carries vault text");
    const vault = map.analyst.find((e) => e.tool_name === "obsidian_prior_research");
    assert.equal(vault.context_only, true);
  });
});

function docWith(toolName, records, { contextOnly = false } = {}) {
  const doc = { path: `tooluniverse://${toolName}`, rel: `live-data/${toolName}`, content: records.map((r) => `${r.text || ""}\n${r.doi ? `doi: ${r.doi}` : ""}`).join("\n\n") };
  if (contextOnly) doc.context_only = true;
  Object.defineProperty(doc, "records", { value: records, enumerable: false });
  Object.defineProperty(doc, "tool_name", { value: toolName, enumerable: false });
  return doc;
}

const DESK_DOCS = [
  docWith("bls_series", [{
    title: "Average hourly earnings",
    text: "BLS: CES4349300003\nValue: 26.83",
    stat: { source: "BLS", cite: "BLS: CES4349300003", series: "Average hourly earnings of all employees, warehousing and storage", value: "26.83", unit: "dollars, seasonally adjusted", period: "August 2026 (preliminary)", geo: "United States" }
  }]),
  docWith("web_evidence", [{
    title: "3PL costs | benchmark",
    url: "https://good.example.com/3pl",
    text: "WEB: 0123456789ab\n¶2 ...",
    webSnapshotId: "0123456789ab",
    passageTotal: 6,
    passages: [{ n: 2, start: 10, end: 90, text: "Labour is 55% of 3PL operating cost.\nEnergy is 8%." }]
  }]),
  docWith("openalex_works", [{ title: "Warehouse energy", year: "2024", journal: "J. Ops", doi: "10.1000/xyz123", abstract: "A study of warehouses. ".repeat(40) }]),
  docWith("sec_filings_citable", [{ title: "ACME 10-K", year: "2025", text: "SEC: 320193/0000320193-24-000123\nAnnual report describing labour costs." }]),
  docWith("obsidian_prior_research", [{ title: "Old note", text: "WEB: ffffffffffff prior run" }], { contextOnly: true })
];

describe("Evidence Desk brief", () => {
  const desk = createEvidenceDesk({ logger });
  const coverage = [
    { source: "bls_series", status: "returned", records: 1 },
    { source: "eurostat_series", status: "skipped", records: 0 },
    { source: "web_evidence", status: "returned", records: 1 },
    { source: "worldbank_indicators", status: "failed", records: 0 },
    { source: "openalex_works", status: "empty", records: 0 }
  ];

  it("lays out statistics, passages, research and filings, citing only what this role fetched", () => {
    const { text, version } = desk.buildBrief({ role: "scout", docs: DESK_DOCS, coverage, workflowInputs: { topic: "Warehouse costs?" } });
    assert.equal(version, "evidence-desk-v1");
    assert.match(text, /^# Evidence Brief\n/);
    assert.match(text, /\| BLS: CES4349300003 \| Average hourly earnings .* \| 26\.83 \| dollars, seasonally adjusted \| August 2026 \(preliminary\) \| United States \|/);
    assert.match(text, /\*\*WEB: 0123456789ab ¶2\*\* \(characters 10–90\)/);
    assert.match(text, /> Labour is 55% of 3PL operating cost\.\n> Energy is 8%\./);
    assert.match(text, /3PL costs \\\| benchmark/, "pipes escaped in headings");
    assert.match(text, /doi: 10\.1000\/xyz123/);
    assert.match(text, /SEC: 320193\/0000320193-24-000123/);
    assert.match(text, /- eurostat_series: not run \(does not apply/);
    assert.match(text, /- worldbank_indicators: failed to answer \(inconclusive/);
    assert.match(text, /- openalex_works: returned nothing \(an honest zero\)/);
    // Grounded by construction: every id in the brief appears in the evidence docs it was built from.
    const fetched = new Set(deduplicateCitations(extractCitations(DESK_DOCS.filter((d) => !d.context_only).map((d) => d.content).join("\n"))).map((c) => c.id.toUpperCase()));
    for (const c of deduplicateCitations(extractCitations(text))) assert.ok(fetched.has(c.id.toUpperCase()), `${c.type}:${c.id} not fetched`);
    assert.doesNotMatch(text, /ffffffffffff/, "context-only vault text never enters the brief");
  });

  it("is byte-identical for the same records, and honest when nothing came back", () => {
    const a = desk.buildBrief({ docs: DESK_DOCS, coverage, workflowInputs: { topic: "q" } }).text;
    const b = desk.buildBrief({ docs: DESK_DOCS, coverage, workflowInputs: { topic: "q" } }).text;
    assert.equal(a, b);
    const empty = desk.buildBrief({ docs: [], coverage: [], workflowInputs: {} }).text;
    assert.match(empty, /No official-statistics series returned a value/);
    assert.match(empty, /No web page passed the relevance check/);
    assert.equal(extractCitations(empty).length, 0);
  });
});

describe("agent engine: the business scout is desk-authored", () => {
  const { createMutableTimeProvider, makeTmpDir } = require("./_phase14-helpers.js");
  const { createTaskDefinition } = require("../../openclaw-bridge/core/task-definition-schema.js");
  const { createAgentEngine } = require("../../openclaw-bridge/core/agent-engine.js");
  const { createResearchOutputManager } = require("../../openclaw-bridge/core/research-output-manager.js");

  async function run({ profile, role, desk }) {
    const timeProvider = createMutableTimeProvider();
    const outputDir = await makeTmpDir("openclaw-desk-");
    let llmCalls = 0;
    const engine = createAgentEngine({
      timeProvider,
      config: { maxTokensPerRequest: 2048 },
      governanceBridge: {
        requestTaskApproval: async () => ({ approved: true }),
        recordTaskExecution: async () => ({ ok: true }),
        generateRLHFEntry: async () => ({ ok: true, local_mirror_path: "" })
      },
      llmAdapter: {
        complete: async () => { llmCalls++; return { text: "model text BLS: CES4349300003", provider: "mock", model: "mock-v1", tokenCount: 1, durationMs: 1 }; },
        getProviderInfo: () => ({ provider: "mock", model: "mock-v1" })
      },
      outputManager: createResearchOutputManager({ timeProvider, outputDir })
    });
    const docs = DESK_DOCS.slice();
    Object.defineProperty(docs, "coverage", { value: [{ source: "bls_series", status: "returned", records: 1 }], enumerable: false });
    const task = createTaskDefinition({ type: "freeform", description: "desk probe", inputs: [], outputFormat: "markdown", createdAt: "2026-10-21T00:00:00.000Z" });
    const result = await engine.executeTask(task, {
      supervisorDecision: { approved: true, decision_id: "sup-ok" },
      agentRole: role,
      toolPrefetch: { prefetchForRole: async () => docs },
      evidenceDesk: desk,
      workflowInputs: profile ? { research_profile: profile, topic: "Warehouse costs?" } : { topic: "x" }
    });
    const meta = JSON.parse(fs.readFileSync(result.metadata_path, "utf8"));
    const output = fs.readFileSync(result.output_path, "utf8");
    return { llmCalls, meta, output, result };
  }

  it("business scout: no model call, the brief is the output, metadata says evidence-desk, fetched ids unchanged", async () => {
    const { llmCalls, meta, output } = await run({ profile: "business", role: "scout", desk: createEvidenceDesk({ logger }) });
    assert.equal(llmCalls, 0);
    assert.match(output, /^# Evidence Brief/);
    assert.equal(meta.authored_by, "evidence-desk");
    assert.equal(meta.provider, "evidence-desk");
    assert.equal(meta.token_count, 0);
    assert.ok(meta.fetched_citation_ids.includes("CES4349300003"));
    assert.equal(meta.citation_verification.ungrounded, 0);
  });

  it("business analyst, a biomedical scout, and a business scout without a desk all make their model call", async () => {
    const desk = createEvidenceDesk({ logger });
    for (const args of [{ profile: "business", role: "analyst", desk }, { profile: null, role: "scout", desk }, { profile: "business", role: "scout", desk: null }]) {
      const { llmCalls, meta } = await run(args);
      assert.equal(llmCalls, 1, JSON.stringify({ profile: args.profile, role: args.role, desk: Boolean(args.desk) }));
      assert.equal(meta.authored_by, undefined, "model-written metadata is unchanged");
    }
  });

  it("a desk that throws falls back to the model call", async () => {
    const { llmCalls, meta } = await run({ profile: "business", role: "scout", desk: { buildBrief: () => { throw new Error("boom"); } } });
    assert.equal(llmCalls, 1);
    assert.equal(meta.authored_by, undefined);
  });
});

describe("citation gate judges model-written text only", () => {
  function fakeFs(files) {
    return (p) => {
      if (!(p in files)) throw new Error(`ENOENT ${p}`);
      return files[p];
    };
  }

  it("a desk section's grounded ids do not pad the ratio; it stays in reportText for screening and re-resolution", () => {
    const desk = "# Evidence Brief\nBLS: CES4349300001 BLS: CES4349300003 BLS: CUUR0000SA0 WEB: 0123456789ab WEB: 0123456789cd";
    const model = "Labour (BLS: CES4349300003) rose; energy (WEB: 0123456789ab). Invented: BLS: CES1111111111.";
    const files = {
      "/s/meta.json": JSON.stringify({ authored_by: "evidence-desk", fetched_citation_ids: ["CES4349300001", "CES4349300003", "CUUR0000SA0", "0123456789ab", "0123456789cd"] }),
      "/s/out.md": desk,
      "/a/meta.json": JSON.stringify({ fetched_citation_ids: [] }),
      "/a/out.md": model
    };
    const subtaskResults = [
      { task_id: "task-scout", metadata_path: "/s/meta.json", output_path: "/s/out.md" },
      { task_id: "task-analyst", metadata_path: "/a/meta.json", output_path: "/a/out.md" }
    ];
    const gate = verifyReportCitations({ subtaskResults, readFile: fakeFs(files), minGroundedRatio: 0.75 });
    // Model text: 3 cited, 2 grounded = 0.667 < 0.75 → blocked. Counting the brief would have read 5/6 = 0.833 and passed.
    assert.equal(gate.cited, 3);
    assert.equal(gate.grounded, 2);
    assert.equal(gate.verdict, "UNVERIFIED");
    assert.deepEqual(gate.desk_authored_sections, ["task-scout"]);
    assert.ok(gate.reportText.includes("# Evidence Brief"), "the brief is still screened and re-resolved");
    assert.equal(isDeskAuthoredSubtask(subtaskResults[0], fakeFs(files)), true);
    assert.equal(isDeskAuthoredSubtask(subtaskResults[1], fakeFs(files)), false);
    assert.equal(isDeskAuthoredSubtask({ metadata_path: "/missing.json" }, fakeFs(files)), false, "unreadable = model text (strict side)");
  });

  it("with no desk section the gate is exactly as before", () => {
    const files = {
      "/a/meta.json": JSON.stringify({ fetched_citation_ids: ["CES4349300003"] }),
      "/a/out.md": "BLS: CES4349300003 and BLS: CES4349300001"
    };
    const gate = verifyReportCitations({ subtaskResults: [{ task_id: "t", metadata_path: "/a/meta.json", output_path: "/a/out.md" }], readFile: fakeFs(files), minGroundedRatio: 0.75 });
    assert.equal(gate.cited, 2);
    assert.equal(gate.grounded_ratio, 0.5);
    assert.deepEqual(gate.desk_authored_sections, []);
  });
});
