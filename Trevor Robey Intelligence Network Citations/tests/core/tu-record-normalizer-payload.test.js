"use strict";

// Regression for the live-data grounding fix (2026-06-11): ToolUniverse SMCP puts
// real records under result.data / result.data.studies, with source-specific field
// names. The normalizer must surface the payload (title/abstract) AND preserve the
// citation identifiers (pmid/nctId/doi/chembl), or the injected "Live Data" doc is
// hollow and the agent falls back to training knowledge.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeToolList,
  extractIdentifiers
} = require("../../openclaw-bridge/mcp/tooluniverse-mcp/tu-record-normalizer.js");

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
});
