"use strict";

// TEST FIXTURES ONLY (T1-1, 2026-11-14). Since T1-1 a mission can be packaged only with the citation
// gate's record beside it (core/mission-citation-record.js), which the workflow engine writes after
// its gate passes. A test that packages a hand-built mission fixture gives it that record here —
// through the ENGINE'S OWN writer, with a manifest the engine's own builder makes from the identifiers
// the fixture's sections cite (all VERIFIED, retraction screen complete). It must be called after the
// mission's sections and mission-summary.json are final, exactly as the engine writes it. Never used
// for a real mission: a real record is only ever written by the engine.

const fs = require("node:fs");
const path = require("node:path");

const { writeMissionCitationRecord, listMissionOutputs } = require("../../openclaw-bridge/core/mission-citation-record.js");
const { extractCitations, deduplicateCitations } = require("../../openclaw-bridge/core/citation-extractor.js");
const { buildReproducibilityManifest } = require("../../openclaw-bridge/core/reproducibility-manifest.js");

const FIXTURE_CLOCK = Object.freeze({ nowIso: () => "2026-03-05T00:00:00.000Z" });

// `reresolutionCompleted: false` models the engine's T1-8 fallback: the gate passed, the re-resolution
// pass crashed, so every cited id is UNCHECKED (reresolution_error) and the pass is marked incomplete.
function passingCitationVerification(rootDir, missionId, { reresolutionCompleted = true } = {}) {
  const summary = JSON.parse(fs.readFileSync(
    path.join(rootDir, "workspace", "missions", missionId, "artifacts", "mission-summary.json"), "utf8"));
  const text = listMissionOutputs(rootDir, summary).map((p) => fs.readFileSync(p, "utf8")).join("\n\n");
  const cites = deduplicateCitations(extractCitations(text));
  const screened = cites.filter((c) => c.type === "DOI" || c.type === "PMID").length;
  const now = FIXTURE_CLOCK.nowIso();
  const manifest = buildReproducibilityManifest({
    reresolved: cites.map((c) => (reresolutionCompleted
      ? { ...c, status: "VERIFIED", resolver_type: "primary", checked_at: now }
      : { ...c, status: "UNCHECKED", resolver_type: "primary", evidence: { reason: "reresolution_error" }, checked_at: now })),
    retraction: { checked: true, retracted_dois: [], retracted_pmids: [], cited: screened, unscreened_ids: [] },
    gate: { cited: cites.length, grounded: cites.length, ungrounded: 0, grounded_ratio: 1, min_grounded_ratio: 0.75, hardFail: false },
    groundedIds: cites.map((c) => c.id),
    reresolutionCompleted,
    meta: { reportId: missionId, deliveryId: "workflow-fixture", resolverTableVersion: "fixture", asOf: now.slice(0, 10), startedAt: now, completedAt: now }
  });
  return {
    pass: true, verdict: "PASS", cited: cites.length, grounded: cites.length, ungrounded: 0, grounded_ratio: 1,
    min_grounded_ratio: 0.75, grounding_match: "id_only", fetched_id_count: cites.length,
    ungrounded_sample: [], ungrounded_ids: [], retracted: [],
    retraction_screen_checked: true, retraction_screen_cited: screened, unscreened: 0, unscreened_ids: [],
    dois_without_retraction_source: 0, retraction_editorial_flags: [],
    reproducibility: manifest.summary, reproducibility_manifest: manifest
  };
}

// The fixture stands in for a workflow that ran to the end, so its quality audit passed (Tier 1
// review: a record whose audit is still "pending" is not packaged). `qualityAudit` overrides it.
function writePassingCitationRecord(rootDir, missionId, options = {}) {
  return writeMissionCitationRecord({
    rootDir, missionId, workflowId: "workflow-fixture", timeProvider: FIXTURE_CLOCK,
    pass: true, verdict: "PASS", errorCode: null,
    qualityAudit: options.qualityAudit || "passed",
    citationVerification: passingCitationVerification(rootDir, missionId, options)
  });
}

module.exports = { passingCitationVerification, writePassingCitationRecord };
