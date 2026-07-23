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
 *     non-2xx, malformed JSON, or a response carrying no usable index at all.
 *   - No new dependency: uses global fetch + AbortController.
 *
 * Small instruct models do not reliably emit a full permutation: asked to "rank", they FILTER,
 * returning only the indices they judged relevant (e.g. [0,1,6] for n=10). Measured on
 * qwen2.5:7b-instruct, the arity-free prompt yielded a valid permutation 100% of the time at n=2
 * and 0% at n>=4 — so with the default max_results=5 the strict isPermutation check rejected every
 * response and the reranker was a silent no-op. Two changes fix that:
 *   1. The prompt states the required arity `n` explicitly and forbids omitting an index (4/4 valid).
 *   2. `repairOrder` salvages a partial/duplicated response — the model's chosen prefix is honored,
 *      and any index it dropped is appended in native order. A filtered answer is real ranking
 *      signal; discarding it wholesale threw away the entire feature.
 *
 * NOTE: reaching the HTTPS proxy requires the connector process to trust the mkcert CA, i.e.
 * NODE_EXTRA_CA_CERTS must point at the mkcert rootCA in the connector's env. If it isn't set,
 * the TLS handshake fails and this function returns the input unchanged (fail-soft).
 *
 * Fail-soft is not the same as silent: every skip path emits a one-time keyed stderr diagnostic via
 * `warnOnce`. Without it an enabled-but-unreachable reranker (Ollama down, CA untrusted, timeout) is
 * indistinguishable from one that ran and declined to reorder — the exact shape of the n>=4 no-op
 * bug described above, which went unnoticed precisely because nothing was printed.
 *
 * @module rerank
 */

const { CONFIG } = require("./config.js");

const _warned = new Set();
/**
 * Emit a stderr diagnostic at most once per distinct `key` for the life of the process. Keyed rather
 * than a single flag so that an early warning (e.g. a bad endpoint) cannot mask a later, unrelated
 * one (e.g. the model being unreachable). stdout is the MCP protocol channel — never write there.
 */
function warnOnce(key, msg) {
  if (_warned.has(key)) return;
  _warned.add(key);
  try {
    process.stderr.write(`[searxng-search] ${msg}\n`);
  } catch {
    /* ignore */
  }
}

/**
 * Human-readable cause for the fail-soft warning. An AbortError is our own `timeoutMs` firing.
 * Otherwise fetch collapses every transport failure into a bare `TypeError: fetch failed` and hides
 * the real reason on `cause` — verified shapes: `cause.code === "ECONNREFUSED"` when Ollama is not
 * running, `cause.code === "SELF_SIGNED_CERT_IN_CHAIN"` when NODE_EXTRA_CA_CERTS is unset, and a
 * codeless `cause.message` (e.g. "bad port") for URLs the Fetch spec refuses outright. Surfacing
 * that detail is the whole point of the warning — "fetch failed" alone tells an operator nothing.
 */
function describeRerankError(err, timeoutMs) {
  if (err && err.name === "AbortError") return `timed out after ${timeoutMs}ms`;
  const name = (err && err.name) || "Error";
  const msg = (err && err.message) || String(err);
  const cause = err && err.cause;
  const detail = (cause && (cause.code || cause.message)) || null;
  return detail ? `${name}: ${msg} (${detail})` : `${name}: ${msg}`;
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
    warnOnce("bad-endpoint", `rerank skipped: SEARXNG_RERANK_ENDPOINT must be https:// on a loopback host, got "${endpoint}"`);
    return results; // never send result text over plaintext or to a remote host
  }
  const model = opts.model || CONFIG.rerankModel;
  if (!model) {
    // No default model since the local runtimes were removed (2026-07-23) —
    // an endpoint without a model would POST `model: ""`. Fail soft.
    warnOnce("no-model", "rerank skipped: SEARXNG_RERANK_MODEL is not set");
    return results;
  }
  const timeoutMs = Number(opts.timeoutMs || CONFIG.rerankTimeoutMs) || 4000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const n = results.length;
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
            `Rank ALL ${n} passages by relevance to the biomedical query. ` +
            `Return {"order":[indices]} best-first. The array MUST contain exactly ${n} integers: ` +
            `every index from 0 to ${n - 1} exactly once, including irrelevant ones (place them last). ` +
            `Never omit, drop, or filter an index.`,
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

    const raw = JSON.parse(content).order;
    const order = isPermutation(raw, n) ? raw : repairOrder(raw, n);
    if (!order) return results; // no usable index at all → native order
    return order.map((i) => results[i]);
  } catch (err) {
    // Diagnostic only — the fail-soft invariant is unchanged: we still return the native ordering.
    // Silence here is what made an unreachable local model look identical to a reranker that ran and
    // simply chose not to reorder, so an enabled-but-dead rerank was an invisible no-op.
    warnOnce("call-failed", `rerank skipped, keeping native order — ${endpoint}: ${describeRerankError(err, timeoutMs)}`);
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

/**
 * Salvage a non-permutation `order` into a full permutation of 0..n-1, or null if it carries no
 * usable index. Keeps the model's ranked prefix (dropping non-integers, out-of-range values and
 * repeats), then appends every index the model omitted in native SearXNG order. Total order is
 * therefore "what the model ranked, best-first" followed by "everything it ignored, unchanged".
 */
function repairOrder(order, n) {
  if (!Array.isArray(order) || order.length === 0) return null;
  const seen = new Set();
  const out = [];
  for (const v of order) {
    if (!Number.isInteger(v) || v < 0 || v >= n || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  if (out.length === 0) return null; // e.g. ["a"] or [99] → no signal; caller keeps native order
  for (let i = 0; i < n; i++) if (!seen.has(i)) out.push(i);
  return out;
}

module.exports = { rerank, isPermutation, repairOrder, isHttpsLoopback };
