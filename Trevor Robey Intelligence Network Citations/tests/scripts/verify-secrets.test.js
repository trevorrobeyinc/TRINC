"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "../..");
const scriptPath = path.join(repoRoot, "scripts", "verify-secrets.sh");

async function createFixture() {
  const fixture = await fsp.mkdtemp(path.join(os.tmpdir(), "verify-secrets-"));
  await fsp.mkdir(path.join(fixture, ".ci", "npm-cache"), { recursive: true });
  await fsp.mkdir(path.join(fixture, "audit", "evidence"), { recursive: true });
  await fsp.writeFile(path.join(fixture, "README.md"), "clean fixture\n", "utf8");
  return fixture;
}

function runScan(rootDir, env = {}) {
  return spawnSync("/bin/bash", [scriptPath, "--root", rootDir], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      ...env
    }
  });
}

test("verify-secrets passes on clean fixture with ripgrep", async () => {
  const fixture = await createFixture();
  const run = runScan(fixture);

  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.match(run.stdout, /Secret scan passed/);
});

test("verify-secrets passes on clean fixture with grep fallback", async () => {
  const fixture = await createFixture();
  const run = runScan(fixture, {
    VERIFY_SECRETS_FORCE_NO_RG: "1"
  });

  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.match(run.stdout, /Secret scan passed via regex fallback/);
});

test("verify-secrets fails on regex-detected secrets", async () => {
  const fixture = await createFixture();
  const fakeSecret = ["SUPER", "SECRET", "KEYVALUE123456"].join("");
  await fsp.writeFile(path.join(fixture, "secret.txt"), `api_key = ${fakeSecret}\n`, "utf8");

  const run = runScan(fixture, {
    VERIFY_SECRETS_FORCE_NO_RG: "1"
  });

  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /Potential secrets detected in repository/);
});
