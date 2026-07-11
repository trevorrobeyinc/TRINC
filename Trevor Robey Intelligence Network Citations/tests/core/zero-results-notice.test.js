"use strict";

// Q3/Q6 (hardened after adversarial review): the model is told about missing live evidence ONLY when
// honest — a genuine EMPTY search (query completed, returned nothing) with NO other evidence anywhere.
// It must NOT fire when upstream evidence exists (review finding A), and a FAILED/unreachable query is
// a limitation, never an honest zero (review finding B).

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const os = require("node:os");
const fsp = require("node:fs/promises");

// The engine confines task inputs to allowed roots; OPENCLAW_INPUT_ROOTS *augments* (the default
// cwd root is always kept), so allow this test's tmp upstream files without narrowing anything else.
process.env.OPENCLAW_INPUT_ROOTS = os.tmpdir();

const { createMutableTimeProvider, makeTmpDir } = require("./_phase14-helpers.js");
const { createTaskDefinition } = require("../../openclaw-bridge/core/task-definition-schema.js");
const { createAgentEngine } = require("../../openclaw-bridge/core/agent-engine.js");
const { createResearchOutputManager } = require("../../openclaw-bridge/core/research-output-manager.js");

// A prefetch mock whose returned array carries a (non-enumerable) `coverage` sidecar, like the real one.
function mockPrefetch(docs, coverage) {
  return {
    prefetchForRole: async () => {
      const arr = docs.slice();
      Object.defineProperty(arr, "coverage", { value: coverage || [], enumerable: false });
      return arr;
    }
  };
}

// Drive executeTask with a prompt-capturing llmAdapter; optionally seed UPSTREAM evidence via a task input.
async function runWithPrefetch(prefetch, opts = {}) {
  const timeProvider = createMutableTimeProvider();
  const outputDir = await makeTmpDir("openclaw-zrn-");
  let captured = null;
  const engine = createAgentEngine({
    timeProvider,
    config: { maxTokensPerRequest: 2048 },
    governanceBridge: {
      requestTaskApproval: async () => ({ approved: true }),
      recordTaskExecution: async () => ({ ok: true }),
      generateRLHFEntry: async () => ({ ok: true, local_mirror_path: "" })
    },
    llmAdapter: {
      complete: async (prompt) => {
        captured = prompt;
        return { text: "ok", provider: "mock", model: "mock-v1", tokenCount: 1, durationMs: 1 };
      },
      getProviderInfo: () => ({ provider: "mock", model: "mock-v1" })
    },
    outputManager: createResearchOutputManager({ timeProvider, outputDir })
  });
  const inputs = [];
  if (opts.upstream) {
    const inputDir = await makeTmpDir("openclaw-zrn-in-");
    await fsp.writeFile(path.join(inputDir, "upstream.md"), opts.upstream, "utf8");
    inputs.push({ path: inputDir, type: "path" });
  }
  const task = createTaskDefinition({
    type: "freeform",
    description: "zero-results-notice probe",
    inputs,
    outputFormat: "markdown",
    createdAt: "2026-03-05T00:00:00.000Z"
  });
  const result = await engine.executeTask(task, {
    supervisorDecision: { approved: true, decision_id: "sup-ok" },
    agentRole: "scout",
    toolPrefetch: prefetch
  });
  return { result, prompt: captured };
}

const ZERO_MARK = "returned NO groundable records";                       // honest-zero notice only
const FAIL_MARK = "every live biomedical database query for this task FAILED"; // all-failed limitation only

test("genuine zero-hit (queries completed empty, no other evidence) → honest ZERO-RESULTS notice", async () => {
  const { result, prompt } = await runWithPrefetch(mockPrefetch([], [
    { source: "PubMed", status: "empty", records: 0, query: "q1" },
    { source: "ClinicalTrials.gov", status: "empty", records: 0, query: "q2" }
  ]));
  assert.equal(result.ok, true);
  assert.ok(prompt.includes(ZERO_MARK), "honest-zero notice must be present");
  assert.ok(prompt.includes("2 source queries completed"), "states the queries genuinely completed");
  assert.ok(prompt.includes("Do NOT fabricate database identifiers"), "forbids fabrication");
  assert.ok(!prompt.includes(FAIL_MARK), "must not use failure wording for a genuine empty");
});

test("real evidence fetched → NO notice", async () => {
  const { prompt } = await runWithPrefetch(mockPrefetch(
    [{ path: "tooluniverse://PubMed", rel: "live-data/PubMed", content: "Key finding, see PMID: 12345678." }],
    [{ source: "PubMed", status: "returned", records: 1, query: "q1" }]
  ));
  assert.ok(!prompt.includes(ZERO_MARK), "no honest-zero notice when evidence exists");
  assert.ok(prompt.includes("12345678"), "the fetched evidence is still in the prompt");
});

// Review finding A: an empty own-prefetch must NOT produce a "no evidence" notice when the role runs on
// citation-rich UPSTREAM evidence (e.g. report_generator / quality_auditor final-report steps).
test("A-regression: empty prefetch but UPSTREAM citation present → NO notice", async () => {
  const { prompt } = await runWithPrefetch(
    mockPrefetch([], [{ source: "PubMed", status: "empty", records: 0, query: "q1" }]),
    { upstream: "Prior analysis established PMID: 99999999 as the key signal." }
  );
  assert.ok(prompt.includes("99999999"), "upstream evidence is in the prompt");
  assert.ok(!prompt.includes(ZERO_MARK), "no false honest-zero when upstream evidence exists");
  assert.ok(!prompt.includes(FAIL_MARK), "no false failure notice either");
});

// Review finding B: an all-FAILED prefetch is a limitation, never a 'genuine empty result'.
test("B-fix: all queries FAILED → limitation wording, NOT honest-zero", async () => {
  const { prompt } = await runWithPrefetch(mockPrefetch([], [
    { source: "PubMed", status: "failed", records: 0, query: "q1" },
    { source: "ChEMBL", status: "failed", records: 0, query: "q2" }
  ]));
  assert.ok(prompt.includes(FAIL_MARK), "uses failure/limitation wording");
  assert.ok(prompt.includes("INCONCLUSIVE, not evidence of absence"), "explicitly inconclusive");
  assert.ok(!prompt.includes(ZERO_MARK), "must NOT claim a genuine empty result for failures");
});

test("mixed: 1 empty + 1 failed → honest-zero that discloses the unreachable source", async () => {
  const { prompt } = await runWithPrefetch(mockPrefetch([], [
    { source: "PubMed", status: "empty", records: 0, query: "q1" },
    { source: "ChEMBL", status: "failed", records: 0, query: "q2" }
  ]));
  assert.ok(prompt.includes(ZERO_MARK), "the completed empty search drives an honest-zero");
  assert.ok(prompt.includes("could not be reached and are inconclusive"), "discloses the failed source honestly");
});

test("no live search activity at all → NO notice (never claim 'searched and found nothing')", async () => {
  const { prompt } = await runWithPrefetch(mockPrefetch([], []));
  assert.ok(!prompt.includes(ZERO_MARK), "no honest-zero when nothing was searched");
  assert.ok(!prompt.includes(FAIL_MARK), "no failure notice when nothing was searched");
});
