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
  // A real gate record always carries `pass` (T1-9: gate sentences print only for pass === true).
  if (summary === "gated") {
    // T1-7: a gate record carries its retraction-screen coverage; this one screened all 4.
    ctx.citation_verification = { pass: true, cited: 4, grounded: 4, ungrounded: 0, retraction_screen_checked: true, retraction_screen_cited: 4, unscreened: 0 };
  } else if (summary) {
    ctx.citation_verification = {
      pass: true, cited: 4, grounded: 4, ungrounded: 0,
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
    /Retraction Watch(?! bulk dataset is not used)/i,
    // T1-9 (2026-11-14): every sentence a bundle says about itself is true.
    /chain-hash/i,
    /append-only/i,
    /every claim/i,
    /RxNorm/,
    /operator review before release/i,
    /per 1,000 characters/i,
    /never presented as fact/i,
    /deterministic multi-agent/i,
    /cross-validat/i,
    /Every citation includes a verifiable identifier/i,
    /at delivery/i
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
  // T1-9: re-resolution runs when the report is assembled, not at delivery.
  assert.match(report, /\*\*Citations\*\*: 34 cited · 29 VERIFIED · 0 UNRESOLVED · 5 UNCHECKED when this report was assembled/);
  assert.doesNotMatch(report, /at delivery/);
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
  assert.match(complete, /Cited DOIs, PMIDs and PMCIDs are retraction-screened \(Crossref for DOIs/);
  const partial = render({ retraction_screen_checked: false, retraction_screen_cited: 24, unscreened: 3, unscreened_ids: ["DOI:10.4/a", "DOI:10.4/b", "PMID:1"] });
  assert.doesNotMatch(partial, /retraction-screened/);
  assert.match(partial, /For this report 3 of 24 cited DOIs, PMIDs and PMCIDs could not be screened; the citation-integrity ledger lists them\./);
  const unknown = render({});
  assert.doesNotMatch(unknown, /retraction-screened/, "a record without coverage claims none");
  assert.match(unknown, /does not state whether every cited DOI, PMID and PMCID could be screened/);
});

// T1-9: gate sentences only for a record that passed (the dataset-scoped sentence is pinned in
// tests/core/verifiability-copy.test.js; a dataset bundle needs real dataset files to package).
test("the store copy's gate bullets follow the record: passed or not passed", async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "openclaw-phase19-gate-bullets-"));
  const packager = createDeliverablePackager({ rootDir: tmp });
  const render = (label, mutate) => {
    const fixture = createMissionFixture();
    const ctx = withResolution(fixture, CLEAN_SUMMARY);
    mutate(ctx);
    const bundleDir = packager.createBundleWorkspace(`${fixture.offer.offer_id}-${label}`);
    packager.writeDeliverables(bundleDir, fixture.offer, ctx);
    return fs.readFileSync(path.join(bundleDir, "deliverables", "store-copy.md"), "utf8");
  };
  const passed = render("passed", () => {});
  assert.match(passed, /Zero-Fabrication Guarantee/);
  assert.match(passed, /flagged `\[UNVERIFIED\]` at every mention and in the citation index/);
  const failed = render("failed", (ctx) => { ctx.citation_verification.pass = false; });
  assert.doesNotMatch(failed, /Zero-Fabrication Guarantee/);
  assert.match(failed, /did not pass the citation gate/);
});

test("the methodology statement describes the bundle seal and the real density rule", async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "openclaw-phase19-methodology-"));
  const packager = createDeliverablePackager({ rootDir: tmp });
  const fixture = createMissionFixture();
  const offer = { ...fixture.offer, tier: "premium" }; // the statement ships with premium / enterprise tiers
  const bundleDir = packager.createBundleWorkspace(offer.offer_id);
  packager.writeDeliverables(bundleDir, offer, withResolution(fixture, CLEAN_SUMMARY));
  const found = fs.readdirSync(path.join(bundleDir, "deliverables"))
    .map((f) => fs.readFileSync(path.join(bundleDir, "deliverables", f), "utf8"))
    .find((t) => t.includes("# Methodology Statement"));
  assert.ok(found, "a methodology statement is written");
  assert.match(found, /## Bundle Seal/);
  assert.match(found, /at least 5 such lines/);
  assert.match(found, /a report below the citation-density threshold does not ship/);
  assert.doesNotMatch(found, /Provenance Chain/);
});

test("the citation-integrity ledger claims only the retraction screens actually queried", () => {
  const { buildIntegrityReport } = require(path.join(root, "openclaw-bridge", "monetization", "integrity-rating.js"));
  const md = buildIntegrityReport({ cited: 4, grounded: 4, ungrounded: 0, retracted_dois: [] }).markdown;
  assert.match(md, /Crossref for DOIs, PubMed for PMIDs/, "names only the screens actually queried");
  // Retraction Watch may appear ONLY as the documented coverage bound, never as a screen we run.
  assert.doesNotMatch(md, /Retraction Watch(?! bulk dataset is not used)/i);
  assert.match(md, /Retraction Watch bulk dataset is not used/, "states the residual coverage gap");
});

// ── Tier 1 review fixes (2026-11-14) ─────────────────────────────────────────────────────────────

test("review: a PREMIUM bundle (methodology + schema files) reintroduces no retired claim, and the schema declares grounded_in_run", async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "openclaw-phase19-premium-banned-"));
  const packager = createDeliverablePackager({ rootDir: tmp });
  const fixture = createMissionFixture();
  const offer = { ...fixture.offer, tier: "premium" };
  const bundleDir = packager.createBundleWorkspace(offer.offer_id);
  packager.writeDeliverables(bundleDir, offer, withResolution(fixture, FLAGGED_SUMMARY));
  const dir = path.join(bundleDir, "deliverables");
  const files = fs.readdirSync(dir);
  assert.ok(files.includes("methodology-statement.md") && files.includes("schema-definition.json"), "the premium-only files are written");
  for (const file of files) {
    const body = fs.readFileSync(path.join(dir, file), "utf8");
    for (const re of [/chain[- ]hash/i, /via API/i, /append-only/i, /deterministic multi-agent/i, /cross-validat/i, /at delivery/i]) {
      assert.doesNotMatch(body, re, `${file} carries ${re}`);
    }
  }
  const schema = JSON.parse(fs.readFileSync(path.join(dir, "schema-definition.json"), "utf8"));
  const columns = schema.output_formats.citation_index.columns.map((c) => c.name);
  assert.deepEqual(columns, ["citation_type", "identifier", "source_task", "context_snippet", "grounded_in_run"]);
  assert.equal(schema.output_formats.citation_index.example_record.grounded_in_run, "yes");
  assert.ok(!("structured_json_payload" in schema), "no payload the bundle does not hold");
  const header = fs.readFileSync(path.join(dir, "tables.csv"), "utf8").split("\n")[0];
  assert.equal(header, columns.join(","), "the schema matches the file it describes");
});

test("review: the sample preview never cuts an untraced identifier off from its [UNVERIFIED] mark", async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "openclaw-phase19-preview-cut-"));
  const packager = createDeliverablePackager({ rootDir: tmp });
  const fixture = createMissionFixture();
  // The id ends at character 1500 of a long line: the old 1500-character slice kept the id and cut
  // its mark off.
  const head = "Executive summary.\n";
  const lead = head + "x".repeat(1486 - head.length);
  const synthesis = `${lead}PMID: 99999999 [UNVERIFIED] is the key paper.\nSecond paragraph.`;
  assert.equal(synthesis.indexOf("99999999") + "99999999".length, 1500, "sanity: the id ends exactly at the old cut");
  assert.doesNotMatch(synthesis.slice(0, 1500), /\[UNVERIFIED\]/, "sanity: the old cut lost the mark");
  const ctx = withResolution(fixture, CLEAN_SUMMARY);
  ctx.artifacts = [{ task_id: "synthesizer", output_rel: "workspace/research-output/s/output.md", output_full: synthesis }];
  ctx.citation_verification.ungrounded_ids = ["PMID:99999999"];
  const bundleDir = packager.createBundleWorkspace(fixture.offer.offer_id);
  packager.writeDeliverables(bundleDir, fixture.offer, ctx);
  const preview = fs.readFileSync(path.join(bundleDir, "deliverables", "sample-preview.md"), "utf8");
  const summary = preview.split("\n---\n")[0];
  assert.match(summary, /PMID: 99999999 \[UNVERIFIED\] is the key paper\./, "the whole line, mark included");
  assert.doesNotMatch(summary, /Second paragraph/, "the cut is still bounded at a line end");
});

test("review: after a crashed re-resolution pass the store copy says nothing was looked up", async () => {
  const copy = await renderStoreCopyFor("fallback", {
    counts: { total: 4, verified: 0, unresolved: 0, unchecked: 4 },
    by_type: { PMID: { total: 4, verified: 0, unresolved: 0, unchecked: 4 } },
    verified_ratio: 0,
    delivery_decision: "DELIVER_WITH_FLAGS",
    reresolution_completed: false
  });
  assert.match(copy, /Re-resolution did not complete for this bundle: no cited identifier was looked up in its registry/);
  assert.match(copy, /not cleared for delivery until the order is re-run/);
  assert.doesNotMatch(copy, /submitted for independent re-resolution/);
  assert.doesNotMatch(copy, /independently re-resolved VERIFIED/);
});

test("review: the retraction bullet says which cited DOIs were screened against Crossref alone", async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "openclaw-phase19-crossref-only-"));
  const packager = createDeliverablePackager({ rootDir: tmp });
  const fixture = createMissionFixture();
  const ctx = withResolution(fixture, CLEAN_SUMMARY);
  Object.assign(ctx.citation_verification, { retraction_screen_checked: true, retraction_screen_cited: 4, unscreened: 0, retraction_dois_crossref_only: 2 });
  const bundleDir = packager.createBundleWorkspace(fixture.offer.offer_id);
  packager.writeDeliverables(bundleDir, fixture.offer, ctx);
  const copy = fs.readFileSync(path.join(bundleDir, "deliverables", "store-copy.md"), "utf8");
  assert.match(copy, /any retracted source blocks release\. For 2 cited DOIs the PubMed cross-check reached no verdict, so they were screened against Crossref alone\./);
});

function writeDatasetFiles(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const datasetPath = path.join(dir, "dataset.jsonl");
  const schemaPath = path.join(dir, "schema.json");
  const buildReportPath = path.join(dir, "build-report.json");
  fs.writeFileSync(datasetPath, "{\"row\":1}\n{\"row\":2}\n");
  fs.writeFileSync(schemaPath, JSON.stringify({ type: "object", properties: { row: { type: "integer" } } }));
  fs.writeFileSync(buildReportPath, JSON.stringify({ ok: true }));
  return { dataset_path: datasetPath, schema_path: schemaPath, build_report_path: buildReportPath };
}

test("review: a dataset-sourced bundle names its own files and states only what its record says", async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "openclaw-phase19-dataset-"));
  const packager = createDeliverablePackager({ rootDir: tmp });
  // The premium tier's real required slots (config/monetization-map.json), schema_definition included.
  const premiumSlots = require(path.join(root, "config", "monetization-map.json")).tiers.premium.required_artifact_slots;
  const offer = { ...createMissionFixture().offer, offer_id: "offer-dataset-demo", source_kind: "dataset", tier: "premium", artifact_slots: premiumSlots };
  const base = {
    source_kind: "dataset",
    source_id: "dataset-demo",
    build_id: "build-demo",
    metadata: { dataset_type: "trial_records", row_count: 2 },
    artifacts: [],
    ...writeDatasetFiles(path.join(tmp, "dataset-src"))
  };
  const render = (label, cv) => {
    const bundleDir = packager.createBundleWorkspace(`${offer.offer_id}-${label}`);
    const refs = packager.writeDeliverables(bundleDir, offer, cv ? { ...base, citation_verification: cv } : base);
    const dir = path.join(bundleDir, "deliverables");
    return { dir, refs, files: fs.readdirSync(dir), read: (f) => fs.readFileSync(path.join(dir, f), "utf8") };
  };

  const gated = render("gated", { pass: true, cited: 12, grounded: 12, ungrounded: 0, reproducibility_manifest: { summary: CLEAN_SUMMARY, citations: [] } });
  const copy = gated.read("store-copy.md");
  assert.match(copy, /\| `dataset\.jsonl` \| The dataset rows \|/);
  assert.doesNotMatch(copy, /`report\.md`|`tables\.csv`|listed in `tables\.csv`/, "no research file the bundle lacks");
  assert.doesNotMatch(copy, /Every report passes the citation gate/);
  assert.match(copy, /the source report's Reproducibility Manifest, which this dataset bundle does not include/);
  assert.match(copy, /the gate checked that report's cited identifiers, not each dataset row/);
  const methodology = gated.read("methodology-statement.md");
  assert.match(methodology, /this dataset's rows were not checked one by one/);
  assert.doesNotMatch(methodology, /Cross-reference verification \(grounding\)/);
  assert.ok(!gated.files.includes("schema-definition.json"), "the research schema file is not shipped with a dataset");
  assert.ok(gated.files.includes("schema.json"), "the dataset's own schema is");
  assert.equal(gated.refs.schema_definition, gated.refs.structured_support, "the tier's schema_definition slot is the dataset's schema.json");
  assert.match(gated.refs.schema_definition, /schema\.json$/);

  const ungated = render("ungated", null);
  const plain = ungated.read("store-copy.md");
  assert.match(plain, /carries no citation-verification record/);
  assert.doesNotMatch(plain, /Every report passes the citation gate/);
  assert.match(ungated.read("methodology-statement.md"), /no passing citation-gate record, so no grounding result is stated/);
});
