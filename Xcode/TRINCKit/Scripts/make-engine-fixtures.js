#!/usr/bin/env node
"use strict";

// Regenerate TRINCKit's ENGINE-BUILT fixture (synthetic content, never a deliverable):
//
//   node /Users/myhome/TRINC/Xcode/TRINCKit/Scripts/make-engine-fixtures.js
//
// The hand-written fixtures from make-fixtures.py check the reader against an independent ZIP
// implementation. This one checks the reader against the ENGINE's own formats: every file that
// carries a format is produced by the engine's code, not copied from it, so a format change in the
// engine shows up as a diff here the next time this runs.
//   - reproducibility-manifest.json / .md: buildReproducibilityManifest + renderManifestMarkdown
//     (openclaw-bridge/core/reproducibility-manifest.js), with an attribution mismatch, so the
//     bundle is DELIVER_WITH_FLAGS / attribution_mismatch, the 2026-11-04 flag no real bundle carries yet;
//   - the inline "[ATTRIBUTION MISMATCH: registry lists …]" mark in report.md: annotateAttributionText
//     (openclaw-bridge/core/citation-attribution.js);
//   - manifest.json + checksums.txt: the packager's own finalizeBundle (deliverable-packager.js);
//   - engine-flagged.zip: the exporter's buildDeterministicZip (scripts/_export-zip-util.js).
// release-approval.json's hash_of_release_bundle repeats release-approval-manager.js computeBundleHash
// (not exported there): sha256("phase19-release-bundle-v1|" + JSON.stringify(files)). The same formula
// was checked against all seven real releases on 2026-11-05.
//
// engine-manifests/ holds three more reproducibility manifests from the same builder, as JSON only (the
// app reads nothing else from them), for the fields Tier 1 (2026-11-14) and Tier 2a (2026-11-16) added:
//   - tagged.json: rows tagged with the deliverables they appear in (T2-6 `sections`, `by_section`), a
//     PMCID, an ISRCTN and an EudraCT id (T2-16), and a retraction screen that names the id it could not
//     screen (T1-7) -> DELIVER_WITH_FLAGS, unchecked_over_threshold + retraction_screen_incomplete;
//   - retracted-pmcid.json: a cited PMCID found retracted (T2-16 `retracted_pmcids`) -> BLOCK;
//   - crashed-pass.json: the fallback the engine seals when its re-resolution pass crashed (T1-8
//     `reresolution_completed: false`, every id UNCHECKED with reason reresolution_error).
//
// Writes only under Tests/TRINCKit/Fixtures/engine-flagged{,.zip} and engine-manifests/; touches nothing
// in the engine. The identifiers are fixture placeholders (PMID 00000002, NCT00000002, DOI 10.0000/fixture.N,
// PMC0000002, ISRCTN00000002, EudraCT 2020-000002-02).

const fs = require("node:fs");
const path = require("node:path");

const ENGINE = path.resolve(__dirname, "..", "..", "..", "Trevor Robey Intelligence Network Citations");
const OUT = path.resolve(__dirname, "..", "Tests", "TRINCKitTests", "Fixtures");
const NAME = "engine-flagged";

const { buildReproducibilityManifest, renderManifestMarkdown } = require(path.join(ENGINE, "openclaw-bridge/core/reproducibility-manifest.js"));
const { annotateAttributionText } = require(path.join(ENGINE, "openclaw-bridge/core/citation-attribution.js"));
const { createDeliverablePackager } = require(path.join(ENGINE, "openclaw-bridge/monetization/deliverable-packager.js"));
const { buildDeterministicZip } = require(path.join(ENGINE, "scripts/_export-zip-util.js"));
const { canonicalize, canonicalJson, sha256 } = require(path.join(ENGINE, "workflows/governance-automation/common.js"));

const WRONG_DOI = "10.0000/fixture.2";
const RIGHT_PMID = "00000002";
const TRIAL = "NCT00000002";
const STAMP = "2026-11-05T00:00:00.000Z";

const REPORT = [
  "# Fixture Report (engine-built)",
  "",
  "**FIXTURE — synthetic test data, not a client deliverable.**",
  "",
  `The comparator trial is ${TRIAL}.`,
  "",
  "## References",
  "",
  "| Work | Identifier |",
  "| --- | --- |",
  `| Chio et al., 2022 | doi: ${WRONG_DOI} |`,
  `| Brown et al., 2017 | PMID: ${RIGHT_PMID} |`,
  "",
].join("\n");

// What the re-resolver's checkAttributions returns for that report (the shape the engine's own
// tests feed buildReproducibilityManifest, tests/reproducibility-manifest.test.js).
const ATTRIBUTION = {
  checked: true,
  marked_lines: 1,
  counts: { cited: 2, checked: 2, matched: 1, mismatched: 1, mismatched_works: 1, not_checked: 0 },
  results: [
    { id: WRONG_DOI, type: "DOI", status: "author_mismatch", written: { name: "Chio", year: 2022 }, registry_label: "Feldman et al., 2022" },
    { id: RIGHT_PMID, type: "PMID", status: "match", written: { name: "Brown", year: 2017 }, registry_label: "Brown et al., 2017" },
  ],
};

function cit(type, id, resolvedUrl, evidence) {
  return { id, type, status: "VERIFIED", resolver_type: "primary", resolved_url: resolvedUrl, http_status: 200, checked_at: STAMP, evidence, attempts: 1 };
}

function writeText(file, body) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body, "utf8");
}

const VARIANTS = "engine-manifests";
const VARIANT_STAMP = "2026-11-16T00:00:00.000Z";

// One re-resolver result, tagged with its deliverables the way workflow-engine.js `tag` does.
function row(type, id, status, httpStatus, evidence, sections) {
  return {
    id, type, status, resolver_type: "primary", resolved_url: null, http_status: httpStatus,
    checked_at: VARIANT_STAMP, evidence, attempts: 1, ...(sections ? { sections } : {}),
  };
}

function variantMeta(name, resolverTableVersion = "2026-11-16") {
  return {
    reportId: `mission-fixture-${name}`, deliveryId: `workflow-fixture-${name}`, resolverTableVersion,
    asOf: "2026-11-16", startedAt: VARIANT_STAMP, completedAt: "2026-11-16T00:00:06.000Z",
  };
}

function writeManifestVariants() {
  const dir = path.join(OUT, VARIANTS);
  fs.rmSync(dir, { recursive: true, force: true });
  const report = ["report"];
  const variants = {
    tagged: buildReproducibilityManifest({
      reresolved: [
        row("NCT", TRIAL, "VERIFIED", 200, { nctId_echo: TRIAL }, ["report", "graveyard-memo"]),
        row("PMID", RIGHT_PMID, "VERIFIED", 200, { has_docsum: true }, report),
        row("PMCID", "PMC0000002", "VERIFIED", 200, { pmcid_echo: "PMC0000002" }, report),
        row("ISRCTN", "ISRCTN00000002", "VERIFIED", 200, { isrctn_echo: "ISRCTN00000002" }, report),
        row("EudraCT", "2020-000002-02", "VERIFIED", 200, { eudract_echo: "2020-000002-02" }, report),
        row("NCT", "NCT00000003", "UNCHECKED", 429, { reason: "rate_limited" }, ["graveyard-memo"]),
        row("NCT", "NCT00000004", "VERIFIED", 200, { nctId_echo: "NCT00000004" }, ["graveyard-memo", "design-benchmark"]),
        row("NCT", "NCT00000005", "VERIFIED", 200, { nctId_echo: "NCT00000005" }, ["design-benchmark"]),
      ],
      // The report cites one PMID and one PMCID; the PMCID's PMC record could not be read.
      retraction: { checked: false, retracted_dois: [], retracted_pmids: [], retracted_pmcids: [], cited: 2, unscreened_ids: ["PMCID:PMC0000002"] },
      gate: { cited: 5, grounded: 5, ungrounded: 0, grounded_ratio: 1, min_grounded_ratio: 0.75 },
      groundedKeys: [`NCT:${TRIAL}`, `PMID:${RIGHT_PMID}`, "PMCID:PMC0000002", "ISRCTN:ISRCTN00000002", "EudraCT:2020-000002-02",
        "NCT:NCT00000003", "NCT:NCT00000004", "NCT:NCT00000005"],
      reresolutionCompleted: true,
      meta: variantMeta("tagged"),
    }),
    "retracted-pmcid": buildReproducibilityManifest({
      reresolved: [
        row("PMID", "00000003", "VERIFIED", 200, { has_docsum: true }),
        row("PMCID", "PMC0000003", "VERIFIED", 200, { pmcid_echo: "PMC0000003" }),
      ],
      retraction: { checked: true, retracted_dois: [], retracted_pmids: [], retracted_pmcids: ["PMC0000003"], cited: 2, unscreened_ids: [] },
      gate: { cited: 2, grounded: 2, ungrounded: 0, grounded_ratio: 1, min_grounded_ratio: 0.75 },
      groundedKeys: ["PMID:00000003", "PMCID:PMC0000003"],
      reresolutionCompleted: true,
      meta: variantMeta("retracted-pmcid"),
    }),
    // workflow-engine.js builds this fallback with no resolver table version and no HTTP status.
    "crashed-pass": buildReproducibilityManifest({
      reresolved: [
        row("PMID", RIGHT_PMID, "UNCHECKED", null, { reason: "reresolution_error" }),
        row("NCT", TRIAL, "UNCHECKED", null, { reason: "reresolution_error" }),
      ],
      retraction: { checked: true, retracted_dois: [], retracted_pmids: [], retracted_pmcids: [], cited: 1, unscreened_ids: [] },
      gate: { cited: 2, grounded: 2, ungrounded: 0, grounded_ratio: 1, min_grounded_ratio: 0.75 },
      groundedKeys: [`PMID:${RIGHT_PMID}`, `NCT:${TRIAL}`],
      reresolutionCompleted: false,
      meta: variantMeta("crashed-pass", null),
    }),
  };
  const out = {};
  for (const [name, rm] of Object.entries(variants)) {
    writeText(path.join(dir, `${name}.json`), JSON.stringify(rm, null, 2));
    out[name] = { decision: rm.summary.delivery_decision, flags: rm.summary.flag_reasons, blocks: rm.summary.block_reasons };
  }
  return { dir, variants: out };
}

// release-approval-manager.js collectBundleFiles + computeBundleHash, verbatim in behaviour.
function bundleHash(bundleDir) {
  const files = [];
  const stack = [bundleDir];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) { stack.push(full); continue; }
      const rel = path.relative(bundleDir, full).split(path.sep).join("/");
      if (["manifest.json", "checksums.txt", "release-approval.json"].includes(rel)
        || rel.startsWith("submission-evidence/") || rel.startsWith("delivery-evidence/")) continue;
      files.push(canonicalize({ file: rel, sha256: sha256(fs.readFileSync(full, "utf8")) }));
    }
  }
  files.sort((a, b) => a.file.localeCompare(b.file));
  return sha256(`phase19-release-bundle-v1|${JSON.stringify(canonicalize(files))}`);
}

function main() {
  const bundleDir = path.join(OUT, NAME);
  const zipPath = path.join(OUT, `${NAME}.zip`);
  fs.rmSync(bundleDir, { recursive: true, force: true });
  fs.rmSync(zipPath, { force: true });

  const marked = annotateAttributionText(REPORT, [{
    id: WRONG_DOI, type: "DOI", registry_label: "Feldman et al., 2022",
    registry_full: { authors: ["Feldman", "Ingre", "Corcia"], years: [2022] },
  }]);
  if (!marked.includes("[ATTRIBUTION MISMATCH: registry lists Feldman et al., 2022]")) {
    throw new Error("the engine's annotator did not mark the fixture's wrong attribution; check the report text");
  }

  const rm = buildReproducibilityManifest({
    reresolved: [
      cit("NCT", TRIAL, `https://clinicaltrials.gov/api/v2/studies/${TRIAL}?format=json`, { nctId_echo: TRIAL }),
      cit("DOI", WRONG_DOI, "https://api.crossref.org/works/10.0000%2Ffixture.2/agency", { crossref_status: "ok", message_type: "work-agency" }),
      cit("PMID", RIGHT_PMID, "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=00000002&retmode=json", { has_docsum: true }),
    ],
    retraction: { checked: true, retracted_dois: [], retracted_pmids: [] },
    gate: { cited: 3, grounded: 3, ungrounded: 0, grounded_ratio: 1, min_grounded_ratio: 0.75 },
    groundedIds: [TRIAL, WRONG_DOI, RIGHT_PMID],
    attribution: ATTRIBUTION,
    meta: {
      reportId: "mission-fixture-flagged", deliveryId: "workflow-fixture-flagged", resolverTableVersion: "2026-06-19",
      asOf: "2026-11-05", startedAt: STAMP, completedAt: "2026-11-05T00:00:04.000Z",
    },
  });

  const d = path.join(bundleDir, "deliverables");
  writeText(path.join(d, "report.md"), marked);
  writeText(path.join(d, "citation-integrity.md"), "# Citation Integrity & Provenance\n\n**FIXTURE.** Three identifiers, all grounded.\n");
  // The packager writes the JSON with JSON.stringify(rm, null, 2) and no trailing newline.
  writeText(path.join(d, "reproducibility-manifest.json"), JSON.stringify(rm, null, 2));
  writeText(path.join(d, "reproducibility-manifest.md"), renderManifestMarkdown(rm));
  writeText(path.join(bundleDir, "metadata.json"), canonicalJson(canonicalize({
    schema_version: "phase21-release-metadata-v1",
    offer_id: "offer-fixture-flagged",
    offer_title: "Fixture flagged benchmark (synthetic)",
    product_line: "biomedical_research_packs",
    tier: "standard",
    release_status: "packaged",
  })));

  // Seal with the packager's own code (it writes manifest.json and checksums.txt).
  const packager = createDeliverablePackager({ rootDir: OUT, releasesDir: OUT });
  packager.finalizeBundle(bundleDir);

  writeText(path.join(bundleDir, "release-approval.json"), canonicalJson(canonicalize({
    schema_version: "phase21-release-approval-v1",
    offer_id: "offer-fixture-flagged",
    approved_at: STAMP,
    approver: "fixture",
    approved_platform_targets: [],
    hash_of_release_bundle: bundleHash(bundleDir),
  })));

  buildDeterministicZip(bundleDir, zipPath);

  // The exporter records its export AFTER zipping, so the folder (not the ZIP) gains it, as in a real release.
  writeText(path.join(bundleDir, "submission-evidence", "export-events.json"),
    canonicalJson(canonicalize({ schema_version: "fixture", events: [] })));

  const manifests = writeManifestVariants();

  process.stdout.write(`${JSON.stringify({ ok: true, folder: bundleDir, zip: zipPath, decision: rm.summary.delivery_decision, flags: rm.summary.flag_reasons, manifests }, null, 2)}\n`);
}

main();
