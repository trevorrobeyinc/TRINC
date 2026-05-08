"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const { copyMonetizationConfigs, writeJson, writeTaskOutput } = require("./phase20-fixtures.js");

function runNode(scriptRelPath, args, cwd) {
  return spawnSync("node", [path.join(root, scriptRelPath), ...args], {
    cwd,
    encoding: "utf8"
  });
}

async function createPhase23FixtureRoot(prefix = "openclaw-phase23-") {
  const fixtureRoot = await fsp.mkdtemp(path.join(os.tmpdir(), prefix));
  await copyMonetizationConfigs(fixtureRoot);
  return fixtureRoot;
}

function createMissionArtifact(fixtureRoot, missionId, fixtureName = "sample-research-output.md") {
  const taskId = `task-${missionId}`;
  const outputPath = writeTaskOutput(fixtureRoot, taskId, fixtureName);
  const missionRoot = path.join(fixtureRoot, "workspace", "missions", missionId);
  fs.mkdirSync(path.join(missionRoot, "artifacts"), { recursive: true });
  writeJson(path.join(missionRoot, "mission.json"), {
    mission_id: missionId,
    description: `Fixture mission ${missionId}`
  });
  writeJson(path.join(missionRoot, "status.json"), {
    mission_id: missionId,
    status: "completed"
  });
  writeJson(path.join(missionRoot, "artifacts", "mission-summary.json"), {
    mission_id: missionId,
    subtask_results: [
      {
        output_path: outputPath,
        status: "completed",
        subtask_id: "step-1"
      }
    ]
  });
}

function generateApprovedOffer(fixtureRoot, input = {}) {
  const missionId = String(input.missionId || "");
  createMissionArtifact(fixtureRoot, missionId, input.fixtureName || "sample-research-output.md");

  const args = [
    "--source", missionId,
    "--product-line", String(input.productLine || "research_packs"),
    "--tier", String(input.tier || "standard"),
    "--targets", String(input.targets || "datarade"),
    "--confirm"
  ];
  if (input.deliveryTargets) {
    args.splice(args.length - 1, 0, "--delivery-targets", String(input.deliveryTargets));
  }

  const generated = runNode("scripts/generate-offer.js", args, fixtureRoot);
  if (generated.status !== 0) {
    throw new Error(generated.stderr || generated.stdout);
  }
  const generatedBody = JSON.parse(generated.stdout);

  const approved = runNode("scripts/approve-release.js", [
    "--offer-id", generatedBody.offer_id,
    "--confirm"
  ], fixtureRoot);
  if (approved.status !== 0) {
    throw new Error(approved.stderr || approved.stdout);
  }

  return generatedBody.offer_id;
}

function exportOffer(fixtureRoot, offerId, format = "folder", operatorId = "operator-phase23") {
  const exported = runNode("scripts/export-release.js", [
    "--offer-id", offerId,
    "--format", format,
    "--operator-id", operatorId,
    "--confirm"
  ], fixtureRoot);
  if (exported.status !== 0) {
    throw new Error(exported.stderr || exported.stdout);
  }
}

function recordSubmissionOutcome(fixtureRoot, input = {}) {
  const args = [
    "--offer-id", String(input.offerId || ""),
    "--platform-target", String(input.platformTarget || "datarade"),
    "--operator-id", String(input.operatorId || "operator-phase23"),
    "--outcome-state", String(input.outcomeState || "submitted_pending_review"),
    "--idempotency-key", String(input.idempotencyKey || "phase23-submission"),
    "--notes", String(input.notes || "phase23 submission evidence"),
    "--confirm"
  ];
  const recorded = runNode("scripts/record-submission-outcome.js", args, fixtureRoot);
  if (recorded.status !== 0) {
    throw new Error(recorded.stderr || recorded.stdout);
  }
}

function recordDeliveryOutcome(fixtureRoot, input = {}) {
  const args = [
    "--offer-id", String(input.offerId || ""),
    "--delivery-target", String(input.deliveryTarget || "manual_secure_transfer"),
    "--operator-id", String(input.operatorId || "operator-phase23"),
    "--outcome-state", String(input.outcomeState || "delivery_in_progress"),
    "--idempotency-key", String(input.idempotencyKey || "phase23-delivery"),
    "--notes", String(input.notes || "phase23 delivery evidence"),
    "--confirm"
  ];
  const recorded = runNode("scripts/record-delivery-outcome.js", args, fixtureRoot);
  if (recorded.status !== 0) {
    throw new Error(recorded.stderr || recorded.stdout);
  }
}

module.exports = {
  createPhase23FixtureRoot,
  exportOffer,
  generateApprovedOffer,
  recordDeliveryOutcome,
  recordSubmissionOutcome
};
