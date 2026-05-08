"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeInput,
  buildStopwords,
  extractFromToolUniverseJson,
  extractFromPubmedAbstracts,
  extractFromOpenClawReport,
} = require("../lib/biomedical-adapter.js");

describe("Biomedical adapter", () => {
  describe("normalizeInput", () => {
    it("passes text through unchanged", () => {
      assert.equal(normalizeInput("hello world", "text"), "hello world");
    });

    it("extracts from ToolUniverse JSON", () => {
      const data = JSON.stringify({
        description: "Aspirin is a drug",
        mechanism_of_action: "COX inhibition",
      });
      const result = normalizeInput(data, "tooluniverse_json");
      assert.ok(result.includes("Aspirin"));
      assert.ok(result.includes("COX inhibition"));
    });

    it("extracts from PubMed abstracts array", () => {
      const data = JSON.stringify([
        { abstract: "Study of aspirin", title: "Aspirin Study", pmid: "12345" },
      ]);
      const result = normalizeInput(data, "pubmed_abstracts");
      assert.ok(result.includes("Study of aspirin"));
      assert.ok(result.includes("PMID:12345"));
    });

    it("cleans OpenClaw report markdown", () => {
      const report = "# Title\n**Bold text** and [link](url)\n`code` block\n[PMID:99999]";
      const result = normalizeInput(report, "openclaw_report");
      assert.ok(!result.includes("#"));
      assert.ok(!result.includes("**"));
      assert.ok(result.includes("Bold text"));
      assert.ok(result.includes("PMID:99999"));
    });

    it("throws on empty input", () => {
      assert.throws(() => normalizeInput("", "text"));
      assert.throws(() => normalizeInput(null, "text"));
    });

    it("defaults to text type", () => {
      assert.equal(normalizeInput("test", undefined), "test");
    });
  });

  describe("buildStopwords", () => {
    it("biomedical mode includes both sets", () => {
      const sw = buildStopwords("biomedical");
      assert.ok(sw.has("the")); // general
      assert.ok(sw.has("patient")); // biomedical
    });

    it("general mode excludes biomedical terms", () => {
      const sw = buildStopwords("general");
      assert.ok(sw.has("the"));
      assert.ok(!sw.has("patient"));
    });

    it("none mode returns empty set", () => {
      const sw = buildStopwords("none");
      assert.equal(sw.size, 0);
    });
  });

  describe("extractFromToolUniverseJson", () => {
    it("handles nested objects", () => {
      const data = { tools: [{ name: "DrugBank", description: "Drug info" }] };
      const result = extractFromToolUniverseJson(data);
      assert.ok(result.includes("Drug info"));
    });

    it("handles string input", () => {
      const result = extractFromToolUniverseJson('{"name": "test"}');
      assert.ok(result.includes("test"));
    });
  });
});
