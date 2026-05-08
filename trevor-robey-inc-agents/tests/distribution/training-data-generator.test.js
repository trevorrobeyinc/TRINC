"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const {
  generateQAPairs,
  generateEvaluationRubrics,
  generateFactualityAssessments,
  exportAsJsonl,
  splitSections,
  extractFactualClaims
} = require("../../openclaw-bridge/distribution/training-data-generator.js");

const SAMPLE_REPORT = [
  "## Executive Summary",
  "",
  "Immune checkpoint inhibitors (ICIs) including nivolumab (DrugBank: DB09035) and pembrolizumab have transformed oncology.",
  "However, they carry significant cardiac risks including myocarditis (PMID: 30232222) and pericarditis.",
  "The FDA FAERS database shows 2,847 cardiac events. Combination therapy risks are higher (PMID: 29566243).",
  "",
  "## Safety Signal Analysis",
  "",
  "Clinical trial NCT03299946 evaluated combination ICI therapy safety profiles across 450 patients.",
  "Hepatotoxicity was observed in 12% of patients receiving nivolumab plus ipilimumab (DrugBank: DB09035).",
  "PubChem CID: 2244 (aspirin) showed prophylactic potential against ICI-induced pericarditis.",
  "The FAERS signal for nivolumab-associated myocarditis carries a 25-50% fatality rate (PMID: 31786280).",
  "",
  "## Target Validation",
  "",
  "PD-1 receptor (UniProt: Q15116) is the primary target for checkpoint blockade therapy.",
  "ChEMBL compound CHEMBL3137343 shows selective binding to PD-L1 with high affinity.",
  "The PD-1/PD-L1 interaction (doi: 10.1038/nature12345) is the basis for ICI mechanism of action."
].join("\n");

const SAMPLE_CSV = [
  "type,id,context",
  "PMID,30232222,myocarditis",
  "PMID,29566243,combination therapy",
  "PMID,31786280,fatality rate",
  "NCT,NCT03299946,ICI safety",
  "DrugBank,DB09035,nivolumab",
  "PubChem CID,2244,aspirin",
  "UniProt,Q15116,PD-1",
  "ChEMBL,CHEMBL3137343,PD-L1"
].join("\n");

describe("training-data-generator", () => {
  describe("splitSections", () => {
    it("splits markdown into sections by ## headers", () => {
      const sections = splitSections(SAMPLE_REPORT);
      assert.ok(sections.length >= 2, "should split into multiple sections");
      assert.ok(sections[0].title, "first section should have a title");
      assert.ok(sections[0].body.length > 30, "first section should have body content");
    });
  });

  describe("extractFactualClaims", () => {
    it("extracts sentences with citations", () => {
      const claims = extractFactualClaims(SAMPLE_REPORT);
      assert.ok(claims.length >= 3, `should extract multiple claims (got ${claims.length})`);
      for (const claim of claims) {
        assert.ok(typeof claim.text === "string", "claim should have text");
        assert.ok(Array.isArray(claim.citations), "claim should have citations array");
        assert.ok(claim.citations.length >= 1, `claim should have at least 1 citation: "${claim.text.slice(0, 60)}..."`);
      }
    });
  });

  describe("generateQAPairs", () => {
    it("produces array with items from report with citations", () => {
      const pairs = generateQAPairs(SAMPLE_REPORT, SAMPLE_CSV);
      assert.ok(Array.isArray(pairs), "should return array");
      assert.ok(pairs.length >= 1, `should produce Q&A pairs (got ${pairs.length})`);
    });

    it("every Q&A pair has question, answer, and citations >= 1", () => {
      const pairs = generateQAPairs(SAMPLE_REPORT, SAMPLE_CSV);
      for (const pair of pairs) {
        assert.ok(typeof pair.question === "string" && pair.question.length > 0, "should have question");
        assert.ok(typeof pair.answer === "string" && pair.answer.length > 0, "should have answer");
        assert.ok(Array.isArray(pair.citations), "should have citations array");
        assert.ok(pair.citations.length >= 1, `Q&A pair should have at least 1 citation`);
        assert.ok(["graduate", "expert"].includes(pair.difficulty), "difficulty should be graduate or expert");
        assert.ok(typeof pair.domain === "string", "should have domain");
      }
    });

    it("returns empty array for empty input", () => {
      const pairs = generateQAPairs("", "");
      assert.ok(Array.isArray(pairs), "should return array");
      assert.equal(pairs.length, 0, "should return empty for empty input");
    });
  });

  describe("generateEvaluationRubrics", () => {
    it("produces rubrics with required_identifiers", () => {
      const rubrics = generateEvaluationRubrics(SAMPLE_REPORT, SAMPLE_CSV);
      assert.ok(Array.isArray(rubrics), "should return array");
      assert.ok(rubrics.length >= 1, `should produce rubrics (got ${rubrics.length})`);

      for (const rubric of rubrics) {
        assert.ok(typeof rubric.prompt === "string", "should have prompt");
        assert.ok(typeof rubric.ideal_response === "string", "should have ideal_response");
        assert.ok(rubric.rubric, "should have rubric object");
        assert.ok(Array.isArray(rubric.rubric.required_identifiers), "should have required_identifiers");
        assert.ok(rubric.rubric.required_identifiers.length >= 1, "should have at least 1 required identifier");
        assert.ok(Array.isArray(rubric.rubric.key_facts), "should have key_facts");
        assert.ok(Array.isArray(rubric.rubric.hallucination_markers), "should have hallucination_markers");
        assert.ok(Array.isArray(rubric.common_errors), "should have common_errors");
      }
    });

    it("returns empty array for empty input", () => {
      assert.deepEqual(generateEvaluationRubrics("", ""), []);
    });
  });

  describe("generateFactualityAssessments", () => {
    it("produces both factual and non-factual items", () => {
      const assessments = generateFactualityAssessments(SAMPLE_REPORT, SAMPLE_CSV);
      assert.ok(Array.isArray(assessments), "should return array");
      assert.ok(assessments.length >= 2, `should produce assessments (got ${assessments.length})`);

      const factual = assessments.filter((a) => a.is_factual === true);
      const nonFactual = assessments.filter((a) => a.is_factual === false);

      assert.ok(factual.length >= 1, "should have at least 1 factual item");
      assert.ok(nonFactual.length >= 1, "should have at least 1 non-factual item");

      for (const item of assessments) {
        assert.ok(typeof item.text === "string", "should have text");
        assert.ok(typeof item.is_factual === "boolean", "should have is_factual boolean");
        assert.ok(Array.isArray(item.errors), "should have errors array");
        assert.ok(Array.isArray(item.corrections), "should have corrections array");
      }

      for (const item of nonFactual) {
        assert.ok(item.errors.length >= 1, "non-factual items should have errors");
        assert.ok(item.corrections.length >= 1, "non-factual items should have corrections");
      }
    });

    it("returns empty array for empty input", () => {
      assert.deepEqual(generateFactualityAssessments("", ""), []);
    });
  });

  describe("exportAsJsonl", () => {
    it("writes valid JSON lines", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "training-test-"));
      const outPath = path.join(tmpDir, "test-output.jsonl");

      const records = [
        { question: "What is PMID: 30232222?", answer: "A study on myocarditis", citations: ["PMID:30232222"] },
        { question: "What is NCT03299946?", answer: "An ICI safety trial", citations: ["NCT:NCT03299946"] }
      ];

      exportAsJsonl(records, outPath);

      assert.ok(fs.existsSync(outPath), "output file should exist");
      const lines = fs.readFileSync(outPath, "utf8").trim().split("\n");

      // First line is metadata
      const meta = JSON.parse(lines[0]);
      assert.equal(meta.generator, "openclaw-training-data");
      assert.equal(meta.record_count, 2);

      // Remaining lines are records
      for (let i = 1; i < lines.length; i++) {
        const parsed = JSON.parse(lines[i]);
        assert.ok(parsed.question, `line ${i + 1} should have question`);
      }

      // Cleanup
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });
  });
});
