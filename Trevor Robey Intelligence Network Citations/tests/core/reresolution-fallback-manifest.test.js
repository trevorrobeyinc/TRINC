"use strict";

// T1-8 (2026-11-14), through the real engine: when the re-resolution pass crashes, the run still seals
// (fail-soft, operator default D1), but never without a manifest. The fallback lists every cited id
// UNCHECKED with reason `reresolution_error` and records reresolution_completed:false, and the buyer
// ZIP refuses that release. Before this, sealed release offer-bcaf2746298f5280fde747f0 had no manifest.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { FULL_PIPELINE, GROUNDED_NCT, makeEngine, workflowDef } = require("../helpers/workflow-bundle-harness.js");
const { buildBuyerZip, BuyerZipError } = require("../../scripts/build-buyer-zip.js");

describe("a crashed re-resolution pass seals an honest fallback manifest (T1-8)", () => {
  it("every cited id is UNCHECKED (reresolution_error), the pass is marked incomplete, and the buyer ZIP refuses it", async () => {
    const crashing = {
      RESOLVER_TABLE_VERSION: "test",
      resolveAll: async () => { throw new Error("resolver bug: undefined is not a function"); }
    };
    const { engine, rootDir } = await makeEngine({}, { researchExtras: { citationReresolver: crashing } });
    const result = await engine.executeWorkflow(workflowDef(FULL_PIPELINE));
    assert.equal(result.ok, true, `the run stays fail-soft: ${JSON.stringify(result.error)}`);

    const releaseDir = path.join(rootDir, "workspace", "releases", result.artifacts.offer_id);
    const manifest = JSON.parse(fs.readFileSync(path.join(releaseDir, "deliverables", "reproducibility-manifest.json"), "utf8"));
    assert.equal(manifest.summary.reresolution_completed, false);
    assert.equal(manifest.summary.counts.total, manifest.summary.counts.unchecked);
    assert.ok(manifest.citations.length >= 1);
    for (const c of manifest.citations) {
      assert.equal(c.status, "UNCHECKED");
      assert.equal(c.evidence.reason, "reresolution_error");
    }
    assert.ok(manifest.citations.some((c) => c.id === GROUNDED_NCT));
    const md = fs.readFileSync(path.join(releaseDir, "deliverables", "reproducibility-manifest.md"), "utf8");
    assert.match(md, /Re-resolution did not complete this run; no identifier was looked up\./);

    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "buyer-zip-fallback-")), "buyer.zip");
    assert.throws(
      () => buildBuyerZip({ offerId: result.artifacts.offer_id, outPath: out, releasesDir: path.join(rootDir, "workspace", "releases") }),
      (error) => error instanceof BuyerZipError && error.problems.includes("re-resolution did not complete; re-run the order")
    );
    assert.equal(fs.existsSync(out), false, "nothing was written");
  });

  it("a normal pass records reresolution_completed:true", async () => {
    const { engine, rootDir } = await makeEngine({});
    const result = await engine.executeWorkflow(workflowDef(FULL_PIPELINE));
    assert.equal(result.ok, true, JSON.stringify(result.error));
    const manifest = JSON.parse(fs.readFileSync(
      path.join(rootDir, "workspace", "releases", result.artifacts.offer_id, "deliverables", "reproducibility-manifest.json"), "utf8"));
    assert.equal(manifest.summary.reresolution_completed, true);
  });
});
