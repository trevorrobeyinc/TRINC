"use strict";

// Multi-agent layer (2026-06-11): per-role backend routing + persistent identity +
// session recording. Core invariants: (1) precedence map→context→default→claude-code;
// (2) fail-soft when nothing is configured (== current behavior); (3) the SHIPPED map
// (empty roles{}) keeps every role on claude-code.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const fs = require("node:fs");
const path = require("node:path");

const { createRoleProviderRouter } = require("../../openclaw-bridge/core/role-provider-router.js");
const { createAgentContextLoader } = require("../../openclaw-bridge/core/agent-context-loader.js");
const { createAgentSessionRecorder } = require("../../openclaw-bridge/core/agent-session-recorder.js");

const REPO_ROOT = path.resolve(__dirname, "..", "..");

function tmpRoot(map) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "magent-"));
  fs.mkdirSync(path.join(dir, "config"), { recursive: true });
  if (map) fs.writeFileSync(path.join(dir, "config", "role-provider-map.json"), JSON.stringify(map));
  return dir;
}

describe("role-provider-router — precedence", () => {
  it("uses the per-role map entry when present", () => {
    const root = tmpRoot({ default: { provider: "claude-code", model: "claude-sonnet-4-6" }, roles: { scout: { provider: "local", model: "qwen", fallback: "claude-code" } } });
    const r = createRoleProviderRouter({ rootDir: root }).resolveRoute("scout", {});
    assert.equal(r.provider, "local"); assert.equal(r.model, "qwen"); assert.equal(r.fallback, "claude-code");
  });
  it("passes through context provider/model when no role entry (template/global default)", () => {
    const root = tmpRoot({ default: { provider: "claude-code", model: "claude-sonnet-4-6" }, roles: {} });
    const r = createRoleProviderRouter({ rootDir: root }).resolveRoute("analyst", { provider: "claude-code", model: "claude-sonnet-4-6" });
    assert.equal(r.provider, "claude-code"); assert.equal(r.model, "claude-sonnet-4-6");
  });
  it("falls back to map default, then hard claude-code", () => {
    const root = tmpRoot({ default: { provider: "lm-studio", model: "x" }, roles: {} });
    assert.equal(createRoleProviderRouter({ rootDir: root }).resolveRoute("zzz", {}).provider, "lm-studio");
    const root2 = tmpRoot({ default: {}, roles: {} });
    assert.equal(createRoleProviderRouter({ rootDir: root2 }).resolveRoute("zzz", {}).provider, "claude-code");
  });
  it("missing map file → pure passthrough / claude-code", () => {
    const root = tmpRoot(null);
    assert.equal(createRoleProviderRouter({ rootDir: root }).resolveRoute("scout", { provider: "claude-code" }).provider, "claude-code");
  });
  it("SHIPPED repo map: scout→local/Ollama (the only local model), all other roles → claude-code", () => {
    const router = createRoleProviderRouter({ rootDir: REPO_ROOT });
    const scout = router.resolveRoute("scout", { provider: "claude-code", model: "claude-sonnet-4-6" });
    assert.equal(scout.provider, "local", "scout is routed to the local (Ollama) backend");
    assert.equal(scout.model, "qwen2.5:7b-instruct");
    assert.equal(scout.fallback, "claude-code", "scout degrades to claude-code if Ollama errors");
    // analyst moved back to claude-code (single local model for 16GB stability) → resolves to default;
    // synthesizer pinned to claude-code; unmapped roles fall through to default (claude-code).
    for (const role of ["analyst", "synthesizer", "literature_reviewer"]) {
      assert.equal(router.resolveRoute(role, { provider: "claude-code", model: "claude-sonnet-4-6" }).provider, "claude-code", `${role} on claude-code`);
    }
  });
});

describe("agent-context-loader — identity injection (fail-soft)", () => {
  it("returns empty prefix when the role dir is absent", () => {
    const root = tmpRoot(null);
    assert.equal(createAgentContextLoader({ rootDir: root }).loadAgentContext("nobody").agentIdentityPrefix, "");
  });
  it("loads SOUL.md + AGENTS.md into the prefix", () => {
    const root = tmpRoot(null);
    const dir = path.join(root, "config", "agents", "scout");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "SOUL.md"), "# SOUL — scout\nMandate: find sources.");
    fs.writeFileSync(path.join(dir, "AGENTS.md"), "- role: scout");
    const pfx = createAgentContextLoader({ rootDir: root }).loadAgentContext("scout").agentIdentityPrefix;
    assert.match(pfx, /Mandate: find sources/);
    assert.match(pfx, /role: scout/);
  });
});

describe("agent-session-recorder — session persistence (fail-soft)", () => {
  it("writes a session record and updates the rolling summary", () => {
    const root = tmpRoot(null);
    const rec = createAgentSessionRecorder({ rootDir: root });
    const out = rec.recordSession("scout", { mission_id: "m1", subtask_id: "m1:scout:1", status: "completed", model: "qwen", provider: "local", topic: "aspirin", completed_at: "2026-06-11T00:00:00.000Z" });
    assert.equal(out.ok, true);
    const sessFile = path.join(root, "config", "agents", "scout", "sessions", "m1:scout:1.json");
    assert.ok(fs.existsSync(sessFile));
    const summary = JSON.parse(fs.readFileSync(path.join(root, "config", "agents", "scout", "sessions", "summary-latest.json"), "utf8"));
    assert.equal(summary.total_sessions, 1);
    assert.equal(summary.window_sessions[0].session_id, "m1:scout:1");
  });
});
