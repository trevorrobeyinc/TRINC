"use strict";

// agent-context-loader — loads a role's persistent identity (SOUL.md, AGENTS.md) and a
// digest of its recent sessions, returning an `agentIdentityPrefix` string to prepend to
// the agent's prompt. This is how OpenClaw (the host) supplies durable identity + memory
// to the otherwise-stateless backend per agent run.
//
// Fail-soft by design: if config/agents/<role>/ does not exist (or files are missing),
// returns an empty prefix → the engine behaves exactly as before. Reuses the existing
// prompt seam (agent-engine buildPrompt prepends context.agentIdentityPrefix to systemPrefix).

const fs = require("node:fs");
const path = require("node:path");

const MAX_SOUL_CHARS = 6000;
const MAX_AGENTS_CHARS = 4000;
const MAX_SESSION_DIGEST = 6;

function safeStr(v) { return typeof v === "string" ? v.trim() : ""; }
function readFileSoft(p, maxChars) {
  try {
    const t = fs.readFileSync(p, "utf8");
    return maxChars && t.length > maxChars ? t.slice(0, maxChars) : t;
  } catch { return ""; }
}

function createAgentContextLoader(options = {}) {
  const rootDir = safeStr(options.rootDir) || process.cwd();
  const agentStateDir = safeStr(options.agentStateDir) || "config/agents";
  const logger = options.logger && typeof options.logger.info === "function"
    ? options.logger : { info() {}, warn() {} };

  function agentDir(role) {
    return path.join(rootDir, agentStateDir, String(role || ""));
  }

  function sessionDigest(role) {
    try {
      const p = path.join(agentDir(role), "sessions", "summary-latest.json");
      const data = JSON.parse(fs.readFileSync(p, "utf8"));
      const win = Array.isArray(data.window_sessions) ? data.window_sessions.slice(-MAX_SESSION_DIGEST) : [];
      if (win.length === 0) return "";
      const lines = win.map((s) =>
        `- ${safeStr(s.completed_at) || "?"} ${safeStr(s.status) || "?"} (${safeStr(s.model) || "?"}) ${safeStr(s.topic) || ""}`.trim());
      return `Recent sessions (most recent last):\n${lines.join("\n")}`;
    } catch { return ""; }
  }

  // Returns { agentIdentityPrefix } — empty string when no identity is configured.
  function loadAgentContext(role) {
    const r = safeStr(role);
    if (!r) return { agentIdentityPrefix: "" };
    const dir = agentDir(r);
    let exists = false;
    try { exists = fs.statSync(dir).isDirectory(); } catch { exists = false; }
    if (!exists) return { agentIdentityPrefix: "" };

    const soul = readFileSoft(path.join(dir, "SOUL.md"), MAX_SOUL_CHARS);
    const agents = readFileSoft(path.join(dir, "AGENTS.md"), MAX_AGENTS_CHARS);
    const digest = sessionDigest(r);

    const parts = [];
    if (soul) parts.push(soul);
    if (agents) parts.push(agents);
    if (digest) parts.push(digest);
    if (parts.length === 0) return { agentIdentityPrefix: "" };

    logger.info({ event: "agent_identity_loaded", role: r, has_soul: Boolean(soul), has_agents: Boolean(agents), has_sessions: Boolean(digest) });
    return { agentIdentityPrefix: parts.join("\n\n") };
  }

  return Object.freeze({ loadAgentContext });
}

module.exports = { createAgentContextLoader };
