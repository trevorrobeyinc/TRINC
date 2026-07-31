"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const os = require("node:os");
const fsp = require("node:fs/promises");

const { buildPhase14Runtime } = require("../../scripts/_phase14-agent-utils.js");
const { createTaskDefinition } = require("../../openclaw-bridge/core/task-definition-schema.js");

test("phase18 compatibility preserves the legacy single-task execution lifecycle", async () => {
  const inputDir = await fsp.mkdtemp(path.join(os.tmpdir(), "openclaw-phase18-compat-input-"));
  const outputDir = await fsp.mkdtemp(path.join(os.tmpdir(), "openclaw-phase18-compat-output-"));
  await fsp.writeFile(path.join(inputDir, "source.txt"), "sample input", "utf8");

  const runtime = await buildPhase14Runtime({
    config: {
      inputDir,
      outputDir,
      provider: "mock",
      model: "mock-v1"
    }
  });
  const task = createTaskDefinition({
    type: "summarize",
    description: "Legacy task path still works",
    inputs: [{ path: inputDir, type: "path" }],
    outputFormat: "markdown",
    createdAt: "2026-03-05T00:00:00.000Z"
  });

  const supervisorDecision = await runtime.governanceBridge.requestSupervisorApproval(task, {
    confirm: true,
    operatorId: "operator-test"
  });
  const result = await runtime.supervisorAuthority.runApprovedTask(task, {
    confirm: true,
    operatorId: "operator-test",
    supervisorDecision,
    provider: "mock",
    model: "mock-v1"
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "completed");
  assert.ok(result.output_path.includes(task.task_id));
});

test("phase18 mission mode is enabled after live evidence promotion", async () => {
  // Redirect only the spawner's write paths. `enabled` still comes from the real
  // config/agent-spawner.json, which is what this test asserts on — overriding rootDir
  // instead would make the spawner load defaults (enabled:false) and pass vacuously.
  const stateDir = await fsp.mkdtemp(path.join(os.tmpdir(), "openclaw-phase18-compat-state-"));
  const runtime = await buildPhase14Runtime({
    spawnerConfig: {
      missionWorkspaceDir: path.join(stateDir, "missions"),
      runtimeStatePath: path.join(stateDir, "runtime", "state.json")
    }
  });
  // Phase 18 is enabled (live evidence promoted). Verify the spawner does not
  // throw PHASE18_DISABLED — it may fail for other reasons (no LLM in CI) but
  // the governance gate itself must be open.
  try {
    await runtime.agentSpawner.spawnMission({
      template_id: "academic_trend_scan",
      description: "enabled mission smoke test",
      inputs: [],
      created_at: "2026-03-06T00:00:00.000Z"
    }, {
      supervisorDecision: { approved: true, decision_id: "sup-1" },
      governanceDecision: { approved: true, reason: "governance_approved" }
    });
  } catch (error) {
    // Execution may fail (no LLM available in CI) but PHASE18_DISABLED must not be thrown
    assert.notEqual(error && error.code, "PHASE18_DISABLED",
      "Phase 18 should be enabled after live evidence promotion");
  }
});
