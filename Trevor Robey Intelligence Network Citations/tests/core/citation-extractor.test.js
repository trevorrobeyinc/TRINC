"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { extractCitations, deduplicateCitations, countByType, crossCheckCitations, roleLabel } = require("../../openclaw-bridge/core/citation-extractor.js");

describe("citation-extractor", () => {
  describe("extractCitations", () => {
    it("extracts PMID citations", () => {
      const citations = extractCitations("See PMID: 12345678 and PMID:23456789 for details.");
      const pmids = citations.filter(c => c.type === "PMID");
      assert.equal(pmids.length, 2);
      assert.equal(pmids[0].id, "12345678");
      assert.equal(pmids[1].id, "23456789");
    });

    it("extracts NCT identifiers", () => {
      const citations = extractCitations("Trial NCT00012345 is relevant.");
      assert.equal(citations.length, 1);
      assert.equal(citations[0].type, "NCT");
      assert.equal(citations[0].id, "NCT00012345");
    });

    it("extracts PubChem CID", () => {
      const citations = extractCitations("PubChem CID: 2244 is aspirin.");
      const cids = citations.filter(c => c.type === "PubChem CID");
      assert.equal(cids.length, 1);
      assert.equal(cids[0].id, "2244");
    });

    it("extracts ChEMBL, DrugBank, UniProt, and DOI", () => {
      const text = "CHEMBL25, DB00945, UniProt: P12345, doi: 10.1038/nature12373";
      const citations = extractCitations(text);
      const types = citations.map(c => c.type);
      assert.ok(types.includes("ChEMBL"));
      assert.ok(types.includes("DrugBank"));
      assert.ok(types.includes("UniProt"));
      assert.ok(types.includes("DOI"));
    });

    it("stops DOIs at trailing markdown/punctuation (no ]] or ; captured) and dupes collapse", () => {
      const text = "See doi: 10.3389/fphar.2026.1787936]] and doi: 10.54097/5hr7dp28]]; plus [[doi: 10.54097/5hr7dp28]] again and doi: 10.1016/j.ajpc.2023.100579]].";
      const dois = extractCitations(text).filter((c) => c.type === "DOI").map((c) => c.id);
      assert.ok(dois.includes("10.3389/fphar.2026.1787936"), "no trailing ]]");
      assert.ok(dois.includes("10.54097/5hr7dp28"), "no trailing ];");
      assert.ok(dois.includes("10.1016/j.ajpc.2023.100579"));
      const dedup = deduplicateCitations(extractCitations(text)).filter((c) => c.type === "DOI").map((c) => c.id);
      assert.equal(dedup.filter((d) => d === "10.54097/5hr7dp28").length, 1, "the two 5hr7dp28 mentions collapse to one clean id");
    });

    it("still extracts a clean DOI fully (internal dots/slashes preserved)", () => {
      const dois = extractCitations("doi: 10.1038/nature12373 and https://doi.org/10.1016/j.cell.2020.05.001").filter((c) => c.type === "DOI").map((c) => c.id);
      assert.ok(dois.includes("10.1038/nature12373"));
      assert.ok(dois.includes("10.1016/j.cell.2020.05.001"));
    });

    it("strips a trailing sentence period from a DOI while keeping internal dots", () => {
      const dois = extractCitations("Per doi: 10.1038/nature12373. And see doi: 10.1016/j.cell.2020.05.001.").filter((c) => c.type === "DOI").map((c) => c.id);
      assert.ok(dois.includes("10.1038/nature12373"), "trailing period stripped");
      assert.ok(dois.includes("10.1016/j.cell.2020.05.001"), "internal dots kept, trailing period stripped");
      assert.ok(!dois.some((d) => d.endsWith(".")), "no extracted DOI ends in a period");
    });

    it("returns empty array for text with no citations", () => {
      assert.deepEqual(extractCitations("No citations here."), []);
    });
  });

  describe("deduplicateCitations", () => {
    it("removes duplicate citations by type:id", () => {
      const input = [
        { type: "PMID", id: "12345678" },
        { type: "PMID", id: "12345678" },
        { type: "NCT", id: "NCT00012345" }
      ];
      const result = deduplicateCitations(input);
      assert.equal(result.length, 2);
    });
  });

  describe("countByType", () => {
    it("counts citations by type", () => {
      const input = [
        { type: "PMID", id: "1" },
        { type: "PMID", id: "2" },
        { type: "NCT", id: "3" }
      ];
      const result = countByType(input);
      assert.equal(result.PMID, 2);
      assert.equal(result.NCT, 1);
    });
  });

  describe("roleLabel", () => {
    it("labels literature review roles", () => {
      assert.equal(roleLabel("literature_reviewer"), "Literature Review");
      assert.equal(roleLabel("scout_agent"), "Literature Review");
    });

    it("labels analysis roles", () => {
      assert.equal(roleLabel("safety_signal_detector"), "Deep Analysis");
      assert.equal(roleLabel("molecular_profiler"), "Deep Analysis");
    });

    it("labels synthesis roles", () => {
      assert.equal(roleLabel("report_generator"), "Integrated Synthesis");
      assert.equal(roleLabel("quality_auditor"), "Integrated Synthesis");
    });

    it("defaults to Research Output for unknown roles", () => {
      assert.equal(roleLabel("unknown_agent"), "Research Output");
      assert.equal(roleLabel(""), "Research Output");
    });
  });

  describe("crossCheckCitations", () => {
    it("splits report citations into verified (in fetched set) vs unverified (model-introduced)", () => {
      const report = "Evidence from PMID: 12345678 and trial NCT00012345; also see PMID: 99999999.";
      const result = crossCheckCitations(report, ["12345678", "NCT00012345"]);
      assert.equal(result.total, 3);
      assert.equal(result.verified_count, 2);
      assert.equal(result.unverified_count, 1);
      assert.equal(result.verified_ratio, 0.667);
      assert.equal(result.unverified[0].id, "99999999");
    });

    it("ratio 0 and empty unverified when the report has no citations", () => {
      const r = crossCheckCitations("No citations here.", ["12345678"]);
      assert.equal(r.total, 0);
      assert.equal(r.verified_ratio, 0);
      assert.deepEqual(r.unverified, []);
    });
  });
});
