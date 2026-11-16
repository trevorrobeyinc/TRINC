"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fsp = require("node:fs/promises");

const { createPhase14Harness, makeTmpDir } = require("./_phase14-helpers.js");
const { createTaskDefinition } = require("../../openclaw-bridge/core/task-definition-schema.js");
const { createAgentEngine } = require("../../openclaw-bridge/core/agent-engine.js");
const { createResearchOutputManager } = require("../../openclaw-bridge/core/research-output-manager.js");

test("phase14 agent engine blocks direct execution without supervisor context", async () => {
  const harness = await createPhase14Harness();
  const task = createTaskDefinition({
    type: "freeform",
    description: "test",
    inputs: [],
    outputFormat: "markdown",
    createdAt: "2026-03-05T00:00:00.000Z"
  });

  await assert.rejects(async () => harness.engine.executeTask(task, {}), (error) => error && error.code === "SUPERVISOR_APPROVAL_REQUIRED");
});

test("phase14 supervisor denial path does not call llm adapter", async () => {
  const harness = await createPhase14Harness();
  const outputDir = await makeTmpDir("openclaw-phase14-output-");
  let llmCalls = 0;

  const engine = createAgentEngine({
    timeProvider: harness.timeProvider,
    config: { maxTokensPerRequest: 512 },
    governanceBridge: {
      requestTaskApproval: async () => ({ approved: true }),
      recordTaskExecution: async () => ({ ok: true }),
      generateRLHFEntry: async () => ({ ok: true, local_mirror_path: "" })
    },
    llmAdapter: {
      complete: async () => {
        llmCalls += 1;
        return { text: "never-called", provider: "mock", model: "mock-v1", tokenCount: 1, durationMs: 1 };
      },
      getProviderInfo: () => ({ provider: "mock", model: "mock-v1" })
    },
    outputManager: createResearchOutputManager({
      timeProvider: harness.timeProvider,
      outputDir
    })
  });

  const task = createTaskDefinition({
    type: "freeform",
    description: "Supervisor denied task",
    inputs: [],
    outputFormat: "markdown",
    createdAt: "2026-03-05T00:00:00.000Z"
  });

  await assert.rejects(
    async () => engine.executeTask(task, { supervisorDecision: { approved: false, decision_id: "sup-deny", reason: "denied" } }),
    (error) => error && error.code === "SUPERVISOR_APPROVAL_REQUIRED"
  );
  assert.equal(llmCalls, 0);
});

// T1-5 (2026-11-14): the retrieved identifiers are persisted as TYPE:ID keys beside the bare ids, from
// the same extraction, so the gate can ground a cited id by type as well as number.
test("phase14 agent engine persists fetched_citation_keys for every retrieved identifier", async () => {
  const harness = await createPhase14Harness();
  const outputDir = await makeTmpDir("openclaw-phase14-keys-");
  const engine = createAgentEngine({
    timeProvider: harness.timeProvider,
    config: { maxTokensPerRequest: 512 },
    governanceBridge: {
      requestTaskApproval: async () => ({ approved: true }),
      recordTaskExecution: async () => ({ ok: true }),
      generateRLHFEntry: async () => ({ ok: true, local_mirror_path: "" })
    },
    llmAdapter: {
      complete: async () => ({ text: "Aspirin is CID: 2244.", provider: "mock", model: "mock-v1", tokenCount: 1, durationMs: 1 }),
      getProviderInfo: () => ({ provider: "mock", model: "mock-v1" })
    },
    outputManager: createResearchOutputManager({ timeProvider: harness.timeProvider, outputDir })
  });
  const docs = [
    { path: "tooluniverse://PubChem", rel: "live-data/PubChem", content: "Aspirin, PubChem CID: 2244. Trial report PMID: 12345678." },
    { path: "vault://prior", rel: "context/prior", context_only: true, content: "Prior note: PMID: 99999999." }
  ];
  Object.defineProperty(docs, "coverage", { value: [], enumerable: false });
  const task = createTaskDefinition({
    type: "freeform", description: "keys", inputs: [], outputFormat: "markdown", createdAt: "2026-03-05T00:00:00.000Z"
  });
  const result = await engine.executeTask(task, {
    supervisorDecision: { approved: true, decision_id: "sup-ok" },
    agentRole: "scout",
    toolPrefetch: { prefetchForRole: async () => docs.slice() }
  });
  assert.equal(result.ok, true);
  const meta = JSON.parse(await fsp.readFile(path.join(path.dirname(result.output_path), "metadata.json"), "utf8"));
  assert.deepEqual(meta.fetched_citation_ids.slice().sort(), ["12345678", "2244"]);
  assert.deepEqual(meta.fetched_citation_keys.slice().sort(), ["PMID:12345678", "PUBCHEM CID:2244"]);
  assert.ok(!meta.fetched_citation_keys.includes("PMID:99999999"), "context-only documents never ground a citation");
});

test("phase14 end-to-end mock execution pipeline works", async () => {
  const harness = await createPhase14Harness();
  const inputDir = await makeTmpDir("openclaw-phase14-input-");
  await fsp.writeFile(path.join(inputDir, "a.txt"), "sample input", "utf8");

  const task = createTaskDefinition({
    type: "summarize",
    description: "Summarize test input",
    inputs: [{ path: inputDir, type: "path" }],
    outputFormat: "markdown",
    createdAt: "2026-03-05T00:00:00.000Z"
  });

  const supervisorDecision = await harness.governanceBridge.requestSupervisorApproval(task, {
    confirm: true,
    operatorId: "operator-test"
  });

  const result = await harness.supervisorAuthority.runApprovedTask(task, {
    confirm: true,
    supervisorDecision,
    operatorId: "operator-test"
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "completed");
  assert.ok(result.output_path.includes(task.task_id));
  assert.equal(harness.interactionLog.getInteractionCount(), 1);
});
