"use strict";

// T2-12 (2026-11-16): re-packaging never deletes a release's approval or evidence. Offer ids are
// deterministic, so packaging the same source again used to `rmSync` releases/<offer_id> wholesale
// (deliverable-packager.js commitBundle), taking release-approval.json, submission-evidence/ (export
// events) and delivery-evidence/ with it. Now commitBundle refuses such a release, and only the explicit
// supersedeRelease step (generate-offer.js --supersede) moves it aside whole, never deleting it.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { buildMonetizationRuntime } = require("../../scripts/_monetization-runtime.js");
const { commitFixtureBundle, makeRoot } = require("../helpers/workflow-bundle-harness.js");

const OFFER_ID = "offer-harness-demo";

async function runtimeWithRelease() {
  const rootDir = await makeRoot();
  const runtime = buildMonetizationRuntime({ rootDir });
  const { bundleDir } = commitFixtureBundle(runtime);
  return { rootDir, runtime, bundleDir };
}

// A release that has been approved, exported and delivered: the real approval, plus evidence files.
function addRecords(runtime, bundleDir) {
  runtime.releaseApprovalManager.approveRelease({ offer_id: OFFER_ID, approver: "operator-test" });
  fs.mkdirSync(path.join(bundleDir, "submission-evidence"), { recursive: true });
  fs.writeFileSync(path.join(bundleDir, "submission-evidence", "export-events.json"), "[{\"sequence\":1,\"event_type\":\"bundle_exported\"}]\n");
  fs.mkdirSync(path.join(bundleDir, "delivery-evidence"), { recursive: true });
  fs.writeFileSync(path.join(bundleDir, "delivery-evidence", "ledger.json"), "{\"events\":[{\"sequence\":1}]}\n");
}

function snapshot(dir) {
  const out = {};
  for (const rel of ["release-approval.json", "submission-evidence/export-events.json", "delivery-evidence/ledger.json", "manifest.json"]) {
    out[rel] = fs.readFileSync(path.join(dir, rel), "utf8");
  }
  return out;
}

describe("T2-12: re-packaging never deletes a release's approval or evidence", () => {
  it("a release with no approval or evidence is replaced as before", async () => {
    const { runtime, bundleDir } = await runtimeWithRelease();
    const again = commitFixtureBundle(runtime);
    assert.equal(again.bundleDir, bundleDir);
    assert.ok(fs.existsSync(path.join(bundleDir, "manifest.json")));
  });

  it("re-packaging a release that holds an approval and evidence is refused, and every record survives byte for byte", async () => {
    const { runtime, bundleDir } = await runtimeWithRelease();
    addRecords(runtime, bundleDir);
    const before = snapshot(bundleDir);
    assert.throws(
      () => commitFixtureBundle(runtime),
      (err) => err.code === "PHASE19_RELEASE_HAS_EVIDENCE"
        && ["release-approval.json", "submission-evidence", "delivery-evidence"].every((r) => err.release_records.includes(r))
    );
    assert.deepEqual(snapshot(bundleDir), before);
  });

  it("supersedeRelease moves the old release aside whole; the new commit then succeeds", async () => {
    const { rootDir, runtime, bundleDir } = await runtimeWithRelease();
    addRecords(runtime, bundleDir);
    const before = snapshot(bundleDir);
    const moved = runtime.deliverablePackager.supersedeRelease(OFFER_ID);
    assert.equal(moved, path.join(rootDir, "workspace", "releases", "_superseded", `${OFFER_ID}-1`));
    assert.deepEqual(snapshot(moved), before, "the old release, its approval and its evidence moved intact");
    const again = commitFixtureBundle(runtime);
    assert.equal(again.bundleDir, bundleDir);
    for (const record of runtime.deliverablePackager.RELEASE_RECORDS) {
      assert.equal(fs.existsSync(path.join(bundleDir, record)), false, `the new release starts without ${record}`);
    }
    addRecords(runtime, bundleDir);
    assert.equal(runtime.deliverablePackager.supersedeRelease(OFFER_ID), path.join(rootDir, "workspace", "releases", "_superseded", `${OFFER_ID}-2`));
  });

  it("supersedeRelease of an offer with no release does nothing", async () => {
    const { runtime } = await runtimeWithRelease();
    assert.equal(runtime.deliverablePackager.supersedeRelease("offer-not-packaged"), null);
  });
});
