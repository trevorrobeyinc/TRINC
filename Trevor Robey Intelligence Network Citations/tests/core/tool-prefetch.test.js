"use strict";

const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { createToolPrefetch } = require("../../openclaw-bridge/core/tool-prefetch.js");

const ROOT_DIR = path.resolve(__dirname, "..", "..");

// `whenExhausted` is what every call past the end of `responses` gets. Without it the queue
// silently falls through to a SUCCESS payload, which couples a test to the exact number of
// prefetch entries the role happens to have: adding a source to tool-prefetch-map.json then
// turns an "everything fails" test into a partial-success one. Pass an Error to model a
// ToolUniverse outage regardless of how many calls the role makes.
function createMockToolUniverseMcp(responses = [], { whenExhausted } = {}) {
  const calls = [];
  return {
    calls,
    execute: async (input) => {
      calls.push(input);
      const response = responses.length ? responses.shift() : whenExhausted;
      if (response instanceof Error) throw response;
      return response !== undefined ? response : [
        { tool_name: "mock_tool", description: "A mock tool result", category: "test" }
      ];
    }
  };
}

function createTestLogger() {
  const logs = { info: [], warn: [], error: [] };
  return {
    logs,
    info(entry) { logs.info.push(entry); },
    warn(entry) { logs.warn.push(entry); },
    error(entry) { logs.error.push(entry); }
  };
}

describe("tool-prefetch", () => {
  let logger;

  beforeEach(() => {
    logger = createTestLogger();
  });

  describe("prefetchForRole", () => {
    it("returns array of inputDoc objects with correct structure", async () => {
      const mcp = createMockToolUniverseMcp();
      const prefetch = createToolPrefetch({ toolUniverseMcp: mcp, logger, rootDir: ROOT_DIR });
      const docs = await prefetch.prefetchForRole("safety_signal_detector", {
        indication: "glioblastoma",
        compound_name: "temozolomide"
      });

      assert.ok(Array.isArray(docs), "should return an array");
      assert.ok(docs.length > 0, "should have at least one doc");

      for (const doc of docs) {
        assert.ok(typeof doc.path === "string", "doc.path should be a string");
        assert.ok(doc.path.startsWith("tooluniverse://"), "doc.path should start with tooluniverse://");
        assert.ok(typeof doc.rel === "string", "doc.rel should be a string");
        assert.ok(doc.rel.startsWith("live-data/"), "doc.rel should start with live-data/");
        assert.ok(typeof doc.content === "string", "doc.content should be a string");
        assert.ok(doc.content.includes("Live Data:"), "doc.content should include Live Data header");
        assert.ok(doc.content.includes("Retrieved:"), "doc.content should include Retrieved timestamp");
        assert.ok(doc.content.includes("Source: ToolUniverse SMCP"), "doc.content should include source");
      }
    });

    it("captures per-search coverage (returned / empty / failed) for the Search-Coverage Ledger (Q5)", async () => {
      // Drive the first three executed searches to distinct outcomes; the rest fall back to the
      // mock default (1 record → returned). Skips (empty args) don't consume the response queue.
      const mcp = createMockToolUniverseMcp([
        [{ id: "a" }, { id: "b" }],  // 2 records -> "returned"
        [],                          // 0 records -> "empty" (the honest-zero)
        new Error("upstream 503")    // throws     -> "failed"
      ]);
      const prefetch = createToolPrefetch({ toolUniverseMcp: mcp, logger, rootDir: ROOT_DIR });
      const docs = await prefetch.prefetchForRole("scout", {
        topic: "glioblastoma", compound_name: "temozolomide",
        indication: "glioblastoma", therapeutic_area: "oncology"
      });

      assert.ok(Array.isArray(docs.coverage), "docs.coverage should be an array");
      assert.ok(docs.coverage.length >= 3, "should record every attempted search");
      const valid = new Set(["returned", "empty", "failed", "skipped"]);
      for (const c of docs.coverage) {
        assert.ok(valid.has(c.status), `status '${c.status}' should be valid`);
        assert.ok(Number.isInteger(c.records) && c.records >= 0, "records is a non-negative integer");
        assert.ok(typeof c.source === "string" && c.source.length > 0, "each search is source-labeled");
      }
      assert.ok(docs.coverage.some((c) => c.status === "returned" && c.records === 2), "2-record search -> returned");
      assert.ok(docs.coverage.some((c) => c.status === "empty" && c.records === 0), "empty search -> recorded honest-zero");
      assert.ok(docs.coverage.some((c) => c.status === "failed"), "throwing search -> recorded as failed");
    });

    it("returns empty array for unknown role", async () => {
      const mcp = createMockToolUniverseMcp();
      const prefetch = createToolPrefetch({ toolUniverseMcp: mcp, logger, rootDir: ROOT_DIR });
      const docs = await prefetch.prefetchForRole("nonexistent_role", { compound_name: "aspirin" });

      assert.ok(Array.isArray(docs), "should return an array");
      assert.equal(docs.length, 0, "should have no docs for unknown role");
      assert.equal(mcp.calls.length, 0, "should not call ToolUniverse for unknown role");
    });

    it("substitutes template variables correctly", async () => {
      const mcp = createMockToolUniverseMcp();
      const prefetch = createToolPrefetch({ toolUniverseMcp: mcp, logger, rootDir: ROOT_DIR });
      await prefetch.prefetchForRole("molecular_profiler", {
        compound_name: "temozolomide",
        indication: "glioblastoma multiforme"
      });

      assert.ok(mcp.calls.length >= 1, "should have called ToolUniverse");
      const firstCall = mcp.calls[0];
      assert.ok(firstCall.query.includes("temozolomide"), "query should contain substituted compound_name");
      assert.ok(!firstCall.query.includes("{{compound_name}}"), "query should not contain raw template");
    });

    it("returns empty array on ToolUniverse failure (graceful degradation)", async () => {
      // Every call fails, however many entries the role has — that is what "ToolUniverse is
      // down" means, and it keeps this test from weakening when a source is added to the role.
      const mcp = createMockToolUniverseMcp([], { whenExhausted: new Error("SMCP process crashed") });
      const prefetch = createToolPrefetch({ toolUniverseMcp: mcp, logger, rootDir: ROOT_DIR });
      const docs = await prefetch.prefetchForRole("safety_signal_detector", {
        indication: "pain",
        compound_name: "aspirin"
      });

      assert.ok(Array.isArray(docs), "should return an array");
      assert.equal(docs.length, 0, "should return empty array on failure");

      const warnings = logger.logs.warn.filter((w) => w.event === "tool_prefetch_call_failed");
      assert.ok(warnings.length > 0, "should log warnings for failed calls");
    });

    it("returns cached result without second ToolUniverse call", async () => {
      const mcp = createMockToolUniverseMcp();
      const prefetch = createToolPrefetch({ toolUniverseMcp: mcp, logger, rootDir: ROOT_DIR });
      const inputs = { compound_name: "aspirin", indication: "pain" };

      const first = await prefetch.prefetchForRole("molecular_profiler", inputs);
      const callCountAfterFirst = mcp.calls.length;

      const second = await prefetch.prefetchForRole("molecular_profiler", inputs);
      assert.equal(mcp.calls.length, callCountAfterFirst, "should not call ToolUniverse again on cache hit");
      assert.deepEqual(first, second, "cached result should equal first result");
    });

    it("findTool entries with empty workflowInputs still produce docs", async () => {
      const mcp = createMockToolUniverseMcp();
      const prefetch = createToolPrefetch({ toolUniverseMcp: mcp, logger, rootDir: ROOT_DIR });
      const docs = await prefetch.prefetchForRole("molecular_profiler", {});

      assert.ok(Array.isArray(docs), "should return an array");
      assert.ok(docs.length > 0, "findTool entries should still produce docs with empty inputs");
      assert.ok(mcp.calls.length > 0, "should still call ToolUniverse");

      const firstQuery = mcp.calls[0].query;
      assert.ok(!firstQuery.includes("{{"), "templates should be resolved (no {{ remaining)");
    });

    it("executeTool entries with all-empty arguments are skipped", async () => {
      const mcp = createMockToolUniverseMcp();
      const prefetch = createToolPrefetch({ toolUniverseMcp: mcp, logger, rootDir: ROOT_DIR });
      const docs = await prefetch.prefetchForRole("scout", {});

      assert.ok(Array.isArray(docs), "should return an array");
      assert.equal(docs.length, 0, "executeTool entries with empty required args must be skipped");
      assert.equal(mcp.calls.length, 0, "guard prevents ToolUniverse calls with empty args");
    });

    it("returns empty array when no MCP is provided", async () => {
      const prefetch = createToolPrefetch({ toolUniverseMcp: null, logger, rootDir: ROOT_DIR });
      const docs = await prefetch.prefetchForRole("safety_signal_detector", { indication: "pain" });

      assert.ok(Array.isArray(docs), "should return an array");
      assert.equal(docs.length, 0, "should return empty without MCP");
    });

    it("returns empty array for empty role name", async () => {
      const mcp = createMockToolUniverseMcp();
      const prefetch = createToolPrefetch({ toolUniverseMcp: mcp, logger, rootDir: ROOT_DIR });
      const docs = await prefetch.prefetchForRole("", {});

      assert.equal(docs.length, 0, "should return empty for empty role");
    });

    it("rate limits calls with >= 500ms gap between sequential calls", async () => {
      const timestamps = [];
      const mcp = {
        execute: async (input) => {
          timestamps.push(Date.now());
          return [{ tool_name: "mock", description: "mock" }];
        }
      };
      const prefetch = createToolPrefetch({ toolUniverseMcp: mcp, logger, rootDir: ROOT_DIR });
      await prefetch.prefetchForRole("safety_signal_detector", {
        indication: "pain",
        compound_name: "aspirin"
      });

      if (timestamps.length >= 2) {
        for (let i = 1; i < timestamps.length; i++) {
          const gap = timestamps[i] - timestamps[i - 1];
          assert.ok(gap >= 450, `gap between calls ${i - 1} and ${i} should be >= 450ms (was ${gap}ms)`);
        }
      }
    });
  });

  describe("clearCache", () => {
    it("clears cached results so next call re-queries ToolUniverse", async () => {
      const mcp = createMockToolUniverseMcp();
      const prefetch = createToolPrefetch({ toolUniverseMcp: mcp, logger, rootDir: ROOT_DIR });
      const inputs = { compound_name: "aspirin" };

      await prefetch.prefetchForRole("molecular_profiler", inputs);
      const callsAfterFirst = mcp.calls.length;

      prefetch.clearCache();
      await prefetch.prefetchForRole("molecular_profiler", inputs);
      assert.ok(mcp.calls.length > callsAfterFirst, "should re-query after cache clear");
    });
  });
});
