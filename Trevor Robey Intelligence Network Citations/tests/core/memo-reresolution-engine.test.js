"use strict";

// T2-6 (2026-11-16), through the real engine: the NCT numbers the graveyard memo and the design
// benchmark ship are re-resolved with the report's identifiers, in one pass, and recorded in the sealed
// manifest with the deliverables each appears in. Until this date re-resolution read the report's text
// alone and both files were built afterwards, so a memo NCT was never looked up (the order form says
// these files "are not separately re-resolved at delivery"). The report's own counts stay report-only;
// an UNRESOLVED memo NCT blocks like any other id (operator default D15); a memo fetch error still
// ships the report, without the memo.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  FULL_PIPELINE,
  GROUNDED_NCT,
  MISSION_STEP,
  makeEngine,
  workflowDef
} = require("../helpers/workflow-bundle-harness.js");
const { createCitationReresolver } = require("../../openclaw-bridge/mcp/citation-reresolver/citation-reresolver.js");

const INDICATION = "test indication";
const MEMO_ONLY = "NCT02222222";
const BENCH_ONLY = "NCT03333333";

// Records shaped like the real fetchers' output: coverage metadata rides on the array, non-enumerable.
function withMeta(records, meta) {
  for (const [k, v] of Object.entries(meta)) {
    Object.defineProperty(records, k, { value: v, enumerable: false, configurable: true });
  }
  return records;
}

const stopped = (ids) => withMeta(
  ids.map((nctId) => ({ nctId, title: `Study ${nctId}`, status: "TERMINATED", phase: "PHASE3", whyStopped: "Slow accrual" })),
  { eligibleTotal: ids.length, censusComplete: true, pagesExhausted: true, fetchError: false, droppedNoNct: 0, droppedDuplicate: 0, conditionQuery: INDICATION }
);

const cohort = (ids) => withMeta(
  ids.map((nctId) => ({ nctId, title: `Phase 3 ${nctId}`, phase: "PHASE3", sponsor: "Sponsor A", enrollment: 300 })),
  { eligibleTotal: ids.length, selectionRule: "fixture cohort", sort: "fixture order" }
);

const ctgovSupplemental = (ids) => ({ searchStoppedTrials: async () => stopped(ids) });
const ctgovDesignBenchmark = (ids) => ({ searchDesignCohort: async () => cohort(ids) });

function sealedManifest(rootDir, offerId) {
  return JSON.parse(fs.readFileSync(path.join(rootDir, "workspace", "releases", offerId, "deliverables", "reproducibility-manifest.json"), "utf8"));
}

function sealedFile(rootDir, offerId, name) {
  return fs.readFileSync(path.join(rootDir, "workspace", "releases", offerId, "deliverables", name), "utf8");
}

const row = (manifest, id) => manifest.citations.find((c) => c.id === id);

describe("T2-6: the memo's and the benchmark's NCT numbers are re-resolved with the report's", () => {
  it("an NCT only the memo lists is in the sealed manifest, VERIFIED, tagged graveyard-memo; the report's own counts are unchanged", async () => {
    const { engine, rootDir } = await makeEngine({}, {
      researchExtras: { ctgovSupplemental: ctgovSupplemental([GROUNDED_NCT, MEMO_ONLY]) }
    });
    const result = await engine.executeWorkflow(workflowDef(FULL_PIPELINE), { inputs: { indication: INDICATION } });
    assert.equal(result.ok, true, JSON.stringify(result.error));
    const manifest = sealedManifest(rootDir, result.artifacts.offer_id);

    assert.equal(row(manifest, MEMO_ONLY).status, "VERIFIED");
    assert.deepEqual(row(manifest, MEMO_ONLY).sections, ["graveyard-memo"]);
    assert.deepEqual(row(manifest, GROUNDED_NCT).sections, ["report", "graveyard-memo"]);
    assert.equal(row(manifest, MEMO_ONLY).grounded_in_run, true, "the memo's fetcher retrieved it this run");
    assert.deepEqual(manifest.summary.by_section, {
      report: { total: 1, verified: 1, unresolved: 0, unchecked: 0 },
      "graveyard-memo": { total: 2, verified: 2, unresolved: 0, unchecked: 0 }
    });
    assert.equal(manifest.summary.counts.total, 2, "the manifest counts every row it lists");
    assert.equal(manifest.summary.delivery_decision, "DELIVER");

    // report.md speaks of the report: one cited identifier, as before T2-6.
    const report = sealedFile(rootDir, result.artifacts.offer_id, "report.md");
    assert.match(report, /\*\*Citations\*\*: 1 cited · 1 VERIFIED · 0 UNRESOLVED · 0 UNCHECKED/);
    assert.match(report, /\*\*1 VERIFIED\*\* of 1/);
    assert.match(report, /the graveyard memo lists 2, all VERIFIED/);

    const md = sealedFile(rootDir, result.artifacts.offer_id, "reproducibility-manifest.md");
    assert.match(md, /By deliverable: report 1 \(1 VERIFIED · 0 UNRESOLVED · 0 UNCHECKED\); graveyard memo 2 \(2 VERIFIED/);
    assert.match(md, new RegExp(`\\| NCT \\| ${MEMO_ONLY} \\| VERIFIED \\|.*\\| graveyard memo \\|`));
  });

  it("the benchmark's NCT numbers are tagged design-benchmark", async () => {
    const { engine, rootDir } = await makeEngine({}, {
      researchExtras: {
        ctgovSupplemental: ctgovSupplemental([MEMO_ONLY]),
        ctgovDesignBenchmark: ctgovDesignBenchmark([BENCH_ONLY, MEMO_ONLY])
      }
    });
    const result = await engine.executeWorkflow(workflowDef(FULL_PIPELINE), { inputs: { indication: INDICATION } });
    assert.equal(result.ok, true, JSON.stringify(result.error));
    const manifest = sealedManifest(rootDir, result.artifacts.offer_id);
    assert.deepEqual(row(manifest, BENCH_ONLY).sections, ["design-benchmark"]);
    assert.deepEqual(row(manifest, MEMO_ONLY).sections, ["graveyard-memo", "design-benchmark"]);
    assert.deepEqual(row(manifest, GROUNDED_NCT).sections, ["report"]);
    assert.equal(manifest.summary.by_section["design-benchmark"].total, 2);
    assert.equal(manifest.summary.by_section.report.total, 1);
  });

  it("a memo NCT the registry answers 404 for blocks the run (D15), through the real re-resolver", async () => {
    // The batch answers for the real number only; the one-study request for the memo's number is a 404.
    const fetchImpl = async (url) => {
      if (url.includes("filter.ids=")) {
        return { status: 200, json: async () => ({ studies: [{ protocolSection: { identificationModule: { nctId: GROUNDED_NCT } } }] }) };
      }
      if (url.includes(`/studies/${MEMO_ONLY}`)) return { status: 404, json: async () => ({}) };
      throw new Error(`no mock route for ${url}`);
    };
    const citationReresolver = createCitationReresolver({ fetchImpl, nowIso: () => "2026-11-16T00:00:00Z", sleep: async () => {} });
    const { engine, rootDir } = await makeEngine({}, {
      researchExtras: { citationReresolver, ctgovSupplemental: ctgovSupplemental([MEMO_ONLY]) }
    });
    const result = await engine.executeWorkflow(workflowDef([MISSION_STEP]), { inputs: { indication: INDICATION } });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "PHASE30_CITATION_UNRESOLVED");

    const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, "workspace", "workflows", result.workflow_id, "reproducibility-manifest.json"), "utf8"));
    assert.equal(manifest.summary.delivery_decision, "BLOCK");
    assert.equal(row(manifest, MEMO_ONLY).status, "UNRESOLVED");
    assert.equal(row(manifest, MEMO_ONLY).evidence.reason, "nct_not_found");
    assert.equal(row(manifest, GROUNDED_NCT).status, "VERIFIED");
    assert.equal(row(manifest, GROUNDED_NCT).evidence.batch_size, 2, "both numbers went in one batch request");
    assert.deepEqual(manifest.summary.by_section["graveyard-memo"], { total: 1, verified: 0, unresolved: 1, unchecked: 0 });
  });

  it("a memo fetch error still ships the report, without the memo, and the manifest is as it was", async () => {
    const failing = { searchStoppedTrials: async () => { throw new Error("ClinicalTrials.gov unreachable"); } };
    const { engine, rootDir } = await makeEngine({}, { researchExtras: { ctgovSupplemental: failing } });
    const result = await engine.executeWorkflow(workflowDef(FULL_PIPELINE), { inputs: { indication: INDICATION } });
    assert.equal(result.ok, true, JSON.stringify(result.error));
    const deliverables = path.join(rootDir, "workspace", "releases", result.artifacts.offer_id, "deliverables");
    assert.equal(fs.existsSync(path.join(deliverables, "graveyard-memo.md")), false);
    const manifest = sealedManifest(rootDir, result.artifacts.offer_id);
    assert.equal(manifest.summary.by_section, undefined, "no deliverable was tagged, so no per-deliverable counts");
    assert.equal(manifest.citations.some((c) => "sections" in c), false);
    assert.equal(manifest.summary.counts.total, 1);
  });
});
