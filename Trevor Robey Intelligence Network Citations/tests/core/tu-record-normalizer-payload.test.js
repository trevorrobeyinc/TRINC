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
});
