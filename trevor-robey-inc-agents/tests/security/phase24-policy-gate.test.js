"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const scriptPath = path.join(root, "scripts", "verify-phase24-policy.sh");
const { copyRepoFiles } = require(path.join(root, "tests", "helpers", "phase20-fixtures.js"));

const REQUIRED_FIXTURE_FILES = [
  ".github/workflows/ci-enforcement.yml",
  "README.md",
  "ARCHITECTURAL_BLUEPRINT.md",
  "docs/attack-surface.md",
  "docs/supervisor-architecture.md",
  "docs/phase24-operator-sync-and-briefing.md",
  "openclaw-bridge/mutation/phase24-operator-briefing.js",
  "openclaw-bridge/mcp/newsletter-mcp.js",
  "openclaw-bridge/mcp/notion-mcp.js",
  "openclaw-bridge/mcp/mcp-service.js",
  "openclaw-bridge/mcp/newsletter-publisher-mcp/contract.json",
  "openclaw-bridge/mcp/notion-sync-mcp/contract.json",
  "openclaw-bridge/execution/egress-policy.js",
  "openclaw-bridge/docs/mcp-contracts-phase1.md",
  "scripts/verify-phase24-policy.sh",
  "scripts/build-verify.sh",
  "package.json",
  "future openclaw research agents phases to be implemented.",
  "audit/evidence/phase24/.gitkeep"
];

async function createFixture() {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "openclaw-phase24-policy-"));
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

test("phase24 policy gate passes for valid repository layout", async () => {
  const fixture = await createFixture();
  const run = runPolicy(fixture);
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.match(run.stdout, /Phase 24 operator sync and briefing policy verification passed/);
});

test("phase24 policy gate fails when phase24 script wiring is removed from package.json", async () => {
  const fixture = await createFixture();
  const file = path.join(fixture, "package.json");
  const packageJson = JSON.parse(fs.readFileSync(file, "utf8"));
  delete packageJson.scripts["phase24:verify"];
  fs.writeFileSync(file, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");

  const run = runPolicy(fixture, { PHASE24_POLICY_FORCE_NO_RG: "1" });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /phase24:verify/);
});

test("phase24 policy gate fails when contracts revert to stub_only", async () => {
  const fixture = await createFixture();
  const file = path.join(fixture, "openclaw-bridge", "mcp", "newsletter-publisher-mcp", "contract.json");
  const contract = JSON.parse(fs.readFileSync(file, "utf8"));
  contract.status = "stub_only";
  fs.writeFileSync(file, `${JSON.stringify(contract, null, 2)}\n`, "utf8");

  const run = runPolicy(fixture, { PHASE24_POLICY_FORCE_NO_RG: "1" });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /operator_gated/);
});

test("phase24 policy gate fails when unsafe automation logic is introduced", async () => {
  const fixture = await createFixture();
  const file = path.join(fixture, "openclaw-bridge", "mutation", "phase24-operator-briefing.js");
  fs.appendFileSync(file, "\nfetch('https://example.com/should-not-exist');\n", "utf8");

  const run = runPolicy(fixture, { PHASE24_POLICY_FORCE_NO_RG: "1" });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /network\/browser\/login\/background-sync automation logic/);
});

test("phase24 policy gate fails when outbound host policy drifts", async () => {
  const fixture = await createFixture();
  const file = path.join(fixture, "openclaw-bridge", "execution", "egress-policy.js");
  const original = fs.readFileSync(file, "utf8");
  const mutated = original.replace(
    'allowedHosts: ["api.beehiiv.com"],',
    'allowedHosts: ["api.beehiiv.com", "api.evil.example"],'
  );
  fs.writeFileSync(file, mutated, "utf8");

  const run = runPolicy(fixture, { PHASE24_POLICY_FORCE_NO_RG: "1" });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /newsletter egress policy must remain pinned/);
});
