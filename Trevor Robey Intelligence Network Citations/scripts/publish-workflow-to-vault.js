#!/usr/bin/env node
"use strict";

/**
 * publish-workflow-to-vault — write a completed, citation-PASS workflow's notes into the Obsidian
 * vault, or backfill every completed run on disk. The SAME writer run-workflow.js calls after a
 * successful run; this CLI exists for backfills (runs completed before 2026-09-22, or while vault
 * publishing was off), for the Command Center plugin's catch-up sweep on load, and for dry-runs.
 *
 * No operator gate: nothing here spends model capacity. Mock-provider runs, failed runs and
 * non-PASS runs are skipped, never written (openclaw-bridge/vault/workflow-vault-publisher.js).
 *
 * Usage:
 *   node scripts/publish-workflow-to-vault.js --workflow-id workflow-XXXX [--force] [--dry-run] [--json]
 *   node scripts/publish-workflow-to-vault.js --all [--force] [--dry-run] [--json]
 *
 * Exit codes: 0 = every requested run was written or legitimately skipped; 1 = at least one failed
 * (bad state, refused path, vault root not allow-listed).
 */

const { createWorkflowVaultPublisher } = require("../openclaw-bridge/vault/workflow-vault-publisher.js");

function parseArgs(argv) {
  const out = { workflowId: "", all: false, force: false, dryRun: false, json: false, unknown: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const t = String(argv[i] || "");
    if (t === "--workflow-id") { out.workflowId = String(argv[i + 1] || "").trim(); i += 1; continue; }
    if (t === "--all") { out.all = true; continue; }
    if (t === "--force") { out.force = true; continue; }
    if (t === "--dry-run") { out.dryRun = true; continue; }
    if (t === "--json") { out.json = true; continue; }
    out.unknown.push(t);
  }
  return out;
}

function usage() {
  return [
    "Usage:",
    "  node scripts/publish-workflow-to-vault.js --workflow-id <workflow-id> [--force] [--dry-run] [--json]",
    "  node scripts/publish-workflow-to-vault.js --all [--force] [--dry-run] [--json]",
    "",
    "  --all       backfill every completed run under workspace/workflows/ (already-written runs are skipped)",
    "  --force     rewrite a run whose notes already exist",
    "  --dry-run   resolve, gate and list the files that WOULD be written; write nothing",
    "  --json      machine-readable result on stdout (human summary goes to stderr either way)"
  ].join("\n");
}

function describe(r) {
  const head = `${r.workflow_id || "?"}: ${r.action}`;
  if (r.action === "written" || r.action === "dry-run") return `${head} → ${r.folder} (${(r.files || []).length} files${r.rewritten ? ", rewritten" : ""})`;
  if (r.action === "skipped") return `${head} — ${r.reason}`;
  return `${head} — ${r.error}${r.code ? ` [${r.code}]` : ""}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.unknown.length > 0 || (!args.all && !args.workflowId) || (args.all && args.workflowId)) {
    process.stderr.write(`${usage()}\n`);
    return 1;
  }
  const logger = {
    info() {},
    warn(data) { process.stderr.write(`[WARN] ${JSON.stringify(data)}\n`); },
    error(data) { process.stderr.write(`[ERROR] ${JSON.stringify(data)}\n`); }
  };
  const publisher = createWorkflowVaultPublisher({ rootDir: process.cwd(), logger });

  let payload;
  if (args.all) {
    payload = await publisher.publishAll({ force: args.force, dryRun: args.dryRun });
    for (const r of payload.results) process.stderr.write(`${describe(r)}\n`);
    const s = payload.summary;
    process.stderr.write(`vault publish: ${s.written} written, ${s.dry_run} dry-run, ${s.skipped} skipped, ${s.failed} failed\n`);
  } else {
    const r = await publisher.publishWorkflow(args.workflowId, { force: args.force, dryRun: args.dryRun });
    payload = { ok: r.ok, summary: { written: r.action === "written" ? 1 : 0, dry_run: r.action === "dry-run" ? 1 : 0, skipped: r.action === "skipped" ? 1 : 0, failed: r.ok ? 0 : 1 }, results: [r] };
    process.stderr.write(`${describe(r)}\n`);
  }
  if (args.json) process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  return payload.ok ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    process.stderr.write(`${err && err.stack ? err.stack : String(err)}\n`);
    process.exit(1);
  });
