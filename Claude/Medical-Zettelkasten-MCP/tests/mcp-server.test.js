"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { dispatch } = require("../src/handlers/index.js");
const { TOOLS } = require("../src/tools.js");

const SAMPLE_TEXT = "Aspirin inhibits COX enzymes reducing prostaglandin synthesis and inflammation. Warfarin interacts with aspirin increasing bleeding risk. Metformin activates AMPK pathway for diabetes treatment.";

describe("MCP Server — tool dispatch", () => {
  it("lists 12 tools", () => {
    assert.equal(TOOLS.length, 12);
  });

  it("all tools have name, description, inputSchema", () => {
    for (const tool of TOOLS) {
      assert.ok(tool.name, "Tool missing name");
      assert.ok(tool.description, `${tool.name} missing description`);
      assert.ok(tool.inputSchema, `${tool.name} missing inputSchema`);
      // Memory tools use entities/entity instead of text
      if (!tool.name.startsWith("memory_")) {
        assert.ok(tool.inputSchema.properties.text, `${tool.name} missing text input`);
      }
    }
  });

  it("analyze_network returns graph data", async () => {
    const result = await dispatch("analyze_network", { text: SAMPLE_TEXT });
    assert.ok(!result.isError);
    const data = JSON.parse(result.content[0].text);
    assert.ok(data.graph);
    assert.ok(data.communities);
    assert.ok(data.diversity);
  });

  it("find_gaps returns gaps", async () => {
    const result = await dispatch("find_gaps", { text: SAMPLE_TEXT });
    assert.ok(!result.isError);
    const data = JSON.parse(result.content[0].text);
    assert.ok(Array.isArray(data.gaps));
  });

  it("detect_clusters returns clusters", async () => {
    const result = await dispatch("detect_clusters", { text: SAMPLE_TEXT });
    assert.ok(!result.isError);
    const data = JSON.parse(result.content[0].text);
    assert.ok(Array.isArray(data.clusters));
  });

  it("measure_diversity returns score", async () => {
    const result = await dispatch("measure_diversity", { text: SAMPLE_TEXT });
    assert.ok(!result.isError);
    const data = JSON.parse(result.content[0].text);
    assert.ok(typeof data.score === "number");
  });

  it("cross_domain_connect returns bridges", async () => {
    const result = await dispatch("cross_domain_connect", { text: SAMPLE_TEXT });
    assert.ok(!result.isError);
    const data = JSON.parse(result.content[0].text);
    assert.ok(Array.isArray(data.bridges));
  });

  it("break_echo_chamber returns bias assessment", async () => {
    const result = await dispatch("break_echo_chamber", { text: SAMPLE_TEXT });
    assert.ok(!result.isError);
    const data = JSON.parse(result.content[0].text);
    assert.ok(typeof data.diversity_score === "number");
  });

  it("link_semantically returns relationships", async () => {
    const result = await dispatch("link_semantically", { text: SAMPLE_TEXT });
    assert.ok(!result.isError);
    const data = JSON.parse(result.content[0].text);
    assert.ok(Array.isArray(data.direct_links));
  });

  it("rescue_orphans returns proposals", async () => {
    const result = await dispatch("rescue_orphans", { text: SAMPLE_TEXT });
    assert.ok(!result.isError);
    const data = JSON.parse(result.content[0].text);
    assert.ok(Array.isArray(data.orphan_nodes));
  });

  it("generate_serendipity returns discoveries", async () => {
    const result = await dispatch("generate_serendipity", { text: SAMPLE_TEXT });
    assert.ok(!result.isError);
    const data = JSON.parse(result.content[0].text);
    assert.ok(Array.isArray(data.structural_gaps));
  });

  it("full_zettelkasten_analysis returns all 5 analyses", async () => {
    const result = await dispatch("full_zettelkasten_analysis", { text: SAMPLE_TEXT });
    assert.ok(!result.isError);
    const data = JSON.parse(result.content[0].text);
    assert.ok(data.cross_domain);
    assert.ok(data.echo_chamber);
    assert.ok(data.semantic_links);
    assert.ok(data.orphan_rescue);
    assert.ok(data.serendipity);
    assert.ok(data.graph);
  });

  it("unknown tool returns error", async () => {
    const result = await dispatch("nonexistent_tool", { text: SAMPLE_TEXT });
    assert.ok(result.isError);
  });

  it("empty text returns error", async () => {
    const result = await dispatch("analyze_network", { text: "" });
    assert.ok(result.isError);
  });

  it("handles ToolUniverse JSON input type", async () => {
    const data = JSON.stringify({ description: "Drug info about aspirin and inflammation" });
    const result = await dispatch("analyze_network", { text: data, input_type: "tooluniverse_json" });
    assert.ok(!result.isError);
  });
});
