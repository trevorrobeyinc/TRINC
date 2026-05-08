"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const scriptPath = path.join(root, "scripts", "verify-phase25-policy.sh");
const { copyRepoFiles } = require(path.join(root, "tests", "helpers", "phase20-fixtures.js"));

const REQUIRED_FIXTURE_FILES = [
  ".github/workflows/ci-enforcement.yml",
  "README.md",
  "ARCHITECTURAL_BLUEPRINT.md",
  "docs/attack-surface.md",
  "docs/supervisor-architecture.md",
  "docs/phase25-credential-broker-and-session-governance.md",
  "openclaw-bridge/security/credential-broker.js",
  "openclaw-bridge/security/credential-broker-boundary.md",
  "openclaw-bridge/security/credential-broker-threat-model.md",
  "scripts/verify-phase25-policy.sh",
  "scripts/build-verify.sh",
  "package.json",
  "security/scope-registry.json",
  "tests/security/phase25-credential-broker.test.js",
  "tests/security/phase25-policy-gate.test.js",
  "future openclaw research agents phases to be implemented.",
  "audit/evidence/phase25/.gitkeep"
];

async function createFixture() {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "openclaw-phase25-policy-"));
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

test("phase25 policy gate passes for valid repository layout", async () => {
  const fixture = await createFixture();
  const run = runPolicy(fixture);
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.match(run.stdout, /Phase 25 credential broker policy verification passed/);
});

test("phase25 policy gate fails when phase25 script wiring is removed from package.json", async () => {
  const fixture = await createFixture();
  const file = path.join(fixture, "package.json");
  const packageJson = JSON.parse(fs.readFileSync(file, "utf8"));
  delete packageJson.scripts["phase25:verify"];
  fs.writeFileSync(file, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");

  const run = runPolicy(fixture, { PHASE25_POLICY_FORCE_NO_RG: "1" });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /phase25:verify/);
});

test("phase25 policy gate fails when required phase25 scope is removed", async () => {
  const fixture = await createFixture();
  const file = path.join(fixture, "security", "scope-registry.json");
  const registry = JSON.parse(fs.readFileSync(file, "utf8"));
  registry.scopes = registry.scopes.filter((entry) => entry.scope_id !== "governance.connector.session.issue");
  fs.writeFileSync(file, `${JSON.stringify(registry, null, 2)}\n`, "utf8");

  const run = runPolicy(fixture, { PHASE25_POLICY_FORCE_NO_RG: "1" });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /governance\.connector\.session\.issue/);
});

test("phase25 policy gate fails when unsafe automation logic is introduced", async () => {
  const fixture = await createFixture();
  const file = path.join(fixture, "openclaw-bridge", "security", "credential-broker.js");
  fs.appendFileSync(file, "\nfetch('https://example.com/should-not-exist');\n", "utf8");

  const run = runPolicy(fixture, { PHASE25_POLICY_FORCE_NO_RG: "1" });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /filesystem persistence, network, browser, or subprocess automation logic/);
});

test("phase25 policy gate fails when CI step is removed", async () => {
  const fixture = await createFixture();
  const file = path.join(fixture, ".github", "workflows", "ci-enforcement.yml");
  const current = fs.readFileSync(file, "utf8");
  fs.writeFileSync(file, current.replace(/- name: Run Phase 25 verification[\s\S]*?run: npm run phase25:verify\n/, ""), "utf8");

  const run = runPolicy(fixture, { PHASE25_POLICY_FORCE_NO_RG: "1" });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /CI must run npm run phase25:verify/);
});
