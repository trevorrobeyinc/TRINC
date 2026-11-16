"use strict";

// T1-6 (2026-11-14): configuration cannot lower or switch off the 0.75 grounded-citation floor.
// Through the real workflow engine: a mission that grounds half of what it cites must be refused
// whatever `minGroundedCitationRatio` the runtime config carries — null and 0 used to read as a
// finite 0 (`Number(null)`), and 0.5 used to be taken at its word.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { GROUNDED_NCT, MISSION_STEP, makeEngine, workflowDef } = require("../helpers/workflow-bundle-harness.js");
const { writeJson, writeTaskText } = require("../helpers/phase20-fixtures.js");

// Cites the grounded NCT and one PMID the run never retrieved: 1 of 2 grounded, ratio 0.5.
function halfGroundedSpawner(rootDir) {
  return {
    spawnMission: async (envelope) => {
      const outputPath = writeTaskText(
        rootDir,
        "task-floor-config-1",
        `Comparable programs include trial ${GROUNDED_NCT}; see also PMID: 99999999.`,
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
      return { ok: true, subtask_results: [{ ...subtask, metadata_path: path.join(path.dirname(outputPath), "metadata.json") }] };
    }
  };
}

function capturingLogger(events) {
  const push = (level) => (e) => events.push({ level, ...e });
  return { info: push("info"), warn: push("warn"), error: push("error") };
}

describe("the configured grounded floor cannot loosen the gate (T1-6)", () => {
  for (const configured of [null, 0, 0.5]) {
    it(`minGroundedCitationRatio ${JSON.stringify(configured)} still refuses a half-grounded mission at 0.75`, async () => {
      const events = [];
      const holder = {};
      const { engine, rootDir } = await makeEngine({}, {
        logger: capturingLogger(events),
        researchExtras: {
          config: { defaultProvider: "mock", defaultModel: "mock-model", minGroundedCitationRatio: configured },
          agentSpawner: { spawnMission: (envelope) => holder.spawner.spawnMission(envelope) }
        }
      });
      holder.spawner = halfGroundedSpawner(rootDir);

      const result = await engine.executeWorkflow(workflowDef([MISSION_STEP]));
      assert.equal(result.ok, false);
      assert.equal(result.error.code, "PHASE30_CITATION_UNVERIFIED");
      assert.match(result.error.message, /grounded ratio 0\.5 < 0\.75/);

      const record = JSON.parse(fs.readFileSync(
        path.join(rootDir, "workspace", "workflows", result.workflow_id, "citation-verification.json"), "utf8"));
      assert.equal(record.min_grounded_ratio, 0.75, "the strict floor is what was recorded");
      assert.equal(record.verdict, "UNVERIFIED");
      assert.equal(record.pass, false);

      const warning = events.find((e) => e.event === "min_grounded_ratio_unconfigured");
      assert.ok(warning, "the rejected configuration is logged");
      assert.equal(warning.using, 0.75);
      assert.equal(warning.rejected, configured);
    });
  }

  it("a configured floor above 0.75 tightens the gate", async () => {
    const holder = {};
    const { engine, rootDir } = await makeEngine({}, {
      researchExtras: {
        config: { defaultProvider: "mock", defaultModel: "mock-model", minGroundedCitationRatio: 0.9 },
        agentSpawner: { spawnMission: (envelope) => holder.spawner.spawnMission(envelope) }
      }
    });
    holder.spawner = halfGroundedSpawner(rootDir);
    const result = await engine.executeWorkflow(workflowDef([MISSION_STEP]));
    assert.equal(result.error.code, "PHASE30_CITATION_UNVERIFIED");
    const record = JSON.parse(fs.readFileSync(
      path.join(rootDir, "workspace", "workflows", result.workflow_id, "citation-verification.json"), "utf8"));
    assert.equal(record.min_grounded_ratio, 0.9);
  });
});
