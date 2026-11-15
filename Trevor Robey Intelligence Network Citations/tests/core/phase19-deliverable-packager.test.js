"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const { createDeliverablePackager } = require(path.join(root, "openclaw-bridge", "monetization", "deliverable-packager.js"));
const {
  PHASE21_PUBLISHER_ADAPTER_SNAPSHOT_SCHEMA,
  buildPublisherAdapterSnapshotHash
} = require(path.join(root, "openclaw-bridge", "monetization", "publisher-adapter-contract.js"));

function createMissionFixture() {
  return {
    offer: {
      offer_id: "offer-packager-demo",
      offer_title: "Packager Demo",
      product_line: "research_packs",
      tier: "sample",
      source_kind: "mission",
      source_id: "mission-packager-demo",
      platform_targets: ["datarade"],
      workflow_roles: ["packaging_agent"],
      artifact_slots: ["primary_deliverable", "sample_preview", "store_copy"],
      required_metadata_fields: ["offer_id"],
      release_status: "packaged"
    },
    sourceContext: {
      source_kind: "mission",
      source_id: "mission-packager-demo",
      description: "Mission summary for packaging",
      summary: {
        subtask_results: [
          {
            subtask_id: "step-1",
            output_path: "/tmp/task-one/output.md",
            status: "completed"
          }
        ]
      },
      artifacts: [
        {
          task_id: "task-packager-1",
          output_rel: "workspace/research-output/task-packager-1/output.md",
          output_excerpt: "A deterministic excerpt for the report."
        }
      ]
    }
  };
}

function createPublisherAdapterSnapshot(targets) {
  const summary = {
    schema_version: PHASE21_PUBLISHER_ADAPTER_SNAPSHOT_SCHEMA,
    targets: targets.map((target) => ({
      adapter_id: `phase21.manual.${target}`,
      adapter_manifest: `submission/${target}/adapter-manifest.json`,
      adapter_version: "phase21-manual-v1",
      generated_files_sha256: [
        {
          file: `submission/${target}/placeholder.txt`,
          sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        }
      ],
      input_snapshot_hash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      manifest_sha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      manual_only: true,
      platform_target: target
    }))
  };
  return {
    ...summary,
    publisher_adapter_snapshot_hash: buildPublisherAdapterSnapshotHash(summary)
  };
}

test("phase19 deliverable packager writes deterministic manifests and checksums", async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "openclaw-phase19-packager-"));
  const packager = createDeliverablePackager({ rootDir: tmp });
  const fixture = createMissionFixture();

  const firstBundle = packager.createBundleWorkspace(fixture.offer.offer_id);
  const firstRefs = packager.writeDeliverables(firstBundle, fixture.offer, fixture.sourceContext);
  packager.writeBundleRoot(
    firstBundle,
    fixture.offer,
    fixture.sourceContext,
    firstRefs,
    {},
    createPublisherAdapterSnapshot(fixture.offer.platform_targets)
  );
  packager.finalizeBundle(firstBundle);

  const secondBundle = packager.createBundleWorkspace(fixture.offer.offer_id);
  const secondRefs = packager.writeDeliverables(secondBundle, fixture.offer, fixture.sourceContext);
  packager.writeBundleRoot(
    secondBundle,
    fixture.offer,
    fixture.sourceContext,
    secondRefs,
    {},
    createPublisherAdapterSnapshot(fixture.offer.platform_targets)
  );
  packager.finalizeBundle(secondBundle);

  const firstManifest = fs.readFileSync(path.join(firstBundle, "manifest.json"), "utf8");
  const secondManifest = fs.readFileSync(path.join(secondBundle, "manifest.json"), "utf8");
  const firstChecksums = fs.readFileSync(path.join(firstBundle, "checksums.txt"), "utf8");
  const secondChecksums = fs.readFileSync(path.join(secondBundle, "checksums.txt"), "utf8");

  assert.equal(firstManifest, secondManifest);
  assert.equal(firstChecksums, secondChecksums);
});

test("Q37: a prose 'DrugBank' mention in the report body blocks the primary manual-ZIP bundle (full-text parity with AWS-DX)", async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "openclaw-phase19-q37-"));
  const packager = createDeliverablePackager({ rootDir: tmp });
  const fixture = createMissionFixture();
  const bundle = packager.createBundleWorkspace(fixture.offer.offer_id);
  // A bare prose mention with NO typed DrugBank citation — the old citation-TYPE-only check missed this.
  const ctx = {
    ...fixture.sourceContext,
    artifacts: [{
      task_id: "t1",
      output_rel: "workspace/research-output/t1/output.md",
      output_full: "The target resembles entries catalogued in DrugBank, though we cite only public sources (PMID: 12345678)."
    }]
  };
  assert.throws(
    () => packager.writeDeliverables(bundle, fixture.offer, ctx),
    /DrugBank/i,
    "a prose DrugBank mention must fail the license gate on the primary path"
  );
});

test("Q37: a bare DrugBank accession id (DB#####) in the report body also blocks the primary path", async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "openclaw-phase19-q37b-"));
  const packager = createDeliverablePackager({ rootDir: tmp });
  const fixture = createMissionFixture();
  const bundle = packager.createBundleWorkspace(fixture.offer.offer_id);
  const ctx = {
    ...fixture.sourceContext,
    artifacts: [{
      task_id: "t1",
      output_rel: "workspace/research-output/t1/output.md",
      output_full: "Prior work referenced DB00945 in the mechanism discussion."
    }]
  };
  assert.throws(() => packager.writeDeliverables(bundle, fixture.offer, ctx), /DrugBank/i);
});

test("Q37: bundle-wide seal scan catches DrugBank in an offer-derived header (not just artifact bodies)", async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "openclaw-phase19-q37c-"));
  const packager = createDeliverablePackager({ rootDir: tmp });
  const fixture = createMissionFixture();
  // Artifacts are CLEAN (the research-branch input gate passes), but the offer TITLE — which derives
  // from the user's mission description — names DrugBank. It ships in the report/preview headers; only
  // the bundle-wide seal scan in finalizeBundle catches it.
  const offer = { ...fixture.offer, offer_title: "DrugBank vs ChEMBL Coverage Demo" };
  const bundle = packager.createBundleWorkspace(offer.offer_id);
  const refs = packager.writeDeliverables(bundle, offer, fixture.sourceContext);
  packager.writeBundleRoot(bundle, offer, fixture.sourceContext, refs, {}, createPublisherAdapterSnapshot(offer.platform_targets));
  assert.throws(
    () => packager.finalizeBundle(bundle),
    /DrugBank/i,
    "the seal scan must catch a DrugBank offer title that ships in a deliverable header"
  );
});

test("phase19 deliverable packager ships the graveyard memo + amendment-risk when present (Slice 3 v2)", async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "openclaw-phase19-packager-graveyard-"));
  const packager = createDeliverablePackager({ rootDir: tmp });
  const fixture = createMissionFixture();
  fixture.sourceContext.graveyard_memo = {
    count: 2,
    markdown: "# Graveyard Memo — Prior Terminated Programs\n\nNCT00000001 was terminated."
  };
  fixture.sourceContext.amendment_risk = {
    sampled: 2, band: "HIGH",
    markdown: "## Protocol Amendment-Risk Signal\n\nAmendment-risk: HIGH."
  };

  const bundleDir = packager.createBundleWorkspace(fixture.offer.offer_id);
  const refs = packager.writeDeliverables(bundleDir, fixture.offer, fixture.sourceContext);

  assert.ok(refs.graveyard_memo, "graveyard_memo artifact ref is set");
  const memo = fs.readFileSync(path.join(bundleDir, refs.graveyard_memo), "utf8");
  assert.ok(memo.includes("NCT00000001"), "graveyard memo body shipped");
  assert.ok(memo.includes("Amendment-risk: HIGH"), "amendment-risk appended to the same artifact");
});

test("phase19 deliverable packager omits the graveyard memo when no stopped trials were found", async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "openclaw-phase19-packager-no-graveyard-"));
  const packager = createDeliverablePackager({ rootDir: tmp });
  const fixture = createMissionFixture(); // no graveyard_memo in sourceContext
  const bundleDir = packager.createBundleWorkspace(fixture.offer.offer_id);
  const refs = packager.writeDeliverables(bundleDir, fixture.offer, fixture.sourceContext);
  assert.equal(refs.graveyard_memo, undefined, "no graveyard ref when absent");
  assert.ok(!fs.existsSync(path.join(bundleDir, "deliverables", "graveyard-memo.md")), "no graveyard file written");
});

test("phase19 deliverable packager fails when a required artifact slot is not produced", async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "openclaw-phase19-packager-missing-slot-"));
  const packager = createDeliverablePackager({ rootDir: tmp });
  const fixture = createMissionFixture();
  fixture.offer.artifact_slots = ["primary_deliverable", "nonexistent_slot"];

  const bundleDir = packager.createBundleWorkspace(fixture.offer.offer_id);
  assert.throws(() => packager.writeDeliverables(bundleDir, fixture.offer, fixture.sourceContext), /required artifact slots/);
});

// ── Customer-facing claim accuracy ───────────────────────────────────────────────────────────
// store-copy.md ships inside every paid bundle and had ZERO body-text coverage, which is how the
// retired "Zero hallucination architecture" claim survived the 2026-07-13 never-overclaim sweep
// (commit 7801443) for two months and shipped in all four release bundles. These lock the copy in
// BOTH directions: no absolute overclaim, and no softening of the real re-resolution capability.

const CITED_BODY = "Findings cite PMID: 12345678 and PMID: 22222222 and NCT01234567 plus doi:10.1056/NEJMoa1911303.";

// summary === null      -> no citation_verification at all (dataset / hand-fed bundle)
// summary === "gated"    -> the gate ran, but the fail-soft resolver produced no manifest
// summary === {…}        -> full manifest
function withResolution(fixture, summary) {
  const ctx = {
    ...fixture.sourceContext,
    artifacts: [{ task_id: "t1", output_rel: "workspace/research-output/t1/output.md", output_full: CITED_BODY }]
  };
  if (summary === "gated") {
    // T1-7: a gate record carries its retraction-screen coverage; this one screened all 4.
    ctx.citation_verification = { cited: 4, grounded: 4, ungrounded: 0, retraction_screen_checked: true, retraction_screen_cited: 4, unscreened: 0 };
  } else if (summary) {
    ctx.citation_verification = {
      cited: 4, grounded: 4, ungrounded: 0,
      reproducibility_manifest: { summary, citations: [] }
    };
  }
  return ctx;
}

async function renderStoreCopyFor(slug, summary) {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), `openclaw-phase19-${slug}-`));
  const packager = createDeliverablePackager({ rootDir: tmp });
  const fixture = createMissionFixture();
  const bundleDir = packager.createBundleWorkspace(fixture.offer.offer_id);
  packager.writeDeliverables(bundleDir, fixture.offer, withResolution(fixture, summary));
  return fs.readFileSync(path.join(bundleDir, "deliverables", "store-copy.md"), "utf8");
}

// Mirrors the real shipped bundle offer-2af242bc1548229c102fee55.
const FLAGGED_SUMMARY = {
  counts: { total: 34, verified: 29, unresolved: 0, unchecked: 5 },
  by_type: {
    DOI: { total: 16, verified: 16, unresolved: 0, unchecked: 0 },
    NCT: { total: 10, verified: 10, unresolved: 0, unchecked: 0 },
    PMID: { total: 8, verified: 3, unresolved: 0, unchecked: 5 }
  },
  verified_ratio: 0.853,
  delivery_decision: "DELIVER_WITH_FLAGS"
};

// A 100%-VERIFIED manifest (the full-strength DELIVER state).
const CLEAN_SUMMARY = {
  counts: { total: 12, verified: 12, unresolved: 0, unchecked: 0 },
  by_type: { PMID: { total: 12, verified: 12, unresolved: 0, unchecked: 0 } },
  verified_ratio: 1,
  delivery_decision: "DELIVER"
};

test("store copy never ships the retired absolute no-hallucination claim (7801443 doctrine)", async () => {
  // Every state, including the ungated one, must be free of the retired claim.
  for (const summary of [FLAGGED_SUMMARY, CLEAN_SUMMARY, null]) {
    const copy = await renderStoreCopyFor("no-halluc", summary);
    assert.ok(!/hallucinat/i.test(copy), "store copy must not make any hallucination claim");
    assert.ok(
      !/flagged and excluded/i.test(copy),
      "ungrounded ids are annotated [UNVERIFIED] inline and SHIP — they are never excluded"
    );
  }
  // The approved replacement term appears only where the gate actually ran.
  for (const summary of [FLAGGED_SUMMARY, CLEAN_SUMMARY]) {
    const copy = await renderStoreCopyFor("no-halluc-gated", summary);
    assert.match(copy, /Zero-Fabrication Guarantee/, "the approved OFFERINGS.md term replaces it");
  }
});

test("NO deliverable in the bundle reintroduces retired or extraction-as-verified claim language", async () => {
  // Bundle-wide, not just store-copy: the same overclaim template was duplicated across
  // report.md, methodology-statement.md and sample-preview.md. A case-sensitive grep missed
  // report.md's "**Verified Citations**:" header during the first pass — this catches it.
  const BANNED = [
    /hallucinat/i,
    /claims without citations are flagged and excluded/i,
    /\bverified citations\b/i,      // \b keeps "Unverified citations" (a real heading) passing
    /\bverified references\b/i,
    /\bverified research\b/i,
    // Retraction Watch may ONLY appear as the documented coverage bound ("…is not used"),
    // never as a screen we claim to run.
    /Retraction Watch(?! bulk dataset is not used)/i
  ];
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "openclaw-phase19-banned-"));
  const packager = createDeliverablePackager({ rootDir: tmp });
  const fixture = createMissionFixture();
  const bundleDir = packager.createBundleWorkspace(fixture.offer.offer_id);
  packager.writeDeliverables(bundleDir, fixture.offer, withResolution(fixture, FLAGGED_SUMMARY));
  const deliverablesDir = path.join(bundleDir, "deliverables");
  for (const file of fs.readdirSync(deliverablesDir)) {
    const body = fs.readFileSync(path.join(deliverablesDir, file), "utf8");
    for (const re of BANNED) assert.doesNotMatch(body, re, `${file} reintroduced ${re}`);
  }
});

test("store copy never calls a regex extraction tally 'verified'", async () => {
  for (const summary of [FLAGGED_SUMMARY, null]) {
    const copy = await renderStoreCopyFor("no-fake-verified", summary);
    assert.ok(!/\d+\s+verified citations/i.test(copy), "extraction count must not be labelled verified");
    assert.ok(!/verified references/i.test(copy), "per-type extraction counts must not be labelled verified");
  }
});

test("a bundle with NO citation-verification record claims neither gate", async () => {
  // renderStoreCopy runs for EVERY bundle, including dataset bundles that never went through
  // the research path. Asserting runtime grounding / retraction screening for those would be a
  // fresh overclaim, so the two absent-states must stay distinct.
  const copy = await renderStoreCopyFor("ungated", null);
  assert.match(copy, /carries no citation-verification record/, "says so plainly");
  assert.ok(!/retrieved at runtime/.test(copy), "must not claim a grounding gate that never ran");
  assert.ok(!/retraction-screened/.test(copy), "must not claim a retraction screen that never ran");
});

test("a BLOCK delivery decision is never rendered as a normal bounded claim", async () => {
  const copy = await renderStoreCopyFor("blocked", {
    counts: { total: 10, verified: 7, unresolved: 3, unchecked: 0 },
    by_type: { PMID: { total: 10, verified: 7, unresolved: 3, unchecked: 0 } },
    verified_ratio: 0.7,
    delivery_decision: "BLOCK"
  });
  assert.match(copy, /BLOCKING result \(3 of 10 UNRESOLVED\)/, "states the blocking outcome");
  assert.match(copy, /NOT cleared for delivery/, "never reads as a deliverable bundle");
});

test("the primary deliverable's header reports the real split, not the extraction tally", async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "openclaw-phase19-report-hdr-"));
  const packager = createDeliverablePackager({ rootDir: tmp });
  const fixture = createMissionFixture();
  const bundleDir = packager.createBundleWorkspace(fixture.offer.offer_id);
  packager.writeDeliverables(bundleDir, fixture.offer, withResolution(fixture, FLAGGED_SUMMARY));
  const report = fs.readFileSync(path.join(bundleDir, "deliverables", "report.md"), "utf8");
  assert.match(report, /\*\*Citations\*\*: 34 cited · 29 VERIFIED · 0 UNRESOLVED · 5 UNCHECKED at delivery/);
  assert.ok(!/\*\*Verified Citations\*\*/.test(report), "the old mislabelled header must not return");
});

test("store copy reports the REAL re-resolution split, not an implied all-verified", async () => {
  const copy = await renderStoreCopyFor("flagged", FLAGGED_SUMMARY);
  assert.match(copy, /29 of 34 resolved VERIFIED/, "states the true verified count from the manifest");
  assert.match(copy, /5 returned no definitive answer and are recorded UNCHECKED/, "states the residue");
  // The exact overclaim found shipped: 8 PMIDs cited, only 3 actually verified.
  assert.match(copy, /\*\*PMID\*\*: 8 cited · 3 VERIFIED · 5 UNCHECKED/, "per-type split comes from the manifest");
  assert.ok(!/34 verified/i.test(copy), "must never imply all 34 were verified");
});

test("store copy reads at full strength only when the manifest is 100% VERIFIED", async () => {
  const copy = await renderStoreCopyFor("clean", CLEAN_SUMMARY);
  assert.match(copy, /all 12 resolved VERIFIED/, "DELIVER earns the unqualified statement");
  assert.ok(!/UNCHECKED/.test(copy), "no residue to report at 100%");
});

// T1-8 (2026-11-14): the engine always attaches a manifest (a fallback when the re-resolution pass
// crashed), so a gate record without one means the manifest was lost; the bundle is refused.
test("a gated bundle without a reproducibility manifest is refused before any file is written", async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "openclaw-phase19-no-manifest-"));
  const packager = createDeliverablePackager({ rootDir: tmp });
  const fixture = createMissionFixture();
  const bundleDir = packager.createBundleWorkspace(fixture.offer.offer_id);
  assert.throws(
    () => packager.writeDeliverables(bundleDir, fixture.offer, withResolution(fixture, "gated")),
    (error) => error && error.code === "PHASE19_RERESOLUTION_MANIFEST_MISSING"
  );
  const deliverables = path.join(bundleDir, "deliverables");
  assert.deepEqual(fs.existsSync(deliverables) ? fs.readdirSync(deliverables) : [], [], "nothing was written");
});

// T1-7: "retraction-screened" is printed only when the screen covered every cited DOI and PMID.
test("the store copy's retraction bullet follows the screen's coverage", async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "openclaw-phase19-retraction-coverage-"));
  const packager = createDeliverablePackager({ rootDir: tmp });
  const render = (cv) => {
    const fixture = createMissionFixture();
    const ctx = withResolution(fixture, FLAGGED_SUMMARY);
    Object.assign(ctx.citation_verification, cv);
    const bundleDir = packager.createBundleWorkspace(`${fixture.offer.offer_id}-${Object.keys(cv).length}-${cv.unscreened || 0}`);
    packager.writeDeliverables(bundleDir, fixture.offer, ctx);
    return fs.readFileSync(path.join(bundleDir, "deliverables", "store-copy.md"), "utf8");
  };
  const complete = render({ retraction_screen_checked: true, retraction_screen_cited: 24, unscreened: 0 });
  assert.match(complete, /Cited DOIs and PMIDs are retraction-screened \(Crossref for DOIs/);
  const partial = render({ retraction_screen_checked: false, retraction_screen_cited: 24, unscreened: 3, unscreened_ids: ["DOI:10.4/a", "DOI:10.4/b", "PMID:1"] });
  assert.doesNotMatch(partial, /retraction-screened/);
  assert.match(partial, /For this report 3 of 24 cited DOIs and PMIDs could not be screened; the citation-integrity ledger lists them\./);
  const unknown = render({});
  assert.doesNotMatch(unknown, /retraction-screened/, "a record without coverage claims none");
  assert.match(unknown, /does not state whether every cited DOI and PMID could be screened/);
});

test("the citation-integrity ledger claims only the retraction screens actually queried", () => {
  const { buildIntegrityReport } = require(path.join(root, "openclaw-bridge", "monetization", "integrity-rating.js"));
  const md = buildIntegrityReport({ cited: 4, grounded: 4, ungrounded: 0, retracted_dois: [] }).markdown;
  assert.match(md, /Crossref for DOIs, PubMed for PMIDs/, "names only the screens actually queried");
  // Retraction Watch may appear ONLY as the documented coverage bound, never as a screen we run.
  assert.doesNotMatch(md, /Retraction Watch(?! bulk dataset is not used)/i);
  assert.match(md, /Retraction Watch bulk dataset is not used/, "states the residual coverage gap");
});
