"use strict";

// Regression for the live-data grounding fix (2026-06-11): ToolUniverse SMCP puts
// real records under result.data / result.data.studies, with source-specific field
// names. The normalizer must surface the payload (title/abstract) AND preserve the
// citation identifiers (pmid/nctId/doi/chembl), or the injected "Live Data" doc is
// hollow and the agent falls back to training knowledge.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  normalizeToolList,
  extractIdentifiers,
  isErrorOnlyRow
} = require("../../openclaw-bridge/mcp/tooluniverse-mcp/tu-record-normalizer.js");
const { createToolUniverseMcp } = require("../../openclaw-bridge/mcp/tooluniverse-mcp/tooluniverse-mcp.js");
const { createToolPrefetch } = require("../../openclaw-bridge/core/tool-prefetch.js");

// Europe PMC's answer to an upstream HTTP 503, exactly as ToolUniverse v1.5.7 returned it (live
// 2026-10-24, both EuropePMC_search_articles calls of a metformin / type 2 diabetes run): the failure
// is a ROW inside a `success` envelope.
const EUROPEPMC_503_ROW = {
  title: "Error",
  abstract: null,
  authors: [],
  journal: null,
  year: null,
  doi: null,
  url: null,
  citations: 0,
  open_access: false,
  keywords: [],
  source: "Europe PMC",
  error: "Europe PMC API error 503",
  reason: "",
  retryable: true
};
const EUROPEPMC_503 = {
  status: "success",
  data: [EUROPEPMC_503_ROW],
  metadata: { count: 1, query: "metformin type 2 diabetes mechanism", source: "Europe PMC", total_results: null }
};

// Semantic Scholar without an API key (live 2026-10-24, all four calls): an error ENVELOPE, no rows.
const SEMANTIC_SCHOLAR_429 = { status: "error", error: "Semantic Scholar API error 429", retryable: true };

// OpenTargets_get_drug_id_description_by_name for "metformin" (live 2026-10-24, first two of five hits).
const OPENTARGETS_METFORMIN = {
  status: "success",
  data: {
    search: {
      hits: [
        {
          id: "CHEMBL1431",
          name: "METFORMIN",
          description: "Small molecule drug with a maximum clinical stage of Approval (across all indications), with 93 approved and 209 investigational indications."
        },
        {
          id: "CHEMBL1703",
          name: "METFORMIN HYDROCHLORIDE",
          description: "Small molecule drug with a maximum clinical stage of Approval (across all indications), with 6 approved and 43 investigational indications."
        }
      ]
    }
  }
};

// A FAERS case report exactly as ToolUniverse v1.5.7 returns it (live 2026-10-24, trimmed).
const FAERS_REPORT = {
  safetyreportid: "10003336",
  serious: "1",
  seriousnessdeath: "1",
  seriousnesshospitalization: "1",
  occurcountry: "US",
  receivedate: "20140312",
  patient: {
    patientsex: "1",
    drug: [
      { medicinalproduct: "JANUMET", drugindication: "TYPE 2 DIABETES MELLITUS", drugdosagetext: "50/1000 MG" },
      { medicinalproduct: "ASPIRIN" }
    ],
    reaction: [
      { reactionmeddrapt: "Metastases to spine", reactionoutcome: "6" },
      { reactionmeddrapt: "Pancreatic carcinoma", reactionoutcome: "5" }
    ],
    summary: { narrativeincludeclinical: "CASE EVENT DATE: 201112" }
  }
};

describe("tu-record-normalizer — payload + identifier preservation", () => {
  it("PubMed article: title/abstract/pmid/doi/journal/year survive normalization", () => {
    const raw = {
      pmid: "42238436",
      title: "ASPREE statistical analysis plan",
      abstract: "Lipoprotein(a) is associated with atherothrombosis ...",
      authors: ["Wolfe R", "Bhatia H"],
      journal: "medRxiv",
      pub_year: "2026",
      doi: "10.64898/2026.05.17.26353443",
      pmcid: "PMC13228837",
      url: "https://pubmed.ncbi.nlm.nih.gov/42238436/"
    };
    const [r] = normalizeToolList([raw], {});
    assert.equal(r.pmid, "42238436");
    assert.equal(r.doi, "10.64898/2026.05.17.26353443");
    assert.equal(r.title, "ASPREE statistical analysis plan");
    assert.match(r.abstract, /Lipoprotein/);
    assert.equal(r.journal, "medRxiv");
    assert.equal(r.year, "2026");
    assert.equal(r.pmcid, "PMC13228837");
  });

  it("ClinicalTrials study: brief_title/brief_summary/NCT ID/phase/status survive", () => {
    const raw = {
      "NCT ID": "NCT01776424",
      brief_title: "Rivaroxaban for the Prevention of Major Cardiovascular Events",
      brief_summary: "The primary objectives of this study are to determine ...",
      overall_status: "COMPLETED",
      phase: ["PHASE3"],
      condition: ["Prevention & Control"]
    };
    const [r] = normalizeToolList([raw], {});
    assert.equal(r.nctId, "NCT01776424");
    assert.equal(r.title, "Rivaroxaban for the Prevention of Major Cardiovascular Events");
    assert.match(r.abstract, /primary objectives/);
    assert.equal(r.phase, "PHASE3");
    assert.equal(r.status, "COMPLETED");
  });

  it("extractIdentifiers handles alternate field names", () => {
    assert.equal(extractIdentifiers({ PMID: "123" }).pmid, "123");
    assert.equal(extractIdentifiers({ nct_id: "NCT9" }).nctId, "NCT9");
    assert.equal(extractIdentifiers({ molecule_chembl_id: "CHEMBL25" }).chemblId, "CHEMBL25");
    assert.deepEqual(extractIdentifiers(null), {});
    assert.deepEqual(extractIdentifiers("x"), {});
  });

  // --- FDA / DailyMed / openFDA row shapes (2026-09-19) ----------------------------
  // Same failure mode as the 2026-06-11 fix above, for the families wired that day: these
  // rows carry their payload under source-specific names, so before the mapping every one
  // normalized to title "unknown_tool" with an EMPTY abstract — a fetch that succeeded, was
  // counted "returned" in search-coverage.md, and reached the prompt carrying nothing.
  // Field names below are copied from live responses, not invented.

  it("DailyMed parsed-label section: content becomes the abstract", () => {
    const raw = { type: "text", content: "The following clinically significant adverse reactions are described elsewhere in the labeling: Myelosuppression" };
    const [r] = normalizeToolList([raw], {});
    assert.match(r.abstract, /Myelosuppression/);
  });

  it("openFDA enforcement row: product_description titles it, reason_for_recall leads the abstract", () => {
    const raw = {
      product_description: "FLUCONAZOLE, Tablet, 200 mg, Rx only",
      reason_for_recall: "Labeling: Label Mixup",
      classification: "Class II",
      recalling_firm: "Aidapak Services, LLC",
      recall_initiation_date: "20130702",
      status: "Terminated"
    };
    const [r] = normalizeToolList([raw], {});
    assert.equal(r.title, "FLUCONAZOLE, Tablet, 200 mg, Rx only");
    assert.match(r.abstract, /^Labeling: Label Mixup/);
    assert.match(r.abstract, /Class II/);
    assert.match(r.abstract, /Aidapak/);
    assert.equal(r.status, "Terminated");
  });

  it("FDA drug-label row: openFDA's LITERAL dotted key titles it, indications become the abstract", () => {
    // openFDA flattens nested keys, so the brand name arrives as "openfda.brand_name",
    // not as a nested openfda object. Reading it as raw.openfda.brand_name finds nothing.
    const raw = {
      "openfda.brand_name": ["Temozolomide"],
      "openfda.generic_name": ["TEMOZOLOMIDE"],
      indications_and_usage: ["1. INDICATIONS AND USAGE TEMOZOLOMIDE Capsules are an alkylating drug"],
      id: "5d202069-2432-4996-9570-0b3389e5fed5"
    };
    const [r] = normalizeToolList([raw], {});
    assert.equal(r.title, "Temozolomide");
    assert.match(r.abstract, /alkylating drug/);
  });

  it("Orange Book row: application number + sponsor title it, products become the abstract", () => {
    const raw = {
      application_number: "NDA021029",
      sponsor_name: "MERCK SHARP DOHME",
      products: [{ brand_name: "TEMODAR", active_ingredients: [{ name: "TEMOZOLOMIDE", strength: "140MG" }] }]
    };
    const [r] = normalizeToolList([raw], {});
    assert.match(r.title, /NDA021029/);
    assert.match(r.title, /MERCK SHARP DOHME/);
    assert.match(r.abstract, /TEMODAR/);
  });

  it("DailyMed SPL search row: label metadata fills the abstract instead of leaving it empty", () => {
    const raw = {
      spl_version: 6,
      published_date: "Aug 31, 2026",
      title: "TEMOZOLOMIDE CAPSULE [OPKO PHARMACEUTICALS, LLC]",
      setid: "9dff10ec-6a55-47b6-a458-b7c39e32dc55"
    };
    const [r] = normalizeToolList([raw], {});
    assert.equal(r.title, "TEMOZOLOMIDE CAPSULE [OPKO PHARMACEUTICALS, LLC]");
    assert.match(r.abstract, /SPL version: 6/);
    assert.match(r.abstract, /9dff10ec/);
  });

  it("known shapes keep precedence over the new source-specific fields", () => {
    // A row carrying BOTH a real abstract and a source-specific field must still use the
    // abstract — the new branches are a fallback, not an override.
    const raw = { title: "Real article", abstract: "Real abstract text", content: "label section text" };
    const [r] = normalizeToolList([raw], {});
    assert.equal(r.title, "Real article");
    assert.equal(r.abstract, "Real abstract text");
  });

  // --- FAERS case reports (ToolUniverse v1.5.7, 2026-10-24) -----------------------------
  it("FAERS case report: the report id titles it, reactions/seriousness/drugs fill the abstract", () => {
    const [r] = normalizeToolList([FAERS_REPORT], {});
    assert.equal(r.title, "FAERS safety report 10003336 (serious)");
    assert.match(r.abstract, /^Reactions: Metastases to spine, Pancreatic carcinoma/);
    assert.match(r.abstract, /Seriousness: death, hospitalization/);
    assert.match(r.abstract, /JANUMET \(for TYPE 2 DIABETES MELLITUS\); ASPIRIN/);
    assert.match(r.abstract, /Country: US \| Received: 20140312/);
    // Codes the field names do not spell out are not decoded into the abstract.
    assert.doesNotMatch(r.abstract, /outcome|sex/i);
  });

  // --- Open Targets search hits and error rows (2026-10-24) -------------------------------
  it("Open Targets drug hit: the drug name titles it, the description is the abstract, the ChEMBL id is kept", () => {
    const [r] = normalizeToolList([OPENTARGETS_METFORMIN.data.search.hits[0]], {});
    assert.equal(r.title, "METFORMIN", "not the description sentence");
    assert.match(r.abstract, /^Small molecule drug with a maximum clinical stage of Approval/);
    assert.equal(r.chemblId, "CHEMBL1431");
  });

  it("a tool-discovery record still takes its description as the title", () => {
    const [r] = normalizeToolList([{ name: "PubMed_search_articles", description: "Search PubMed articles", id: "tool-17" }], {});
    assert.equal(r.title, "Search PubMed articles");
    assert.equal(r.chemblId, undefined, "a non-ChEMBL id is not read as one");
  });

  it("isErrorOnlyRow: an error with no payload is error-only; an error beside real content is not", () => {
    assert.equal(isErrorOnlyRow(EUROPEPMC_503_ROW), true);
    assert.equal(isErrorOnlyRow(SEMANTIC_SCHOLAR_429), true, "an error envelope taken as a row");
    assert.equal(isErrorOnlyRow({ pmid: "42238436", title: "T", abstract: null, error: "abstract fetch failed" }), false, "a PMID is payload");
    assert.equal(isErrorOnlyRow({ title: "T", abstract: "Real abstract", error: "partial" }), false, "abstract text is payload");
    assert.equal(isErrorOnlyRow({ title: "T", error: "" }), false, "an empty error is no error");
    assert.equal(isErrorOnlyRow({ title: "T", error: null }), false);
    assert.equal(isErrorOnlyRow({ error: { code: 503, message: "unavailable" } }), true, "a structured error counts");
    assert.equal(isErrorOnlyRow(null), false);
  });
});

describe("ToolUniverseMcp envelope unwrapping", () => {
  function mcpReturning(envelope) {
    return createToolUniverseMcp({ processManager: { call: async () => envelope, shutdown() {} } });
  }
  const call = { action: "executeTool", tool_name: "FAERS_search_reports_by_drug_and_indication", arguments: {} };

  it("v1.5.x top-level row array beside paging fields becomes the records", async () => {
    const records = await mcpReturning({
      status: "success",
      reports: [FAERS_REPORT, { ...FAERS_REPORT, safetyreportid: "10003337", serious: "2" }],
      count: 2,
      total_available: 103043,
      truncated: true,
      truncation_note: "Partial result: reports 1-2 of 103043 matching this search."
    }).execute(call, {});
    assert.equal(records.length, 2);
    assert.equal(records[0].title, "FAERS safety report 10003336 (serious)");
    assert.equal(records[1].title, "FAERS safety report 10003337");
    assert.match(records[0].abstract, /Reactions:/);
  });

  it("a success envelope whose only row array is empty is a genuine zero, not a hollow record", async () => {
    const records = await mcpReturning({ status: "success", reports: [], count: 0, total_available: 0 }).execute(call, {});
    assert.deepEqual(records, []);
  });

  it("two top-level arrays are ambiguous and stay empty rather than guessing", async () => {
    const records = await mcpReturning({ status: "success", reports: [FAERS_REPORT], warnings: ["x"] }).execute(call, {});
    assert.deepEqual(records, []);
  });

  it("the data-level shape is unchanged", async () => {
    const records = await mcpReturning({ status: "success", data: [{ pmid: "1", title: "T", abstract: "A" }] }).execute(call, {});
    assert.equal(records.length, 1);
    assert.equal(records[0].pmid, "1");
  });

  // --- Upstream errors are failed calls, not records (2026-10-24) ---------------------------
  const europePmcCall = { action: "executeTool", tool_name: "EuropePMC_search_articles", arguments: { query: "metformin" } };

  it("Europe PMC's 503 row inside a success envelope throws instead of becoming a record", async () => {
    await assert.rejects(mcpReturning(EUROPEPMC_503).execute(europePmcCall, {}), (err) => {
      assert.equal(err.code, "TU_UPSTREAM_ERROR");
      assert.equal(err.message, "EuropePMC_search_articles: Europe PMC API error 503");
      assert.equal(err.retryable, true);
      return true;
    });
  });

  it("error rows beside real rows are dropped and the real rows kept", async () => {
    const records = await mcpReturning({
      status: "success",
      data: [{ pmid: "1", title: "T", abstract: "A" }, EUROPEPMC_503_ROW]
    }).execute(europePmcCall, {});
    assert.equal(records.length, 1);
    assert.equal(records[0].pmid, "1");
  });

  it("an error envelope with no rows (Semantic Scholar 429) throws instead of a hollow record", async () => {
    const s2Call = { action: "executeTool", tool_name: "SemanticScholar_search_papers", arguments: { query: "metformin" } };
    await assert.rejects(mcpReturning(SEMANTIC_SCHOLAR_429).execute(s2Call, {}), {
      code: "TU_UPSTREAM_ERROR",
      message: "SemanticScholar_search_papers: Semantic Scholar API error 429"
    });
  });

  it("an error beside an empty row list is a failed call, not an honest zero", async () => {
    await assert.rejects(mcpReturning({ status: "error", error: "Europe PMC API error 503", data: [] }).execute(europePmcCall, {}), {
      code: "TU_UPSTREAM_ERROR"
    });
  });

  it("Open Targets search envelope: data.search.hits become the records", async () => {
    const otCall = { action: "executeTool", tool_name: "OpenTargets_get_drug_id_description_by_name", arguments: { drugName: "metformin" } };
    const records = await mcpReturning(OPENTARGETS_METFORMIN).execute(otCall, {});
    assert.equal(records.length, 2, "one record per hit, not one empty record");
    assert.deepEqual(records.map((r) => r.title), ["METFORMIN", "METFORMIN HYDROCHLORIDE"]);
    assert.deepEqual(records.map((r) => r.chemblId), ["CHEMBL1431", "CHEMBL1703"]);
    assert.ok(records.every((r) => r.abstract.trim()), "every hit carries its description");
  });
});

describe("Search coverage of ToolUniverse results through tool-prefetch", () => {
  it("an upstream error row is a failed search with nothing rendered; Open Targets hits reach the prompt with their ChEMBL ids", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tu-coverage-"));
    fs.mkdirSync(path.join(tmp, "config"));
    fs.writeFileSync(path.join(tmp, "config", "tool-prefetch-map.json"), JSON.stringify({
      role_mappings: {
        analyst: [
          { action: "executeTool", tool_name: "EuropePMC_search_articles", arguments: { query: "{{compound_name}} {{indication}} mechanism", limit: 6 } },
          { action: "executeTool", tool_name: "OpenTargets_get_drug_id_description_by_name", arguments: { drugName: "{{compound_name}}" } }
        ]
      }
    }));
    const envelopes = {
      EuropePMC_search_articles: EUROPEPMC_503,
      OpenTargets_get_drug_id_description_by_name: OPENTARGETS_METFORMIN
    };
    const toolUniverseMcp = createToolUniverseMcp({
      processManager: { call: async (method, params) => JSON.parse(JSON.stringify(envelopes[params.tool_name])), shutdown() {} }
    });
    const warnings = [];
    const prefetch = createToolPrefetch({
      toolUniverseMcp,
      rootDir: tmp,
      logger: { info() {}, warn(entry) { warnings.push(entry); }, error() {} }
    });

    const docs = await prefetch.prefetchForRole("analyst", { compound_name: "metformin", indication: "type 2 diabetes" });

    assert.deepEqual(docs.coverage.map((c) => [c.source, c.status, c.records]), [
      ["EuropePMC_search_articles", "failed", 0],
      ["OpenTargets_get_drug_id_description_by_name", "returned", 2]
    ]);
    assert.deepEqual(docs.map((d) => d.tool_name), ["OpenTargets_get_drug_id_description_by_name"], "the failed search renders nothing");
    assert.doesNotMatch(docs.map((d) => d.content).join("\n"), /### Error|Europe PMC API error/);
    assert.match(docs[0].content, /### METFORMIN\n.*Small molecule drug.*\nChEMBL: CHEMBL1431/);
    const failure = warnings.find((w) => w.event === "tool_prefetch_call_failed");
    assert.match(failure.error, /EuropePMC_search_articles: Europe PMC API error 503/);
  });
});
