"use strict";

/**
 * Thin client over the local SearXNG JSON API, normalized to a Tavily-shaped
 * result so agents already coded against Tavily can consume it unchanged.
 *
 * @module searxng
 */

const { CONFIG } = require("./config.js");
const { TTLCache, retry, dedupe } = require("./robust.js");
const { extractCitations } = require("./citation-grammar.js");
const { rerank } = require("./rerank.js");

/** SearXNG natively supports these time_range values; Tavily also allows "week". */
const NATIVE_TIME_RANGES = new Set(["day", "month", "year"]);

/** Process-lifetime cache of parsed SearXNG responses, keyed by request URL. */
const _cache = new TTLCache(CONFIG.cacheTtlMs, CONFIG.cacheMaxEntries);

/**
 * One SearXNG JSON fetch. Throws errors tagged with `.status` (HTTP) or name "AbortError"
 * (timeout) so the retry layer can classify them; network failures throw a status-less error
 * (treated as transient / retryable).
 */
async function fetchSearxngOnce(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG.searchTimeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json", "User-Agent": CONFIG.userAgent },
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const err = new Error(
        `SearXNG returned HTTP ${res.status} for /search. ` +
          `Is the instance running at ${CONFIG.searxngBaseUrl} with JSON format enabled? ` +
          (body ? `Body: ${body.slice(0, 200)}` : "")
      );
      err.status = res.status; // 429/5xx → retryable; other 4xx → not
      throw err;
    }
    return await res.json();
  } catch (err) {
    if (err.name === "AbortError") {
      const e = new Error(
        `SearXNG search timed out after ${CONFIG.searchTimeoutMs}ms (${CONFIG.searxngBaseUrl}).`
      );
      e.name = "AbortError"; // preserved so retry treats a timeout as non-retryable (bounded latency)
      throw e;
    }
    if (err instanceof TypeError) {
      // Connection refused / DNS / socket: status-less → retry layer treats as transient.
      throw new Error(
        `Could not reach SearXNG at ${CONFIG.searxngBaseUrl}. ` +
          `Start it (launchctl kickstart -k gui/$(id -u)/com.trevorrobey.searxng) ` +
          `or set SEARXNG_BASE_URL. Underlying error: ${err.message}`
      );
    }
    throw err; // already-tagged HTTP-status errors pass through to the retry classifier
  } finally {
    clearTimeout(timer);
  }
}

/** Cache-checked, retry-wrapped SearXNG fetch. Cache + retry are both fail-soft enhancements. */
async function fetchSearxng(url) {
  if (CONFIG.cacheTtlMs > 0) {
    const hit = _cache.get(url);
    if (hit !== undefined) return hit;
  }
  const data = await retry(() => fetchSearxngOnce(url), {
    attempts: CONFIG.retryAttempts,
    baseMs: CONFIG.retryBaseMs,
    capMs: CONFIG.retryCapMs,
  });
  // Negative-cache guard: never cache an empty/zero-result response. A transient degraded run (all
  // engines timed out → 0 rows) would otherwise be served stale for the whole TTL, masking recovery.
  if (CONFIG.cacheTtlMs > 0 && Array.isArray(data.results) && data.results.length > 0) {
    _cache.set(url, data);
  }
  return data;
}

/** Extract the hostname (lowercased, no leading www.) from a URL, or "" on failure. */
function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** True if `host` equals `domain` or is a subdomain of it. */
function hostMatchesDomain(host, domain) {
  const d = String(domain).toLowerCase().replace(/^www\./, "");
  return host === d || host.endsWith("." + d);
}

/**
 * Call the SearXNG JSON API.
 *
 * @param {object} params
 * @param {string} params.query               required search string
 * @param {number} [params.max_results=5]     cap 0..40 on returned results
 * @param {"general"|"news"|"science"} [params.topic="general"]
 * @param {"day"|"week"|"month"|"year"} [params.time_range]
 * @param {string} [params.language]          e.g. "en", "en-US"
 * @param {string[]} [params.include_domains]  allowlist (client-side, matches subdomains)
 * @param {string[]} [params.exclude_domains]  blocklist (client-side, matches subdomains)
 * @param {string} [params.engines]           comma-separated SearXNG engine names
 * @returns {Promise<object>} Tavily-shaped { query, answer, results, response_time, ... }
 */
async function search(params) {
  const started = Date.now();
  const {
    query,
    max_results = 5,
    topic = "general",
    time_range,
    language,
    include_domains = [],
    exclude_domains = [],
    engines,
    rerank: rerankOverride,
    min_citations = 0,
  } = params;

  if (!query || typeof query !== "string" || !query.trim()) {
    throw new Error("`query` is required and must be a non-empty string.");
  }

  // Map Tavily "topic" onto SearXNG categories.
  const categoryByTopic = { general: "general", news: "news", science: "science" };
  const categories = categoryByTopic[topic] || "general";

  // Recall boost: a single include-domain becomes a `site:` operator (forwarded to
  // Google/Bing/DDG). All include/exclude filtering is still enforced client-side below.
  let effectiveQuery = query.trim();
  if (include_domains.length === 1) {
    effectiveQuery = `site:${include_domains[0]} ${effectiveQuery}`;
  }

  const qs = new URLSearchParams({
    q: effectiveQuery,
    format: "json",
    categories,
  });
  if (language) qs.set("language", language);
  if (engines) qs.set("engines", engines);
  // SearXNG understands day/month/year; a legacy "week" is coerced to "day" (closest
  // recency bucket). The actual value applied is echoed back as applied_time_range.
  let appliedTimeRange = null;
  if (time_range) {
    appliedTimeRange = NATIVE_TIME_RANGES.has(time_range)
      ? time_range
      : time_range === "week"
        ? "day"
        : null;
    if (appliedTimeRange) qs.set("time_range", appliedTimeRange);
  }

  const url = `${CONFIG.searxngBaseUrl}/search?${qs.toString()}`;
  const data = await fetchSearxng(url);

  // Client-side domain allow/deny (works across every engine, unlike site:).
  let rows = Array.isArray(data.results) ? data.results : [];
  if (include_domains.length > 0) {
    rows = rows.filter((r) =>
      include_domains.some((d) => hostMatchesDomain(hostOf(r.url), d))
    );
  }
  if (exclude_domains.length > 0) {
    rows = rows.filter(
      (r) => !exclude_domains.some((d) => hostMatchesDomain(hostOf(r.url), d))
    );
  }

  // Normalize to Tavily shape and additively attach any citation ids harvested from the
  // title/snippet/url (PMID/DOI/NCT/ChEMBL/…). Then dedupe across engines by URL + id, slice
  // to the caller's limit, and (optionally, off by default) listwise-rerank via a local model.
  const mapped = rows.map((r) => {
    const row = {
      title: r.title || "",
      url: r.url,
      content: r.content || "",
      score: typeof r.score === "number" ? r.score : null,
      engine: r.engine || null,
      published_date: r.publishedDate || null,
      category: r.category || null,
    };
    const citations = extractCitations(row);
    if (citations.length) row.citations = citations; // additive only — never removes a field
    return row;
  });

  const limit = Math.max(0, Math.min(Number(max_results) || 0, 40));
  let deduped = dedupe(mapped);
  // Opt-in gate: keep only results carrying >= min_citations ids (a connector-level "every result
  // sourced" filter). Applied BEFORE the limit so the caller still gets up to `max_results` cited hits.
  const minCites = Math.max(0, Math.trunc(Number(min_citations) || 0));
  if (minCites > 0) {
    deduped = deduped.filter((r) => Array.isArray(r.citations) && r.citations.length >= minCites);
  }
  // Off-domain-preprint relevance lever: on biomedical (science) queries, demote arXiv-hosted results
  // BELOW peer-reviewed / on-domain ones before the top-N cut — arXiv is overwhelmingly CS/physics/math
  // (off-domain for clinical queries). bioRxiv/medRxiv (biomedical preprints) are NOT touched. Stable:
  // preserves SearXNG's ranking within each group; a pure reorder (does not drop or rescore anything).
  if (topic === "science") {
    const isArxiv = (r) =>
      hostOf(r.url) === "arxiv.org" ||
      (Array.isArray(r.citations) && r.citations.some((c) => c && c.type === "arxiv"));
    const arxiv = deduped.filter(isArxiv);
    if (arxiv.length > 0 && arxiv.length < deduped.length) {
      deduped = deduped.filter((r) => !isArxiv(r)).concat(arxiv);
    }
  }
  let results = deduped.slice(0, limit);
  // fail-soft: returns `results` unchanged if disabled/anomalous. Per-call `rerank` overrides the env default.
  results = await rerank(
    query,
    results,
    rerankOverride === undefined ? {} : { enabled: rerankOverride }
  );

  // SearXNG has no LLM, so `answer` is the best available instant answer / infobox
  // text rather than a synthesized paragraph. Honest, non-fabricated.
  const answer = deriveAnswer(data);

  return {
    query,
    answer,
    applied_time_range: appliedTimeRange,
    results,
    suggestions: Array.isArray(data.suggestions) ? data.suggestions : [],
    infoboxes: summarizeInfoboxes(data.infoboxes),
    unresponsive_engines: data.unresponsive_engines || [],
    response_time: (Date.now() - started) / 1000,
    provider: "searxng",
  };
}

/** Pull a direct answer from SearXNG's `answers` / `infoboxes`, else null. */
function deriveAnswer(data) {
  if (Array.isArray(data.answers) && data.answers.length > 0) {
    const a = data.answers[0];
    if (typeof a === "string") return a;
    if (a && typeof a === "object") return a.answer || a.text || null;
  }
  if (Array.isArray(data.infoboxes) && data.infoboxes.length > 0) {
    const ib = data.infoboxes[0];
    if (ib && ib.content) return ib.content;
  }
  return null;
}

/** Compact the (often huge) infobox objects to the useful bits. */
function summarizeInfoboxes(infoboxes) {
  if (!Array.isArray(infoboxes)) return [];
  return infoboxes.slice(0, 3).map((ib) => ({
    title: ib.infobox || ib.title || null,
    content: ib.content || null,
    url:
      (Array.isArray(ib.urls) && ib.urls[0] && ib.urls[0].url) || ib.id || null,
  }));
}

module.exports = { search, hostOf, hostMatchesDomain };
