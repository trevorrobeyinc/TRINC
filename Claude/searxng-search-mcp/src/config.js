"use strict";

/**
 * Runtime configuration for the SearXNG search connector.
 *
 * The connector talks to the local SearXNG instance through the in-monorepo
 * HTTPS TLS proxy at https://127.0.0.1:8891 (launchd
 * `com.trevorrobey.searxng-tls-proxy` → plaintext upstream :8890), the same
 * treatment as Miyo/Qdrant/Ollama/LM Studio. The 2026-07-06 hardening removed
 * the previous ":8890 plaintext loopback" carve-out. The process must run
 * with NODE_EXTRA_CA_CERTS pointing at the mkcert root CA so `fetch` trusts
 * the proxy; this stdio MCP server still binds no TCP port of its own.
 *
 * @module config
 */

/** Trim a trailing slash so we can join paths predictably. */
function stripTrailingSlash(u) {
  return u.replace(/\/+$/, "");
}

const CONFIG = Object.freeze({
  /** Base URL of the local SearXNG HTTPS proxy. Override with SEARXNG_BASE_URL. */
  searxngBaseUrl: stripTrailingSlash(
    process.env.SEARXNG_BASE_URL || "https://127.0.0.1:8891"
  ),

  /** Per-request timeout (ms) when calling the SearXNG JSON API. */
  searchTimeoutMs: Number(process.env.SEARXNG_SEARCH_TIMEOUT_MS || 15000),

  /** Per-URL timeout (ms) when fetching a page for `extract` / `map`. */
  fetchTimeoutMs: Number(process.env.SEARXNG_FETCH_TIMEOUT_MS || 12000),

  /** Cap on extracted characters per page (keeps tool output LLM-sized). */
  maxExtractChars: Number(process.env.SEARXNG_MAX_EXTRACT_CHARS || 20000),

  /** Concurrency when extracting several URLs at once (clamped to a sane >=1 integer). */
  extractConcurrency: Math.max(
    1,
    Math.trunc(Number(process.env.SEARXNG_EXTRACT_CONCURRENCY)) || 4
  ),

  /** Browser-like UA so content sites don't reject the fetch outright. */
  userAgent:
    process.env.SEARXNG_USER_AGENT ||
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36 searxng-search-mcp/1.0",

  /* -------- Robustness layer (all fail-soft; safe to leave at defaults) -------- */

  /** Search-response cache TTL (ms). 0 disables caching. */
  cacheTtlMs: Number(process.env.SEARXNG_CACHE_TTL_MS ?? 300000),

  /** Max cached search responses (FIFO eviction beyond this). */
  cacheMaxEntries: Number(process.env.SEARXNG_CACHE_MAX_ENTRIES ?? 500),

  /** Total attempts for the SearXNG fetch (1 = no retry). Retries only transient 429/5xx/network. */
  retryAttempts: Math.max(1, Math.trunc(Number(process.env.SEARXNG_RETRY_ATTEMPTS ?? 3)) || 1),

  /** Retry backoff base / cap (ms). Full-jitter between attempts. */
  retryBaseMs: Number(process.env.SEARXNG_RETRY_BASE_MS ?? 400),
  retryCapMs: Number(process.env.SEARXNG_RETRY_CAP_MS ?? 8000),

  /* -------- Optional local-LLM reranking (OFF by default) -------- */

  /** Enable listwise rerank via a local model through the HTTPS proxy. Default off. */
  rerankEnabled: /^(1|true|yes|on)$/i.test(String(process.env.SEARXNG_RERANK_ENABLED ?? "")),

  /** Rerank endpoint — MUST be an HTTPS loopback proxy (Ollama :11435 / LM Studio :1235). */
  rerankEndpoint: process.env.SEARXNG_RERANK_ENDPOINT || "https://127.0.0.1:11435/api/chat",

  /** Local rerank model id. */
  rerankModel: process.env.SEARXNG_RERANK_MODEL || "qwen2.5:7b-instruct",

  /** Hard timeout (ms) for a rerank call; on expiry we keep native ordering. */
  rerankTimeoutMs: Number(process.env.SEARXNG_RERANK_TIMEOUT_MS ?? 4000),
});

module.exports = { CONFIG };
