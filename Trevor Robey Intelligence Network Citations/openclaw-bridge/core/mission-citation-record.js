"use strict";

// mission-citation-record.js — T1-1 (2026-11-14): the citation gate's verdict, written beside the
// mission, so that EVERY packaging path refuses a mission the gate did not pass.
//
// Until this date the documented packaging command, scripts/generate-offer.js, built, sealed and
// committed a release from any mission whose status.json read "completed" (offer-builder.js checked
// nothing else), and agent-spawner writes "completed" BEFORE the gate runs. So a mission the gate
// blocked as UNVERIFIED or RETRACTED could still be packaged; only executeWorkflow's own offer step
// was gated.
//
// The workflow engine (executeMissionStep) writes workspace/missions/<id>/artifacts/
// citation-verification.json:
//   * pass:false immediately before each throw after the gate (gate verdict, annotation failure,
//     UNRESOLVED, a re-resolution crash with no fallback), and when a later quality-audit step
//     fails (density or zero-coverage);
//   * pass:true only after the LAST rewrite of the shipped sections (the attribution marks), with the
//     reproducibility manifest and the sha256 of mission-summary.json and of every output file the
//     packager will read. A failed pass:true write stops the run (fail-closed).
// offer-builder.resolveMissionSource requires that record and re-hashes the files, so text that
// changed after the gate (a resumed mission, an edited output) is refused as STALE.
//
// The quality audit (Tier 1 review, 2026-11-14, operator pick D1). A pass:true record says
// quality_audit "pending" when the workflow has a quality_audit step still to run, and the engine
// turns it to "passed" only when that step passes ("failed" when it fails, with pass:false); a workflow
// with no quality step records "not_applicable". The offer builder packages only "passed" or
// "not_applicable", so a run killed or cancelled between the gate and the audit cannot be packaged by
// generate-offer.js with a density audit that never ran.
//
// A record is only ever written by the engine. Never hand-write one: a mission sealed before T1-1 is
// re-run if it must be re-packaged (operator default D5).

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const SCHEMA_VERSION = "mission-citation-record-v1";
const QUALITY_AUDIT_STATES = new Set(["pending", "passed", "failed", "not_applicable"]);
// The only states the offer builder packages.
const PACKAGEABLE_AUDIT_STATES = new Set(["passed", "not_applicable"]);

function missionRoot(rootDir, missionId) {
  return path.join(rootDir, "workspace", "missions", String(missionId));
}

function missionCitationRecordPath(rootDir, missionId) {
  return path.join(missionRoot(rootDir, missionId), "artifacts", "citation-verification.json");
}

function missionSummaryPath(rootDir, missionId) {
  return path.join(missionRoot(rootDir, missionId), "artifacts", "mission-summary.json");
}

function fileSha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function relativeFromRoot(rootDir, filePath) {
  return path.relative(rootDir, filePath).split(path.sep).join("/");
}

// Pinned paths are taken between REAL paths, so the engine and a later packaging process agree on a
// file however each spells the repo path (a symlinked checkout, macOS /var → /private/var, a cwd).
function realOrSelf(p) {
  try { return fs.realpathSync(p); } catch { return p; }
}
function pinnedPath(rootDir, filePath) {
  return relativeFromRoot(realOrSelf(rootDir), realOrSelf(filePath));
}

// The output files the packager reads for a mission: every subtask output_path in
// mission-summary.json that exists, resolved against rootDir — exactly offer-builder's rule.
function listMissionOutputs(rootDir, summary) {
  const out = [];
  for (const result of Array.isArray(summary && summary.subtask_results) ? summary.subtask_results : []) {
    const raw = String((result && result.output_path) || "").trim();
    if (!raw) continue;
    const resolved = path.isAbsolute(raw) ? raw : path.resolve(rootDir, raw);
    if (fs.existsSync(resolved)) out.push(resolved);
  }
  return out;
}

// The hashes a pass:true record pins: mission-summary.json and every output file the packager reads.
// A mission with no summary pins nothing; the packager refuses it anyway (it needs the summary, and a
// record with no pinned summary never matches one).
function hashMissionFiles(rootDir, missionId) {
  const summaryPath = missionSummaryPath(rootDir, missionId);
  if (!fs.existsSync(summaryPath)) return { mission_summary: null, outputs: [] };
  const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
  return {
    mission_summary: { path: pinnedPath(rootDir, summaryPath), sha256: fileSha256(summaryPath) },
    outputs: listMissionOutputs(rootDir, summary).map((p) => ({ path: pinnedPath(rootDir, p), sha256: fileSha256(p) }))
  };
}

// Write (or rewrite) the record. Throws on any failure; the caller decides what a failure means.
function writeMissionCitationRecord(options = {}) {
  const rootDir = path.resolve(String(options.rootDir || ""));
  const missionId = String(options.missionId || "");
  if (!missionId) throw new Error("writeMissionCitationRecord requires missionId");
  const pass = options.pass === true;
  const record = {
    schema_version: SCHEMA_VERSION,
    mission_id: missionId,
    workflow_id: options.workflowId || null,
    pass,
    verdict: options.verdict || null,
    error_code: options.errorCode || null,
    // A pass:true record with no stated audit state is "pending": packaging waits for the audit.
    quality_audit: pass ? (QUALITY_AUDIT_STATES.has(options.qualityAudit) ? options.qualityAudit : "pending") : null,
    written_at: options.timeProvider && typeof options.timeProvider.nowIso === "function" ? options.timeProvider.nowIso() : null,
    ...(pass ? hashMissionFiles(rootDir, missionId) : {}),
    citation_verification: options.citationVerification || null
  };
  const recordPath = missionCitationRecordPath(rootDir, missionId);
  fs.mkdirSync(path.dirname(recordPath), { recursive: true });
  fs.writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  return record;
}

// Turn an existing record into pass:false (a later quality-audit failure). Throws on failure.
function failMissionCitationRecord(options = {}) {
  const recordPath = missionCitationRecordPath(path.resolve(String(options.rootDir || "")), options.missionId);
  const record = JSON.parse(fs.readFileSync(recordPath, "utf8"));
  const failed = {
    ...record,
    pass: false,
    verdict: options.verdict || "FAILED_AFTER_GATE",
    error_code: options.errorCode || null,
    quality_audit: QUALITY_AUDIT_STATES.has(options.qualityAudit) ? options.qualityAudit : (record.quality_audit || null)
  };
  fs.writeFileSync(recordPath, `${JSON.stringify(failed, null, 2)}\n`, "utf8");
  return failed;
}

// The workflow's quality_audit step passed: a pass:true record's "pending" becomes "passed". A record
// that did not pass is left as it is (an audit never makes a failed gate packageable). Throws on any
// read or write failure; the engine then fails the step (fail-closed).
function passMissionQualityAudit(options = {}) {
  const recordPath = missionCitationRecordPath(path.resolve(String(options.rootDir || "")), options.missionId);
  const record = JSON.parse(fs.readFileSync(recordPath, "utf8"));
  if (record.pass !== true) return record;
  const passed = { ...record, quality_audit: "passed" };
  fs.writeFileSync(recordPath, `${JSON.stringify(passed, null, 2)}\n`, "utf8");
  return passed;
}

function recordError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

// The packaging precondition. Returns the record's citation_verification, or throws:
//   PHASE19_MISSION_CITATION_RECORD_MISSING — no record, or an unreadable one;
//   PHASE19_MISSION_CITATION_GATE_FAILED   — pass is not true, or the manifest says BLOCK;
//   PHASE19_MISSION_CITATION_RECORD_STALE  — a pinned file changed, disappeared, or an output file
//                                            the packager would read is not in the record.
function assertMissionCitationRecord(rootDir, missionId) {
  const root = path.resolve(String(rootDir || ""));
  const recordPath = missionCitationRecordPath(root, missionId);
  let record;
  try {
    record = JSON.parse(fs.readFileSync(recordPath, "utf8"));
  } catch {
    throw recordError("PHASE19_MISSION_CITATION_RECORD_MISSING",
      `Mission '${missionId}' has no citation-gate record (${relativeFromRoot(root, recordPath)}). Only a mission the workflow engine's citation gate passed can be packaged; missions made by scripts/run-research-task.js, or sealed before 2026-11-14, are re-run through scripts/run-workflow.js.`);
  }
  if (!record || typeof record !== "object" || record.mission_id !== String(missionId)) {
    throw recordError("PHASE19_MISSION_CITATION_RECORD_MISSING", `Mission '${missionId}' carries a citation-gate record for another mission`);
  }
  const cv = record.citation_verification && typeof record.citation_verification === "object" ? record.citation_verification : {};
  const manifestSummary = cv.reproducibility_manifest && cv.reproducibility_manifest.summary;
  const decision = manifestSummary && manifestSummary.delivery_decision;
  if (record.pass !== true || decision === "BLOCK") {
    throw recordError("PHASE19_MISSION_CITATION_GATE_FAILED",
      `Mission '${missionId}' did not pass the citation gate (verdict ${record.verdict || "unknown"}${record.error_code ? `, ${record.error_code}` : ""}${decision === "BLOCK" ? ", delivery decision BLOCK" : ""}); it cannot be packaged.`);
  }
  if (!PACKAGEABLE_AUDIT_STATES.has(record.quality_audit)) {
    throw recordError("PHASE19_MISSION_QUALITY_AUDIT_PENDING",
      `Mission '${missionId}' passed the citation gate, but its workflow's quality audit has not passed (record: ${record.quality_audit || "no audit state"}); the run stopped before the audit, or is still running. Re-run the order before packaging.`);
  }
  let current;
  try {
    current = hashMissionFiles(root, missionId);
  } catch (err) {
    throw recordError("PHASE19_MISSION_CITATION_RECORD_STALE", `Mission '${missionId}': the files its citation-gate record pins cannot be read (${err.message})`);
  }
  const problems = [];
  if (!record.mission_summary || !current.mission_summary || record.mission_summary.sha256 !== current.mission_summary.sha256) {
    problems.push("mission-summary.json changed after the gate");
  }
  const pinned = new Map((Array.isArray(record.outputs) ? record.outputs : []).map((o) => [o.path, o.sha256]));
  const now = new Map(current.outputs.map((o) => [o.path, o.sha256]));
  for (const [p, sha] of now) {
    if (!pinned.has(p)) problems.push(`${p} is not in the record`);
    else if (pinned.get(p) !== sha) problems.push(`${p} changed after the gate`);
  }
  for (const p of pinned.keys()) {
    if (!now.has(p)) problems.push(`${p} is gone`);
  }
  if (problems.length > 0) {
    throw recordError("PHASE19_MISSION_CITATION_RECORD_STALE",
      `Mission '${missionId}' changed after its citation gate passed (${problems.join("; ")}); re-run it before packaging.`);
  }
  return cv;
}

module.exports = {
  SCHEMA_VERSION,
  assertMissionCitationRecord,
  failMissionCitationRecord,
  listMissionOutputs,
  missionCitationRecordPath,
  passMissionQualityAudit,
  writeMissionCitationRecord
};
