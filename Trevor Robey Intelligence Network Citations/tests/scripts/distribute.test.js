"use strict";

// T1-2 (2026-11-14): scripts/distribute.js builds marketplace files ONLY from the workflow's sealed,
// gate-passed release, checked against the release seal the same way build-buyer-zip.js checks it.
// Before this it staged the longest .md it could find in the mission folder or in ANY research-output
// folder named "task-…", so a marketplace listing could carry another run's text, gated or not.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { FULL_PIPELINE, MISSION_STEP, makeEngine, workflowDef } = require("../helpers/workflow-bundle-harness.js");
const { writeTaskText } = require("../helpers/phase20-fixtures.js");
const { DistributionRefusedError, findWorkflowFiles, runDistribution } = require("../../scripts/distribute.js");

const quiet = (fn) => {
  const log = console.log;
  console.log = () => {};
  try { return fn(); } finally { console.log = log; }
};

async function sealedWorkflow(researchExtras = {}) {
  const { engine, rootDir } = await makeEngine({}, { researchExtras });
  const result = await engine.executeWorkflow(workflowDef(FULL_PIPELINE));
  assert.equal(result.ok, true, JSON.stringify(result.error));
  const releaseDir = path.join(rootDir, "workspace", "releases", result.artifacts.offer_id);
  return { rootDir, workflowId: result.workflow_id, releaseDir };
}

function refusedWith(fn, pattern) {
  assert.throws(fn, (error) => error instanceof DistributionRefusedError && error.problems.some((p) => pattern.test(p)));
}

describe("distribute.js stages only from a sealed, gate-passed release (T1-2)", () => {
  it("a workflow that sealed no release is refused, and nothing is written", async () => {
    const { engine, rootDir } = await makeEngine({});
    // Mission only: the run ends without packaging, so workflow.json names no offer.
    const result = await engine.executeWorkflow(workflowDef([MISSION_STEP]));
    assert.equal(result.ok, true, JSON.stringify(result.error));
    refusedWith(() => quiet(() => runDistribution({ workflowId: result.workflow_id, targetList: ["datarade"], rootDir })), /sealed no release/);
    assert.equal(fs.existsSync(path.join(rootDir, "workspace", "distribution")), false, "nothing staged");
  });

  it("a sealed, gate-passed release: the staged report IS the sealed report.md, byte for byte", async () => {
    const { rootDir, workflowId, releaseDir } = await sealedWorkflow();
    const staged = findWorkflowFiles(workflowId, { rootDir });
    assert.equal(staged.report, fs.readFileSync(path.join(releaseDir, "deliverables", "report.md"), "utf8"));
    assert.equal(staged.citations, fs.readFileSync(path.join(releaseDir, "deliverables", "tables.csv"), "utf8"));
    assert.equal(staged.citationCount, staged.citations.trim().split("\n").length - 1, "the header is not a citation");
    const { outputBase } = quiet(() => runDistribution({ workflowId, targetList: ["datarade"], rootDir }));
    assert.ok(fs.existsSync(path.join(outputBase, "datarade", workflowId)));
  });

  it("a longer output.md planted in another task- folder is never picked", async () => {
    const { rootDir, workflowId, releaseDir } = await sealedWorkflow();
    writeTaskText(rootDir, "task-ffffffffffffffffffffffff", "An unrelated, ungated run's text. ".repeat(500), {});
    const staged = findWorkflowFiles(workflowId, { rootDir });
    assert.equal(staged.report, fs.readFileSync(path.join(releaseDir, "deliverables", "report.md"), "utf8"));
    assert.ok(!staged.report.includes("An unrelated, ungated run's text."));
  });

  it("a report.md edited after sealing is refused", async () => {
    const { rootDir, workflowId, releaseDir } = await sealedWorkflow();
    fs.appendFileSync(path.join(releaseDir, "deliverables", "report.md"), "\nEdited after the seal.\n");
    refusedWith(() => findWorkflowFiles(workflowId, { rootDir }), /changed after the release was sealed: report\.md/);
  });

  it("a release whose re-resolution pass did not complete (T1-8) is refused", async () => {
    const crashing = { RESOLVER_TABLE_VERSION: "test", resolveAll: async () => { throw new Error("resolver bug"); } };
    const { rootDir, workflowId } = await sealedWorkflow({ citationReresolver: crashing });
    refusedWith(() => findWorkflowFiles(workflowId, { rootDir }), /re-resolution did not complete; re-run the order/);
  });
});
