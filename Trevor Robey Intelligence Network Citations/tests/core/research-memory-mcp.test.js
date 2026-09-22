"use strict";

// The engine-side research-memory client is a thin argv-array spawn of the pack store's own CLI.
// These tests drive it against a FAKE CLI script (no Qdrant, no embedding model, no network) and
// pin: context-only records, the shippability gates shared with the vault publisher, idempotency
// via artifacts.research_memory, the disabled-by-default switch, and fail-soft on CLI failure.

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createResearchMemory } = require("../../openclaw-bridge/mcp/research-memory-mcp/index.js");

const FAKE_CLI = `#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const cmd = process.argv[2];
const args = process.argv.slice(3);
const logFile = process.env.FAKE_RM_LOG;
if (logFile) fs.appendFileSync(logFile, JSON.stringify({ cmd, args, cwd: process.cwd(), qdrant: process.env.QDRANT_URL, allow_remote: process.env.EMBED_ALLOW_REMOTE }) + "\\n");
if (process.env.FAKE_RM_FAIL === "1") { console.error("boom"); process.exit(1); }
if (cmd === "search") {
  console.log(JSON.stringify({ results: [
    { pack_id: "pack-2026-07-16-clinical-trial-landscape-72f0c288", pack_title: "clinical-trial-landscape — heart failure", score: 0.81,
      snippet: "Sacubitril/valsartan reduced hospitalization PMID: 25176015 NCT01035255", payload: { topic: "clinical-trial-landscape", ingested_at: "2026-09-22T12:00:00.000Z" } },
    { pack_id: "pack-x", pack_title: "other", score: 0.55, snippet: "no ids here", payload: { topic: "t" } }
  ] }));
} else if (cmd === "ingest") {
  const i = args.indexOf("--pack-id");
  console.log(JSON.stringify({ pack_id: args[i + 1], content_sha256: "deadbeef", vector_count: 1, action: process.env.FAKE_RM_ACTION || "created", ingested_at: "2026-09-22T12:00:00.000Z" }));
} else if (cmd === "health") {
  console.log(JSON.stringify({ ok: true, collection: "trevorobeyinc-packs", total_packs: 3 }));
} else {
  process.exit(2);
}
`;

function makeFixture({ status = "completed", verdict = "PASS", provider = "claude-code", enabled = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rm-root-"));
  const cliPath = path.join(root, "fake-cli.js");
  fs.writeFileSync(cliPath, FAKE_CLI);
  const logFile = path.join(root, "cli-calls.log");
  fs.mkdirSync(path.join(root, "config"), { recursive: true });
  fs.writeFileSync(path.join(root, "config", "vault-publish.json"), JSON.stringify({
    enabled: true, vaultRoot: root, allowedVaultRoots: [root], requireCitationPass: true,
    researchMemory: { enabled, cliPath, client: "trevorobeyinc", qdrantUrl: "https://127.0.0.1:6433", timeoutMs: 20000, scoreThreshold: 0.5 }
  }));
  const workflowId = "workflow-abcdef0123456789abcdef01";
  const missionId = "mission-rm0001";
  const taskId = "task-synth-rm";
  const outDir = path.join(root, "workspace", "research-output", taskId);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "output.md"), "# Synthesis\n\nFindings (PMID: 30000001).\n");
  fs.writeFileSync(path.join(outDir, "metadata.json"), JSON.stringify({ task_id: taskId, provider, model: "m", token_count: 10 }));
  fs.mkdirSync(path.join(root, "workspace", "missions", missionId), { recursive: true });
  fs.writeFileSync(path.join(root, "workspace", "missions", missionId, "status.json"), JSON.stringify({
    subtask_results: [{ agent_id: `${missionId}:synthesizer:1`, task_id: taskId, output_path: path.join(outDir, "output.md"), metadata_path: path.join(outDir, "metadata.json") }]
  }));
  const wfDir = path.join(root, "workspace", "workflows", workflowId);
  fs.mkdirSync(wfDir, { recursive: true });
  fs.writeFileSync(path.join(wfDir, "workflow.json"), JSON.stringify({
    workflow_id: workflowId, template_id: "clinical-trial-landscape", status,
    inputs: { therapeutic_area: "cardiology", indication: "heart failure" },
    created_at: "2026-07-16T09:00:00.000Z", completed_at: "2026-07-16T09:20:00.000Z",
    pipeline_progress: { steps: [] },
    artifacts: { mission_id: missionId, citation_verification: { pass: verdict === "PASS", verdict, cited: 5, grounded: 5, grounded_ratio: 1 } }
  }));
  return { root, cliPath, logFile, workflowId, wfDir };
}

function calls(fx) {
  if (!fs.existsSync(fx.logFile)) return [];
  return fs.readFileSync(fx.logFile, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

describe("research-memory-mcp (engine-side client of the pack store CLI)", () => {
  let fx;
  const savedEnv = {};
  beforeEach(() => {
    fx = makeFixture();
    for (const k of ["FAKE_RM_LOG", "FAKE_RM_FAIL", "FAKE_RM_ACTION"]) savedEnv[k] = process.env[k];
    process.env.FAKE_RM_LOG = fx.logFile;
    delete process.env.FAKE_RM_FAIL;
    delete process.env.FAKE_RM_ACTION;
  });
  afterEach(() => {
    fs.rmSync(fx.root, { recursive: true, force: true });
    for (const k of Object.keys(savedEnv)) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
  });

  it("searchPriors returns context-only records shaped for the prefetch renderer", async () => {
    const rm = createResearchMemory({ rootDir: fx.root });
    assert.equal(rm.enabled, true);
    const records = await rm.searchPriors({ query: "  heart   failure sacubitril ", limit: 3 });
    assert.equal(records.length, 2);
    assert.equal(records[0].path, "research-memory://pack-2026-07-16-clinical-trial-landscape-72f0c288");
    assert.equal(records[0].title, "clinical-trial-landscape — heart failure");
    assert.match(records[0].text, /PMID: 25176015/, "raw snippet is returned; the prefetch renderer withholds ids");
    assert.equal(records[0].context_only, true);
    assert.equal(records[0].source, "research-memory");
    assert.equal(records[0].score, 0.81);
    const [call] = calls(fx);
    assert.equal(call.cmd, "search");
    assert.deepEqual(call.args, ["--query", "heart failure sacubitril", "--limit", "3", "--score-threshold", "0.5"]);
    assert.equal(call.qdrant, "https://127.0.0.1:6433", "the CLI is pointed at the HTTPS proxy, never :6333");
    assert.equal(call.allow_remote, "0", "a prefetch may only use the locally cached embedding model");
  });

  it("never lets an automated spawn fetch the embedding model; only an explicit allowRemote ingest may", async () => {
    const rm = createResearchMemory({ rootDir: fx.root });
    await rm.health();
    await rm.ingestWorkflow(fx.workflowId);
    await rm.ingestWorkflow(fx.workflowId, { force: true, allowRemote: true });
    const seen = calls(fx);
    assert.deepEqual(seen.map((c) => [c.cmd, c.allow_remote]), [["health", "0"], ["ingest", "0"], ["ingest", "1"]]);
  });

  it("ingestWorkflow ingests a shippable run with a stable pack id and records artifacts.research_memory", async () => {
    const rm = createResearchMemory({ rootDir: fx.root });
    const r = await rm.ingestWorkflow(fx.workflowId);
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.action, "created");
    assert.equal(r.pack_id, "pack-2026-07-16-clinical-trial-landscape-abcdef01");
    const [call] = calls(fx);
    assert.equal(call.cmd, "ingest");
    const arg = (k) => call.args[call.args.indexOf(k) + 1];
    assert.equal(arg("--client"), "trevorobeyinc");
    assert.equal(arg("--topic"), "clinical-trial-landscape");
    assert.equal(arg("--tags"), `openclaw,synthesizer,clinical-trial-landscape,${fx.workflowId}`);
    assert.equal(arg("--synthesizer-version"), "openclaw-engine");
    assert.equal(arg("--pack-title"), "clinical-trial-landscape — cardiology / heart failure");
    assert.ok(arg("--source-uri").startsWith("file://"));
    assert.equal(fs.existsSync(arg("--pack-file")), false, "temp pack file is removed afterwards");
    const state = JSON.parse(fs.readFileSync(path.join(fx.wfDir, "workflow.json"), "utf8"));
    assert.deepEqual(state.artifacts.research_memory, {
      pack_id: "pack-2026-07-16-clinical-trial-landscape-abcdef01", action: "created", content_sha256: "deadbeef",
      ingested_at: "2026-09-22T12:00:00.000Z", ingested_by: "engine"
    });

    // Second call is a recorded skip (no CLI spawn), force re-runs the CLI which dedupes by hash.
    const again = await rm.ingestWorkflow(fx.workflowId);
    assert.equal(again.action, "skipped");
    assert.match(again.reason, /already ingested/);
    assert.equal(calls(fx).length, 1);
    process.env.FAKE_RM_ACTION = "skipped_duplicate";
    const forced = await rm.ingestWorkflow(fx.workflowId, { force: true });
    assert.equal(forced.action, "skipped_duplicate");
    assert.equal(calls(fx).length, 2);
  });

  it("applies the vault publisher's gates: failed, non-PASS and mock runs are never ingested", async () => {
    for (const variant of [{ status: "failed" }, { verdict: "UNVERIFIED" }, { provider: "mock" }]) {
      const local = makeFixture(variant);
      process.env.FAKE_RM_LOG = local.logFile;
      try {
        const rm = createResearchMemory({ rootDir: local.root });
        const r = await rm.ingestWorkflow(local.workflowId);
        assert.equal(r.ok, true);
        assert.equal(r.action, "skipped", JSON.stringify(variant));
        assert.equal(calls(local).length, 0, "the CLI is never spawned for a non-shippable run");
      } finally {
        fs.rmSync(local.root, { recursive: true, force: true });
      }
    }
  });

  it("is a recorded skip everywhere while disabled, and health says so", async () => {
    const local = makeFixture({ enabled: false });
    process.env.FAKE_RM_LOG = local.logFile;
    try {
      const rm = createResearchMemory({ rootDir: local.root });
      assert.equal(rm.enabled, false);
      assert.deepEqual(await rm.searchPriors({ query: "x" }), []);
      const r = await rm.ingestWorkflow(local.workflowId);
      assert.equal(r.action, "skipped");
      assert.match(r.reason, /disabled/);
      const h = await rm.health();
      assert.equal(h.ok, false);
      assert.equal(h.enabled, false);
      assert.equal(calls(local).length, 0);
    } finally {
      fs.rmSync(local.root, { recursive: true, force: true });
    }
  });

  it("fails soft on CLI failure, a missing CLI, and refuses a plaintext Qdrant url", async () => {
    process.env.FAKE_RM_FAIL = "1";
    const rm = createResearchMemory({ rootDir: fx.root });
    assert.deepEqual(await rm.searchPriors({ query: "x" }), []);
    const r = await rm.ingestWorkflow(fx.workflowId);
    assert.equal(r.ok, false);
    assert.equal(r.action, "failed");
    assert.match(r.error, /exited 1/);
    delete process.env.FAKE_RM_FAIL;

    const missing = createResearchMemory({ rootDir: fx.root, cliPath: path.join(fx.root, "nope.js") });
    assert.deepEqual(await missing.searchPriors({ query: "x" }), []);
    const h = await missing.health();
    assert.equal(h.ok, false);
    assert.match(h.error, /not found/);

    assert.throws(
      () => createResearchMemory({ rootDir: fx.root, configOverride: { qdrantUrl: "http://127.0.0.1:6333" } }),
      /https/
    );
  });
});
