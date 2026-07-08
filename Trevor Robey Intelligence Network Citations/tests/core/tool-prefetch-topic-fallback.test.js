"use strict";

// Operator-authorized live-query fix (2026-06-10): for topic-only workflows the
// prefetch must query the live connectors using the `topic` input instead of
// skipping every call because the drug-specific template vars are empty.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const fs = require("node:fs");
const path = require("node:path");

const { createToolPrefetch } = require("../../openclaw-bridge/core/tool-prefetch.js");

function tmpRootWithMap(roleMappings) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prefetch-topic-"));
  fs.mkdirSync(path.join(dir, "config"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "config", "tool-prefetch-map.json"),
    JSON.stringify({ schema_version: "tool-prefetch-map-v2", role_mappings: roleMappings })
  );
  return dir;
}

function recordingMcp(calls) {
  return { execute: async (input) => { calls.push(input); return { results: [{ title: "stub", pmid: "1" }] }; } };
}

describe("tool-prefetch — topic fallback (operator-authorized live query)", () => {
  it("queries free-text tools with the topic, and still skips drugName-only tools that topic can't fill", async () => {
    const calls = [];
    const rootDir = tmpRootWithMap({
      scout: [
        { action: "executeTool", tool_name: "PubMed_search_articles",
          arguments: { query: "{{compound_name}} {{indication}}", limit: 5 } },
        { action: "executeTool", tool_name: "search_clinical_trials",
          arguments: { query_term: "{{therapeutic_area}} {{indication}}", condition: "{{indication}}", pageSize: 5 } },
        { action: "executeTool", tool_name: "OpenTargets_get_drug_id_description_by_name",
          arguments: { drugName: "{{compound_name}}" } }
      ]
    });
    const prefetch = createToolPrefetch({ toolUniverseMcp: recordingMcp(calls), rootDir });

    await prefetch.prefetchForRole("scout", { topic: "low-dose aspirin cardiovascular prevention" });

    const pubmed = calls.find((c) => c.tool_name === "PubMed_search_articles");
    const trials = calls.find((c) => c.tool_name === "search_clinical_trials");
    assert.ok(pubmed, "PubMed should have been queried using the topic");
    assert.equal(pubmed.arguments.query, "low-dose aspirin cardiovascular prevention");
    assert.ok(trials, "ClinicalTrials should have been queried using the topic");
    assert.equal(trials.arguments.query_term, "low-dose aspirin cardiovascular prevention");
    assert.equal(trials.arguments.condition, undefined, "empty secondary arg should be dropped, not block the call");
    assert.ok(
      !calls.some((c) => c.tool_name === "OpenTargets_get_drug_id_description_by_name"),
      "a drugName-only tool with no topic-derivable arg should still skip gracefully"
    );
    assert.equal(calls.length, 2);
  });

  it("skips when neither topic nor drug vars are present (no junk queries)", async () => {
    const calls = [];
    const rootDir = tmpRootWithMap({
      scout: [
        { action: "executeTool", tool_name: "PubMed_search_articles", arguments: { query: "{{compound_name}}", limit: 5 } }
      ]
    });
    const prefetch = createToolPrefetch({ toolUniverseMcp: recordingMcp(calls), rootDir });

    await prefetch.prefetchForRole("scout", {});
    assert.equal(calls.length, 0);
  });
});
