"use strict";

// A real-component workflow harness: the REAL dataset builder, offer builder, packager and approval
// manager, driven by a fake research runtime that leaves on disk exactly what a passing mission
// leaves. Used by the tests that must prove something about the SEALED BUNDLE a customer receives
// (dates, disclosures) rather than about one component in isolation.
//
// Only the model call is faked. Everything downstream of the mission runs for real, which is the
// point: a wiring omission in any component (a clock never passed, a result never forwarded) fails
// here whichever component forgot it.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createWorkflowEngine } = require("../../openclaw-bridge/core/workflow-engine.js");
const { buildMonetizationRuntime } = require("../../scripts/_monetization-runtime.js");
const {
  copyDatasetConfigs,
  copyMonetizationConfigs,
  writeJson,
  writeTaskText
} = require("./phase20-fixtures.js");

// The real-format id every fixture mission cites AND grounds, so the citation gate passes on merit.
const GROUNDED_NCT = "NCT01111111";

function silentLogger() {
  return { info() {}, warn() {}, error() {} };
}

async function makeRoot() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-bundle-"));
  await copyDatasetConfigs(rootDir);
  await copyMonetizationConfigs(rootDir);
  fs.mkdirSync(path.join(rootDir, "workspace", "workflows"), { recursive: true });
  return rootDir;
}

// What a real passing mission leaves on disk: a task output that CITES a real-format id and is
// GROUNDED by a metadata sidecar, plus the mission folder the dataset builder and the offer builder
// read. The envelope is written verbatim as mission.json - exactly what agent-spawner.js does - so
// the envelope's own `created_at` is what a mission-sourced offer later reads.
function makeResearchRuntime(rootDir, captured, extras = {}) {
  return {
    rootDir,
    config: { defaultProvider: "mock", defaultModel: "mock-model" },
    citationReresolver: {
      RESOLVER_TABLE_VERSION: "test",
      resolveAll: async (cites) => cites.map((c) => ({ ...c, status: "VERIFIED" }))
    },
    agentSpawner: {
      spawnMission: async (envelope) => {
        captured.envelope = envelope;
        const outputPath = writeTaskText(
          rootDir,
          "task-bundle-harness-1",
          `Enterprise buyers prioritize integration depth and auditability, as seen in trial ${GROUNDED_NCT}.`,
          {
            fetched_citation_ids: [GROUNDED_NCT],
            rights: { commercial_use_allowed: true, redistribution_allowed: true },
            source_domain: "approved.example"
          }
        );
        const missionRoot = path.join(rootDir, "workspace", "missions", envelope.mission_id);
        const subtask = { subtask_id: "sub-1", output_path: outputPath, status: "completed" };
        writeJson(path.join(missionRoot, "mission.json"), envelope);
        writeJson(path.join(missionRoot, "status.json"), { status: "completed" });
        writeJson(path.join(missionRoot, "artifacts", "mission-summary.json"), { subtask_results: [subtask] });
        return {
          ok: true,
          subtask_results: [{ ...subtask, metadata_path: path.join(path.dirname(outputPath), "metadata.json") }]
        };
      }
    },
    ...extras
  };
}

// `clock` is injected into BOTH the engine and the monetization runtime, the way a caller that owns
// a clock would. `researchExtras` adds fetchers (ctgovSupplemental, ...) to the fake research runtime.
// `logger` lets a test capture the engine's events; the default is silent.
async function makeEngine(captured, { clock, researchExtras, logger } = {}) {
  const rootDir = await makeRoot();
  const monetizationRuntime = buildMonetizationRuntime({ rootDir, timeProvider: clock });
  const engine = createWorkflowEngine({
    researchRuntime: makeResearchRuntime(rootDir, captured, researchExtras),
    monetizationRuntime,
    logger: logger || silentLogger(),
    timeProvider: clock
  });
  return { engine, rootDir, monetizationRuntime };
}

function workflowDef(steps) {
  return {
    schema_version: "phase30-workflow-v1",
    workflow_template_id: "wf-bundle-harness",
    name: "Bundle harness",
    auto_approve: true,
    pipeline: steps
  };
}

const MISSION_STEP = { step_id: "research", type: "mission", mission_template_id: "biomedical_drug_discovery", depends_on: [] };
const DATASET_STEP = { step_id: "build_dataset", type: "dataset", depends_on: ["research"], dataset_type: "instruction_qa", quality_threshold: 0.5 };
// biomedical_research_packs allows only mission sources, so a dataset-sourced offer falls back to the
// mission - the same fallback the real trial-design-benchmark template takes (verified in run #3).
const OFFER_STEP = { step_id: "package", type: "offer", depends_on: ["build_dataset"], product_line: "biomedical_research_packs", tier: "standard", targets: ["datarade"] };
const APPROVE_STEP = { step_id: "approve", type: "approve", depends_on: ["package"] };
const FULL_PIPELINE = [MISSION_STEP, DATASET_STEP, OFFER_STEP, APPROVE_STEP];

function stepResult(result, stepId) {
  const step = (result.pipeline_progress.steps || []).find((s) => s.step_id === stepId);
  if (!step) throw new Error(`step '${stepId}' missing from pipeline_progress`);
  return step.result;
}

function listFiles(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else out.push(full);
    }
  }
  return out.sort();
}

// A committed release bundle for the approval-manager tests, built by the SAME runtime components
// the engine's offer step uses.
function commitFixtureBundle(runtime) {
  const offer = {
    offer_id: "offer-harness-demo",
    offer_title: "Harness Demo",
    product_line: "research_packs",
    tier: "sample",
    source_kind: "mission",
    source_id: "mission-harness-demo",
    platform_targets: ["datarade"],
    workflow_roles: ["packaging_agent"],
    artifact_slots: ["primary_deliverable", "sample_preview", "store_copy"],
    required_metadata_fields: ["offer_id"],
    release_status: "packaged"
  };
  const sourceContext = {
    source_kind: "mission",
    source_id: "mission-harness-demo",
    description: "Harness fixture",
    summary: { subtask_results: [{ subtask_id: "step-1", output_path: "/tmp/task-one/output.md", status: "completed" }] },
    artifacts: [{
      task_id: "task-harness-1",
      output_rel: "workspace/research-output/task-harness-1/output.md",
      output_excerpt: "Harness fixture excerpt."
    }]
  };
  const bundleDir = runtime.deliverablePackager.createBundleWorkspace(offer.offer_id);
  const artifactRefs = runtime.deliverablePackager.writeDeliverables(bundleDir, offer, sourceContext);
  const generated = runtime.submissionPackGenerator.generateSubmissionPacks(bundleDir, offer, sourceContext);
  runtime.deliverablePackager.writeBundleRoot(
    bundleDir, offer, sourceContext, artifactRefs, generated.submission_refs, generated.publisher_adapter_snapshot
  );
  runtime.deliverablePackager.finalizeBundle(bundleDir);
  return { bundleDir: runtime.deliverablePackager.commitBundle(bundleDir, offer.offer_id), offerId: offer.offer_id };
}

module.exports = {
  APPROVE_STEP,
  DATASET_STEP,
  FULL_PIPELINE,
  GROUNDED_NCT,
  MISSION_STEP,
  OFFER_STEP,
  commitFixtureBundle,
  listFiles,
  makeEngine,
  makeRoot,
  silentLogger,
  stepResult,
  workflowDef
};
