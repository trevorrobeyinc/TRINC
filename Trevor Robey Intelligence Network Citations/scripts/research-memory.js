#!/usr/bin/env node
"use strict";

/**
 * research-memory — operator / bridge CLI over the engine's research-memory client
 * (openclaw-bridge/mcp/research-memory-mcp/index.js), which is a thin client of the pack store's
 * own CLI (Claude/trevorobeyinc-research-memory-mcp/dist/cli.js) over the :6433 HTTPS proxy.
 *
 * WHY THIS EXISTS. The Command Center bridge (:8799) exposes research-memory search to Copilot
 * agent chat by spawning THIS script, not the pack store's CLI directly, so the one gate that
 * decides whether the store may be touched — `config/vault-publish.json` → `researchMemory.enabled`
 * — is honoured from every surface. While it is false, `search` reports `enabled:false` with the
 * operator's action instead of embedding the query (which would download the store's embedding
 * model from huggingface.co on first use).
 *
 * Usage:
 *   node scripts/research-memory.js search --query "<text>" [--limit N] [--json]
 *   node scripts/research-memory.js health [--json]
 *   node scripts/research-memory.js ingest --workflow-id <id> [--force] [--allow-remote-model] [--json]
 *
 * `--allow-remote-model` is the ONLY way the engine lane lets the pack store fetch its embedding
 * model from huggingface.co (one-time, operator-run, into the store's node_modules cache). Every
 * other call — this script without the flag, the post-run ingest, the prefetch, the bridge tool —
 * runs the store offline; a missing model is then a loud EMBED_MODEL_NOT_CACHED failure, never a
 * download.
 *
 * Exit codes: 0 = ok (a disabled lane is a recorded skip, still 0); 1 = failure; 2 = usage.
 */

const { createResearchMemory } = require("../openclaw-bridge/mcp/research-memory-mcp/index.js");

const ENABLE_ACTION =
  "Operator: run `node scripts/research-memory.js health` (creates the Qdrant collection over :6433), then " +
  "`node scripts/research-memory.js ingest --workflow-id <a completed, citation-PASS run> --allow-remote-model` " +
  "once (that flag lets the pack store fetch its nomic embedding model from huggingface.co), then set " +
  "config/vault-publish.json → researchMemory.enabled = true.";

function parseArgs(argv) {
  const out = { cmd: String(argv[0] || ""), query: "", limit: 5, workflowId: "", force: false, allowRemote: false, json: false, unknown: [] };
  for (let i = 1; i < argv.length; i += 1) {
    const t = String(argv[i] || "");
    if (t === "--query") { out.query = String(argv[i + 1] || ""); i += 1; continue; }
    if (t === "--limit") { out.limit = Number(argv[i + 1]); i += 1; continue; }
    if (t === "--workflow-id") { out.workflowId = String(argv[i + 1] || "").trim(); i += 1; continue; }
    if (t === "--force") { out.force = true; continue; }
    if (t === "--allow-remote-model") { out.allowRemote = true; continue; }
    if (t === "--json") { out.json = true; continue; }
    out.unknown.push(t);
  }
  return out;
}

function usage() {
  return [
    "Usage:",
    "  node scripts/research-memory.js search --query \"<text>\" [--limit N] [--json]",
    "  node scripts/research-memory.js health [--json]",
    "  node scripts/research-memory.js ingest --workflow-id <id> [--force] [--allow-remote-model] [--json]",
    "    --allow-remote-model: one-time operator fetch of the store's embedding model (never set by automation)"
  ].join("\n");
}

function emit(payload, json) {
  if (json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }
  if (payload.enabled === false) {
    process.stdout.write(`research memory is DISABLED — ${payload.reason}\n${payload.action}\n`);
    return;
  }
  if (Array.isArray(payload.results)) {
    if (payload.results.length === 0) process.stdout.write("no prior packs matched\n");
    for (const r of payload.results) {
      process.stdout.write(`- ${r.title} (${r.path}${typeof r.score === "number" ? `, score ${r.score.toFixed(2)}` : ""})\n  ${String(r.text || "").slice(0, 200)}\n`);
    }
    return;
  }
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const known = new Set(["search", "health", "ingest"]);
  if (!known.has(args.cmd) || args.unknown.length > 0) {
    process.stderr.write(`${usage()}\n`);
    return 2;
  }
  const logger = {
    info() {},
    warn(data) { process.stderr.write(`[WARN] ${JSON.stringify(data)}\n`); },
    error(data) { process.stderr.write(`[ERROR] ${JSON.stringify(data)}\n`); }
  };
  const rm = createResearchMemory({ rootDir: process.cwd(), logger });

  if (!rm.enabled) {
    emit({
      ok: true,
      enabled: false,
      command: args.cmd,
      results: args.cmd === "search" ? [] : undefined,
      reason: "config/vault-publish.json → researchMemory.enabled is false (the store's CLI downloads its embedding model on first use; enabling it is the operator's decision)",
      action: ENABLE_ACTION
    }, args.json);
    return 0;
  }

  if (args.cmd === "search") {
    const query = args.query.replace(/\s+/g, " ").trim();
    if (!query) { process.stderr.write("search requires --query\n"); return 2; }
    const limit = Number.isFinite(args.limit) ? Math.max(1, Math.min(args.limit, 10)) : 5;
    const results = await rm.searchPriors({ query, limit });
    emit({ ok: true, enabled: true, command: "search", query, limit, results, context_only: true,
      note: "Prior-run packs are CONTEXT, never citation evidence: identifiers inside them must not be cited without a live source fetch." }, args.json);
    return 0;
  }
  if (args.cmd === "health") {
    const h = await rm.health();
    emit({ command: "health", ...h }, args.json);
    return h.ok ? 0 : 1;
  }
  if (!args.workflowId) { process.stderr.write("ingest requires --workflow-id\n"); return 2; }
  const r = await rm.ingestWorkflow(args.workflowId, { force: args.force, allowRemote: args.allowRemote });
  emit({ command: "ingest", enabled: true, allow_remote_model: args.allowRemote, ...r }, args.json);
  return r.ok ? 0 : 1;
}

main()
  .then((code) => { process.exitCode = code; })
  .catch((err) => {
    process.stderr.write(`${err && err.stack ? err.stack : String(err)}\n`);
    process.exitCode = 1;
  });
