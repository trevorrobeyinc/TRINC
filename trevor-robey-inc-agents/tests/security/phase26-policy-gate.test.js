"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const scriptPath = path.join(root, "scripts", "verify-phase26-policy.sh");
const { copyRepoFiles } = require(path.join(root, "tests", "helpers", "phase20-fixtures.js"));

const REQUIRED_FIXTURE_FILES = [
  ".github/workflows/ci-enforcement.yml",
  "README.md",
  "docs/attack-surface.md",
  "docs/supervisor-architecture.md",
  "docs/phase26-bridge-runtime-and-execution-routing.md",
  "openclaw-bridge/bridge/bridge-routing.js",
  "openclaw-bridge/bridge/bridge-auth.js",
  "openclaw-bridge/bridge/server.ts",
  "openclaw-bridge/bridge/worker.ts",
  "openclaw-bridge/bridge/state-store.ts",
  "openclaw-bridge/bridge/types.ts",
  "openclaw-bridge/src/core/execution-router.ts",
  "tests/security/phase26-bridge-routing.test.js",
  "tests/security/phase26-bridge-auth.test.js",
  "tests/security/phase26-policy-gate.test.js",
  "scripts/verify-phase26-policy.sh",
  "scripts/build-verify.sh",
  "package.json"
];

async function createFixture() {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "openclaw-phase26-policy-"));
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

test("phase26 policy gate passes for valid repository layout", async () => {
  const fixture = await createFixture();
  const run = runPolicy(fixture);
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.match(run.stdout, /Phase 26 bridge runtime and execution-router consolidation policy verification passed/);
});

test("phase26 policy gate fails when phase26 script wiring is removed from package.json", async () => {
  const fixture = await createFixture();
  const file = path.join(fixture, "package.json");
  const packageJson = JSON.parse(fs.readFileSync(file, "utf8"));
  delete packageJson.scripts["phase26:verify"];
  fs.writeFileSync(file, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");

  const run = runPolicy(fixture, { PHASE26_POLICY_FORCE_NO_RG: "1" });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /phase26:verify/);
});

test("phase26 policy gate fails when JobExecutionContext is removed from types", async () => {
  const fixture = await createFixture();
  const file = path.join(fixture, "openclaw-bridge", "bridge", "types.ts");
  const current = fs.readFileSync(file, "utf8");
  fs.writeFileSync(file, current.replace(/JobExecutionContext/g, "RemovedContext"), "utf8");

  const run = runPolicy(fixture, { PHASE26_POLICY_FORCE_NO_RG: "1" });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /JobExecutionContext/);
});

test("phase26 policy gate fails when execution router is missing from worker", async () => {
  const fixture = await createFixture();
  const file = path.join(fixture, "openclaw-bridge", "bridge", "worker.ts");
  const current = fs.readFileSync(file, "utf8");
  fs.writeFileSync(file, current.replace(/executeViaRouter/g, "processDirectly"), "utf8");

  const run = runPolicy(fixture, { PHASE26_POLICY_FORCE_NO_RG: "1" });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /worker must route jobs through execution router/);
});

test("phase26 policy gate fails when fail-closed is removed from worker", async () => {
  const fixture = await createFixture();
  const file = path.join(fixture, "openclaw-bridge", "bridge", "worker.ts");
  const current = fs.readFileSync(file, "utf8");
  fs.writeFileSync(file, current.replace(/fail-closed/g, "permissive"), "utf8");

  const run = runPolicy(fixture, { PHASE26_POLICY_FORCE_NO_RG: "1" });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /fail-closed/);
});

test("phase26 policy gate fails when Phase 26 node ID is missing from execution router", async () => {
  const fixture = await createFixture();
  const file = path.join(fixture, "openclaw-bridge", "src", "core", "execution-router.ts");
  const current = fs.readFileSync(file, "utf8");
  fs.writeFileSync(file, current.replace(/phase26-bridge-node/g, "phase1-node"), "utf8");

  const run = runPolicy(fixture, { PHASE26_POLICY_FORCE_NO_RG: "1" });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /execution router must use Phase 26 node ID/);
});
