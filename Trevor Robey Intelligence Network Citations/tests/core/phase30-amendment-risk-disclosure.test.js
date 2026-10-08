"use strict";

// The amendment-risk section must never vanish without a word. Found by the first real run (2026-10-08).
//
// The registry's undocumented change-history endpoint answered HTTP 403 for every request. The
// fetcher swallowed the errors, buildAmendmentRisk found no trial with history and returned an empty
// string, and the engine dropped the section: run #3's shipped graveyard memo had no amendment
// signal and nothing said why. A reader could not tell "this indication has low amendment risk"
// from "the signal could not be computed" - the one confusion a citation-traced product exists to
// prevent. These tests follow the disclosure from the fetcher's accounting, through the engine, into
// the sealed bundle's own deliverable (tests/helpers/workflow-bundle-harness.js - real components).

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  FULL_PIPELINE,
  MISSION_STEP,
  makeEngine,
  stepResult,
  workflowDef
} = require("../helpers/workflow-bundle-harness.js");

const INDICATION = "test indication";

// Records shaped like the real fetcher's output: coverage + history accounting ride on the array as
// NON-ENUMERABLE properties.
function stoppedTrials(records, extraMeta) {
  const meta = {
    eligibleTotal: records.length,
    censusComplete: true,
    pagesExhausted: true,
    fetchError: false,
    droppedNoNct: 0,
    droppedDuplicate: 0,
    historySelectionRule: "the first N stopped programs in registry order.",
    conditionQuery: INDICATION,
    ...extraMeta
  };
  for (const [k, v] of Object.entries(meta)) {
    Object.defineProperty(records, k, { value: v, enumerable: false, configurable: true });
  }
  return records;
}

const trial = (nctId, versions) => ({
  nctId, title: `Study ${nctId}`, status: "TERMINATED", phase: "PHASE3", whyStopped: "Slow accrual",
  changeSummary: versions ? { versions, amended_modules: ["Eligibility", "Outcomes"] } : undefined
});

const REFUSED = { historyAttempted: 2, historySucceeded: 0, historyFailed: 2, historyFirstError: "HTTP 403" };
const RETRIEVED = { historyAttempted: 2, historySucceeded: 2, historyFailed: 0, historyFirstError: "" };

function engineWith(records) {
  const ctgovSupplemental = { searchStoppedTrials: async () => records };
  return makeEngine({}, { researchExtras: { ctgovSupplemental } });
}

function persistedMemo(rootDir, workflowId) {
  return fs.readFileSync(path.join(rootDir, "workspace", "workflows", workflowId, "graveyard-memo.md"), "utf8");
}

describe("amendment-risk disclosure - engine", () => {
  it("persists the disclosure into graveyard-memo.md and records the status, when every history request was refused", async () => {
    const { engine, rootDir } = await engineWith(stoppedTrials([trial("NCT01111111"), trial("NCT02222222")], REFUSED));
    const result = await engine.executeWorkflow(workflowDef([MISSION_STEP]), { inputs: { indication: INDICATION } });
    assert.equal(result.ok, true, `workflow failed: ${JSON.stringify(result.error)}`);

    const memo = persistedMemo(rootDir, result.workflow_id);
    assert.match(memo, /Not available for this run/);
    assert.match(memo, /HTTP 403/);
    assert.doesNotMatch(memo, /Amendment-risk: (LOW|MODERATE|HIGH)/);
    assert.equal(result.artifacts.graveyard.amendment_status, "unavailable");
    assert.equal(result.artifacts.graveyard.amendment_band, null);
    assert.equal(stepResult(result, "research").amendment_risk.status, "unavailable");
  });

  it("leaves a computed band exactly as it was", async () => {
    const { engine, rootDir } = await engineWith(stoppedTrials([trial("NCT01111111", 12), trial("NCT02222222", 11)], RETRIEVED));
    const result = await engine.executeWorkflow(workflowDef([MISSION_STEP]), { inputs: { indication: INDICATION } });
    assert.equal(result.ok, true, `workflow failed: ${JSON.stringify(result.error)}`);

    const memo = persistedMemo(rootDir, result.workflow_id);
    assert.match(memo, /Amendment-risk: HIGH/);
    assert.doesNotMatch(memo, /Not available for this run|Retrieval gap/);
    assert.equal(result.artifacts.graveyard.amendment_band, "HIGH");
    assert.equal(result.artifacts.graveyard.amendment_status, "ok");
  });
});

describe("amendment-risk disclosure - the sealed bundle", () => {
  it("ships the disclosure inside deliverables/graveyard-memo.md", async () => {
    const { engine, rootDir } = await engineWith(stoppedTrials([trial("NCT01111111"), trial("NCT02222222")], REFUSED));
    const result = await engine.executeWorkflow(workflowDef(FULL_PIPELINE), { inputs: { indication: INDICATION } });
    assert.equal(result.ok, true, `workflow failed: ${JSON.stringify(result.error)}`);

    const bundleDir = path.join(rootDir, "workspace", "releases", result.artifacts.offer_id);
    const memo = fs.readFileSync(path.join(bundleDir, "deliverables", "graveyard-memo.md"), "utf8");
    assert.match(memo, /# Graveyard Memo/);
    assert.match(memo, /Not available for this run/);
    assert.match(memo, /HTTP 403/);
  });
});
