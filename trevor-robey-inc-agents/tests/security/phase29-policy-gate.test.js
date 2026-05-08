"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const scriptPath = path.join(root, "scripts", "verify-phase29-policy.sh");
const { copyRepoFiles } = require(path.join(root, "tests", "helpers", "phase20-fixtures.js"));

const REQUIRED_FIXTURE_FILES = [
  "openclaw-bridge/mcp/tooluniverse-mcp/tooluniverse-mcp.js",
  "openclaw-bridge/mcp/tooluniverse-mcp/tu-process-manager.js",
  "openclaw-bridge/mcp/tooluniverse-mcp/tu-record-normalizer.js",
  "openclaw-bridge/mcp/tooluniverse-mcp/tu-schema.js",
  "openclaw-bridge/bridge/mcp-method-registry.js",
  "openclaw-bridge/execution/egress-policy.js",
  "openclaw-bridge/mcp/mcp-service.js",
  "openclaw-bridge/openclaw.json",
  "config/dataset-schemas.json",
  "config/mission-templates.json",
  "security/phase29-startup-integrity.js",
  "security/rbac-policy.json",
  "scripts/verify-phase29-policy.sh",
  "scripts/build-verify.sh",
  "package.json"
];

async function createFixture() {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "openclaw-phase29-policy-"));
  await copyRepoFiles(tmp, REQUIRED_FIXTURE_FILES);
  // Create vendor/tooluniverse stub so submodule check passes
  await fsp.mkdir(path.join(tmp, "vendor", "tooluniverse"), { recursive: true });
  await fsp.writeFile(path.join(tmp, "vendor", "tooluniverse", "README.md"), "stub", "utf8");
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

test("phase29 policy gate passes for valid repository layout", async () => {
  const fixture = await createFixture();
  const run = runPolicy(fixture);
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.match(run.stdout, /ALL CHECKS PASSED/);
});

test("phase29 policy gate fails when adapter file is missing", async () => {
  const fixture = await createFixture();
  fs.unlinkSync(path.join(fixture, "openclaw-bridge", "mcp", "tooluniverse-mcp", "tooluniverse-mcp.js"));

  const run = runPolicy(fixture);
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /tooluniverse-mcp\.js/);
});

test("phase29 policy gate fails when method registry is missing findTool", async () => {
  const fixture = await createFixture();
  const file = path.join(fixture, "openclaw-bridge", "bridge", "mcp-method-registry.js");
  const current = fs.readFileSync(file, "utf8");
  fs.writeFileSync(file, current.replace(/research_findTool/g, "research_findRemoved"), "utf8");

  const run = runPolicy(fixture);
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /research_findTool/);
});

test("phase29 policy gate fails when feature flag is missing", async () => {
  const fixture = await createFixture();
  const file = path.join(fixture, "openclaw-bridge", "openclaw.json");
  const current = JSON.parse(fs.readFileSync(file, "utf8"));
  if (current.featureFlags) delete current.featureFlags.ENABLE_TOOLUNIVERSE_MCP;
  if (current.features) delete current.features.ENABLE_TOOLUNIVERSE_MCP;
  fs.writeFileSync(file, JSON.stringify(current, null, 2), "utf8");

  const run = runPolicy(fixture);
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /ENABLE_TOOLUNIVERSE_MCP/);
});

test("phase29 policy gate fails when dataset schema is missing", async () => {
  const fixture = await createFixture();
  const file = path.join(fixture, "config", "dataset-schemas.json");
  const current = fs.readFileSync(file, "utf8");
  fs.writeFileSync(file, current.replace(/molecular_properties/g, "molecular_removed"), "utf8");

  const run = runPolicy(fixture);
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /molecular_properties/);
});

test("phase29 policy gate fails when mission template is missing", async () => {
  const fixture = await createFixture();
  const file = path.join(fixture, "config", "mission-templates.json");
  const current = fs.readFileSync(file, "utf8");
  fs.writeFileSync(file, current.replace(/biomedical_drug_discovery/g, "biomedical_removed"), "utf8");

  const run = runPolicy(fixture);
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /biomedical_drug_discovery/);
});
