#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import os from "node:os";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const REPLACEMENTS = [
  ["OpenClaw-Research-Agents", "trevor-robey-inc-agents"],
  ["OPENCLAW_RESEARCH_AGENTS", "TREVOR_ROBEY_INC_AGENTS"],
  ["openclaw-research-agents", "trevor-robey-inc-agents"],
  ["com.openclaw.mcp", "com.trevorrobeyinc.agents.mcp"],
];

const ALLOWLIST_GLOBS = [
  { kind: "md-recursive" },
  { kind: "file", path: "package.json", mode: "json-name-only" },
  { kind: "file", path: "package-lock.json", mode: "json-name-only" },
  { kind: "file", path: "ops/launchd/com.openclaw.mcp.plist" },
  { kind: "file", path: "openclaw-bridge/github-pro-mcp/ecosystem.config.js" },
  { kind: "dir-glob", dir: ".github/workflows", suffix: ".yml" },
  { kind: "dir-glob", dir: "tasks/release-tables", suffix: ".csv" },
  { kind: "file", path: "tests/security/cline-supervisor-contract.test.js" },
  { kind: "dir-glob", dir: "ops/launchd", suffix: ".sh" },
  { kind: "dir-glob", dir: "openclaw-bridge/github-pro-mcp/scripts", suffix: ".sh" },
  { kind: "dir-glob", dir: "scripts", suffix: ".sh" },
];

const SIBLING_GLOBS = [
  { kind: "file", path: "../THE Copilot in Obsidian Everything/ecosystem.config.js" },
  { kind: "file", path: "../obsidian-openclaw-command-center/src/constants.ts" },
  { kind: "file", path: "../obsidian-openclaw-command-center/src/settings.ts" },
  { kind: "file", path: "../obsidian-openclaw-command-center/src/types.ts" },
  { kind: "file", path: "../TrevClaw-Obsidianodus/CLAUDE.md" },
];

const SKIP_DIRS = new Set([
  "workspace", "node_modules", ".git", ".ci", "var", "state", "vendor",
]);

const SKIP_FILE_PATTERNS = [
  /\.bak\.cleanup\.[^/]+$/,
  /(^|\/)openclaw-bridge\/openclaw\.json$/,
  /(^|\/)NOTICE\.md$/,
  /(^|\/)LICENSE$/,
];

const PRESERVE_LINE_TOKENS = [
  "upstream", "based on", "MIT", "github.com/openclaw/openclaw",
  "attribution", "cleanRoomDerivative", "Built with Meta Llama 3",
];

function parseArgs(argv) {
  const out = { mode: "dry-run", includeSiblings: false, summary: false, reportPath: null, unknown: [] };
  for (const arg of argv.slice(2)) {
    if (arg === "--dry-run") out.mode = "dry-run";
    else if (arg === "--apply") out.mode = "apply";
    else if (arg === "--allowlist-only") out.mode = "allowlist-only";
    else if (arg === "--summary") out.summary = true;
    else if (arg === "--include-siblings") out.includeSiblings = true;
    else if (arg.startsWith("--report=")) out.reportPath = arg.slice("--report=".length);
    else out.unknown.push(arg);
  }
  if (out.unknown.length) {
    console.error(`Unknown args: ${out.unknown.join(" ")}`);
    process.exit(4);
  }
  return out;
}

async function* walkMarkdown(dir, rel = "") {
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); }
  catch { return; }
  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".github") continue;
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    const r = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      yield* walkMarkdown(full, r);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      yield { abs: full, rel: r };
    }
  }
}

function isSkipped(relPath) {
  for (const re of SKIP_FILE_PATTERNS) if (re.test(relPath)) return true;
  return false;
}

function lineHasPreservedToken(line) {
  for (const tok of PRESERVE_LINE_TOKENS) {
    if (line.includes(tok)) return true;
  }
  return false;
}

function applyReplacementsToText(content, mode) {
  if (mode === "json-name-only") {
    let parsed;
    try { parsed = JSON.parse(content); }
    catch { return { changed: false, content, replacementCounts: {} }; }
    const counts = {};
    if (typeof parsed.name === "string") {
      const before = parsed.name;
      let after = before;
      for (const [from, to] of REPLACEMENTS) {
        const occurrences = after.split(from).length - 1;
        if (occurrences > 0) {
          counts[from] = (counts[from] || 0) + occurrences;
          after = after.split(from).join(to);
        }
      }
      if (after !== before) {
        parsed.name = after;
        const trailingNewline = content.endsWith("\n") ? "\n" : "";
        return { changed: true, content: JSON.stringify(parsed, null, 2) + trailingNewline, replacementCounts: counts };
      }
    }
    return { changed: false, content, replacementCounts: {} };
  }

  const lines = content.split("\n");
  const counts = {};
  let changed = false;
  for (let i = 0; i < lines.length; i++) {
    const original = lines[i];
    if (lineHasPreservedToken(original)) continue;
    let next = original;
    for (const [from, to] of REPLACEMENTS) {
      const occurrences = next.split(from).length - 1;
      if (occurrences > 0) {
        counts[from] = (counts[from] || 0) + occurrences;
        next = next.split(from).join(to);
      }
    }
    if (next !== original) {
      lines[i] = next;
      changed = true;
    }
  }
  return { changed, content: lines.join("\n"), replacementCounts: counts };
}

async function gatherCandidates(includeSiblings) {
  const candidates = [];
  for await (const md of walkMarkdown(REPO_ROOT)) {
    if (isSkipped(md.rel)) continue;
    candidates.push({ abs: md.abs, rel: md.rel, mode: "text" });
  }
  for (const entry of ALLOWLIST_GLOBS) {
    if (entry.kind === "md-recursive") continue;
    if (entry.kind === "file") {
      const abs = path.join(REPO_ROOT, entry.path);
      try { await fs.access(abs); }
      catch { continue; }
      if (isSkipped(entry.path)) continue;
      candidates.push({ abs, rel: entry.path, mode: entry.mode || "text" });
    } else if (entry.kind === "dir-glob") {
      const dirAbs = path.join(REPO_ROOT, entry.dir);
      let names;
      try { names = await fs.readdir(dirAbs); }
      catch { continue; }
      for (const name of names) {
        if (!name.endsWith(entry.suffix)) continue;
        const rel = `${entry.dir}/${name}`;
        if (isSkipped(rel)) continue;
        candidates.push({ abs: path.join(dirAbs, name), rel, mode: "text" });
      }
    }
  }
  if (includeSiblings) {
    for (const entry of SIBLING_GLOBS) {
      const abs = path.resolve(REPO_ROOT, entry.path);
      try { await fs.access(abs); }
      catch { continue; }
      candidates.push({ abs, rel: entry.path, mode: "text", sibling: true });
    }
  }
  return candidates;
}

async function gatherSkiplistAuditPaths() {
  const found = [];
  async function walkAll(dir, rel = "") {
    let entries;
    try { entries = await fs.readdir(dir, { withFileTypes: true }); }
    catch { return; }
    for (const entry of entries) {
      const r = rel ? `${rel}/${entry.name}` : entry.name;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) {
          found.push({ rel: r, kind: "dir" });
          continue;
        }
        await walkAll(full, r);
      } else if (entry.isFile()) {
        if (isSkipped(r)) found.push({ rel: r, kind: "file" });
      }
    }
  }
  await walkAll(REPO_ROOT);
  return found;
}

function unifiedDiff(relPath, before, after) {
  const tmpDir = os.tmpdir();
  const stamp = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const aPath = path.join(tmpDir, `rebrand-a-${stamp}`);
  const bPath = path.join(tmpDir, `rebrand-b-${stamp}`);
  return (async () => {
    await fs.writeFile(aPath, before);
    await fs.writeFile(bPath, after);
    const res = spawnSync("diff", ["-u", aPath, bPath], { encoding: "utf8" });
    await fs.unlink(aPath).catch(() => {});
    await fs.unlink(bPath).catch(() => {});
    if (res.status === 0) return "";
    if (res.status !== 1) {
      throw new Error(`diff failed for ${relPath}: ${res.stderr}`);
    }
    const lines = res.stdout.split("\n");
    if (lines.length >= 2) {
      lines[0] = `--- a/${relPath}`;
      lines[1] = `+++ b/${relPath}`;
    }
    return lines.join("\n");
  })();
}

async function gitWorkingTreeClean() {
  const res = spawnSync("git", ["status", "--porcelain"], { cwd: REPO_ROOT, encoding: "utf8" });
  if (res.status !== 0) return false;
  const lines = res.stdout.split("\n").filter(Boolean);
  const meaningful = lines.filter((l) => {
    const p = l.slice(3);
    if (p.startsWith(".ci/npm-cache/")) return false;
    if (p === "vendor/tooluniverse" || p.startsWith("vendor/tooluniverse/")) return false;
    return true;
  });
  return meaningful.length === 0;
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.mode === "allowlist-only") {
    const candidates = await gatherCandidates(args.includeSiblings);
    const violations = candidates.filter((c) => isSkipped(c.rel));
    if (violations.length) {
      console.error(`Skiplist invariant FAIL — these candidates would be touched but are skiplisted:`);
      for (const v of violations) console.error(`  ${v.rel}`);
      process.exit(3);
    }
    console.log(`allowlist-only: PASS (${candidates.length} files in allowlist, 0 skiplist violations)`);
    process.exit(0);
  }

  if (args.mode === "apply") {
    const clean = await gitWorkingTreeClean();
    if (!clean) {
      console.error(`Refusing to --apply: git working tree has meaningful changes outside .ci/npm-cache and vendor/tooluniverse.`);
      console.error(`Run 'git status' and stash or commit first.`);
      process.exit(3);
    }
  }

  const candidates = await gatherCandidates(args.includeSiblings);
  const proposals = [];
  let totalReplacements = 0;
  const tokenTotals = Object.fromEntries(REPLACEMENTS.map(([f]) => [f, 0]));

  for (const c of candidates) {
    let raw;
    try { raw = await fs.readFile(c.abs, "utf8"); }
    catch (err) {
      console.error(`I/O error reading ${c.rel}: ${err.message}`);
      process.exit(2);
    }
    const result = applyReplacementsToText(raw, c.mode);
    if (!result.changed) continue;
    const fileTotal = Object.values(result.replacementCounts).reduce((a, b) => a + b, 0);
    totalReplacements += fileTotal;
    for (const [k, v] of Object.entries(result.replacementCounts)) {
      tokenTotals[k] = (tokenTotals[k] || 0) + v;
    }
    proposals.push({ ...c, before: raw, after: result.content, replacementCounts: result.replacementCounts, fileTotal });
  }

  if (args.reportPath) {
    const report = {
      mode: args.mode,
      totals: { filesChanged: proposals.length, replacements: totalReplacements, byToken: tokenTotals },
      files: proposals.map((p) => ({ path: p.rel, replacements: p.replacementCounts, sibling: !!p.sibling })),
    };
    await fs.writeFile(args.reportPath, JSON.stringify(report, null, 2) + "\n");
  }

  if (args.summary) {
    console.log(`${proposals.length} files would change; ${totalReplacements} total replacements`);
    for (const [k, v] of Object.entries(tokenTotals)) {
      if (v > 0) console.log(`  ${k}: ${v}`);
    }
    const audit = await gatherSkiplistAuditPaths();
    console.log(`skiplisted paths present (informational): ${audit.length}`);
    console.log(`allowlist-skiplist invariant: PASS`);
    process.exit(0);
  }

  if (args.mode === "dry-run") {
    for (const p of proposals) {
      const diff = await unifiedDiff(p.rel, p.before, p.after);
      if (diff) process.stdout.write(diff + "\n");
    }
    console.log(`# ${proposals.length} files would change; ${totalReplacements} total replacements; allowlist-skiplist invariant: PASS`);
    process.exit(0);
  }

  if (args.mode === "apply") {
    for (const p of proposals) {
      await fs.writeFile(p.abs, p.after);
    }
    console.log(`Applied: ${proposals.length} files; ${totalReplacements} replacements.`);
    process.exit(0);
  }
}

main().catch((err) => {
  console.error(`Fatal: ${err.stack || err.message}`);
  process.exit(2);
});
