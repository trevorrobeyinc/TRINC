"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const datarade = require("../../openclaw-bridge/distribution/datarade-format-adapter.js");
const kaggle = require("../../openclaw-bridge/distribution/kaggle-format-adapter.js");
const huggingface = require("../../openclaw-bridge/distribution/huggingface-format-adapter.js");
const aws = require("../../openclaw-bridge/distribution/aws-data-exchange-format-adapter.js");
const dataAndSons = require("../../openclaw-bridge/distribution/data-and-sons-format-adapter.js");

const SAMPLE_OUTPUT = {
  workflowId: "workflow-test-001",
  templateId: "pharmacovigilance-report",
  outputDir: "/tmp/test",
  report: [
    "## Executive Summary",
    "",
    "Immune checkpoint inhibitors (ICIs) including nivolumab (DrugBank: DB09035) and pembrolizumab have transformed oncology treatment.",
    "However, they carry significant adverse event risks including myocarditis (PMID: 30232222) and hepatitis.",
    "",
    "## Safety Signal Analysis",
    "",
    "The FDA Adverse Event Reporting System (FAERS) shows 2,847 cardiac adverse events associated with ICIs.",
    "Nivolumab-associated myocarditis carries a 25-50% fatality rate (PMID: 29566243).",
    "Clinical trial NCT03299946 evaluated combination ICI therapy safety profiles.",
    "PubChem CID: 2244 (aspirin) was studied as a prophylactic co-medication.",
    "",
    "## Target Validation",
    "",
    "PD-1 (UniProt: Q15116) remains the primary target for checkpoint inhibition.",
    "ChEMBL compound CHEMBL3137343 shows selective binding to PD-L1.",
    "The interaction between PD-1 and PD-L1 (doi: 10.1038/nature12345) is well-characterized."
  ].join("\n"),
  citations: [
    "type,id,context",
    "PMID,30232222,ICI myocarditis",
    "PMID,29566243,nivolumab myocarditis fatality",
    "NCT,NCT03299946,combination ICI safety",
    "DrugBank,DB09035,nivolumab",
    "PubChem CID,2244,aspirin prophylactic",
    "UniProt,Q15116,PD-1",
    "ChEMBL,CHEMBL3137343,PD-L1 binding"
  ].join("\n"),
  citationCount: 7,
  qualityScore: 0.95,
  metadata: { status: "completed" }
};

const adapters = [
  { name: "datarade", mod: datarade },
  { name: "kaggle", mod: kaggle },
  { name: "huggingface", mod: huggingface },
  { name: "aws-data-exchange", mod: aws },
  { name: "data-and-sons", mod: dataAndSons }
];

describe("format adapters", () => {
  for (const { name, mod } of adapters) {
    describe(name, () => {
      it("exports formatId and transform function", () => {
        assert.ok(typeof mod.formatId === "string", "should export formatId");
        assert.ok(typeof mod.transform === "function", "should export transform");
      });

      it("produces { files: [...], metadata: {...} }", () => {
        const result = mod.transform(SAMPLE_OUTPUT);
        assert.ok(Array.isArray(result.files), "files should be an array");
        assert.ok(result.files.length > 0, "files should not be empty");
        assert.ok(typeof result.metadata === "object", "metadata should be an object");
        assert.ok(result.metadata.platform, "metadata.platform should exist");

        for (const file of result.files) {
          assert.ok(typeof file.name === "string", `file.name should be a string`);
          assert.ok(typeof file.content === "string", `file.content should be a string`);
          assert.ok(file.content.length > 0, `file '${file.name}' should not be empty`);
        }
      });

      it("handles missing optional fields gracefully", () => {
        const minimal = {
          workflowId: "test-min",
          templateId: "test",
          outputDir: "/tmp",
          report: "",
          citations: "",
          citationCount: 0,
          qualityScore: null,
          metadata: {}
        };
        const result = mod.transform(minimal);
        assert.ok(Array.isArray(result.files), "should produce files from minimal input");
      });
    });
  }

  describe("kaggle adapter", () => {
    it("produces dataset-metadata.json with required fields", () => {
      const result = kaggle.transform(SAMPLE_OUTPUT);
      const metaFile = result.files.find((f) => f.name === "dataset-metadata.json");
      assert.ok(metaFile, "should have dataset-metadata.json");

      const meta = JSON.parse(metaFile.content);
      assert.ok(meta.title, "should have title");
      assert.ok(meta.description, "should have description");
      assert.ok(Array.isArray(meta.licenses), "should have licenses array");
      assert.ok(Array.isArray(meta.keywords), "should have keywords array");
    });

    it("includes watermark in README", () => {
      const result = kaggle.transform(SAMPLE_OUTPUT);
      const readme = result.files.find((f) => f.name === "README.md");
      assert.ok(readme, "should have README.md");
      assert.ok(readme.content.includes("trevorrobeyinc.github.io"), "README should include watermark URL");
    });
  });

  describe("huggingface adapter", () => {
    it("produces README with YAML front matter", () => {
      const result = huggingface.transform(SAMPLE_OUTPUT);
      const readme = result.files.find((f) => f.name === "README.md");
      assert.ok(readme, "should have README.md");
      assert.ok(readme.content.startsWith("---"), "README should start with YAML front matter");
      assert.ok(readme.content.includes("license: cc-by-nc-4.0"), "should include license");
      assert.ok(readme.content.includes("task_categories:"), "should include task categories");
    });

    it("includes watermark in README", () => {
      const result = huggingface.transform(SAMPLE_OUTPUT);
      const readme = result.files.find((f) => f.name === "README.md");
      assert.ok(readme.content.includes("trevorrobeyinc.github.io"), "README should include watermark URL");
    });
  });

  describe("free-tier adapters include watermark", () => {
    for (const name of ["kaggle", "huggingface"]) {
      it(`${name} output includes trevorrobeyinc.github.io`, () => {
        const mod = name === "kaggle" ? kaggle : huggingface;
        const result = mod.transform(SAMPLE_OUTPUT);
        const allContent = result.files.map((f) => f.content).join("\n");
        assert.ok(allContent.includes("trevorrobeyinc.github.io"), `${name} should include watermark`);
      });
    }
  });
});
