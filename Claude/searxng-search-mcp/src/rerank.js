"use strict";

/**
 * OPTIONAL local-LLM listwise reranker. OFF by default (CONFIG.rerankEnabled).
 *
 * Feeds the query + all candidate snippets to a local model in ONE call and asks for a
 * best-first index permutation (RankGPT-style listwise). This is more consistent and more
 * token-efficient than pointwise scoring for the small N (~5-20) SearXNG returns.
 *
 * Hard invariants:
 *   - Runs against a LOCAL model ONLY, through the monorepo HTTPS proxy
 *     (https://127.0.0.1:11435 Ollama / :1235 LM Studio) — never a paid API, never plaintext.
 *   - Fail-soft to the ORIGINAL ordering on ANY anomaly: disabled, <2 results, timeout,
 *     non-2xx, malformed JSON, or a response that is not a clean permutation of 0..n-1.
 *   - No new dependency: uses global fetch + AbortController.
 *
 * NOTE: reaching the HTTPS proxy requires the connector process to trust the mkcert CA, i.e.
 * NODE_EXTRA_CA_CERTS must point at the mkcert rootCA in the connector's env. If it isn't set,
 * the TLS handshake fails and this function simply returns the input unchanged (fail-soft).
 *
 * @module rerank
 */

const { CONFIG } = require("./config.js");

let _warned = false;
function warnOnce(msg) {
  if (_warned) return;
  _warned = true;
  try {
    process.stderr.write(`[searxng-search] ${msg}\n`);
  } catch {
    /* ignore */
  }
}

/**
 * Enforce the HTTPS-only + local-only posture: the rerank endpoint must be `https:` on a loopback
 * host. Guards against a hostile/misconfigured SEARXNG_RERANK_ENDPOINT sending result text over
 * plaintext or to a remote host. Returns false (→ rerank is skipped) on anything else.
 */
function isHttpsLoopback(endpoint) {
  try {
    const u = new URL(String(endpoint));
    // URL.hostname wraps IPv6 in brackets (e.g. "[::1]") — strip them before comparing.
    const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    return u.protocol === "https:" && (host === "127.0.0.1" || host === "localhost" || host === "::1");
  } catch {
    return false;
  }
}

/**
 * Listwise-rerank `results` for `query`. Returns a reordered copy, or the input unchanged.
 *
 * @param {string} query
 * @param {Array<object>} results  Tavily-shaped rows ({title, content, ...})
 * @param {object} [opts] overrides (endpoint/model/timeoutMs) — defaults from CONFIG
 * @returns {Promise<Array<object>>}
 */
async function rerank(query, results, opts = {}) {
  // Per-call override (opts.enabled) wins over the global CONFIG.rerankEnabled default.
  const enabled = typeof opts.enabled === "boolean" ? opts.enabled : CONFIG.rerankEnabled;
  if (!enabled) return results;
  if (!Array.isArray(results) || results.length < 2) return results;

  const endpoint = opts.endpoint || CONFIG.rerankEndpoint;
  if (!isHttpsLoopback(endpoint)) {
    warnOnce(`rerank skipped: SEARXNG_RERANK_ENDPOINT must be https:// on a loopback host, got "${endpoint}"`);
    return results; // never send result text over plaintext or to a remote host
  }
  const model = opts.model || CONFIG.rerankModel;
  const timeoutMs = Number(opts.timeoutMs || CONFIG.rerankTimeoutMs) || 4000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const items = results
      .map((r, i) => `[${i}] ${r.title || ""} — ${String(r.content || "").slice(0, 200)}`)
      .join("\n");

    const body = {
      model,
      stream: false,
      // Ollama structured-output: constrain to {"order":[int,...]}. LM Studio ignores unknown
      // keys gracefully; either way we still validate the parsed result below.
      format: {
        type: "object",
        properties: { order: { type: "array", items: { type: "integer" } } },
        required: ["order"],
      },
      messages: [
        {
          role: "system",
          content:
            "Rank the passages by relevance to the biomedical query. " +
            'Return {"order":[indices]} best-first. Include every index exactly once.',
        },
        { role: "user", content: `Query: ${query}\n${items}` },
      ],
    };

    const res = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return results;

    const data = await res.json();
    // Ollama chat: { message: { content } }. Be defensive about shape.
    const content = data && data.message && data.message.content;
    if (typeof content !== "string") return results;

    const order = JSON.parse(content).order;
    if (!isPermutation(order, results.length)) return results;
    return order.map((i) => results[i]);
  } catch {
    return results; // timeout / abort / non-JSON / network / TLS → original order
  } finally {
    clearTimeout(timer);
  }
}

/** True iff `order` is exactly a permutation of 0..n-1. */
function isPermutation(order, n) {
  if (!Array.isArray(order) || order.length !== n) return false;
  const set = new Set(order);
  if (set.size !== n) return false;
  for (const i of set) {
    if (!Number.isInteger(i) || i < 0 || i >= n) return false;
  }
  return true;
}

module.exports = { rerank, isPermutation, isHttpsLoopback };
