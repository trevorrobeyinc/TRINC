"use strict";

/**
 * Dependency-free robustness primitives for the SearXNG connector:
 *   - TTLCache  : tiny in-memory cache with lazy expiry + a bounded size.
 *   - retry     : exponential backoff + full jitter, transient-only.
 *   - dedupe    : collapse duplicate results across engines by URL + citation id.
 *
 * Every primitive is fail-soft by construction: a cache miss, an exhausted retry, or an
 * empty dedup all leave the caller on the connector's original (pre-enhancement) behavior.
 * Uses Date.now()/Math.random() freely — the ENGINE's no-Date/no-random lint scope is
 * `openclaw-bridge/`, not this stand-alone connector (which also uses Date.now in searxng.js).
 *
 * @module robust
 */

/** In-memory TTL cache. `get` lazily evicts expired entries; `set` bounds total size (FIFO). */
class TTLCache {
  /**
   * @param {number} [defaultTtlMs=300000] default entry lifetime (5 min)
   * @param {number} [maxEntries=500] hard cap; oldest inserted entries are dropped first
   */
  constructor(defaultTtlMs = 300000, maxEntries = 500) {
    this.map = new Map();
    this.ttl = Math.max(0, Number(defaultTtlMs) || 0);
    this.max = Math.max(1, Math.trunc(Number(maxEntries) || 1));
  }

  get(key) {
    const it = this.map.get(key);
    if (!it) return undefined;
    if (Date.now() > it.expiresAt) {
      this.map.delete(key);
      return undefined;
    }
    return it.value;
  }

  set(key, value, ttlMs = this.ttl) {
    // Only a NEW key grows the map, so only a new key can require eviction. Without this guard,
    // re-setting an existing key at capacity evicts an unrelated entry and leaves the cache below
    // `max`. `Map.set` on an existing key preserves its original insertion position, which is what
    // the FIFO policy wants: refreshing a value must not promote it past older entries.
    if (!this.map.has(key)) {
      // Evict oldest while at capacity (Map preserves insertion order).
      while (this.map.size >= this.max) {
        const oldest = this.map.keys().next().value;
        if (oldest === undefined) break;
        this.map.delete(oldest);
      }
    }
    this.map.set(key, { value, expiresAt: Date.now() + Math.max(0, Number(ttlMs) || 0) });
    return value;
  }

  clear() {
    this.map.clear();
  }
}

/** Default transient-error test: retry network errors, 429, and 5xx — but NOT timeouts/aborts. */
function defaultIsRetryable(err) {
  if (!err) return false;
  if (err.name === "AbortError") return false; // a per-attempt timeout: don't multiply latency
  const status = err.status;
  // Status-less means the request never produced an HTTP status: a network/DNS/socket failure, or a
  // parse error off a truncated body. Both are treated as transient because `retry` re-invokes `fn`,
  // which issues a FRESH request — it never reparses the same bytes, so a retry can genuinely differ.
  // (A permanent server-side misconfiguration arrives here with a status instead, e.g. SearXNG
  // answers 403 when `format=json` is not enabled — already non-retryable via the check below.)
  if (status === undefined || status === null) return true;
  return status === 429 || (status >= 500 && status < 600);
}

/**
 * Run `fn` with exponential backoff + full jitter, retrying only transient failures.
 *
 * @template T
 * @param {() => Promise<T>} fn
 * @param {object} [opts]
 * @param {number} [opts.attempts=3]   total attempts (1 = no retry)
 * @param {number} [opts.baseMs=400]   base backoff
 * @param {number} [opts.capMs=8000]   max backoff per wait
 * @param {(e:Error)=>boolean} [opts.isRetryable]
 * @param {()=>number} [opts.rand=Math.random] injectable RNG (tests)
 * @param {(ms:number)=>Promise<void>} [opts.sleep] injectable sleeper (tests)
 * @returns {Promise<T>}
 */
async function retry(fn, opts = {}) {
  const attempts = Math.max(1, Math.trunc(Number(opts.attempts) || 1));
  const baseMs = Math.max(0, Number(opts.baseMs) || 0);
  const capMs = Math.max(0, Number(opts.capMs) || 0);
  const isRetryable = opts.isRetryable || defaultIsRetryable;
  const rand = opts.rand || Math.random;
  const sleep = opts.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));

  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i === attempts - 1 || !isRetryable(err)) throw err;
      // Full jitter: uniform in [0, min(cap, base * 2^i)].
      const ceiling = Math.min(capMs, baseMs * 2 ** i);
      await sleep(rand() * ceiling);
    }
  }
  // Unreachable: attempts>=1 means the final iteration's catch always throws (retryable-exhausted or
  // non-retryable). Kept as a defensive fallback so `retry` can never implicitly return undefined.
  throw lastErr;
}

/**
 * Canonicalize a URL for dedup: drop scheme, lowercase the host, strip a leading `www.`, drop
 * default ports (:80/:443), keep the path/query CASE-INTACT (paths are case-sensitive on most
 * servers, so two pages differing only in path case are NOT the same page), then trim a trailing
 * slash. So `http://Www.X.com:80/a/` and `https://x.com/a` fold together, but `/AbC` and `/abc`
 * stay distinct. Falls back to a scheme/www/slash strip on parse error.
 */
function canonicalUrl(url) {
  const s = String(url || "");
  try {
    const u = new URL(s);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const port = u.port && u.port !== "80" && u.port !== "443" ? ":" + u.port : "";
    return (host + port + u.pathname + u.search).replace(/\/+$/, "");
  } catch {
    return s.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/+$/, "");
  }
}

/**
 * Collapse duplicate results across engines. Two results collide if they share a canonical URL,
 * or share a URL-DERIVED citation id (the same paper found via PubMed and OpenAlex under different
 * hosts → one row). Text-derived ids do NOT merge results: a review article that merely CITES a
 * paper's PMID in its snippet must never be folded into that paper (that would drop a distinct,
 * independently-corroborating source). Order is preserved (first/highest-ranked copy survives).
 *
 * @param {Array<object>} results result rows (each may carry `url` and `citations[]`)
 * @returns {Array<object>} deduped rows
 */
function dedupe(results) {
  if (!Array.isArray(results)) return results;
  const seen = new Set();
  const out = [];
  for (const r of results) {
    const urlKey = r && r.url ? "u:" + canonicalUrl(r.url) : null;
    // Only url-derived ids are page-identity; text-derived ids are references, not identity.
    const idKeys = Array.isArray(r && r.citations)
      ? r.citations.filter((c) => c.source === "url").map((c) => "c:" + c.type + ":" + c.id)
      : [];
    if ((urlKey && seen.has(urlKey)) || idKeys.some((k) => seen.has(k))) continue;
    if (urlKey) seen.add(urlKey);
    for (const k of idKeys) seen.add(k);
    out.push(r);
  }
  return out;
}

module.exports = { TTLCache, retry, dedupe, canonicalUrl, defaultIsRetryable };
