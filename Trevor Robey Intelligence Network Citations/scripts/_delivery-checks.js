"use strict";

// _delivery-checks.js — T1-11 (2026-11-14): the refusals a sealed research release must clear before
// anything leaves it, in ONE place. Moved out of build-buyer-zip.js (its steps 1-3, unchanged) so every
// delivery path refuses the same things:
//   * build-buyer-zip.js — the order form's delivery path (all three checks);
//   * export-release.js  — the engine's export, which also records delivery evidence (the manifest and
//                          ChEMBL checks; before this it checked only the release approval);
//   * distribute.js      — marketplace staging (the seal and the manifest checks, T1-2).
// Each check returns a list of problems, worded for the operator; an empty list means it may ship.

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const SHIPPABLE_DECISIONS = new Set(["DELIVER", "DELIVER_WITH_FLAGS"]);
const CHEMBL_PATTERNS = Object.freeze([/CHEMBL\d+/, /chembl_?id/i]);
// Text the generators no longer write. A bundle sealed before the fix still carries it, so it is
// refused rather than shipped: run the order again on the current engine.
const RETIRED_WORDING = Object.freeze([
  { file: "graveyard-memo.md", text: "re-funding a path", decision: "#7 (the memo read as funding advice)" },
  { file: "design-benchmark.md", text: "no identifier below was counted", decision: "#6 (the scope note misstated the grade)" }
]);

// The engine seals the UTF-8 text of each file (finalizeBundle), so the seal check hashes the same way.
function sealHash(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath, "utf8")).digest("hex");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function firstMatch(text, patterns) {
  const lines = text.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    for (const pattern of patterns) {
      const match = lines[index].match(pattern);
      if (match) return { line: index + 1, match: match[0] };
    }
  }
  return null;
}

// 1. Every listed file is present and unchanged since the release was sealed (manifest.json).
//    Returns { problems, present } — `present` lists the files that exist.
function sealProblems(releaseDir, names) {
  const deliverablesDir = path.join(releaseDir, "deliverables");
  const problems = [];
  let sealed = null;
  try {
    sealed = new Map((readJson(path.join(releaseDir, "manifest.json")).files || []).map((entry) => [entry.file, entry.sha256]));
  } catch (err) {
    problems.push(`the release seal (manifest.json) is unreadable: ${err.message}`);
  }
  const present = [];
  for (const name of names) {
    const filePath = path.join(deliverablesDir, name);
    if (!fs.existsSync(filePath)) {
      problems.push(`missing: ${name}`);
      continue;
    }
    present.push(name);
    if (!sealed) continue;
    const expected = sealed.get(`deliverables/${name}`);
    if (!expected) problems.push(`not covered by the release seal: ${name}`);
    else if (sealHash(filePath) !== expected) problems.push(`changed after the release was sealed: ${name}`);
  }
  return { problems, present };
}

// 2. The engine's own delivery decision allows shipping, nothing is UNRESOLVED, and the re-resolution
//    pass completed (T1-8). A missing manifest is a problem only when `requireManifest` is set (the
//    buyer ZIP reports it as a missing listed file in step 1 instead).
//    Returns { problems, decision, flags }.
function manifestProblems(deliverablesDir, { requireManifest = false } = {}) {
  const problems = [];
  let decision = null;
  let flags = [];
  const manifestPath = path.join(deliverablesDir, "reproducibility-manifest.json");
  if (!fs.existsSync(manifestPath)) {
    if (requireManifest) problems.push("no reproducibility manifest (reproducibility-manifest.json); a research release never ships without one");
    return { problems, decision, flags };
  }
  try {
    const summary = readJson(manifestPath).summary || {};
    decision = summary.delivery_decision || null;
    flags = Array.isArray(summary.flag_reasons) ? summary.flag_reasons : [];
    const unresolved = Number((summary.counts || {}).unresolved || 0);
    if (!SHIPPABLE_DECISIONS.has(decision)) problems.push(`delivery decision is ${decision || "missing"}, not DELIVER or DELIVER_WITH_FLAGS`);
    if (unresolved > 0) problems.push(`${unresolved} cited identifier(s) were UNRESOLVED at delivery`);
    // T1-8 (2026-11-14): the fallback manifest of a crashed re-resolution pass. Its DELIVER_WITH_FLAGS
    // would otherwise pass the check above, though no identifier was looked up. Older manifests lack
    // the field and pass, as before.
    if (summary.reresolution_completed === false) problems.push("re-resolution did not complete; re-run the order");
  } catch (err) {
    problems.push(`reproducibility-manifest.json is unreadable: ${err.message}`);
  }
  return { problems, decision, flags };
}

// 3. No ChEMBL identifier (excluded from paid deliverables until counsel answers the CC BY-SA 3.0
//    share-alike question), and no retired wording, in the files named.
function contentProblems(deliverablesDir, names, { retiredWording = true } = {}) {
  const problems = [];
  for (const name of names) {
    const text = fs.readFileSync(path.join(deliverablesDir, name), "utf8");
    const chembl = firstMatch(text, CHEMBL_PATTERNS);
    if (chembl) {
      problems.push(`ChEMBL identifier in ${name}:${chembl.line} ("${chembl.match}"); ChEMBL is excluded from paid deliverables until counsel answers the share-alike question`);
    }
    if (!retiredWording) continue;
    for (const retired of RETIRED_WORDING) {
      if (retired.file === name && text.includes(retired.text)) {
        problems.push(`${name} still says "${retired.text}", retired on 2026-11-06 by decision ${retired.decision}; run the order on the current engine`);
      }
    }
  }
  return problems;
}

module.exports = {
  CHEMBL_PATTERNS,
  RETIRED_WORDING,
  SHIPPABLE_DECISIONS,
  contentProblems,
  manifestProblems,
  sealHash,
  sealProblems
};
