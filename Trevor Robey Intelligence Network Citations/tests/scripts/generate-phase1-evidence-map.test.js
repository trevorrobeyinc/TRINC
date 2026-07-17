"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  TARGETS,
  buildEvidenceMap,
  fileExistsOnMain
} = require("../../scripts/generate-phase1-evidence-map.js");

// PROVENANCE NOTE (2026-07-17): the original Phase-1 SHAs (ae1e51a…/a050721b…) live in the
// archived, pre-consolidation `trevor-robey-inc-agents` repository. The 2026-05-19 monorepo
// flat-merge SEVERED that commit graph, so those objects are permanently unreachable via live
// git — `buildEvidenceMap()` run today reconstructs against the CONSOLIDATED history and can no
// longer reproduce them (it now resolves every target to the flat-merge commit). The surviving
// record of the true Phase-1 provenance is the frozen historical artifact below. So we verify the
// two concerns separately and honestly: (1) the live reconstruction tool still produces a
// structurally valid map, and (2) the preserved predecessor SHAs are asserted against the frozen
// record — NOT re-derived from a git graph that no longer contains them. (Asserting the live map's
// SHA against 294df0c would only encode the meaningless fact "the flat-merge added README" and
// destroy the provenance intent.)
const FROZEN = JSON.parse(fs.readFileSync(
  path.resolve(__dirname, "../../audit/evidence/history/phase1-evidence-map-latest.json"),
  "utf8"
));

test("phase1 evidence map: the live reconstruction tool still produces a structurally valid map", () => {
  const map = buildEvidenceMap();

  assert.equal(map.historical_reconstruction, true);
  assert.ok(
    map.phase1_repo_seed_commit && typeof map.phase1_repo_seed_commit.sha === "string" && map.phase1_repo_seed_commit.sha.length > 0,
    "live reconstruction resolves a repo-seed commit against the current history"
  );
  assert.equal(Array.isArray(map.targets), true);
  assert.equal(map.targets.length, TARGETS.length);
  assert.ok(map.targets.some((entry) => entry.kind === "implemented"));
  assert.ok(map.targets.some((entry) => entry.kind === "scaffolded"));
});

test("phase1 evidence map: the frozen historical record preserves the original predecessor-repo Phase-1 SHAs", () => {
  // These SHAs are from the archived pre-consolidation trevor-robey-inc-agents repo and can no
  // longer be reproduced by live git; the frozen artifact is the surviving provenance record.
  assert.equal(FROZEN.historical_reconstruction, true);
  assert.equal(FROZEN.phase1_repo_seed_commit.sha, "ae1e51aaa3818f99b6461c6029d7dc817e9dfcf9");
  assert.equal(FROZEN.summary.first_phase1_bundle_commit.sha, "a050721b98a7e2eda91c29f527bcd417fd3cbccb");
});

test("phase1 evidence helpers distinguish current and historical-only files (live git)", () => {
  assert.equal(fileExistsOnMain("audit/phase1-checklist.md"), true);
  assert.equal(fileExistsOnMain("PHASE1_ARCHITECTURAL_BLUEPRINT.md"), false);
});
