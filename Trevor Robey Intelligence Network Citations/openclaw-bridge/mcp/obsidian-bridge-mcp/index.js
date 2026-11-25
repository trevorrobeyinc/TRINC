"use strict";

// obsidian-bridge-mcp — engine-side adapter for the CANONICAL Obsidian MCP bridge.
//
// WHY THIS EXISTS
// The engine could publish INTO the vault (scripts/publish-to-vault.js) but could never READ it:
// an agent role had no way to ask "has this vault already covered this indication?" mid-run.
// This adapter closes that gap, read-first.
//
// TRANSPORT — the one non-negotiable design constraint
// Root CLAUDE.md: the canonical vault bridge is the vault access point; do not create alternative
// vault bridges. So this adapter is a THIN CLIENT of that existing bridge. It opens no listener,
// spawns nothing, and never touches the Local REST API on :27124. connector-registry.json's
// `obsidian-bridge` entry says the same thing in its suggested_adapter_path: proxy to the
// canonical bridge, DO NOT create a parallel vault listener.
//
// Since bridges-uds (2026-11-24) the bridge serves the same routes over a private Unix socket,
// <home>/.local/state/trinc/run/vault-bridge.sock (run directory 0700, socket 0600), instead of
// loopback TCP with mkcert TLS on :8798. Every bridge call goes through bridgeSocketRequest in
// ../base-mcp.js, which is local IPC rather than egress (its comment there says why it lives in
// that file): it derives the path from os.homedir(), never from config; refuses a missing or
// untrusted socket before the token is written; and pins the connection to the socket. There is no
// TCP path and no TCP fallback: a refused or missing socket gets the same fail-soft "no vault" as
// any other failure, never a retry over another transport.
//
// AUTH — identical to every other caller of the bridge (see scripts/publish-to-vault.js):
//   Authorization: Bearer <token> + x-mcp-token + x-mcp-timestamp + x-mcp-nonce
//   + x-mcp-body-sha256, where the token is read from the bridge's own config file
//   (security.authToken) — the same file the bridge reads at startup, so there is no second
//   copy of the secret anywhere.
//
// VAULT ROOT — the same file supplies the one other value the bridge needs from a caller. Its note
// tools (read_note, create_note, append_note) require `vaultRoot` in the input and accept it only
// if it is one of the bridge's own allowedVaultRoots, compared as an exact string; the bridge then
// pins its path guard to allowedVaultRoots[0]. So the note tools send allowedVaultRoots[0], read
// from the file in the same single read as the token. Until 2026-11-25 the adapter sent no
// vaultRoot, so the bridge refused every note call (INTERNAL_ERROR, HTTP 400) before any backend
// ran and readNote returned ''. append_note also needs an idempotencyKey (see appendIdempotencyKey).
// search_notes, miyo_search_context and health need no vaultRoot and send none.
// tests/mcp/obsidian-bridge-mcp-schemas.test.js runs every request this adapter sends through the
// bridge's real schemas, read from its TypeScript source in this checkout.
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
// vault-zettelkasten plugin and Command Center already call directly — and the vault bridge is the
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
// The only way this adapter reaches the vault bridge: local IPC over its Unix socket (see header).
const { bridgeSocketRequest, VAULT_BRIDGE_SOCKET_NAME } = require("../base-mcp.js");

const DEFAULT_BRIDGE_CONFIG = path.join(
  "/Users/myhome/TRINC",
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

/**
 * The bridge lane's default transport: one request to the vault bridge over its Unix socket, opened
 * by base-mcp's bridgeSocketRequest (local IPC, outside the egress policy). `request` is
 * { method, path, headers, body, signal }; there is deliberately no url, host or port field.
 * Resolves { status, json } (json is null when the body is not JSON). Rejects with the socket
 * refusal, thrown before any connection (err.code ENOENT, SOCKET_UNTRUSTED or SOCKET_PATH_TOO_LONG),
 * a connect error such as ECONNREFUSED, a response cut short, or the caller's abort signal.
 */
function defaultBridgeTransport({ method, path: requestPath, headers, body, signal }) {
  return new Promise((resolve, reject) => {
    const payload = Buffer.from(String(body), "utf8");
    const req = bridgeSocketRequest({
      method,
      path: requestPath,
      signal,
      headers: { ...headers, "Content-Length": String(payload.length) },
    });
    req.on("error", reject);
    req.on("response", (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("error", reject);
      res.on("close", () => {
        if (!res.complete) reject(new Error("bridge response ended before it was complete"));
      });
      res.on("end", () => {
        let json = null;
        try {
          json = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        } catch {
          json = null;
        }
        resolve({ status: res.statusCode || 0, json });
      });
    });
    req.end(payload);
  });
}

// A socket the trust check refused fails soft like an outage, but its error says it was refused:
// "bridge unavailable" means not running (ENOENT, ECONNREFUSED), these mean not trusted.
const SOCKET_REFUSALS = Object.freeze({
  SOCKET_UNTRUSTED: "bridge socket untrusted",
  SOCKET_PATH_TOO_LONG: "bridge socket path too long",
});

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

// A note tool fails soft with this, sending nothing, when the bridge config names no vault root:
// the bridge would refuse the call anyway (see VAULT ROOT in the header).
const VAULT_ROOT_UNAVAILABLE = "bridge vault root unavailable";

/**
 * The idempotencyKey for one append_note call. The bridge refuses an append without one
 * (IDEMPOTENCY_KEY_REQUIRED_FOR_RETRY), and three of its behaviours set what the key must be:
 *
 *   - Its ledger is a durable SQLite table keyed on (operation, key) alone, shared by every note and
 *     kept across restarts. A key it has already COMMITTED or RECONCILED is answered "appended" and
 *     nothing is written. So the same call must get the same key every time, from any adapter
 *     instance (no clock, counter or random value: a retry after a timeout must be recognised, not
 *     appended twice), and a different note or different content must get a different key.
 *   - It records the key as STARTED before the backend runs, and a key it has seen before is only
 *     ever reconciled, never written again: the retry looks for the key's marker in the note's last
 *     16 KB. An attempt that leaves no marker behind (a timeout whose write never landed, or a
 *     failure before anything was written, such as NO_CAPABLE_BACKEND in the bridge's cold-start
 *     window) makes every later call with that key end in AMBIGUOUS_WRITE_REQUIRES_DECISION, even
 *     after the bridge recovers. The only way past it is a new key, which is why appendNote takes an
 *     optional `appendId`; but a new key appends the text again, so use one only when the text is
 *     known to be missing, and that code alone does not say so. The bridge also sends it while the
 *     first attempt is still writing (it does not stop when this adapter gives up at 15 s, and an
 *     append may wait 20 s in its queue and then write for 15 s more), and it sends it with retryable
 *     true whenever its own read of the note fails, which can last (a note that does not exist yet).
 *     So: wait out those 35 s, repeat the SAME call (a write that landed comes back RECONCILED), and
 *     take a new appendId only if that repeat is refused with retryable false, the answer the bridge
 *     gives once it has read the note and found no marker. readNote cannot settle it for you: it
 *     returns '' on any failure. callTool passes the bridge's code and retryable on. The lasting fix
 *     is in the bridge: drop the STARTED row when its backend failed before writing.
 *   - It writes the key into the note inside an HTML-comment marker
 *     (`<!-- cpbh-idem:v1 key=<key> op=append_note … -->`) that it searches for when it reconciles a
 *     timed-out append. So the key uses only letters, digits and `._:-` (no whitespace, never
 *     `-->`) and stays short.
 *
 * The key is therefore content-addressed: a version tag, then the sha256 of the call's fields as one
 * JSON array (an array keeps field boundaries, where joined strings could not tell "a|b" + "c" from
 * "a" + "b|c"), with `appendId` as a fifth field only when the caller gives one. The fields are
 * taken exactly as given, never normalized, so two spellings of one note path are two keys. The same
 * text appended twice to the same note is ONE append unless the two calls carry different appendIds.
 * Changing this scheme changes every key, so a retry across the change would append twice: bump the
 * tag deliberately.
 *
 * @param {{ vault: string, vaultRoot: string, notePath: string, content: string, appendId?: string }} call
 * @returns {string} `engine-append-v1:` and 64 hex digits
 */
function appendIdempotencyKey({ vault, vaultRoot, notePath, content, appendId }) {
  const fields = [vault, vaultRoot, notePath, content];
  if (appendId !== undefined) fields.push(appendId);
  return `engine-append-v1:${crypto.createHash("sha256").update(JSON.stringify(fields), "utf8").digest("hex")}`;
}

function createObsidianBridgeMcp(options = {}) {
  const logger =
    options.logger && typeof options.logger.warn === "function"
      ? options.logger
      : { info() {}, warn() {}, error() {} };

  // Miyo-direct only: since bridges-uds the bridge lane never uses fetch.
  const fetchImpl = options.fetchImpl || (typeof fetch === "function" ? fetch : null);
  // The bridge lane: the vault bridge's Unix socket. Injectable so tests never open a socket they
  // did not create. There is no URL, host or port option (a stale `bridgeUrl` is ignored): the
  // socket path comes from base-mcp's bridgeSocketRequest and nowhere else.
  const bridgeTransport = typeof options.bridgeTransport === "function" ? options.bridgeTransport : defaultBridgeTransport;
  const bridgeConfigPath = options.bridgeConfigPath || DEFAULT_BRIDGE_CONFIG;
  const vault = options.vault || DEFAULT_VAULT;
  const timeoutMs = Number(options.timeoutMs) || 15_000;
  const allowWrites = options.allowWrites === true;
  // Injectable so tests don't need a config file on disk.
  const tokenOverride = typeof options.authToken === "string" ? options.authToken : null;
  const vaultRootOverride = typeof options.vaultRoot === "string" ? options.vaultRoot : null;
  // Miyo-direct lane (see header). Injectable request for tests.
  const miyoUrl = String(options.miyoUrl || DEFAULT_MIYO).replace(/\/+$/, "");
  const miyoCaPath = options.miyoCaPath || DEFAULT_MKCERT_CA;
  const miyoTimeoutMs = Number(options.miyoTimeoutMs) || 8_000;
  const miyoPathPrefixes = Array.isArray(options.miyoPathPrefixes) ? options.miyoPathPrefixes : DEFAULT_MIYO_PREFIXES;
  const miyoRequest = typeof options.miyoRequest === "function" ? options.miyoRequest : defaultMiyoRequest;

  let cachedToken = tokenOverride;
  let tokenLookupFailed = false;
  let cachedVaultRoot = vaultRootOverride;
  let vaultRootLookupFailed = false;
  // Availability is cached per instance: a closed Obsidian shouldn't cost every role a timeout.
  let availability = null;

  // The bridge's own config file, read at most once per instance and not at all while both values
  // it supplies (the token and the vault root) are injected. null after a failed read.
  let bridgeConfig;

  function readBridgeConfig() {
    if (bridgeConfig !== undefined) return bridgeConfig;
    bridgeConfig = null;
    try {
      const cfg = JSON.parse(fs.readFileSync(bridgeConfigPath, "utf8"));
      if (cfg && typeof cfg === "object") {
        bridgeConfig = cfg;
      } else {
        logger.warn(`[obsidian-bridge-mcp] bridge config is not a JSON object: ${bridgeConfigPath}`);
      }
    } catch (err) {
      // Never a parse error's message: V8 quotes the JSON around the fault, and this file holds the
      // bridge's token. A file-system error's code (ENOENT, EACCES) is enough to act on.
      const reason = err && err.name === "SyntaxError" ? "not valid JSON" : (err && err.code) || "unreadable";
      logger.warn(`[obsidian-bridge-mcp] cannot read bridge config (${bridgeConfigPath}): ${reason}`);
    }
    return bridgeConfig;
  }

  function readToken() {
    if (cachedToken) return cachedToken;
    if (tokenLookupFailed) return null;
    const cfg = readBridgeConfig();
    const token = cfg && cfg.security && cfg.security.authToken;
    if (typeof token === "string" && token.length > 0) {
      cachedToken = token;
      return cachedToken;
    }
    if (cfg) logger.warn(`[obsidian-bridge-mcp] bridge config has no security.authToken: ${bridgeConfigPath}`);
    tokenLookupFailed = true;
    return null;
  }

  /** The note tools' vaultRoot: allowedVaultRoots[0] of the bridge config (see VAULT ROOT above). */
  function readVaultRoot() {
    if (cachedVaultRoot) return cachedVaultRoot;
    if (vaultRootLookupFailed) return null;
    const cfg = readBridgeConfig();
    const root = cfg && Array.isArray(cfg.allowedVaultRoots) ? cfg.allowedVaultRoots[0] : undefined;
    if (typeof root === "string" && root.length > 0) {
      cachedVaultRoot = root;
      return cachedVaultRoot;
    }
    if (cfg) logger.warn(`[obsidian-bridge-mcp] bridge config has no allowedVaultRoots[0]: ${bridgeConfigPath}`);
    vaultRootLookupFailed = true;
    return null;
  }

  /**
   * One authenticated POST to the bridge's /mcp/tool endpoint, over the vault bridge's socket.
   * Returns { ok, data?, error?, status?, code?, retryable? } and NEVER throws — every caller below
   * is on a research hot path where an unreachable vault must degrade, not abort. code and
   * retryable are the bridge's own, present only when the bridge sent them.
   */
  async function callTool(tool, operation, input) {
    const token = readToken();
    if (!token) return { ok: false, error: "bridge auth token unavailable" };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      // Built inside the try, so an input JSON cannot encode (a BigInt, a cycle) fails soft too.
      const body = JSON.stringify({ tool, operation, input: { vault, ...input } });
      const bodySha256 = crypto.createHash("sha256").update(body, "utf8").digest("hex");
      const res = await bridgeTransport({
        method: "POST",
        path: "/mcp/tool",
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
      const status = res && Number(res.status) > 0 ? Number(res.status) : 0;
      const json = res ? res.json : null;
      if (status < 200 || status >= 300 || !json || json.ok !== true) {
        const bridgeError = json && json.error && typeof json.error === "object" ? json.error : {};
        const failure = { ok: false, error: bridgeError.message || `HTTP ${status || "no-response"}`, status };
        if (typeof bridgeError.code === "string") failure.code = bridgeError.code;
        if (typeof bridgeError.retryable === "boolean") failure.retryable = bridgeError.retryable;
        return failure;
      }
      return { ok: true, data: json.data };
    } catch (err) {
      const code = err && typeof err.code === "string" ? err.code : "";
      if (Object.prototype.hasOwnProperty.call(SOCKET_REFUSALS, code)) {
        // Say why once per refusal: the message names the path and the failed check, never the token.
        logger.warn(`[obsidian-bridge-mcp] refused the bridge socket (${code}): ${err.message}`);
        return { ok: false, error: SOCKET_REFUSALS[code] };
      }
      if (code === "ENOENT" || code === "ECONNREFUSED") {
        return { ok: false, error: `bridge unavailable (${code})` };
      }
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
    const vaultRoot = readVaultRoot();
    if (!vaultRoot) return "";
    const spec = READ_TOOLS.read_note;
    const res = await callTool(spec.tool, spec.operation, { vaultRoot, path: notePath });
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
        // Miyo's own fetch seam (miyoFetchImpl, else fetchImpl, else global fetch), HTTPS through the
        // :8743 proxy and unchanged by bridges-uds. The bridge lane has its own transport.
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
    if (!notePath || typeof notePath !== "string" || typeof content !== "string") {
      return { ok: false, error: "createNote requires notePath and content" };
    }
    const vaultRoot = readVaultRoot();
    if (!vaultRoot) return { ok: false, error: VAULT_ROOT_UNAVAILABLE };
    const spec = WRITE_TOOLS.create_note;
    return callTool(spec.tool, spec.operation, { vaultRoot, path: notePath, content, mode });
  }

  /**
   * Append to a note. `appendId` (optional) names this append for its idempotency key: omit it, or
   * repeat it, and the same text appended to the same note again is recognised as the same append; a
   * new one appends the text again. Before using a new one to get past
   * AMBIGUOUS_WRITE_REQUIRES_DECISION, read appendIdempotencyKey: that code alone does not mean the
   * text is missing.
   */
  async function appendNote({ notePath, content, appendId } = {}) {
    if (!allowWrites) return { ok: false, error: "writes disabled (allowWrites=false)" };
    // The bridge's append schema refuses empty content (z.string().min(1)), so it is never sent.
    if (!notePath || typeof notePath !== "string" || typeof content !== "string" || content.length === 0) {
      return { ok: false, error: "appendNote requires notePath and non-empty content" };
    }
    if (appendId !== undefined && (typeof appendId !== "string" || appendId.length === 0)) {
      return { ok: false, error: "appendNote appendId must be a non-empty string" };
    }
    const vaultRoot = readVaultRoot();
    if (!vaultRoot) return { ok: false, error: VAULT_ROOT_UNAVAILABLE };
    const idempotencyKey = appendIdempotencyKey({ vault, vaultRoot, notePath, content, appendId });
    const spec = WRITE_TOOLS.append_note;
    return callTool(spec.tool, spec.operation, { vaultRoot, path: notePath, content, idempotencyKey });
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
    _spec: { bridgeSocket: VAULT_BRIDGE_SOCKET_NAME, vault, allowWrites, miyoUrl, miyoPathPrefixes, READ_TOOLS, WRITE_TOOLS },
  };
}

module.exports = { createObsidianBridgeMcp, READ_TOOLS, WRITE_TOOLS };
