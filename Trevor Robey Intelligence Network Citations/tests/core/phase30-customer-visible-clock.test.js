"use strict";

// Customer-visible dates must come from a real clock. Found by the first real run (2026-10-08).
//
// Run #3's sealed bundle shipped `**Generated**: 1970-01-01` in deliverables/report.md and
// `"approved_at": "1970-01-01T00:00:00.000Z"` in release-approval.json. Neither is "unknown": each is
// a component's built-in DEFAULT clock - a frozen epoch, so unit tests stay deterministic - that
// production never replaced, because nothing on the production path handed those components a clock:
//
//   1. The workflow engine built the mission envelope without `created_at`, so the schema's epoch
//      default stood. The real spawner writes the envelope VERBATIM as mission.json, and a
//      mission-sourced offer (every `biomedical_research_packs` bundle, including the
//      trial-design-benchmark template) reads that field as the bundle's "Generated" date.
//   2. The engine built its dataset output manager and builder inline, with no clock, although it
//      holds one - so `build_completed_at` (the "Generated" date of a dataset-sourced offer) was
//      the epoch too.
//   3. `buildMonetizationRuntime` built the release-approval manager with no clock. Every operator
//      script (approve-release, export-release, generate-offer, record-*-outcome, verify-*) builds
//      through that one factory, so every approval they stamp was 1970.
//
// These tests drive the REAL dataset, offer, packaging and approval components with a fixed clock
// (tests/helpers/workflow-bundle-harness.js), so a missed wiring fails here whichever component
// forgot it - not only the two dates that were seen.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { buildMonetizationRuntime } = require("../../scripts/_monetization-runtime.js");
const {
  DATASET_STEP,
  FULL_PIPELINE,
  MISSION_STEP,
  commitFixtureBundle,
  listFiles,
  makeEngine,
  makeRoot,
  stepResult,
  workflowDef
} = require("../helpers/workflow-bundle-harness.js");

const FIXED_ISO = "2026-10-08T12:34:56.000Z";
const FIXED_DAY = "2026-10-08";
const EPOCH_DAY = "1970-01-01";

const fixedClock = Object.freeze({
  nowIso: () => FIXED_ISO,
  nowMs: () => Date.parse(FIXED_ISO)
});

describe("customer-visible clock - workflow engine", () => {
  it("stamps the mission envelope with the engine clock, not the schema's epoch default", async () => {
    const captured = {};
    const { engine } = await makeEngine(captured, { clock: fixedClock });
    const result = await engine.executeWorkflow(workflowDef([MISSION_STEP]));
    assert.equal(result.ok, true, `workflow failed: ${JSON.stringify(result.error)}`);
    assert.equal(captured.envelope.created_at, FIXED_ISO);
  });

  it("stamps the dataset build with the engine clock", async () => {
    const captured = {};
    const { engine } = await makeEngine(captured, { clock: fixedClock });
    const result = await engine.executeWorkflow(workflowDef([MISSION_STEP, DATASET_STEP]));
    assert.equal(result.ok, true, `workflow failed: ${JSON.stringify(result.error)}`);

    const dataset = stepResult(result, "build_dataset");
    // A degenerate build would make the date assertion below meaningless, so prove the fixture built.
    assert.equal(dataset.ok, true, "the fixture must produce a real dataset build");
    const metadata = JSON.parse(fs.readFileSync(dataset.dataset_result.metadata_path, "utf8"));
    assert.equal(metadata.build_completed_at, FIXED_ISO);
    assert.equal(metadata.build_started_at, FIXED_ISO);
  });

  it("ships a bundle with no epoch date in any file, and the run's own date where a date is shown", async () => {
    const captured = {};
    const { engine, rootDir } = await makeEngine(captured, { clock: fixedClock });
    const result = await engine.executeWorkflow(workflowDef(FULL_PIPELINE));
    assert.equal(result.ok, true, `workflow failed: ${JSON.stringify(result.error)}`);

    const offerId = result.artifacts.offer_id;
    assert.ok(offerId, "the run must produce an offer");
    const bundleDir = path.join(rootDir, "workspace", "releases", offerId);

    const epochFiles = listFiles(bundleDir)
      .filter((file) => fs.readFileSync(file, "utf8").includes(EPOCH_DAY))
      .map((file) => path.relative(bundleDir, file));
    assert.deepEqual(epochFiles, [], `files in the sealed bundle still carry ${EPOCH_DAY}`);

    const report = fs.readFileSync(path.join(bundleDir, "deliverables", "report.md"), "utf8");
    assert.match(report, new RegExp(`\\*\\*Generated\\*\\*: ${FIXED_DAY}`));
    const approval = JSON.parse(fs.readFileSync(path.join(bundleDir, "release-approval.json"), "utf8"));
    assert.equal(approval.approved_at, FIXED_ISO);
  });
});

describe("customer-visible clock - buildMonetizationRuntime (the factory behind every operator script)", () => {
  it("stamps an approval from an injected clock", async () => {
    const rootDir = await makeRoot();
    const runtime = buildMonetizationRuntime({ rootDir, timeProvider: fixedClock });
    const { offerId } = commitFixtureBundle(runtime);
    const approval = runtime.releaseApprovalManager.approveRelease({ offer_id: offerId, approver: "operator-test" });
    assert.equal(approval.approved_at, FIXED_ISO);
  });

  it("defaults to the real clock when none is injected", async () => {
    // approve-release.js, export-release.js, generate-offer.js and the evidence scripts all call
    // buildMonetizationRuntime() with no arguments, so the DEFAULT is the production behavior.
    const rootDir = await makeRoot();
    const runtime = buildMonetizationRuntime({ rootDir });
    const { offerId } = commitFixtureBundle(runtime);
    const before = Date.now();
    const approval = runtime.releaseApprovalManager.approveRelease({ offer_id: offerId, approver: "operator-test" });
    const after = Date.now();
    assert.ok(!approval.approved_at.startsWith(EPOCH_DAY), `approved_at is the epoch default: ${approval.approved_at}`);
    const stamped = Date.parse(approval.approved_at);
    assert.ok(stamped >= before - 1000 && stamped <= after + 1000, `approved_at ${approval.approved_at} is not the current time`);
  });
});
