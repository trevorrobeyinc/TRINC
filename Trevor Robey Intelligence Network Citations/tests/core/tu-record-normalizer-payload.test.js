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
const { extractCitations, deduplicateCitations } = require("../../openclaw-bridge/core/citation-extractor.js");

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

// openalex_literature_search for "type 2 diabetes  metformin", max_results 8, exactly as ToolUniverse
// v1.5.7 returned it (live 2026-10-24; first three of eight rows; organizations, keywords and the paging
// fields trimmed). execute_tool wraps the tool's bare row list as { result }. Row 0: no venue, no DOI;
// row 1: the placeholder abstract; row 2: everything present. The DOI is a resolver URL.
const OPENALEX_ROWS = [
  {
    title: "Type 2 Diabetes, Metformin, and Cardioprotection: Are the Data There?",
    abstract: "Metformin and the class of sulfonylureas are the work horses of therapy for type 2 diabetes. Metformin even confers some protection from vascular complications. But, how do they stack up against newer agents? Here, a closer look.",
    authors: ["Gregory W. Rutecki"],
    year: 2013,
    venue: "Unknown venue",
    doi: null,
    citation_count: 0,
    open_access: false,
    article_type: "article",
    publisher: "Unknown",
    openalex_id: "https://openalex.org/W2943560033",
    url: "https://openalex.org/W2943560033",
    data_quality: { has_abstract: true, has_authors: true, has_venue: false, has_year: true, has_doi: false, has_citation_count: false, has_keywords: true }
  },
  {
    title: "A prospective study of type 2 diabetes, metformin use, and risk of breast cancer",
    abstract: "Abstract not available",
    authors: ["Yong‐Moon Park", "Deborah B. Bookwalter", "Katie M. O’Brien", "Chandra L. Jackson", "Clarice Ring Weinberg", "Dale P. Sandler"],
    year: 2021,
    venue: "Annals of Oncology",
    doi: "https://doi.org/10.1016/j.annonc.2020.12.008",
    citation_count: 94,
    open_access: true,
    article_type: "article",
    publisher: "Unknown",
    openalex_id: "https://openalex.org/W3124905289",
    url: "https://doi.org/10.1016/j.annonc.2020.12.008",
    data_quality: { has_abstract: false, has_authors: true, has_venue: true, has_year: true, has_doi: true, has_citation_count: true, has_keywords: true }
  },
  {
    title: "Building therapy in type 2 diabetes – metformin and beyond",
    abstract: "David Morris looks at the options available for managing this common condition",
    authors: ["David Morris"],
    year: 2021,
    venue: "Independent Nurse",
    doi: "https://doi.org/10.12968/indn.2021.3.14",
    citation_count: 0,
    open_access: false,
    article_type: "article",
    publisher: "Unknown",
    openalex_id: "https://openalex.org/W3150489976",
    url: "https://doi.org/10.12968/indn.2021.3.14",
    data_quality: { has_abstract: true, has_authors: true, has_venue: true, has_year: true, has_doi: true, has_citation_count: false, has_keywords: true }
  }
];

// DOAJ_search_articles for the same query, max_results 6 (live 2026-10-24; rows 3 and 6 of six,
// abstracts cut to their first sentence, the second row's authors to three). The DOI is bare; the
// journal is `venue`.
const DOAJ_ROWS = [
  {
    title: "Cost effectiveness of vildagliptin versus glimepiride as add-on treatment to metformin for the treatment of diabetes mellitus type 2 patients in Greece",
    abstract: "Abstract Objectives This study was designed to assess the cost-effectiveness of vildagliptin versus glimepiride as add-on to metformin in the management of type 2 diabetes mellitus (T2DM) patients in the Greek healthcare setting.",
    authors: ["Hara Kousoulakou", "Magdalini Hatzikou", "Varvara Baroutsou", "John Yfantopoulos"],
    year: 2017,
    doi: "10.1186/s12962-017-0082-7",
    venue: "Cost Effectiveness and Resource Allocation",
    url: "http://link.springer.com/article/10.1186/s12962-017-0082-7",
    citations: 0,
    open_access: true,
    keywords: ["Medicine (General)"],
    article_type: "journal-article",
    publisher: "BMC",
    source: "DOAJ",
    data_quality: { has_abstract: true, has_authors: true, has_journal: true, has_year: true, has_doi: true, has_citations: false, has_keywords: true, has_url: true }
  },
  {
    title: "Efficacy and Safety of Alogliptin-Pioglitazone Combination for Type 2 Diabetes Mellitus Poorly Controlled with Metformin: A Multicenter, Double-Blind Randomized Trial",
    abstract: "Background Guidelines for switching to triple combination therapy directly after monotherapy failure are limited.",
    authors: ["Ji-Yeon Park", "Joonyub Lee", "Yoon-Hee Choi"],
    year: 2024,
    doi: "10.4093/dmj.2023.0259",
    venue: "Diabetes & Metabolism Journal",
    url: "http://www.e-dmj.org/upload/pdf/dmj-2023-0259.pdf",
    citations: 0,
    open_access: true,
    keywords: ["Diseases of the endocrine glands. Clinical endocrinology"],
    article_type: "journal-article",
    publisher: "Korean Diabetes Association",
    source: "DOAJ",
    data_quality: { has_abstract: true, has_authors: true, has_journal: true, has_year: true, has_doi: true, has_citations: false, has_keywords: true, has_url: true }
  }
];

// A DOAJ row missing everything optional. All six live rows were complete, so the placeholder values
// are the tool's own (doaj_tool.py, v1.5.7), on the live row shape.
const DOAJ_PLACEHOLDER_ROW = {
  ...DOAJ_ROWS[1],
  abstract: "Abstract not available",
  authors: "Author information not available",
  year: 0,
  doi: "DOI not available",
  venue: "Journal information not available",
  url: "URL not available",
  publisher: "Publisher information not available",
  data_quality: { has_abstract: false, has_authors: false, has_journal: false, has_year: false, has_doi: false, has_citations: false, has_keywords: true, has_url: false }
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

  // --- OpenAlex and DOAJ rows (ToolUniverse v1.5.7, 2026-10-24) ----------------------------
  it("OpenAlex row: venue becomes the journal and the resolver-URL DOI is carried bare", () => {
    const [r] = normalizeToolList([OPENALEX_ROWS[2]], {});
    assert.equal(r.title, "Building therapy in type 2 diabetes – metformin and beyond");
    assert.equal(r.abstract, "David Morris looks at the options available for managing this common condition");
    assert.equal(r.journal, "Independent Nurse");
    assert.equal(r.year, "2021");
    assert.equal(r.doi, "10.12968/indn.2021.3.14");
    assert.equal(r.url, "https://doi.org/10.12968/indn.2021.3.14");
  });

  it("OpenAlex placeholders the tool flags absent are carried as nothing, not as text or a journal", () => {
    const [noVenue, noAbstract] = normalizeToolList(OPENALEX_ROWS.slice(0, 2), {});
    assert.match(noVenue.abstract, /^Metformin and the class of sulfonylureas/);
    assert.equal(noVenue.journal, undefined, "\"Unknown venue\" is not a journal");
    assert.equal(noVenue.doi, undefined);
    assert.equal(noVenue.year, "2013");
    assert.equal(noAbstract.abstract, "", "\"Abstract not available\" is not abstract text");
    assert.equal(noAbstract.journal, "Annals of Oncology");
    assert.equal(noAbstract.doi, "10.1016/j.annonc.2020.12.008");
  });

  it("DOAJ row: venue becomes the journal, the bare DOI, year and URL are kept", () => {
    const [r] = normalizeToolList([DOAJ_ROWS[0]], {});
    assert.match(r.title, /^Cost effectiveness of vildagliptin versus glimepiride/);
    assert.match(r.abstract, /^Abstract Objectives This study was designed/);
    assert.equal(r.journal, "Cost Effectiveness and Resource Allocation");
    assert.equal(r.doi, "10.1186/s12962-017-0082-7");
    assert.equal(r.year, "2017");
    assert.equal(r.url, "http://link.springer.com/article/10.1186/s12962-017-0082-7");
  });

  it("DOAJ placeholders are dropped, and a placeholder is not payload beside an error", () => {
    const [r] = normalizeToolList([DOAJ_PLACEHOLDER_ROW], {});
    assert.equal(r.abstract, "");
    assert.equal(r.doi, undefined, "\"DOI not available\" is not an identifier");
    assert.equal(r.journal, undefined);
    assert.equal(r.url, undefined);
    assert.equal(r.year, undefined);
    assert.equal(isErrorOnlyRow({ ...DOAJ_PLACEHOLDER_ROW, error: "DOAJ API error 503" }), true);
  });

  it("the cleanup is scoped to OpenAlex and DOAJ rows: another tool's data_quality is not read", () => {
    const [r] = normalizeToolList([{
      title: "T",
      abstract: "Real abstract",
      doi: "10.1000/xyz",
      venue: "Some Venue",
      source: "Europe PMC",
      data_quality: { has_abstract: false, has_doi: false }
    }], {});
    assert.equal(r.abstract, "Real abstract");
    assert.equal(r.doi, "10.1000/xyz");
    assert.equal(r.journal, undefined, "venue is mapped only for the two literature indexes");
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

  // --- execute_tool's { result } wrapper around a bare row list (2026-10-24) -------------------
  const openAlexCall = { action: "executeTool", tool_name: "openalex_literature_search", arguments: { query: "type 2 diabetes  metformin", max_results: 8 } };

  it("{ result: [...rows] } becomes one record per row, not one record holding the rows as JSON", async () => {
    const records = await mcpReturning({ result: OPENALEX_ROWS }).execute(openAlexCall, {});
    assert.equal(records.length, 3);
    assert.deepEqual(records.map((r) => r.title), OPENALEX_ROWS.map((row) => row.title));
    assert.deepEqual(records.map((r) => r.doi), [undefined, "10.1016/j.annonc.2020.12.008", "10.12968/indn.2021.3.14"]);
    assert.ok(records.every((r) => !r.abstract.includes("\"title\"")), "no row list serialized into an abstract");
  });

  it("{ result: [] } is an honest zero", async () => {
    assert.deepEqual(await mcpReturning({ result: [] }).execute(openAlexCall, {}), []);
  });

  it("an error row inside { result } is a failed call, like any other row list", async () => {
    await assert.rejects(mcpReturning({ result: [EUROPEPMC_503_ROW] }).execute(openAlexCall, {}), {
      code: "TU_UPSTREAM_ERROR",
      message: "openalex_literature_search: Europe PMC API error 503"
    });
  });

  it("{ result: \"<text>\" } (a non-JSON string) still becomes the single text record", async () => {
    const records = await mcpReturning({ result: "Plain text answer" }).execute(openAlexCall, {});
    assert.equal(records.length, 1);
    assert.equal(records[0].abstract, "Plain text answer");
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

  it("OpenAlex and DOAJ rows reach the prompt one record each, counted per row, with groundable DOIs", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tu-coverage-"));
    fs.mkdirSync(path.join(tmp, "config"));
    // The two literature_reviewer entries as config/tool-prefetch-map.json declares them.
    fs.writeFileSync(path.join(tmp, "config", "tool-prefetch-map.json"), JSON.stringify({
      role_mappings: {
        literature_reviewer: [
          { action: "executeTool", tool_name: "openalex_literature_search", optional: true, arguments: { query: "{{indication}} {{drug_class}} {{compound_name}}", max_results: 8 } },
          { action: "executeTool", tool_name: "DOAJ_search_articles", optional: true, arguments: { query: "{{indication}} {{drug_class}} {{compound_name}}", max_results: 6 } }
        ]
      }
    }));
    const envelopes = {
      openalex_literature_search: { result: OPENALEX_ROWS },
      DOAJ_search_articles: { result: DOAJ_ROWS }
    };
    const calls = [];
    const toolUniverseMcp = createToolUniverseMcp({
      processManager: {
        call: async (method, params) => {
          calls.push(params);
          return JSON.parse(JSON.stringify(envelopes[params.tool_name]));
        },
        shutdown() {}
      }
    });
    const prefetch = createToolPrefetch({
      toolUniverseMcp,
      rootDir: tmp,
      logger: { info() {}, warn() {}, error() {} }
    });

    const docs = await prefetch.prefetchForRole("literature_reviewer", { compound_name: "metformin", indication: "type 2 diabetes" });

    assert.deepEqual(calls.map((c) => c.arguments.query), ["type 2 diabetes  metformin", "type 2 diabetes  metformin"]);
    assert.deepEqual(docs.coverage.map((c) => [c.source, c.status, c.records]), [
      ["openalex_literature_search", "returned", 3],
      ["DOAJ_search_articles", "returned", 2]
    ]);
    const [openAlex, doaj] = docs.map((d) => d.content);
    assert.equal((openAlex.match(/^### /gm) || []).length, 3);
    assert.match(openAlex, /### A prospective study of type 2 diabetes, metformin use, and risk of breast cancer\n\*2021 · Annals of Oncology\*\ndoi: 10\.1016\/j\.annonc\.2020\.12\.008\n/);
    assert.doesNotMatch(openAlex, /Abstract not available|Unknown venue|"data_quality"/);
    assert.match(doaj, /\*2024 · Diabetes & Metabolism Journal\*\nBackground Guidelines for switching/);
    const dois = (content) => deduplicateCitations(extractCitations(content)).filter((c) => c.type === "DOI").map((c) => c.id).sort();
    assert.deepEqual(dois(openAlex), ["10.1016/j.annonc.2020.12.008", "10.12968/indn.2021.3.14"]);
    assert.deepEqual(dois(doaj), ["10.1186/s12962-017-0082-7", "10.4093/dmj.2023.0259"], "a bare DOAJ DOI is groundable once rendered");
  });
});
