"use strict";

// Business research lane (2026-10-21): research profiles, the WEB / SEC / WB identifier grammar,
// the web snapshot store, the four business fetchers, their re-resolvers, and the profile seams in
// tool-prefetch and agent-context-loader. Everything runs offline against injected fakes.

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "../..");

const { getResearchProfile, PROFILES } = require("../../openclaw-bridge/core/research-profiles.js");
const { extractCitations, crossCheckCitations } = require("../../openclaw-bridge/core/citation-extractor.js");
const { createWebSnapshotStore, snapshotHash } = require("../../openclaw-bridge/mcp/business-sources/web-snapshot-store.js");
const { createWebEvidence } = require("../../openclaw-bridge/mcp/business-sources/web-evidence.js");
const { createSecFilings } = require("../../openclaw-bridge/mcp/business-sources/sec-filings.js");
const { createWorldBank } = require("../../openclaw-bridge/mcp/business-sources/world-bank.js");
const { createOpenAlex, abstractFromInvertedIndex } = require("../../openclaw-bridge/mcp/business-sources/openalex.js");
const { createCitationReresolver } = require("../../openclaw-bridge/mcp/citation-reresolver/citation-reresolver.js");
const { createToolPrefetch } = require("../../openclaw-bridge/core/tool-prefetch.js");
const { createAgentContextLoader } = require("../../openclaw-bridge/core/agent-context-loader.js");
const { validateWorkflowDefinition } = require("../../openclaw-bridge/core/workflow-schema.js");

const logger = { info() {}, warn() {}, error() {} };
const LONG_TEXT = "Average warehouse labour cost rose in 2025 according to the survey. ".repeat(10);

function tmpStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "web-snap-"));
  return createWebSnapshotStore({ dir, nowIso: () => "2026-10-21T00:00:00.000Z" });
}

function jsonResponse(status, body) {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}

describe("research profiles", () => {
  it("defaults to biomedical for a missing or unknown id", () => {
    assert.equal(getResearchProfile(undefined).id, "biomedical");
    assert.equal(getResearchProfile("astrology").id, "biomedical");
    assert.equal(getResearchProfile(" Business ").id, "business");
  });

  it("keeps the biomedical lane on the files it always used", () => {
    assert.equal(PROFILES.biomedical.prefetchMapFile, "tool-prefetch-map.json");
    assert.equal(PROFILES.biomedical.soulFile, "SOUL.md");
    assert.equal(PROFILES.biomedical.identifierList, "PMID/NCT/DOI/ChEMBL/CID/UniProt");
  });

  it("every business template validates and declares the business profile", () => {
    for (const id of ["business-research-pack", "cost-reduction-analysis", "market-landscape"]) {
      const def = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "config", "workflow-templates", `${id}.json`), "utf8"));
      assert.equal(validateWorkflowDefinition(def).research_profile, "business", id);
    }
  });
});

describe("business identifier grammar", () => {
  it("extracts SEC, WEB and WB identifiers with their literal prefixes", () => {
    const got = extractCitations(
      "Revenue fell (SEC: 320193/0000320193-24-000123). Wages rose (WEB: 3f9a1c0b7d2e). CPI (WB: FP.CPI.TOTL.ZG)."
    );
    assert.deepEqual(got, [
      { type: "SEC", id: "320193/0000320193-24-000123" },
      { type: "WEB", id: "3f9a1c0b7d2e" },
      { type: "WB", id: "FP.CPI.TOTL.ZG" }
    ]);
  });

  it("does not capture the biomedical lane's context-only SEC rendering or malformed ids", () => {
    const got = extractCitations(
      "CIK 1095981 · Accession 0001564590-20-047276. WEB: 3f9a1c0b7d2eff (14 hex) web: 3f9a1c0b7d2e WB: lowercase"
    );
    assert.deepEqual(got, []);
  });

  it("grounds a cited WEB id only when the run fetched it", () => {
    const res = crossCheckCitations("Claim (WEB: aaaaaaaaaaaa). Other (WEB: bbbbbbbbbbbb).", ["aaaaaaaaaaaa"]);
    assert.equal(res.verified_count, 1);
    assert.deepEqual(res.unverified, [{ type: "WEB", id: "bbbbbbbbbbbb" }]);
  });
});

describe("web snapshot store", () => {
  it("is content-addressed and idempotent", () => {
    const store = tmpStore();
    const a = store.put({ url: "https://example.com/a", title: "A", text: LONG_TEXT });
    const b = store.put({ url: "https://example.com/a", title: "A", text: LONG_TEXT });
    assert.equal(a.id, b.id);
    assert.equal(a.id, snapshotHash("https://example.com/a", LONG_TEXT).slice(0, 12));
    assert.equal(store.verify(a.id).status, "found");
  });

  it("reports missing and altered snapshots", () => {
    const store = tmpStore();
    assert.equal(store.verify("000000000000").status, "missing");
    const rec = store.put({ url: "https://example.com/b", text: LONG_TEXT });
    const file = path.join(store.dir, `${rec.id}.json`);
    const tampered = JSON.parse(fs.readFileSync(file, "utf8"));
    tampered.text = `${tampered.text} plus an inserted sentence`;
    fs.writeFileSync(file, JSON.stringify(tampered));
    assert.equal(store.verify(rec.id).status, "altered");
  });
});

describe("web evidence fetcher", () => {
  it("reads https pages only, skips thin pages, and stores what it shows", async () => {
    const store = tmpStore();
    const web = createWebEvidence({
      logger,
      snapshotStore: store,
      searchFn: async () => ({
        results: [
          { url: "http://insecure.example.com/x", title: "insecure" },
          { url: "https://thin.example.com/x", title: "thin" },
          { url: "https://good.example.com/x", title: "good" }
        ]
      }),
      extractOne: async (url) => ({ raw_content: url.includes("thin") ? "too short" : LONG_TEXT, title: "Good page" })
    });
    const recs = await web.searchAndRead({ query: "warehouse labour cost" });
    assert.equal(recs.length, 1);
    assert.equal(recs[0].url, "https://good.example.com/x");
    assert.match(recs[0].text, /^WEB: [0-9a-f]{12}\n/);
    assert.equal(store.verify(recs[0].webSnapshotId).status, "found");
  });

  it("fails soft when search throws or no subject is given", async () => {
    const web = createWebEvidence({ logger, snapshotStore: tmpStore(), searchFn: async () => { throw new Error("down"); } });
    assert.deepEqual(await web.searchAndRead({ query: "x" }), []);
    assert.deepEqual(await web.searchAndRead({}), []);
  });
});

describe("business fetchers", () => {
  it("SEC filings become citable only with both CIK and accession", async () => {
    const sec = createSecFilings({
      logger,
      secEdgar: {
        searchDisclosures: async () => [
          { title: "Acme — 10-K", cik: "0000320193", accessionNumber: "0000320193-24-000123", description: "Form 10-K", url: "https://www.sec.gov/x" },
          { title: "No accession", cik: "1", accessionNumber: "" }
        ]
      }
    });
    const recs = await sec.searchCitable({ company: "Acme" });
    assert.equal(recs.length, 1);
    assert.match(recs[0].text, /^SEC: 320193\/0000320193-24-000123\n/);
  });

  it("World Bank shows the API's value and year verbatim, skipping null values", async () => {
    const wb = createWorldBank({
      logger,
      fetchImpl: async (url) => (url.includes("FP.CPI.TOTL.ZG")
        ? jsonResponse(200, [{}, [{ indicator: { value: "Inflation, consumer prices (annual %)" }, country: { value: "United States" }, date: "2024", value: 2.94952 }]])
        : jsonResponse(200, [{}, [{ value: null, date: "2024" }]]))
    });
    const recs = await wb.latestIndicators({ country: "US", indicators: "FP.CPI.TOTL.ZG,FR.INR.LEND" });
    assert.equal(recs.length, 1);
    assert.match(recs[0].text, /^WB: FP\.CPI\.TOTL\.ZG\nValue: 2\.94952 \(United States, 2024/);
  });

  it("OpenAlex keeps DOI-bearing works and rebuilds the abstract", async () => {
    assert.equal(abstractFromInvertedIndex({ costs: [1], Lower: [0] }), "Lower costs");
    const oa = createOpenAlex({
      logger,
      fetchImpl: async () => jsonResponse(200, {
        results: [
          { display_name: "Lean warehousing", doi: "https://doi.org/10.1016/j.ijpe.2020.107777", publication_year: 2020 },
          { display_name: "No DOI", doi: null }
        ]
      })
    });
    const recs = await oa.searchWorks({ query: "lean warehousing" });
    assert.equal(recs.length, 1);
    assert.equal(recs[0].doi, "10.1016/j.ijpe.2020.107777");
  });
});

describe("business re-resolvers", () => {
  it("SEC: 200 with the matching directory is VERIFIED, 404 UNRESOLVED, 403 UNCHECKED", async () => {
    const make = (status, body) => createCitationReresolver({ logger, fetchImpl: async () => jsonResponse(status, body) });
    const ok = await make(200, { directory: { name: "/Archives/edgar/data/320193/000032019324000123" } })
      .resolveOne({ type: "SEC", id: "320193/0000320193-24-000123" });
    assert.equal(ok.status, "VERIFIED");
    const missing = await make(404, {}).resolveOne({ type: "SEC", id: "320193/0000320193-24-000123" });
    assert.equal(missing.status, "UNRESOLVED");
    const throttled = await make(403, {}).resolveOne({ type: "SEC", id: "320193/0000320193-24-000123" });
    assert.equal(throttled.status, "UNCHECKED");
  });

  it("SEC sends a User-Agent with the organisation and contact address", async () => {
    let ua = "";
    const r = createCitationReresolver({
      logger,
      fetchImpl: async (_url, init) => { ua = init.headers["User-Agent"]; return jsonResponse(404, {}); }
    });
    await r.resolveOne({ type: "SEC", id: "1/0000000001-24-000001" });
    assert.match(ua, /Trevor Robey Intelligence Network Citations LLC .+@/);
  });

  it("WB: a known code is VERIFIED, an unknown one UNRESOLVED", async () => {
    const known = await createCitationReresolver({ logger, fetchImpl: async () => jsonResponse(200, [{}, [{ id: "FP.CPI.TOTL.ZG", name: "Inflation" }]]) })
      .resolveOne({ type: "WB", id: "FP.CPI.TOTL.ZG" });
    assert.equal(known.status, "VERIFIED");
    const unknown = await createCitationReresolver({ logger, fetchImpl: async () => jsonResponse(200, [{ message: [{ id: "120" }] }]) })
      .resolveOne({ type: "WB", id: "XX.NOT.REAL" });
    assert.equal(unknown.status, "UNRESOLVED");
  });

  it("WEB: stored snapshot VERIFIED, missing UNRESOLVED, no store UNCHECKED — no network call", async () => {
    let calls = 0;
    const fetchImpl = async () => { calls += 1; return jsonResponse(500, {}); };
    const store = tmpStore();
    const rec = store.put({ url: "https://example.com/c", text: LONG_TEXT });
    const r = createCitationReresolver({ logger, fetchImpl, webSnapshotStore: store });
    const found = await r.resolveOne({ type: "WEB", id: rec.id });
    assert.equal(found.status, "VERIFIED");
    assert.equal(found.evidence.url, "https://example.com/c");
    assert.equal((await r.resolveOne({ type: "WEB", id: "0123456789ab" })).status, "UNRESOLVED");
    const noStore = await createCitationReresolver({ logger, fetchImpl }).resolveOne({ type: "WEB", id: rec.id });
    assert.equal(noStore.status, "UNCHECKED");
    assert.equal(calls, 0);
  });
});

describe("profile seams", () => {
  it("tool-prefetch reads the business map only for the business profile", async () => {
    const calls = [];
    const mcp = { execute: async (input) => { calls.push(input.tool_name); return { status: "success", data: [] }; } };
    const prefetch = createToolPrefetch({
      toolUniverseMcp: mcp,
      logger,
      rootDir: ROOT_DIR,
      localFetchers: {
        web_evidence: async () => { calls.push("web_evidence"); return [{ title: "t", text: `WEB: aaaaaaaaaaaa\n${LONG_TEXT}`, url: "https://e.com" }]; }
      }
    });
    const docs = await prefetch.prefetchForRole("synthesizer", { topic: "warehouse labour cost", research_profile: "business" });
    assert.ok(!calls.includes("PubMed_search_articles"), "business synthesizer must not call PubMed");
    assert.ok(calls.includes("openalex_works"), "business synthesizer calls OpenAlex");
    assert.ok(Array.isArray(docs));
    calls.length = 0;
    await prefetch.prefetchForRole("synthesizer", { topic: "glioblastoma", therapeutic_area: "oncology", indication: "glioblastoma" });
    assert.ok(calls.includes("PubMed_search_articles"), "biomedical synthesizer is unchanged");
  });

  it("agent-context-loader loads SOUL.business.md for business and never falls back to the biomedical soul", () => {
    const loader = createAgentContextLoader({ rootDir: ROOT_DIR, logger });
    const business = loader.loadAgentContext("scout", "business").agentIdentityPrefix;
    assert.match(business, /business research/);
    assert.doesNotMatch(business, /PubMed \(PMID\)/);
    const biomedical = loader.loadAgentContext("scout").agentIdentityPrefix;
    assert.match(biomedical, /biomedical research/);
    const noBusinessSoul = loader.loadAgentContext("orchestrator", "business").agentIdentityPrefix;
    assert.doesNotMatch(noBusinessSoul, /biomedical/i);
  });
});

describe("business report packaging", () => {
  const { createDeliverablePackager } = require("../../openclaw-bridge/monetization/deliverable-packager.js");

  function fixture(extra = {}) {
    return {
      offer: {
        offer_id: "offer-business-demo",
        offer_title: "Warehouse Cost Brief",
        product_line: "research_packs",
        tier: "premium",
        source_kind: "mission",
        source_id: "mission-business-demo"
      },
      sourceContext: {
        source_kind: "mission",
        source_id: "mission-business-demo",
        artifacts: [{
          task_id: "task-synthesizer-1",
          output_rel: "workspace/research-output/t1/output.md",
          output_full: "Labour is the largest cost line (WEB: 0123456789ab). Lending rates rose (WB: FR.INR.LEND)."
        }],
        ...extra
      }
    };
  }

  function write(extra) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "biz-pack-"));
    const packager = createDeliverablePackager({ rootDir: tmp });
    const f = fixture(extra);
    const dir = packager.createBundleWorkspace(f.offer.offer_id);
    const refs = packager.writeDeliverables(dir, f.offer, f.sourceContext);
    const read = (rel) => fs.readFileSync(path.join(dir, "deliverables", rel), "utf8");
    return { dir, refs, read };
  }

  it("biomedical copy is unchanged when no profile is set", () => {
    const { read } = write();
    assert.match(read("store-copy.md"), /peer-reviewed biomedical literature/);
    assert.match(read("methodology-statement.md"), /authoritative biomedical databases/);
    assert.match(read("methodology-statement.md"), /does not constitute medical advice/);
  });

  it("business copy names business sources and never claims biomedical registries", () => {
    const { read } = write({ research_profile: "business" });
    const store = read("store-copy.md");
    const method = read("methodology-statement.md");
    assert.match(store, /public company filings, official economic statistics/);
    assert.doesNotMatch(store, /PubMed|ClinicalTrials\.gov|Pharmacological/);
    assert.match(method, /SEC EDGAR/);
    assert.doesNotMatch(method, /PubChem|UniProt/);
    assert.match(method, /tax or accounting advice/);
  });

  it("business resolution sentence names the business resolvers and the snapshot caveat", () => {
    const manifest = {
      summary: { counts: { total: 1, verified: 1, unresolved: 0, unchecked: 0 }, delivery_decision: "DELIVER", by_type: { WEB: { total: 1, verified: 1 } } },
      citations: [{ id: "0123456789ab", type: "WEB", status: "VERIFIED" }]
    };
    const { read } = write({ research_profile: "business", citation_verification: { reproducibility_manifest: manifest } });
    const store = read("store-copy.md");
    assert.match(store, /WEB → this run's stored page snapshot/);
    assert.match(store, /not that the page is still live/);
    assert.doesNotMatch(store, /NCBI E-utilities/);
  });

  it("ships cited web snapshots in sources/ and withholds one that fails the license screen", () => {
    const text = LONG_TEXT;
    const good = { id: snapshotHash("https://example.com/a", text).slice(0, 12), url: "https://example.com/a", retrieved_at: "2026-10-21T00:00:00.000Z", sha256: snapshotHash("https://example.com/a", text), text };
    const badText = "Compare entries in DrugBank. " + LONG_TEXT;
    const bad = { id: snapshotHash("https://example.com/b", badText).slice(0, 12), url: "https://example.com/b", sha256: snapshotHash("https://example.com/b", badText), text: badText };
    const { refs, read } = write({ research_profile: "business", web_snapshots: [good, bad] });
    assert.equal(refs.web_sources, "deliverables/sources/index.md");
    const index = read("sources/index.md");
    assert.match(index, new RegExp(good.id));
    assert.match(index, new RegExp(`Withheld by the license screen.*${bad.id}`));
    const page = read(`sources/WEB-${good.id}.md`);
    assert.match(page, /https:\/\/example\.com\/a/);
    assert.ok(page.includes(text));
    assert.match(read("store-copy.md"), /`sources\/`/);
  });
});
