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
    "Immune checkpoint inhibitors (ICIs) including nivolumab and pembrolizumab have transformed oncology treatment.",
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
  // Since T1-2 the citation index is the sealed release's own tables.csv (scripts/distribute.js).
  citations: [
    "citation_type,identifier,source_task,context_snippet,grounded_in_run",
    "PMID,30232222,scout,ICI myocarditis,yes",
    "PMID,29566243,analyst,\"nivolumab myocarditis, fatality\",yes",
    "NCT,NCT03299946,analyst,combination ICI safety,yes",
    "PubChem CID,2244,analyst,aspirin prophylactic,no",
    "UniProt,Q15116,analyst,PD-1,yes",
    "ChEMBL,CHEMBL3137343,analyst,PD-L1 binding,yes"
  ].join("\n"),
  citationCount: 6,
  qualityScore: 0.95,
  offerId: "offer-test-001",
  metadata: { workflow_id: "workflow-test-001", template_id: "pharmacovigilance-report", offer_id: "offer-test-001" }
};

// The shape of a sealed report.md (deliverable-packager.js renderResearchReport): a title block, a
// Table of Contents, anchored sections with "*Task: …*" lines, the engine's verification list and a
// closing Citation Summary.
const PACKAGED_REPORT = [
  "# Packaged Pack", "", "**Product Line**: research packs", "", "---", "",
  "## Table of Contents", "", "1. [Literature Review](#section-1)", "2. [Citation Summary](#citation-summary)", "", "---", "",
  "<a id=\"section-1\"></a>", "## 1. Literature Review", "", "*Task: scout*", "",
  "Checkpoint inhibitors raise the risk of myocarditis in a minority of treated patients (PMID: 30232222).",
  "", "## ⚠️ Citation Verification", "",
  "The following cited identifiers were NOT found in the evidence fetched at runtime and are flagged **UNVERIFIED**. Per the zero-fabrication policy, treat each as unconfirmed.",
  "", "- PubChem CID: 2244", "", "---", "",
  "<a id=\"citation-summary\"></a>", "## 2. Citation Summary", "", "Total cited identifiers: **2**", "",
  "- **PMID** (1): 30232222, a long enough line to count as a finding body in the old extractor", ""
].join("\n");

describe("format adapters — the sealed release's files (Tier 1 review, 2026-11-14)", () => {
  const COLUMNS = ["citation_type", "identifier", "source_task", "context_snippet", "grounded_in_run"];

  it("Kaggle, Data & Sons and AWS document the real tables.csv columns, grounded_in_run included", () => {
    const readme = kaggle.transform(SAMPLE_OUTPUT).files.find((f) => f.name === "README.md").content;
    const dictionary = dataAndSons.transform(SAMPLE_OUTPUT).files.find((f) => f.name === "data-dictionary.md").content;
    for (const col of COLUMNS) {
      assert.match(readme, new RegExp(`\\| ${col} \\|`), `the Kaggle README documents ${col}`);
      assert.match(dictionary, new RegExp(`\\| ${col} \\|`), `the data dictionary documents ${col}`);
    }
    assert.doesNotMatch(readme, /\| type \| Identifier type/);
    const schema = JSON.parse(aws.transform(SAMPLE_OUTPUT).files.find((f) => f.name === "schema.json").content);
    assert.equal(schema.properties.citations.type, "string", "the data file holds the CSV text");
    for (const col of COLUMNS) assert.match(schema.properties.citations.description, new RegExp(col));
  });

  it("AWS research-output.json carries only the ids, never the unsealed workflow.json", () => {
    const leaky = { ...SAMPLE_OUTPUT, metadata: { workflow_id: "workflow-test-001", outputDir: "/Users/someone/workspace/x", inputs: { compound_name: "secret" } } };
    const data = JSON.parse(aws.transform(leaky).files.find((f) => f.name === "data/research-output.json").content);
    assert.deepEqual(data.metadata, { workflow_id: "workflow-test-001", template_id: "pharmacovigilance-report", offer_id: "offer-test-001" });
  });

  it("Kaggle findings and Hugging Face samples come from the research sections only", () => {
    const packaged = { ...SAMPLE_OUTPUT, report: PACKAGED_REPORT };
    const findings = kaggle.transform(packaged).files.find((f) => f.name === "findings.jsonl").content
      .split("\n").filter(Boolean).map((l) => JSON.parse(l).section);
    assert.deepEqual(findings, ["1. Literature Review"]);
    const samples = huggingface.transform(packaged).files.find((f) => f.name === "data/train.jsonl").content;
    assert.doesNotMatch(samples, /Table of Contents|Citation Summary|following cited identifiers were NOT found/);
    assert.match(samples, /myocarditis in a minority of treated patients/);
  });

  it("Datarade counts citation rows without the header, and marks the premium-only files", () => {
    const listing = datarade.transform({ ...SAMPLE_OUTPUT, citationCount: undefined });
    assert.equal(JSON.parse(listing.files.find((f) => f.name === "listing-fields.json").content).citation_count, 6);
    const description = listing.files.find((f) => f.name === "product-description.md").content;
    assert.match(description, /\*\*Methodology Statement\*\* \(premium and enterprise tiers\)/);
    assert.match(description, /\*\*Schema Definition\*\* \(premium and enterprise tiers\)/);
  });
});

const adapters = [
  { name: "datarade", mod: datarade },
  { name: "kaggle", mod: kaggle },
  { name: "huggingface", mod: huggingface },
  { name: "aws-data-exchange", mod: aws },
  { name: "data-and-sons", mod: dataAndSons }
];

// T1-9 (2026-11-14): nothing a marketplace file says about the product may be false.
const BANNED = [
  /every claim/i,
  /every factual claim/i,
  /chain-hash/i,
  /S3 bucket/i,
  /provenance chain/i,
  /verified database identifiers/i,
  /\d+\+? verified identifiers/i,
  /deterministic (?:multi|\d)-agent/i,
  /cross-validat/i,
  /API \/ Download/
];

describe("format adapters — no false self-description (T1-9)", () => {
  for (const { name, mod } of adapters) {
    it(`${name} output carries none of the retired claims`, () => {
      const result = mod.transform(SAMPLE_OUTPUT);
      for (const file of result.files) {
        for (const re of BANNED) assert.doesNotMatch(String(file.content), re, `${name}/${file.name} carries ${re}`);
      }
    });
  }
});

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
      assert.ok(readme.content.includes("trevorobeyinc.com"), "README should include watermark URL");
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
      assert.ok(readme.content.includes("trevorobeyinc.com"), "README should include watermark URL");
    });
  });

  describe("free-tier adapters include watermark", () => {
    for (const name of ["kaggle", "huggingface"]) {
      it(`${name} output includes trevorobeyinc.com`, () => {
        const mod = name === "kaggle" ? kaggle : huggingface;
        const result = mod.transform(SAMPLE_OUTPUT);
        const allContent = result.files.map((f) => f.content).join("\n");
        assert.ok(allContent.includes("trevorobeyinc.com"), `${name} should include watermark`);
      });
    }
  });
});
