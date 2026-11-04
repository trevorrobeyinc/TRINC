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

  // 2026-11-04: run #6 (workflow-6cc2f82c) showed the competitive_intel_analyst only titles for the
  // design-benchmark cohort, so it inferred sponsors from drug names and contradicted the run's own
  // design-benchmark.csv. These pin that the registry fields reach the prompt, that a missing field
  // is simply absent (never guessed), and that records from every other source render unchanged.
  describe("registry design fields (Trial Design Benchmark cohort)", () => {
    const DESIGN_RECORD = {
      title: "Synthetic design-benchmark trial",
      nctId: "NCT00000001",
      status: "RECRUITING",
      phase: "PHASE3",
      sponsor: "National Cancer Institute (NCI)",
      sponsorClass: "NIH",
      allocation: "RANDOMIZED",
      interventionModel: "PARALLEL",
      primaryPurpose: "TREATMENT",
      masking: "NONE",
      enrollmentCount: 1210,
      enrollmentType: "ESTIMATED",
      armCount: 2,
      interventions: [{ type: "DRUG", name: "Example drug" }],
      primaryOutcomes: [{ measure: "Disease-free survival", timeFrame: "Up to 5 years" }],
      startDate: "2026-03",
      startDateType: "ESTIMATED",
      primaryCompletionDate: "2031-12",
      primaryCompletionDateType: "ESTIMATED"
    };
    const STOPPED_RECORD = {
      title: "Synthetic stopped trial",
      nctId: "NCT00000002",
      status: "TERMINATED",
      phase: "PHASE3",
      whyStopped: "slow accrual"
    };
    const NOTE = "_Registry fields below come from ClinicalTrials.gov, lightly normalized";

    // The real fetcher attaches the denominator, rule and sort as non-enumerable properties.
    function asCohort(records, eligibleTotal) {
      const { SELECTION_RULE, COHORT_SORT } = require("../../openclaw-bridge/mcp/ctgov-supplemental/ctgov-design-benchmark.js");
      const arr = records.slice();
      Object.defineProperty(arr, "eligibleTotal", { value: eligibleTotal, enumerable: false });
      Object.defineProperty(arr, "selectionRule", { value: SELECTION_RULE, enumerable: false });
      Object.defineProperty(arr, "sort", { value: COHORT_SORT, enumerable: false });
      return arr;
    }

    it("shows the competitive_intel_analyst N of M and every design field the cohort fetcher returned", async () => {
      const { SELECTION_RULE } = require("../../openclaw-bridge/mcp/ctgov-supplemental/ctgov-design-benchmark.js");
      const prefetch = createToolPrefetch({
        toolUniverseMcp: createMockToolUniverseMcp([], { whenExhausted: [] }),
        logger,
        rootDir: ROOT_DIR,
        localFetchers: {
          ctgov_design_benchmark: async () => asCohort([DESIGN_RECORD], 675),
          ctgov_stopped_trials: async () => [STOPPED_RECORD]
        }
      });
      const docs = await prefetch.prefetchForRole("competitive_intel_analyst", {
        indication: "non-small cell lung cancer"
      });

      const bench = docs.find((d) => d.content.includes("## Live Data: ctgov_design_benchmark"));
      assert.ok(bench, "the analyst's prefetch must include the design-benchmark cohort");
      assert.ok(bench.content.includes(
        `_Cohort: 1 of 675 eligible registered programs (a count of ClinicalTrials.gov records, not a patient population). Selection rule: ${SELECTION_RULE} Sort: StartDate:desc._\n\n`
      ), `the cohort denominator must reach the prompt (run #6 wrote "20 of 20"); got:\n${bench.content}`);
      assert.ok(bench.content.includes(NOTE), "the design-benchmark result carries the do-not-infer note");
      assert.ok(bench.content.includes('call it "not retrieved", never "not reported"'), "the note separates not-requested from not-reported");
      assert.ok(bench.content.includes(
        "### Synthetic design-benchmark trial\n" +
        "*Phase PHASE3 · RECRUITING*\n" +
        "**Lead sponsor:** National Cancer Institute (NCI) (class: NIH)\n" +
        "**Design:** allocation RANDOMIZED · intervention model PARALLEL · masking NONE · primary purpose TREATMENT · 2 arm groups\n" +
        "**Enrollment:** 1210 (ESTIMATED)\n" +
        "**Interventions:** DRUG: Example drug\n" +
        "**Primary outcome:** Disease-free survival [time frame: Up to 5 years]\n" +
        "**Dates:** start 2026-03 (ESTIMATED) · primary completion 2031-12 (ESTIMATED)\n" +
        "NCT: NCT00000001\n\n"
      ), `design record should render every field it carries; got:\n${bench.content}`);

      const stopped = docs.find((d) => d.content.includes("## Live Data: ctgov_stopped_trials"));
      assert.ok(stopped, "the analyst's prefetch must include the stopped-trial records");
      assert.ok(stopped.content.includes(
        "### Synthetic stopped trial\n*Phase PHASE3 · TERMINATED*\n**Stopped:** slow accrual\nNCT: NCT00000002\n\n"
      ), `a record without design fields renders exactly as before; got:\n${stopped.content}`);
      assert.ok(!stopped.content.includes(NOTE), "no note outside the design-benchmark source");
      assert.ok(!stopped.content.includes("_Cohort:"), "no cohort line outside the design-benchmark source");
    });

    it("prints only what is present, caps long lists, and ties the note to the design-benchmark tool", async () => {
      const fs = require("node:fs");
      const os = require("node:os");
      const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tool-prefetch-design-"));
      try {
        fs.mkdirSync(path.join(tmpRoot, "config"));
        fs.writeFileSync(path.join(tmpRoot, "config", "tool-prefetch-map.json"), JSON.stringify({
          role_mappings: {
            fixture_role: [
              { action: "executeTool", tool_name: "ctgov_design_benchmark", arguments: { condition: "{{indication}}" } },
              { action: "executeTool", tool_name: "fixture_other_registry", arguments: { condition: "{{indication}}" } },
              { action: "executeTool", tool_name: "fixture_literature", arguments: { query: "{{indication}}" } }
            ]
          }
        }));
        const longFrame = "x".repeat(400);
        const prefetch = createToolPrefetch({
          toolUniverseMcp: createMockToolUniverseMcp([], { whenExhausted: [] }),
          logger,
          rootDir: tmpRoot,
          localFetchers: {
            // No eligibleTotal on this array: no cohort line may be invented.
            ctgov_design_benchmark: async () => [{
              title: "Withdrawn fixture trial",
              nctId: "NCT00000003",
              sponsor: "Example University",
              enrollmentCount: 0,
              enrollmentType: "ACTUAL",
              armCount: 1,
              interventions: Array.from({ length: 8 }, (_, i) => ({ type: "DRUG", name: `Agent ${i + 1}` })),
              primaryOutcomes: [
                { measure: "  " },
                { measure: "Overall survival", timeFrame: longFrame },
                "not-an-object",
                { measure: "Progression-free survival" },
                { measure: "Objective response rate" },
                { measure: "Duration of response" }
              ]
            }],
            fixture_other_registry: async () => [{ title: "Other source row", sponsor: "Some Sponsor", startDate: "2020-01" }],
            fixture_literature: async () => [{ title: "A paper", pmid: "12345678", abstract: "Abstract text." }]
          }
        });
        const docs = await prefetch.prefetchForRole("fixture_role", { indication: "fixture disease" });

        const bench = docs.find((d) => d.content.includes("## Live Data: ctgov_design_benchmark"));
        assert.ok(bench.content.includes(NOTE));
        assert.ok(!bench.content.includes("_Cohort:"), "no cohort line without a fetcher-supplied denominator");
        assert.ok(bench.content.includes("**Lead sponsor:** Example University\n"), "no class suffix when the class is absent");
        assert.ok(bench.content.includes("**Design:** 1 arm group\n"), "singular arm group; absent design fields omitted");
        assert.ok(bench.content.includes("**Enrollment:** 0 (ACTUAL)\n"), "a reported enrollment of 0 is printed");
        assert.ok(bench.content.includes(
          "**Interventions:** DRUG: Agent 1; DRUG: Agent 2; DRUG: Agent 3; DRUG: Agent 4; DRUG: Agent 5; DRUG: Agent 6 (+2 more)\n"
        ), "interventions capped at six with a count of the rest");
        const outcomesLine = bench.content.split("\n").find((l) => l.startsWith("**Primary outcomes:**"));
        assert.ok(outcomesLine, "plural label for several outcomes");
        assert.ok(outcomesLine.includes("Overall survival [time frame: "), "outcome with its time frame");
        assert.ok(outcomesLine.includes("…]"), "an over-long time frame is clipped with an ellipsis");
        assert.ok(!outcomesLine.includes(longFrame), "the full 400-character time frame is not printed");
        assert.ok(outcomesLine.endsWith("(+1 more primary outcome not shown)"), "three shown, the rest counted; blanks and non-objects dropped");
        assert.ok(!outcomesLine.includes("Duration of response"), "the fourth valid outcome is left out");
        assert.ok(!bench.content.includes("**Dates:**"), "no dates line when no date was returned");

        const other = docs.find((d) => d.content.includes("## Live Data: fixture_other_registry"));
        assert.ok(other.content.includes("**Lead sponsor:** Some Sponsor\n"), "per-record fields render for any source");
        assert.ok(other.content.includes("**Dates:** start 2020-01\n"), "an untyped date prints bare");
        assert.ok(!other.content.includes(NOTE), "the ClinicalTrials.gov note never attaches to another source");

        const literature = docs.find((d) => d.content.includes("## Live Data: fixture_literature"));
        assert.ok(literature.content.includes("### A paper\nAbstract text.\nPMID: 12345678\n\n"), "literature renders unchanged");
        assert.ok(!literature.content.includes(NOTE));
        assert.ok(!literature.content.includes("**Lead sponsor:**"));
      } finally {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
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
