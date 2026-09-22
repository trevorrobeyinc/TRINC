"use strict";

// The bridge's `obsidian_openclaw_research_memory_search` tool spawns scripts/research-memory.js,
// which must honour the engine's single `researchMemory.enabled` gate. These tests pin that a
// disabled lane is a recorded, machine-readable skip (never a spawn of the pack store's CLI —
// which would download its embedding model), and that a bad invocation is a usage error.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const SCRIPT = path.join(ROOT, "scripts", "research-memory.js");

function disabledRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rm-cli-"));
  fs.mkdirSync(path.join(root, "config"), { recursive: true });
  const cli = path.join(root, "must-not-run.js");
  fs.writeFileSync(cli, "process.stderr.write('THE PACK STORE CLI WAS SPAWNED');process.exit(9);");
  fs.writeFileSync(path.join(root, "config", "vault-publish.json"), JSON.stringify({
    enabled: false, vaultRoot: root, allowedVaultRoots: [root],
    researchMemory: { enabled: false, cliPath: cli, qdrantUrl: "https://127.0.0.1:6433" }
  }));
  return root;
}

describe("scripts/research-memory.js (bridge-facing CLI over the engine's research-memory client)", () => {
  it("search while disabled is a recorded skip with the operator's action — the pack store CLI is never spawned", () => {
    const root = disabledRoot();
    try {
      const r = spawnSync(process.execPath, [SCRIPT, "search", "--query", "heart failure", "--json"], { cwd: root, encoding: "utf8" });
      assert.equal(r.status, 0, r.stderr);
      assert.doesNotMatch(r.stderr, /WAS SPAWNED/);
      const j = JSON.parse(r.stdout);
      assert.equal(j.ok, true);
      assert.equal(j.enabled, false);
      assert.deepEqual(j.results, []);
      assert.match(j.action, /researchMemory\.enabled = true/);
      const human = spawnSync(process.execPath, [SCRIPT, "health"], { cwd: root, encoding: "utf8" });
      assert.equal(human.status, 0);
      assert.match(human.stdout, /DISABLED/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("usage errors exit 2 and print usage", () => {
    const root = disabledRoot();
    try {
      for (const argv of [[], ["bogus"], ["search", "--nope"]]) {
        const r = spawnSync(process.execPath, [SCRIPT, ...argv], { cwd: root, encoding: "utf8" });
        assert.equal(r.status, 2, JSON.stringify(argv));
        assert.match(r.stderr, /Usage:/);
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
