"use strict";

// obsidian-bridge-mcp — engine-side adapter for the CANONICAL Obsidian MCP bridge.
//
// WHY THIS EXISTS
// The engine could publish INTO the vault (scripts/publish-to-vault.js) but could never READ it:
// an agent role had no way to ask "has this vault already covered this indication?" mid-run.
// This adapter closes that gap, read-first.
//
// TRANSPORT — the one non-negotiable design constraint
// Root CLAUDE.md: ":8798 is the canonical vault access point. Do not create alternative vault
// bridges." So this adapter is a THIN CLIENT of the existing bridge on https://127.0.0.1:8798.
// It opens no listener, spawns nothing, and never touches the Local REST API on :27124.
// connector-registry.json's `obsidian-bridge` entry says the same thing in its
// suggested_adapter_path: "would proxy to the canonical bridge on :8798 — DO NOT create a
// parallel vault listener".
//
// AUTH — identical to every other caller of the bridge (see scripts/publish-to-vault.js):
//   Authorization: Bearer <token> + x-mcp-token + x-mcp-timestamp + x-mcp-nonce
//   + x-mcp-body-sha256, where the token is read from the bridge's own config file
//   (security.authToken) — the same file the bridge reads at startup, so there is no second
//   copy of the secret anywhere.
//
// FAIL-SOFT IS MANDATORY. The bridge is a child of the obsidian-bridge-launcher plugin and dies
// with Obsidian, and run-workflow.js can also be launched standalone from a terminal. A closed
// vault must degrade to "no prior-research context", never fail a run — the same contract every
// other prefetch source honours (cf. ctgov-supplemental.js returning [] on any error).
//
// WRITES ARE OPT-IN. `allowWrites` defaults to false. Command Center's autoGenerateNotes already
// writes a note for every completed workflow into `OpenClaw/<template_id>/<date> <label>/`; the
// bridge's research_publish uses a different, currently-dormant scheme (`Research-Output/...`).
// Enabling both without picking one would double-write into two parallel vault trees.
//
// RESTRICTED GLOBALS: raw wall-clock and RNG built-ins are banned under openclaw-bridge/ and
// enforced by scripts/lint-restricted-globals.sh (which greps file TEXT — so even naming them in
// a comment trips it). The replay headers therefore use nowMs() from core/time-provider and
// randomUuid() from core/entropy-provider, which also makes this adapter deterministic under the
// engine's test seeding.
//
// MIYO-DIRECT SEMANTIC READ-BACK (2026-09-22, Obsidian re-integration plan D4). Miyo indexes the
// vault folder itself and answers with Obsidian CLOSED (Qdrant is Miyo's child process), so the
// first semantic hop now goes straight to the in-monorepo HTTPS proxy on :8743 — the endpoint the
// vault-zettelkasten plugin and Command Center already call directly — and the :8798 bridge is the
// fallback for when Obsidian is open. This is NOT a vault bridge: no listener, a third-party service
// already wrapped in mkcert TLS. Never Miyo's plaintext upstream port — the proxy only. Headless
// runs therefore get prior-vault context for the first time.
//
// CONTEXT ONLY, NEVER EVIDENCE. Every record this adapter returns carries `context_only: true`.
// tool-prefetch renders such records under a NOT-evidence banner with identifiers withheld, and
// agent-engine excludes them from fetched_citation_ids — an identifier that sits in a prior note
// can no longer ground a citation without a live source fetch.

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { nowMs } = require("../../core/time-provider.js");
const { randomUuid } = require("../../core/entropy-provider.js");

const DEFAULT_BRIDGE = "https://127.0.0.1:8798";
const DEFAULT_BRIDGE_CONFIG = path.join(
  "/Users/myhome/TrevClaw-Obsidianodus",
  "Copilot-Everything/bridges/obsidian-copilot-bridge/config/obsidian-cli-mcp.local.json"
);
const DEFAULT_VAULT = "My Digital Garden";
const DEFAULT_MIYO = "https://127.0.0.1:8743";
const DEFAULT_MKCERT_CA = path.join(os.homedir(), "Library/Application Support/mkcert/rootCA.pem");
// Prior RESEARCH lives in the engine's own vault tree; the rest of the vault (course notes, books,
// clippings) is not "prior research" and would only add noise to a role's prompt.
const DEFAULT_MIYO_PREFIXES = Object.freeze(["OpenClaw/", "Research-Output/"]);

/**
 * One HTTPS POST to Miyo through the same transport every sibling fetcher uses (global fetch — the
 * MCP egress policy forbids raw socket/https calls in adapters). mkcert trust comes from
 * NODE_EXTRA_CA_CERTS, which run-workflow.js guarantees at startup. Rejects on a non-https url,
 * transport error, or timeout.
 */
async function defaultMiyoRequest(url, body, { timeoutMs, fetchImpl }) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") {
    throw new Error("miyo url must be https (HTTPS-only invariant)");
  }
  const doFetch = typeof fetchImpl === "function" ? fetchImpl : (typeof fetch === "function" ? fetch : null);
  if (!doFetch) throw new Error("no fetch implementation available");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await doFetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    return { status: res.status || 0, json };
  } finally {
    clearTimeout(timer);
  }
}

// Tool → operation. The bridge validates `operation` against a 6-value enum, so tools that are
// not themselves operations (obsidian_health, miyo_search_context) still have to send a VALID
// enum member; the dispatcher short-circuits on the tool name before the operation is used.
const READ_TOOLS = Object.freeze({
  search_notes: { tool: "obsidian_search_notes", operation: "search_notes" },
  read_note: { tool: "obsidian_read_note", operation: "read_note" },
  miyo_search_context: { tool: "miyo_search_context", operation: "search_notes" },
  health: { tool: "obsidian_health", operation: "read_note" },
});

const WRITE_TOOLS = Object.freeze({
  create_note: { tool: "obsidian_create_note", operation: "create_note" },
  append_note: { tool: "obsidian_append_note", operation: "append_note" },
});

function createObsidianBridgeMcp(options = {}) {
  const logger =
    options.logger && typeof options.logger.warn === "function"
      ? options.logger
      : { info() {}, warn() {}, error() {} };

  const fetchImpl = options.fetchImpl || (typeof fetch === "function" ? fetch : null);
  const bridgeUrl = String(options.bridgeUrl || DEFAULT_BRIDGE).replace(/\/+$/, "");
  const bridgeConfigPath = options.bridgeConfigPath || DEFAULT_BRIDGE_CONFIG;
  const vault = options.vault || DEFAULT_VAULT;
  const timeoutMs = Number(options.timeoutMs) || 15_000;
  const allowWrites = options.allowWrites === true;
  // Injectable so tests don't need a config file on disk.
  const tokenOverride = typeof options.authToken === "string" ? options.authToken : null;
  // Miyo-direct lane (see header). Injectable request for tests.
  const miyoUrl = String(options.miyoUrl || DEFAULT_MIYO).replace(/\/+$/, "");
  const miyoCaPath = options.miyoCaPath || DEFAULT_MKCERT_CA;
  const miyoTimeoutMs = Number(options.miyoTimeoutMs) || 8_000;
  const miyoPathPrefixes = Array.isArray(options.miyoPathPrefixes) ? options.miyoPathPrefixes : DEFAULT_MIYO_PREFIXES;
  const miyoRequest = typeof options.miyoRequest === "function" ? options.miyoRequest : defaultMiyoRequest;

  let cachedToken = tokenOverride;
  let tokenLookupFailed = false;
  // Availability is cached per instance: a closed Obsidian shouldn't cost every role a timeout.
  let availability = null;

  function readToken() {
    if (cachedToken) return cachedToken;
    if (tokenLookupFailed) return null;
    try {
      const raw = fs.readFileSync(bridgeConfigPath, "utf8");
      const cfg = JSON.parse(raw);
      const token = cfg && cfg.security && cfg.security.authToken;
      if (typeof token === "string" && token.length > 0) {
        cachedToken = token;
        return cachedToken;
      }
      logger.warn(`[obsidian-bridge-mcp] bridge config has no security.authToken: ${bridgeConfigPath}`);
    } catch (err) {
      logger.warn(
        `[obsidian-bridge-mcp] cannot read bridge config (${bridgeConfigPath}): ${err && err.message ? err.message : err}`
      );
    }
    tokenLookupFailed = true;
    return null;
  }

  /**
   * One authenticated POST to the bridge's /mcp/tool endpoint.
   * Returns { ok, data?, error?, status? } and NEVER throws — every caller below is on a
   * research hot path where an unreachable vault must degrade, not abort.
   */
  async function callTool(tool, operation, input) {
    if (typeof fetchImpl !== "function") {
      return { ok: false, error: "no fetch implementation available" };
    }
    const token = readToken();
    if (!token) return { ok: false, error: "bridge auth token unavailable" };

    const body = JSON.stringify({ tool, operation, input: { vault, ...input } });
    const bodySha256 = crypto.createHash("sha256").update(body, "utf8").digest("hex");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(`${bridgeUrl}/mcp/tool`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "x-mcp-token": token,
          "x-mcp-timestamp": String(nowMs()),
          "x-mcp-nonce": randomUuid(),
          "x-mcp-body-sha256": bodySha256,
        },
        body,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json || json.ok !== true) {
        const message =
          (json && json.error && json.error.message) || `HTTP ${res ? res.status : "no-response"}`;
        return { ok: false, error: message, status: res ? res.status : 0 };
      }
      return { ok: true, data: json.data };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Is the vault reachable right now? Cached after the first probe.
   *
   * NOTE the cold-start race (observed live 2026-07-23): for a few seconds after Obsidian
   * launches, the bridge's backend selector still reports `available:false` and tool calls fail
   * with NO_CAPABLE_BACKEND (self-reported `retryable: true`) until its first capability refresh.
   * `force: true` re-probes so a caller can retry rather than caching a false negative.
   */
  async function available({ force = false } = {}) {
    if (availability !== null && !force) return availability;
    const spec = READ_TOOLS.health;
    const res = await callTool(spec.tool, spec.operation, {});
    availability = res.ok === true;
    if (!availability) {
      logger.warn(`[obsidian-bridge-mcp] vault unavailable — continuing without it: ${res.error}`);
    }
    return availability;
  }

  async function health() {
    const spec = READ_TOOLS.health;
    return callTool(spec.tool, spec.operation, {});
  }

  /**
   * Full-text vault search. Returns a PLAIN ARRAY (possibly empty) so it drops straight into a
   * prefetch pipeline next to ctgov_stopped_trials and the ToolUniverse results.
   */
  async function searchNotes({ query, limit = 5 } = {}) {
    if (!query || typeof query !== "string" || !query.trim()) return [];
    const spec = READ_TOOLS.search_notes;
    const res = await callTool(spec.tool, spec.operation, { query: query.trim(), limit });
    if (!res.ok) return [];
    const matches = res.data && Array.isArray(res.data.matches) ? res.data.matches : [];
    return matches.map((m) => ({
      path: m && m.path ? String(m.path) : "",
      text: m && m.text ? String(m.text) : "",
      source: "obsidian-vault",
      context_only: true,
    }));
  }

  /** Read one note by vault-relative path. Returns a string ("" when unavailable). */
  async function readNote({ notePath } = {}) {
    if (!notePath || typeof notePath !== "string") return "";
    const spec = READ_TOOLS.read_note;
    const res = await callTool(spec.tool, spec.operation, { path: notePath });
    if (!res.ok) return "";
    const d = res.data;
    if (typeof d === "string") return d;
    if (d && typeof d.content === "string") return d.content;
    return "";
  }

  /**
   * Semantic (Miyo-backed) vault search — finds prior research that shares no keywords.
   * Same fail-soft array contract as searchNotes.
   */
  async function miyoSearchContext({ query, limit = 5 } = {}) {
    if (!query || typeof query !== "string" || !query.trim()) return [];
    const spec = READ_TOOLS.miyo_search_context;
    const res = await callTool(spec.tool, spec.operation, { query: query.trim(), limit });
    if (!res.ok) return [];
    const raw =
      (res.data && (res.data.results || res.data.matches || res.data.context)) || [];
    if (!Array.isArray(raw)) return [];
    return raw.map((m) => ({
      path: m && (m.path || m.file_path) ? String(m.path || m.file_path) : "",
      text: m && (m.text || m.chunk_text) ? String(m.text || m.chunk_text) : "",
      score: m && typeof m.score === "number" ? m.score : null,
      source: "obsidian-vault-semantic",
      context_only: true,
    }));
  }

  /** Strip Miyo's leading vault-name segment ("My Digital Garden/OpenClaw/…" → "OpenClaw/…"). */
  function vaultRelative(p) {
    const s = String(p || "");
    const prefix = `${vault}/`;
    return s.startsWith(prefix) ? s.slice(prefix.length) : s;
  }

  /**
   * Semantic vault search straight against Miyo's HTTPS proxy — works with Obsidian closed.
   * Filters to markdown under the research prefixes. Same fail-soft array contract as the rest.
   */
  async function miyoDirectSearch({ query, limit = 5 } = {}) {
    if (!query || typeof query !== "string" || !query.trim()) return [];
    let res;
    try {
      res = await miyoRequest(`${miyoUrl}/v0/search`, { query: query.trim(), limit: Math.max(limit * 3, limit) }, {
        caPath: miyoCaPath,
        timeoutMs: miyoTimeoutMs,
        // The bridge's own fetch (injectable in tests) serves Miyo too — one transport, one policy.
        fetchImpl: options.miyoFetchImpl || fetchImpl,
      });
    } catch (err) {
      logger.warn(`[obsidian-bridge-mcp] miyo-direct unavailable — falling back to the bridge: ${err && err.message ? err.message : err}`);
      return [];
    }
    if (!res || res.status !== 200 || !res.json) return [];
    const raw = Array.isArray(res.json.results) ? res.json.results : [];
    const out = [];
    const seen = new Set();
    for (const m of raw) {
      if (!m || typeof m !== "object") continue;
      const rel = vaultRelative(m.path || m.file_path);
      if (!rel || !rel.toLowerCase().endsWith(".md")) continue;
      if (miyoPathPrefixes.length > 0 && !miyoPathPrefixes.some((p) => rel.startsWith(p))) continue;
      // Miyo returns one row per CHUNK; keep the best-scoring chunk per note so a long note
      // cannot crowd out the other prior runs in a role's small context budget.
      if (seen.has(rel)) continue;
      seen.add(rel);
      out.push({
        path: rel,
        title: m.title ? String(m.title) : "",
        text: String(m.chunk_text || m.text || m.snippet || ""),
        score: typeof m.score === "number" ? m.score : null,
        source: "obsidian-vault-semantic",
        context_only: true,
      });
      if (out.length >= limit) break;
    }
    return out;
  }

  /**
   * Prefetch entry point. `tool-prefetch.js`'s localFetchers seam calls one function per tool
   * name; this returns prior-research context for a topic: Miyo-direct first (headless-capable),
   * then the bridge's semantic and full-text tools when Obsidian is open. Always an array — never
   * throws, never blocks a run — and every record is context-only.
   */
  async function priorResearch({ topic, limit = 5 } = {}) {
    if (!topic || typeof topic !== "string" || !topic.trim()) return [];
    const direct = await miyoDirectSearch({ query: topic, limit });
    if (direct.length > 0) return direct;
    if (!(await available())) return [];
    const semantic = await miyoSearchContext({ query: topic, limit });
    if (semantic.length > 0) return semantic;
    return searchNotes({ query: topic, limit });
  }

  // ── Writes (opt-in; see the double-write note in the header) ────────────────
  async function createNote({ notePath, content, mode = "create" } = {}) {
    if (!allowWrites) return { ok: false, error: "writes disabled (allowWrites=false)" };
    if (!notePath || typeof content !== "string") {
      return { ok: false, error: "createNote requires notePath and content" };
    }
    const spec = WRITE_TOOLS.create_note;
    return callTool(spec.tool, spec.operation, { path: notePath, content, mode });
  }

  async function appendNote({ notePath, content } = {}) {
    if (!allowWrites) return { ok: false, error: "writes disabled (allowWrites=false)" };
    if (!notePath || typeof content !== "string") {
      return { ok: false, error: "appendNote requires notePath and content" };
    }
    const spec = WRITE_TOOLS.append_note;
    return callTool(spec.tool, spec.operation, { path: notePath, content });
  }

  return {
    available,
    health,
    searchNotes,
    readNote,
    miyoSearchContext,
    miyoDirectSearch,
    priorResearch,
    createNote,
    appendNote,
    // exposed for tests / diagnostics
    _spec: { bridgeUrl, vault, allowWrites, miyoUrl, miyoPathPrefixes, READ_TOOLS, WRITE_TOOLS },
  };
}

module.exports = { createObsidianBridgeMcp, READ_TOOLS, WRITE_TOOLS };
