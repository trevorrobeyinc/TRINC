"use strict";

/**
 * Runtime configuration for the SearXNG search connector.
 *
 * The connector talks to the local SearXNG instance through the in-monorepo
 * HTTPS TLS proxy at https://127.0.0.1:8891 (launchd
 * `com.trevorrobey.searxng-tls-proxy` → plaintext upstream on port 8890), the same
 * treatment as Miyo/Qdrant/Ollama/LM Studio. The 2026-07-06 hardening removed
 * the previous "port-8890 plaintext loopback" carve-out. The process must run
 * with NODE_EXTRA_CA_CERTS pointing at the mkcert root CA so `fetch` trusts
 * the proxy; this stdio MCP server still binds no TCP port of its own.
 *
 * @module config
 */

/** Trim a trailing slash so we can join paths predictably. */
function stripTrailingSlash(u) {
  return u.replace(/\/+$/, "");
}

/**
 * Parse a numeric env var, falling back to `def` on a non-finite/negative value (a typo like
 * `SEARXNG_SEARCH_TIMEOUT_MS=abc` → NaN), and on `0` unless `allowZero`. Guards AFTER `Number()`:
 * the old `Number(process.env.X || def)` only substituted the default for an UNSET var, so a garbage
 * value propagated as NaN and a literal "0" as 0 — either of which makes `setTimeout(fn, ms)` fire
 * immediately (breaking every request) or an `n > cap` truncation check fail open. Matches the
 * guard-after-Number pattern already used for extractConcurrency.
 */
function numEnv(raw, def, { allowZero = false } = {}) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return def;
  if (n === 0 && !allowZero) return def;
  return n;
}

const CONFIG = Object.freeze({
  /** Base URL of the local SearXNG HTTPS proxy. Override with SEARXNG_BASE_URL. */
  searxngBaseUrl: stripTrailingSlash(
    process.env.SEARXNG_BASE_URL || "https://127.0.0.1:8891"
  ),

  /** Per-request timeout (ms) when calling the SearXNG JSON API. */
  searchTimeoutMs: numEnv(process.env.SEARXNG_SEARCH_TIMEOUT_MS, 15000),

  /** Per-URL timeout (ms) when fetching a page for `extract` / `map`. */
  fetchTimeoutMs: numEnv(process.env.SEARXNG_FETCH_TIMEOUT_MS, 12000),

  /** Cap on extracted characters per page (keeps tool output LLM-sized). */
  maxExtractChars: numEnv(process.env.SEARXNG_MAX_EXTRACT_CHARS, 20000),

  /** Concurrency when extracting several URLs at once (clamped to a sane >=1 integer). */
  extractConcurrency: Math.max(
    1,
    Math.trunc(Number(process.env.SEARXNG_EXTRACT_CONCURRENCY)) || 4
  ),

  /**
   * Hostnames exempt from the `extract`/`map` SSRF guard (see src/ssrf.js). Comma-separated, and
   * matched against the HOSTNAME AS WRITTEN in the url — not the address it resolves to — because
   * that is what an operator can actually predict. Empty by default: no private/loopback target is
   * reachable unless deliberately named here, e.g.
   *   SEARXNG_EXTRACT_ALLOW_HOSTS="localhost,127.0.0.1"
   */
  extractAllowHosts: Object.freeze(
    String(process.env.SEARXNG_EXTRACT_ALLOW_HOSTS || "")
      .split(",")
      .map((h) => h.trim().toLowerCase().replace(/^\[/, "").replace(/\]$/, ""))
      .filter(Boolean)
  ),

  /** Browser-like UA so content sites don't reject the fetch outright. */
  userAgent:
    process.env.SEARXNG_USER_AGENT ||
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36 searxng-search-mcp/1.0",

  /* -------- Robustness layer (all fail-soft; safe to leave at defaults) -------- */

  /** Search-response cache TTL (ms). 0 disables caching (allowZero). */
  cacheTtlMs: numEnv(process.env.SEARXNG_CACHE_TTL_MS, 300000, { allowZero: true }),

  /** Max cached search responses (FIFO eviction beyond this). */
  cacheMaxEntries: numEnv(process.env.SEARXNG_CACHE_MAX_ENTRIES, 500, { allowZero: true }),

  /** Total attempts for the SearXNG fetch (1 = no retry). Retries only transient 429/5xx/network. */
  retryAttempts: Math.max(1, Math.trunc(Number(process.env.SEARXNG_RETRY_ATTEMPTS ?? 3)) || 1),

  /** Retry backoff base / cap (ms). Full-jitter between attempts. */
  retryBaseMs: numEnv(process.env.SEARXNG_RETRY_BASE_MS, 400),
  retryCapMs: numEnv(process.env.SEARXNG_RETRY_CAP_MS, 8000),

  /* -------- Optional listwise reranking (OFF by default) -------- */

  /**
   * Enable listwise rerank. Default off, and there is no longer any default
   * endpoint: the local runtimes this used to target are gone (LM Studio
   * decommissioned 2026-07-16, Ollama removed 2026-07-23). To use rerank you
   * must now set BOTH SEARXNG_RERANK_ENDPOINT and SEARXNG_RERANK_MODEL
   * explicitly — that way the feature can never silently point at a dead or
   * reinstated local daemon.
   */
  rerankEnabled: /^(1|true|yes|on)$/i.test(String(process.env.SEARXNG_RERANK_ENABLED ?? "")),

  /** Rerank endpoint — no default; MUST be an explicit HTTPS endpoint. */
  rerankEndpoint: process.env.SEARXNG_RERANK_ENDPOINT || "",

  /** Rerank model id — no default; MUST be set explicitly. */
  rerankModel: process.env.SEARXNG_RERANK_MODEL || "",

  /** Hard timeout (ms) for a rerank call; on expiry we keep native ordering. */
  rerankTimeoutMs: numEnv(process.env.SEARXNG_RERANK_TIMEOUT_MS, 4000),
});

module.exports = { CONFIG, numEnv };
