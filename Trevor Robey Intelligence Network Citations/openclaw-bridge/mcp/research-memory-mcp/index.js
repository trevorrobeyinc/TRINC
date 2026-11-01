"use strict";

// research-memory-mcp — engine-side client of the Trevorobeyinc Research Memory pack store
// (2026-09-22, Obsidian re-integration plan, decision D5). Closes the registry's long-standing
// `research-memory: adapter_status missing` gap.
//
// WHAT IT IS. `Claude/trevorobeyinc-research-memory-mcp` keeps every shipped synthesizer pack as a
// vector in Qdrant (collection `trevorobeyinc-packs`, reached ONLY through the in-monorepo HTTPS
// proxy on :6433 — never Qdrant's plaintext upstream port). Until now only the Command Center plugin ingested
// into it (after a run it dispatched itself, while Obsidian was open — which had never happened),
// and nothing in the engine could read it. This module is a THIN CLIENT of that package's own
// CLI (`dist/cli.js ingest|search|health`): no listener, no embedding code in the engine, no second
// copy of the store's logic. Spawned as an argv array, never a shell string.
//
// TWO JOBS.
//   ingestWorkflow(workflowId) — post-run: a shippable run's synthesizer output becomes a pack.
//     Same gates as the vault publisher (completed + citation PASS + not mock), idempotent on the
//     pack's content hash (the CLI returns `skipped_duplicate`), so the plugin's own later ingest
//     of the same run can never duplicate it. Records `artifacts.research_memory` in workflow.json.
//   searchPriors({query}) — prefetch (`research_memory_priors`, synthesizer role): what earlier
//     runs concluded about a similar indication. CONTEXT ONLY: every record carries
//     `context_only: true`, is rendered with identifiers withheld and never enters
//     fetched_citation_ids (see tool-prefetch.js / agent-engine.js).
//
// ONE SWITCH, AND NO NETWORK FETCH BY ACCIDENT. `config/vault-publish.json` → `researchMemory.enabled`
// turns both jobs on (enabled 2026-09-22 after the operator's manual first ingest); while false both
// are recorded skips. The CLI embeds with `Xenova/nomic-embed-text-v1` through @huggingface/transformers
// (until 2026-11-01 @xenova/transformers; the cache is now ~/.cache/trevorobeyinc-research-memory/,
// overridable with EMBED_CACHE_DIR), which would download the model from huggingface.co whenever its
// cache is empty — so every spawn
// from here sets EMBED_ALLOW_REMOTE=0 (the pack store's embedder is offline by default and fails
// loudly with EMBED_MODEL_NOT_CACHED) unless the caller passes `allowRemote: true`, which only the
// operator CLI (`scripts/research-memory.js ingest --allow-remote-model`) ever does. A research run
// or a bridge call can therefore never trigger a model download. Fail-soft throughout: nothing here
// can fail a research run.
//
// RESTRICTED GLOBALS: no wall-clock, no RNG — temp-file names derive from the workflow id and the
// process id; dates come from the run's own state.

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { loadConfig, assessWorkflow, atomicWriteJson } = require("../../vault/workflow-vault-publisher.js");

const DEFAULT_CLI = "/Users/myhome/TRINC/Claude/trevorobeyinc-research-memory-mcp/dist/cli.js";
const DEFAULT_QDRANT = "https://127.0.0.1:6433";
const DEFAULT_MKCERT_CA = path.join(os.homedir(), "Library/Application Support/mkcert/rootCA.pem");
const MAX_CAPTURE = 512 * 1024;

function isPlainObject(v) {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function createResearchMemory(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const logger = isPlainObject(options.logger) ? options.logger : { info() {}, warn() {}, error() {} };
  const fileConfig = loadConfig(rootDir);
  const rm = { ...(isPlainObject(fileConfig.researchMemory) ? fileConfig.researchMemory : {}), ...(isPlainObject(options.configOverride) ? options.configOverride : {}) };
  const enabled = rm.enabled === true;
  const cliPath = String(options.cliPath || rm.cliPath || DEFAULT_CLI);
  const client = String(rm.client || "trevorobeyinc");
  const qdrantUrl = String(rm.qdrantUrl || DEFAULT_QDRANT).replace(/\/+$/, "");
  const timeoutMs = Number(rm.timeoutMs) || 90_000;
  const scoreThreshold = Number.isFinite(Number(rm.scoreThreshold)) ? Number(rm.scoreThreshold) : 0.5;
  const nodeBin = options.nodeBin || process.execPath;
  const spawnImpl = typeof options.spawnImpl === "function" ? options.spawnImpl : spawn;
  const requireCitationPass = fileConfig.requireCitationPass !== false;

  if (!/^https:\/\//.test(qdrantUrl)) {
    throw Object.assign(new Error("research-memory qdrantUrl must be https (HTTPS-only invariant)"), { code: "RESEARCH_MEMORY_PLAINTEXT_REFUSED" });
  }

  /**
   * Run one CLI subcommand. Resolves { ok, code, stdout, stderr, json } — never rejects.
   * `allowRemote` is false for every automated caller: the pack store may then only load its
   * embedding model from its local cache, never from huggingface.co.
   */
  function runCli(args, { timeout = timeoutMs, allowRemote = false } = {}) {
    return new Promise((resolve) => {
      if (!fs.existsSync(cliPath)) {
        resolve({ ok: false, code: null, stdout: "", stderr: "", json: null, error: `research-memory CLI not found at ${cliPath}` });
        return;
      }
      let proc;
      try {
        proc = spawnImpl(nodeBin, [cliPath, ...args], {
          cwd: path.dirname(cliPath),
          stdio: ["ignore", "pipe", "pipe"],
          env: {
            ...process.env,
            QDRANT_URL: qdrantUrl,
            NODE_EXTRA_CA_CERTS: process.env.NODE_EXTRA_CA_CERTS || DEFAULT_MKCERT_CA,
            EMBED_ALLOW_REMOTE: allowRemote === true ? "1" : "0"
          }
        });
      } catch (err) {
        resolve({ ok: false, code: null, stdout: "", stderr: "", json: null, error: err && err.message ? err.message : String(err) });
        return;
      }
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      const cap = (s, b) => (s.length < MAX_CAPTURE ? s + b.toString() : s);
      proc.stdout.on("data", (b) => { stdout = cap(stdout, b); });
      proc.stderr.on("data", (b) => { stderr = cap(stderr, b); });
      const timer = setTimeout(() => {
        timedOut = true;
        try { proc.kill("SIGTERM"); } catch { /* gone */ }
      }, timeout);
      proc.on("error", (err) => {
        clearTimeout(timer);
        resolve({ ok: false, code: null, stdout, stderr, json: null, error: err && err.message ? err.message : String(err) });
      });
      proc.on("close", (code) => {
        clearTimeout(timer);
        let json = null;
        try { json = stdout.trim() ? JSON.parse(stdout) : null; } catch { json = null; }
        if (timedOut) {
          resolve({ ok: false, code, stdout, stderr, json, error: `research-memory CLI timed out after ${timeout}ms` });
          return;
        }
        if (code !== 0) {
          resolve({ ok: false, code, stdout, stderr, json, error: `research-memory CLI exited ${code}: ${(stderr || stdout).trim().slice(0, 300)}` });
          return;
        }
        resolve({ ok: true, code, stdout, stderr, json });
      });
    });
  }

  /**
   * Prefetch entry point (`research_memory_priors`). Always an array; every record context-only.
   */
  async function searchPriors({ query, limit = 5 } = {}) {
    if (!enabled) return [];
    const q = String(query || "").replace(/\s+/g, " ").trim();
    if (!q) return [];
    const res = await runCli(["search", "--query", q, "--limit", String(Math.max(1, Math.min(Number(limit) || 5, 10))), "--score-threshold", String(scoreThreshold)]);
    if (!res.ok || !res.json || !Array.isArray(res.json.results)) {
      if (!res.ok) logger.warn({ event: "research_memory_search_failed", error: res.error });
      return [];
    }
    return res.json.results.map((r) => ({
      path: `research-memory://${r.pack_id}`,
      title: r.pack_title ? String(r.pack_title) : String(r.pack_id || ""),
      text: String(r.snippet || ""),
      score: typeof r.score === "number" ? r.score : null,
      topic: r.payload && r.payload.topic ? String(r.payload.topic) : "",
      ingested_at: r.payload && r.payload.ingested_at ? String(r.payload.ingested_at) : "",
      source: "research-memory",
      context_only: true
    }));
  }

  function skip(workflowId, reason) {
    logger.info({ event: "research_memory_ingest_skipped", workflow_id: workflowId, reason });
    return { ok: true, action: "skipped", workflow_id: workflowId, reason };
  }

  /**
   * Post-run ingest. Same gates as the vault publisher; idempotent on content hash.
   * opts.force re-runs the CLI for an already-recorded run; opts.allowRemote lets THIS ONE spawn fetch
   * the embedding model (operator CLI only — the engine's post-run call never sets it).
   * Returns { ok, action: "created"|"replaced"|"skipped_duplicate"|"skipped"|"failed", pack_id?, reason? }.
   */
  async function ingestWorkflow(workflowId, opts = {}) {
    const id = String(workflowId || "").trim();
    if (!id) return { ok: false, action: "failed", error: "workflowId required" };
    if (!enabled) return skip(id, "research memory disabled (config/vault-publish.json researchMemory.enabled=false)");
    const assessed = assessWorkflow(rootDir, id, { requireCitationPass });
    if (!assessed.state) return { ok: false, action: "failed", workflow_id: id, error: assessed.block };
    if (assessed.block) return skip(id, assessed.block);
    if (!assessed.synthesizer) return skip(id, "no synthesizer output on disk for this run");
    const existing = assessed.state.artifacts && assessed.state.artifacts.research_memory;
    if (existing && existing.pack_id && opts.force !== true) {
      return { ok: true, action: "skipped", workflow_id: id, pack_id: existing.pack_id, reason: "already ingested (artifacts.research_memory present)" };
    }

    const state = assessed.state;
    const templateId = String(state.template_id || "unknown");
    const runDate = String(state.created_at || "").slice(0, 10) || "undated";
    const packId = `pack-${runDate}-${templateId}-${id.replace(/^workflow-/, "").slice(0, 8)}`;
    const inputLabel = Object.values(state.inputs || {}).join(" / ");
    const tags = ["openclaw", "synthesizer", templateId, id].join(",");
    const tmpFile = path.join(os.tmpdir(), `openclaw-pack-${id.replace(/[^a-zA-Z0-9-]/g, "")}-${process.pid}.md`);
    try {
      fs.writeFileSync(tmpFile, assessed.synthesizer.content, "utf8");
      const res = await runCli([
        "ingest",
        "--pack-file", tmpFile,
        "--client", client,
        "--topic", templateId,
        "--tags", tags,
        "--source-uri", `file://${assessed.synthesizer.outputPath || tmpFile}`,
        "--synthesizer-version", "openclaw-engine",
        "--pack-id", packId,
        "--pack-title", `${templateId} — ${inputLabel}`
      ], {
        allowRemote: opts.allowRemote === true,
        // A permitted model fetch (~140 MB) is expected to be slow; the automated path keeps its budget.
        timeout: opts.allowRemote === true ? Math.max(timeoutMs, 600_000) : timeoutMs
      });
      if (!res.ok || !res.json || !res.json.pack_id) {
        logger.warn({ event: "research_memory_ingest_failed", workflow_id: id, error: res.error || "CLI returned no pack_id" });
        return { ok: false, action: "failed", workflow_id: id, error: res.error || "CLI returned no pack_id" };
      }
      const record = {
        pack_id: String(res.json.pack_id),
        action: String(res.json.action || "created"),
        content_sha256: res.json.content_sha256 ? String(res.json.content_sha256) : null,
        ingested_at: res.json.ingested_at ? String(res.json.ingested_at) : null,
        ingested_by: "engine"
      };
      const fresh = readJson(assessed.stateFile) || state;
      fresh.artifacts = isPlainObject(fresh.artifacts) ? fresh.artifacts : {};
      fresh.artifacts.research_memory = record;
      atomicWriteJson(assessed.stateFile, fresh);
      logger.info({ event: "research_memory_ingested", workflow_id: id, ...record });
      return { ok: true, action: record.action, workflow_id: id, pack_id: record.pack_id, record };
    } catch (err) {
      logger.warn({ event: "research_memory_ingest_failed", workflow_id: id, error: err && err.message });
      return { ok: false, action: "failed", workflow_id: id, error: err && err.message ? err.message : String(err) };
    } finally {
      try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch { /* ignore */ }
    }
  }

  async function health() {
    if (!enabled) return { ok: false, enabled: false, reason: "disabled in config/vault-publish.json" };
    const res = await runCli(["health"], { timeout: Math.min(timeoutMs, 30_000) });
    if (!res.ok) return { ok: false, enabled: true, error: res.error };
    return { ok: true, enabled: true, ...(res.json || {}) };
  }

  return Object.freeze({
    enabled,
    searchPriors,
    ingestWorkflow,
    health,
    _spec: Object.freeze({ cliPath, client, qdrantUrl, timeoutMs, scoreThreshold })
  });
}

module.exports = { createResearchMemory };
