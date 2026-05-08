"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const scriptPath = path.join(root, "scripts", "verify-phase23-policy.sh");
const { copyRepoFiles } = require(path.join(root, "tests", "helpers", "phase20-fixtures.js"));

const REQUIRED_FIXTURE_FILES = [
  ".github/workflows/ci-enforcement.yml",
  "README.md",
  "ARCHITECTURAL_BLUEPRINT.md",
  "docs/attack-surface.md",
  "docs/supervisor-architecture.md",
  "docs/phase23-portfolio-intelligence.md",
  "analytics/portfolio-intelligence/phase23-evidence-aggregator.js",
  "analytics/portfolio-intelligence/phase23-commercialization-decision-engine.js",
  "analytics/portfolio-intelligence/phase23-report-builder.js",
  "scripts/generate-phase23-report.js",
  "scripts/verify-phase23-policy.sh",
  "scripts/build-verify.sh",
  "package.json",
  "future openclaw research agents phases to be implemented."
];

async function createFixture() {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "openclaw-phase23-policy-"));
  await copyRepoFiles(tmp, REQUIRED_FIXTURE_FILES);
  return tmp;
}

function runPolicy(rootDir, env = {}) {
  return spawnSync("bash", [scriptPath, "--root", rootDir], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      ...env
    }
  });
}

test("phase23 policy gate passes for valid repository layout", async () => {
  const fixture = await createFixture();
  const run = runPolicy(fixture);
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.match(run.stdout, /Phase 23 portfolio intelligence policy verification passed/);
});

test("phase23 policy gate fails when phase23 script wiring is removed from package.json", async () => {
  const fixture = await createFixture();
  const file = path.join(fixture, "package.json");
  const packageJson = JSON.parse(fs.readFileSync(file, "utf8"));
  delete packageJson.scripts["phase23:verify"];
  fs.writeFileSync(file, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");

  const run = runPolicy(fixture, { PHASE23_POLICY_FORCE_NO_RG: "1" });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /phase23:verify/);
});

test("phase23 policy gate fails when unsafe network logic is introduced into phase23 paths", async () => {
  const fixture = await createFixture();
  const file = path.join(fixture, "analytics", "portfolio-intelligence", "phase23-evidence-aggregator.js");
  fs.appendFileSync(file, "\nfetch('https://example.com/should-not-exist');\n", "utf8");

  const run = runPolicy(fixture, { PHASE23_POLICY_FORCE_NO_RG: "1" });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /network\/browser\/login automation logic/);
});
