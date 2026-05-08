"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

const { createMutableTimeProvider, makeTmpDir } = require("./_phase14-helpers.js");
const { createTaskDefinition } = require("../../openclaw-bridge/core/task-definition-schema.js");
const { createAgentEngine } = require("../../openclaw-bridge/core/agent-engine.js");
const { createResearchOutputManager } = require("../../openclaw-bridge/core/research-output-manager.js");

function makeStubAdapter(text) {
  return {
    complete: async () => ({
      text,
      provider: "stub",
      model: "stub-v1",
      tokenCount: 100,
      durationMs: 5
    }),
    getProviderInfo: () => ({ provider: "stub", model: "stub-v1" })
  };
}

const SYNTH_BODY = [
  "## Findings",
  "Psilocybin (PubChem CID: 10624) shows efficacy in treatment-resistant depression.",
  "Trial NCT01234567 evaluated COMP360 (CHEMBL12345).",
  "See PMID: 30232222 and doi: 10.1056/NEJMoa1716078.",
  "## Targets",
  "Receptor UniProt: P28223 (HTR2A)."
].join("\n");

test("synthesizer task — enrichment writes wiki-links and sidecar", async () => {
  const dir = await makeTmpDir("openclaw-enrich-");
  const timeProvider = createMutableTimeProvider();
  const logger = { info() {}, warn() {}, error() {} };
  const outputManager = createResearchOutputManager({
    logger,
    timeProvider,
    outputDir: path.join(dir, "research-output")
  });

  const engine = createAgentEngine({
    logger,
    timeProvider,
    config: { maxTokensPerRequest: 4096 },
    governanceBridge: {
      requestTaskApproval: async () => ({ approved: true }),
      recordTaskExecution: async () => ({ ok: true }),
      generateRLHFEntry: async () => ({ ok: true, local_mirror_path: "" })
    },
    llmAdapter: makeStubAdapter(SYNTH_BODY),
    outputManager
  });

  const task = createTaskDefinition({
    type: "freeform",
    description: "synthesizer-task",
    inputs: [],
    outputFormat: "markdown",
    createdAt: "2026-04-28T00:00:00.000Z",
    task_id: "synthesizer-test-001"
  });

  const result = await engine.executeTask(task, {
    supervisorDecision: { approved: true, decision_id: "sup-ok", reason: "approved" },
    workflowInputs: { compound_name: "psilocybin", indication: "treatment-resistant depression" }
  });

  assert.equal(result.ok, true);

  const output = fs.readFileSync(result.output_path, "utf8");
  assert.match(output, /\[\[CID-10624\|CID: 10624\]\]/);
  assert.match(output, /\[\[NCT01234567\]\]/);
  assert.match(output, /\[\[CHEMBL12345\]\]/);
  assert.match(output, /\[\[PMID-30232222\|PMID: 30232222\]\]/);
  assert.match(output, /\[\[DOI-10\.1056_NEJMoa1716078\|doi: 10\.1056\/NEJMoa1716078\]\]/);
  assert.match(output, /\[\[UniProt-P28223\|UniProt: P28223\]\]/);
  assert.match(output, /\[\[psilocybin\]\]/);
  assert.match(output, /\[\[treatment-resistant-depression\|treatment-resistant depression\]\]/);

  const sidecarPath = path.join(path.dirname(result.output_path), "wiki-links.json");
  assert.ok(fs.existsSync(sidecarPath));
  const sidecar = JSON.parse(fs.readFileSync(sidecarPath, "utf8"));
  assert.equal(sidecar.schema_version, "wiki-links-v1");
  assert.ok(sidecar.links.length >= 7);
});

test("non-synthesizer task — enrichment is skipped, no sidecar", async () => {
  const dir = await makeTmpDir("openclaw-no-enrich-");
  const timeProvider = createMutableTimeProvider();
  const logger = { info() {}, warn() {}, error() {} };
  const outputManager = createResearchOutputManager({
    logger,
    timeProvider,
    outputDir: path.join(dir, "research-output")
  });

  const engine = createAgentEngine({
    logger,
    timeProvider,
    config: { maxTokensPerRequest: 4096 },
    governanceBridge: {
      requestTaskApproval: async () => ({ approved: true }),
      recordTaskExecution: async () => ({ ok: true }),
      generateRLHFEntry: async () => ({ ok: true, local_mirror_path: "" })
    },
    llmAdapter: makeStubAdapter(SYNTH_BODY),
    outputManager
  });

  const task = createTaskDefinition({
    type: "freeform",
    description: "scout-task",
    inputs: [],
    outputFormat: "markdown",
    createdAt: "2026-04-28T00:00:00.000Z",
    taskId: "scout-test-001"
  });

  const result = await engine.executeTask(task, {
    supervisorDecision: { approved: true, decision_id: "sup-ok", reason: "approved" }
  });

  assert.equal(result.ok, true);
  const output = fs.readFileSync(result.output_path, "utf8");
  assert.doesNotMatch(output, /\[\[/);

  const sidecarPath = path.join(path.dirname(result.output_path), "wiki-links.json");
  assert.equal(fs.existsSync(sidecarPath), false);
});
