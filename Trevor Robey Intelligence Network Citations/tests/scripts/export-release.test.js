"use strict";

// T1-11 (2026-11-14): scripts/export-release.js records delivery evidence for direct delivery targets,
// so for a research bundle it refuses what the buyer ZIP refuses (scripts/_delivery-checks.js). Before
// this it checked only the release approval, so a bundle whose re-resolution pass crashed (the T1-8
// fallback manifest) could be exported and recorded as delivered.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..", "..");
const { copyMonetizationConfigs, writeJson, writeTaskOutput } = require(path.join(root, "tests", "helpers", "phase20-fixtures.js"));
const { writePassingCitationRecord } = require(path.join(root, "tests", "helpers", "mission-citation-record-fixture.js"));

function runNode(scriptRelPath, args, cwd) {
  return spawnSync("node", [path.join(root, scriptRelPath), ...args], { cwd, encoding: "utf8" });
}

// A gate-passed mission, packaged and approved; `chembl` adds a ChEMBL id to its section.
async function approvedRelease(label, { reresolutionCompleted = true, chembl = false } = {}) {
  const fixtureRoot = await fsp.mkdtemp(path.join(os.tmpdir(), `openclaw-export-release-${label}-`));
  await copyMonetizationConfigs(fixtureRoot);
  const missionId = `mission-export-release-${label}`;
  const outputPath = writeTaskOutput(fixtureRoot, `task-export-release-${label}`, "sample-research-output.md");
  if (chembl) fs.appendFileSync(outputPath, "\nThe lead compound is CHEMBL25.\n");
  const missionRoot = path.join(fixtureRoot, "workspace", "missions", missionId);
  writeJson(path.join(missionRoot, "mission.json"), { mission_id: missionId, description: `Export release ${label}` });
  writeJson(path.join(missionRoot, "status.json"), { mission_id: missionId, status: "completed" });
  writeJson(path.join(missionRoot, "artifacts", "mission-summary.json"), {
    mission_id: missionId,
    subtask_results: [{ subtask_id: "step-1", output_path: outputPath, status: "completed" }]
  });
  writePassingCitationRecord(fixtureRoot, missionId, { reresolutionCompleted });
  const generated = runNode("scripts/generate-offer.js", [
    "--source", missionId, "--product-line", "research_packs", "--tier", "standard", "--targets", "datarade", "--confirm"
  ], fixtureRoot);
  assert.equal(generated.status, 0, generated.stderr || generated.stdout);
  const offerId = JSON.parse(generated.stdout).offer_id;
  const approved = runNode("scripts/approve-release.js", ["--offer-id", offerId, "--operator-id", "operator-test", "--confirm"], fixtureRoot);
  assert.equal(approved.status, 0, approved.stderr || approved.stdout);
  return { fixtureRoot, offerId };
}

function exportedArtifacts(fixtureRoot, offerId) {
  const releases = path.join(fixtureRoot, "workspace", "releases");
  return fs.readdirSync(releases).filter((name) => name.startsWith(`${offerId}-export`));
}

describe("export-release refuses what the buyer ZIP refuses (T1-11)", () => {
  it("refuses a release whose re-resolution pass did not complete (the T1-8 fallback), writing nothing", async () => {
    const { fixtureRoot, offerId } = await approvedRelease("fallback", { reresolutionCompleted: false });
    for (const format of ["zip", "folder"]) {
      const exported = runNode("scripts/export-release.js", ["--offer-id", offerId, "--format", format, "--confirm"], fixtureRoot);
      assert.equal(exported.status, 2, exported.stderr || exported.stdout);
      assert.match(exported.stderr, /re-resolution did not complete; re-run the order/);
      assert.deepEqual(exportedArtifacts(fixtureRoot, offerId), [], `nothing exported (${format})`);
    }
  });

  it("refuses a release that carries a ChEMBL identifier", async () => {
    const { fixtureRoot, offerId } = await approvedRelease("chembl", { chembl: true });
    const exported = runNode("scripts/export-release.js", ["--offer-id", offerId, "--format", "zip", "--confirm"], fixtureRoot);
    assert.equal(exported.status, 2);
    assert.match(exported.stderr, /ChEMBL identifier in report\.md/);
    assert.deepEqual(exportedArtifacts(fixtureRoot, offerId), []);
  });

  // Review finding delivery:4: the "no reproducibility manifest" refusal had no test. Since T1-8 the
  // packager never seals a research bundle without one, and removing the file from a sealed release
  // trips the seal check first, so the refusal itself is pinned on the function the export runs.
  it("a research release with no reproducibility manifest is refused (researchExportProblems)", async () => {
    const { researchExportProblems } = require(path.join(root, "scripts", "export-release.js"));
    const { fixtureRoot, offerId } = await approvedRelease("no-manifest");
    const bundleDir = path.join(fixtureRoot, "workspace", "releases", offerId);
    const offer = JSON.parse(fs.readFileSync(path.join(bundleDir, "offer.json"), "utf8"));
    assert.deepEqual(researchExportProblems(bundleDir, offer), [], "the sealed release passes as it is");
    for (const name of ["reproducibility-manifest.json", "reproducibility-manifest.md"]) fs.rmSync(path.join(bundleDir, "deliverables", name));
    const problems = researchExportProblems(bundleDir, offer);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /^no reproducibility manifest \(reproducibility-manifest\.json\); a research release never ships without one$/);
    assert.deepEqual(researchExportProblems(bundleDir, { ...offer, source_kind: "dataset" }), [], "a dataset bundle never carries one");
  });

  it("exports a release whose pass completed, as before", async () => {
    const { fixtureRoot, offerId } = await approvedRelease("clean");
    const exported = runNode("scripts/export-release.js", ["--offer-id", offerId, "--format", "zip", "--confirm"], fixtureRoot);
    assert.equal(exported.status, 0, exported.stderr || exported.stdout);
    assert.ok(fs.existsSync(JSON.parse(exported.stdout).export_path));
  });
});
