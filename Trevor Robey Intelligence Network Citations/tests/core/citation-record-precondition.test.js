"use strict";

// T1-1 (2026-11-14), through the real engine and the real offer builder: a mission the citation gate
// did not pass cannot be packaged by ANY path. generate-offer.js used to package any mission whose
// status.json read "completed" — written before the gate ran — so a mission the gate blocked could
// still be sealed. The engine now records its verdict beside the mission
// (core/mission-citation-record.js) and the offer builder requires it and re-hashes what it pins.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { FULL_PIPELINE, GROUNDED_NCT, MISSION_STEP, makeEngine, workflowDef } = require("../helpers/workflow-bundle-harness.js");
const { writeJson, writeTaskText } = require("../helpers/phase20-fixtures.js");
const { missionCitationRecordPath, passMissionQualityAudit } = require("../../openclaw-bridge/core/mission-citation-record.js");

const OFFER = (source) => ({ source, product_line: "research_packs", tier: "standard", targets: ["datarade"] });
const codeOf = (fn) => { try { fn(); } catch (error) { return error.code; } return "(no error)"; };
const readRecord = (rootDir, missionId) => JSON.parse(fs.readFileSync(missionCitationRecordPath(rootDir, missionId), "utf8"));

// A spawner writing one section; `text` decides whether the gate passes.
function spawnerWriting(rootDir, text, captured) {
  return {
    spawnMission: async (envelope) => {
      captured.missionId = envelope.mission_id;
      const outputPath = writeTaskText(rootDir, "task-record-precondition-1", text, {
        fetched_citation_ids: [GROUNDED_NCT],
        rights: { commercial_use_allowed: true, redistribution_allowed: true },
        source_domain: "approved.example"
      });
      const missionRoot = path.join(rootDir, "workspace", "missions", envelope.mission_id);
      const subtask = { subtask_id: "sub-1", output_path: outputPath, status: "completed" };
      writeJson(path.join(missionRoot, "mission.json"), envelope);
      writeJson(path.join(missionRoot, "status.json"), { status: "completed" });
      writeJson(path.join(missionRoot, "artifacts", "mission-summary.json"), { subtask_results: [subtask] });
      captured.outputPath = outputPath;
      return { ok: true, subtask_results: [{ ...subtask, metadata_path: path.join(path.dirname(outputPath), "metadata.json") }] };
    }
  };
}

async function engineWriting(text) {
  const captured = {};
  const holder = {};
  const made = await makeEngine({}, { researchExtras: { agentSpawner: { spawnMission: (e) => holder.spawner.spawnMission(e) } } });
  holder.spawner = spawnerWriting(made.rootDir, text, captured);
  return { ...made, captured };
}

const GROUNDED_TEXT = `Comparable programs include trial ${GROUNDED_NCT}.`;

describe("only a gate-passed mission can be packaged, on every path (T1-1)", () => {
  it("a mission the gate blocks leaves a pass:false record, and the offer builder refuses it", async () => {
    const { engine, rootDir, monetizationRuntime, captured } = await engineWriting(
      `Comparable programs include trial ${GROUNDED_NCT}; see also PMID: 99999999.`);
    const result = await engine.executeWorkflow(workflowDef([MISSION_STEP]));
    assert.equal(result.error.code, "PHASE30_CITATION_UNVERIFIED");
    const record = readRecord(rootDir, captured.missionId);
    assert.equal(record.pass, false);
    assert.equal(record.verdict, "UNVERIFIED");
    assert.equal(record.error_code, "PHASE30_CITATION_UNVERIFIED");
    // generate-offer.js's path: the mission's status.json still reads "completed".
    assert.equal(codeOf(() => monetizationRuntime.offerBuilder.buildOffer(OFFER(captured.missionId))), "PHASE19_MISSION_CITATION_GATE_FAILED");
  });

  it("a passing FULL_PIPELINE run still completes, and its record is pass:true with the manifest and pinned hashes", async () => {
    const { engine, rootDir, monetizationRuntime, captured } = await engineWriting(GROUNDED_TEXT);
    const result = await engine.executeWorkflow(workflowDef(FULL_PIPELINE));
    assert.equal(result.ok, true, JSON.stringify(result.error));
    const record = readRecord(rootDir, captured.missionId);
    assert.equal(record.pass, true);
    assert.equal(record.quality_audit, "not_applicable", "the harness pipeline has no quality step");
    assert.ok(record.citation_verification.reproducibility_manifest.summary);
    assert.ok(record.mission_summary.sha256);
    assert.equal(record.outputs.length, 1);
    // The same mission can be re-packaged later by generate-offer.js's path, unchanged.
    const built = monetizationRuntime.offerBuilder.buildOffer(OFFER(captured.missionId));
    assert.equal(built.source_context.citation_verification.pass, true);
  });

  it("a section edited after the record is refused as STALE", async () => {
    const { engine, monetizationRuntime, captured } = await engineWriting(GROUNDED_TEXT);
    assert.equal((await engine.executeWorkflow(workflowDef([MISSION_STEP]))).ok, true);
    fs.appendFileSync(captured.outputPath, "\nAn unsourced claim added after the gate.\n");
    assert.equal(codeOf(() => monetizationRuntime.offerBuilder.buildOffer(OFFER(captured.missionId))), "PHASE19_MISSION_CITATION_RECORD_STALE");
  });

  it("a resumed mission (its summary rewritten with a new section) is refused as STALE", async () => {
    const { engine, rootDir, monetizationRuntime, captured } = await engineWriting(GROUNDED_TEXT);
    assert.equal((await engine.executeWorkflow(workflowDef([MISSION_STEP]))).ok, true);
    // What run-research-task.js --resume-mission leaves: a re-synthesized mission-summary.json.
    const extra = writeTaskText(rootDir, "task-record-precondition-2", "A section written on resume, never gated.", {});
    const summaryPath = path.join(rootDir, "workspace", "missions", captured.missionId, "artifacts", "mission-summary.json");
    const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
    summary.subtask_results.push({ subtask_id: "sub-2", output_path: extra, status: "completed" });
    writeJson(summaryPath, summary);
    assert.equal(codeOf(() => monetizationRuntime.offerBuilder.buildOffer(OFFER(captured.missionId))), "PHASE19_MISSION_CITATION_RECORD_STALE");
  });

  it("a quality audit that fails after the gate passed turns the record to pass:false", async () => {
    const { engine, rootDir, monetizationRuntime, captured } = await engineWriting(GROUNDED_TEXT);
    // One cited line is below the audit's default minimum of 5 citation-shaped lines: density fails,
    // so the section gate (a live search) never runs.
    const QUALITY = { step_id: "quality", type: "quality_audit", depends_on: ["research"] };
    const result = await engine.executeWorkflow(workflowDef([MISSION_STEP, QUALITY]));
    assert.equal(result.error.code, "PHASE30_QUALITY_BELOW_THRESHOLD");
    const record = readRecord(rootDir, captured.missionId);
    assert.equal(record.pass, false);
    assert.equal(record.verdict, "QUALITY_AUDIT_FAILED");
    assert.equal(record.quality_audit, "failed");
    assert.equal(codeOf(() => monetizationRuntime.offerBuilder.buildOffer(OFFER(captured.missionId))), "PHASE19_MISSION_CITATION_GATE_FAILED");
  });

  // Tier 1 review (2026-11-14, operator pick D1): the record waits for the workflow's quality audit.
  it("a run that stops between the gate and the quality audit leaves 'pending', and the offer builder refuses it", async () => {
    const { engine, rootDir, monetizationRuntime, captured } = await engineWriting(GROUNDED_TEXT);
    // An approve step with nothing to approve fails right after the mission, so the quality step,
    // which depends on it, never runs: the shape of a run killed or cancelled between the two.
    const APPROVE_EARLY = { step_id: "approve-early", type: "approve", depends_on: ["research"] };
    const QUALITY_LATE = { step_id: "quality", type: "quality_audit", depends_on: ["approve-early"] };
    const result = await engine.executeWorkflow(workflowDef([MISSION_STEP, APPROVE_EARLY, QUALITY_LATE]));
    assert.equal(result.ok, false, "the run stopped before the audit");
    const record = readRecord(rootDir, captured.missionId);
    assert.equal(record.pass, true, "the citation gate itself passed");
    assert.equal(record.quality_audit, "pending");
    assert.equal(codeOf(() => monetizationRuntime.offerBuilder.buildOffer(OFFER(captured.missionId))), "PHASE19_MISSION_QUALITY_AUDIT_PENDING");
    // The step the engine runs when the audit passes (a passing audit needs a live section search, so
    // the transition is driven directly): "pending" becomes "passed", and the mission packages.
    passMissionQualityAudit({ rootDir, missionId: captured.missionId });
    assert.equal(readRecord(rootDir, captured.missionId).quality_audit, "passed");
    assert.equal(monetizationRuntime.offerBuilder.buildOffer(OFFER(captured.missionId)).source_context.citation_verification.pass, true);
  });

  it("a workflow with no quality step records 'not_applicable', and its mission can be packaged", async () => {
    const { engine, rootDir, monetizationRuntime, captured } = await engineWriting(GROUNDED_TEXT);
    assert.equal((await engine.executeWorkflow(workflowDef([MISSION_STEP]))).ok, true);
    assert.equal(readRecord(rootDir, captured.missionId).quality_audit, "not_applicable");
    assert.equal(monetizationRuntime.offerBuilder.buildOffer(OFFER(captured.missionId)).source_context.citation_verification.pass, true);
  });

  // Review finding delivery:3: the record check's "is gone" branch alone refuses a deleted section.
  it("a section deleted after the record is refused as STALE (it is gone), never silently dropped", async () => {
    const { engine, monetizationRuntime, captured } = await engineWriting(GROUNDED_TEXT);
    assert.equal((await engine.executeWorkflow(workflowDef([MISSION_STEP]))).ok, true);
    fs.rmSync(captured.outputPath);
    let message = "";
    try { monetizationRuntime.offerBuilder.buildOffer(OFFER(captured.missionId)); } catch (error) { message = `${error.code} ${error.message}`; }
    assert.match(message, /^PHASE19_MISSION_CITATION_RECORD_STALE /);
    assert.match(message, /is gone/);
  });

  it("a mission no workflow gated (what run-research-task.js leaves) is refused as RECORD_MISSING", async () => {
    const { rootDir, monetizationRuntime } = await makeEngine({});
    const missionId = "mission-research-task-only";
    const outputPath = writeTaskText(rootDir, "task-research-task-only", GROUNDED_TEXT, {});
    const missionRoot = path.join(rootDir, "workspace", "missions", missionId);
    writeJson(path.join(missionRoot, "mission.json"), { mission_id: missionId, description: "run-research-task mission" });
    writeJson(path.join(missionRoot, "status.json"), { status: "completed" });
    writeJson(path.join(missionRoot, "artifacts", "mission-summary.json"), { subtask_results: [{ subtask_id: "s", output_path: outputPath, status: "completed" }] });
    assert.equal(codeOf(() => monetizationRuntime.offerBuilder.buildOffer(OFFER(missionId))), "PHASE19_MISSION_CITATION_RECORD_MISSING");
  });
});
