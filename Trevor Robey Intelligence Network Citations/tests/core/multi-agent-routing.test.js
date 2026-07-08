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
  it("resolves the per-role helper when present, null when absent", () => {
    const root = tmpRoot({
      default: { provider: "claude-code", model: "claude-opus-4-8" },
      roles: {
        scout: { provider: "claude-code", model: "claude-opus-4-8", helper: { provider: "local", model: "qwen2.5:7b-instruct", maxTokens: 512 }, fallback: "local" },
        plain: { provider: "claude-code", model: "claude-opus-4-8" }
      }
    });
    const router = createRoleProviderRouter({ rootDir: root });
    assert.deepEqual(router.resolveRoute("scout", {}).helper, { provider: "local", model: "qwen2.5:7b-instruct", maxTokens: 512 });
    assert.equal(router.resolveRoute("plain", {}).helper, null, "role without helper → null");
    assert.equal(router.resolveRoute("unmapped", {}).helper, null, "unmapped role → null");
  });
  it("SHIPPED repo map: scout/analyst/synthesizer → claude-code/Opus 4.8 with OSS helpers; unmapped → claude-code", () => {
    const router = createRoleProviderRouter({ rootDir: REPO_ROOT });
    // scout was retired off Ollama qwen2.5:7b as primary → now Opus 4.8, with qwen2.5:7b kept as its helper (back burner).
    const scout = router.resolveRoute("scout", { provider: "claude-code", model: "claude-sonnet-4-6" });
    assert.equal(scout.provider, "claude-code", "scout runs on the claude-code (Opus) backend");
    assert.equal(scout.model, "claude-opus-4-8");
    assert.equal(scout.fallback, "local", "scout degrades to its OSS backend (Ollama) on error");
    assert.ok(scout.helper, "scout has a helper");
    assert.equal(scout.helper.provider, "local");
    assert.equal(scout.helper.model, "qwen2.5:7b-instruct", "qwen2.5:7b kept as scout's helper, not retired");
    // analyst + synthesizer → Opus 4.8 with LM Studio helper.
    for (const role of ["analyst", "synthesizer"]) {
      const r = router.resolveRoute(role, { provider: "claude-code", model: "claude-sonnet-4-6" });
      assert.equal(r.provider, "claude-code", `${role} on claude-code`);
      assert.equal(r.model, "claude-opus-4-8", `${role} on Opus 4.8`);
      assert.equal(r.helper.provider, "lm-studio", `${role} helper is LM Studio`);
      assert.equal(r.helper.model, "qwen/qwen3.5-9b");
    }
    // Unmapped roles fall through to default (claude-code/sonnet, no helper).
    const lit = router.resolveRoute("literature_reviewer", { provider: "claude-code", model: "claude-sonnet-4-6" });
    assert.equal(lit.provider, "claude-code", "literature_reviewer on claude-code");
    assert.equal(lit.helper, null, "unmapped roles have no helper");
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
