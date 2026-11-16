"use strict";

// T2-14 (2026-11-16): the workflow's own export step (workflow-engine.js executeExportStep) runs the
// checks export-release.js runs (scripts/_delivery-checks.js researchExportProblems) before it zips,
// copies or records anything. Before this it checked only the release approval: the armed proof run
// workflow-e255cb68727f683268c754db wrote offer-d5ada9a79a258deeb9513730-export.zip and recorded a
// bundle_exported event for a release export-release.js refuses (two ChEMBL ids). A refusal leaves no
// export and no event, and the run still completes (operator default D1).

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  EXPORT_STEP,
  FULL_PIPELINE,
  GROUNDED_NCT,
  makeEngine,
  stepResult,
  workflowDef
} = require("../helpers/workflow-bundle-harness.js");

// A mission that cites, and grounds, a ChEMBL id beside the NCT: the gate passes (2 of 2 traced) and
// the re-resolver stub answers VERIFIED, so only the delivery checks can refuse it.
const CHEMBL_MISSION = {
  text: `Enterprise buyers prioritize integration depth, as seen in trial ${GROUNDED_NCT} and compound CHEMBL25.`,
  ids: [GROUNDED_NCT, "CHEMBL25"]
};

function capturingLogger() {
  const events = [];
  const push = (data) => events.push(data);
  return { info: push, warn: push, error: push, events };
}

async function runWithExport({ mission, researchExtras, format = "zip", logger } = {}) {
  const { engine, rootDir } = await makeEngine({}, { mission, researchExtras, logger });
  const exportStep = { ...EXPORT_STEP, format };
  const result = await engine.executeWorkflow(workflowDef([...FULL_PIPELINE, exportStep]));
  assert.equal(result.ok, true, JSON.stringify(result.error));
  const offerId = result.artifacts.offer_id;
  const releasesDir = path.join(rootDir, "workspace", "releases");
  return {
    result,
    offerId,
    releaseDir: path.join(releasesDir, offerId),
    zipPath: path.join(releasesDir, `${offerId}-export.zip`),
    folderPath: path.join(releasesDir, `${offerId}-export`)
  };
}

function exportEventsPath(releaseDir) {
  return path.join(releaseDir, "submission-evidence", "export-events.json");
}

describe("T2-14: the workflow's own export step runs the delivery checks", () => {
  it("a sealed mission release citing a ChEMBL id: no ZIP, no export event, and the run completes with the reasons", async () => {
    const logger = capturingLogger();
    const run = await runWithExport({ mission: CHEMBL_MISSION, logger });
    assert.equal(fs.existsSync(run.zipPath), false, "no export ZIP is written");
    assert.equal(fs.existsSync(exportEventsPath(run.releaseDir)), false, "no export event is recorded");
    assert.equal(run.result.artifacts.export_path, undefined, "workflow.json names no export");
    const refused = run.result.artifacts.export_refused;
    assert.ok(Array.isArray(refused) && refused.some((p) => /ChEMBL identifier in report\.md/.test(p)), JSON.stringify(refused));
    const step = stepResult(run.result, "export");
    assert.equal(step.exported, false);
    assert.deepEqual(step.export_refused, refused);
    assert.ok(logger.events.some((e) => e && e.event === "phase30_export_refused" && e.offer_id === run.offerId));
  });

  it("the folder format is refused the same way, and no export folder is written", async () => {
    const run = await runWithExport({ mission: CHEMBL_MISSION, format: "folder" });
    assert.equal(fs.existsSync(run.folderPath), false);
    assert.ok(run.result.artifacts.export_refused.some((p) => /ChEMBL identifier/.test(p)));
  });

  it("a clean sealed mission release exports as before: the ZIP and one export event", async () => {
    const run = await runWithExport();
    assert.equal(fs.existsSync(run.zipPath), true, "the export ZIP is written");
    assert.equal(run.result.artifacts.export_path, run.zipPath);
    assert.equal(run.result.artifacts.export_refused, undefined);
    assert.equal(stepResult(run.result, "export").exported, true);
    const events = JSON.parse(fs.readFileSync(exportEventsPath(run.releaseDir), "utf8"));
    const list = Array.isArray(events) ? events : events.events;
    assert.equal(list.length, 1);
    assert.equal(list[0].event_type, "bundle_exported");
  });

  it("a release whose re-resolution pass crashed (T1-8) is refused at export", async () => {
    const crashing = { RESOLVER_TABLE_VERSION: "test", resolveAll: async () => { throw new Error("resolver bug"); } };
    const run = await runWithExport({ researchExtras: { citationReresolver: crashing } });
    assert.equal(fs.existsSync(run.zipPath), false);
    assert.ok(run.result.artifacts.export_refused.some((p) => /re-resolution did not complete/.test(p)), JSON.stringify(run.result.artifacts.export_refused));
  });
});
