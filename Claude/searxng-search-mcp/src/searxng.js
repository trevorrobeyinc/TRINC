"use strict";

/**
 * Thin client over the local SearXNG JSON API, normalized to a Tavily-shaped
 * result so agents already coded against Tavily can consume it unchanged.
 *
 * Since 2026-11-24 every answer is also JUDGED before it is returned (src/relevance.js): on the general
 * and news topics, rows that are not about the query are moved to `off_topic_results`, and the answer
 * carries `quality` (ok / thin / degraded / empty / unjudged). A degraded answer falls back to
 * `docs_search` for a registered doc site the query names, then to other honest engines, recorded in
 * `engines_tried`. Why: Bing receives the full query and still answers some of them with decoys.
 *
 * @module searxng
 */

const { CONFIG } = require("./config.js");
const { TTLCache, retry, dedupe } = require("./robust.js");
const { extractCitations, normalizeDoi, classifyDoi } = require("./citation-grammar.js");
const { rerank } = require("./rerank.js");
const { hostOf, hostMatchesDomain } = require("./url-util.js");
const { queryTerms, assessRow, assessQuality, compactOffTopic } = require("./relevance.js");
const { resolveSites } = require("./doc-sites.js");

/** SearXNG natively supports these time_range values; Tavily also allows "week". */
const NATIVE_TIME_RANGES = new Set(["day", "month", "year"]);

/** Process-lifetime cache of parsed SearXNG responses, keyed by request URL. */
const _cache = new TTLCache(CONFIG.cacheTtlMs, CONFIG.cacheMaxEntries);

/** The instance's /config (enabled engines per category), reused for 10 minutes. */
const _configCache = new TTLCache(600000, 2);

/** Off-topic rows reported per answer (compact: they are evidence of junk, not answers). */
const MAX_OFF_TOPIC_REPORTED = 10;

/**
 * One SearXNG JSON fetch. Throws errors tagged with `.status` (HTTP) or name "AbortError"
 * (timeout) so the retry layer can classify them; network failures throw a status-less error
 * (treated as transient / retryable).
 */
async function fetchSearxngOnce(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG.searchTimeoutMs);
  let path = "/search";
  try {
    path = new URL(url).pathname;
  } catch {
    /* keep the default label */
  }
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json", "User-Agent": CONFIG.userAgent },
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const err = new Error(
        `SearXNG returned HTTP ${res.status} for ${path}. ` +
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

/**
 * The engines the instance queries by default for a category, from its /config. Null when /config
 * cannot be read (the caller then treats every fallback engine as not yet tried).
 * @param {string} category
 * @returns {Promise<Set<string>|null>}
 */
async function enabledEngines(category) {
  let cfg = _configCache.get("config");
  if (!cfg) {
    try {
      cfg = await fetchSearxngOnce(`${CONFIG.searxngBaseUrl}/config`);
      _configCache.set("config", cfg);
    } catch {
      return null;
    }
  }
  const engines = Array.isArray(cfg && cfg.engines) ? cfg.engines : [];
  return new Set(
    engines.filter((e) => e && e.enabled && Array.isArray(e.categories) && e.categories.includes(category)).map((e) => e.name)
  );
}

/**
 * Append a SearXNG engine-supplied `doi` to an already-harvested `citations` array, in place.
 * No-op when the field is absent/malformed or that DOI was already found in the url/title/snippet
 * (the text-derived hit keeps its stronger "url"/"text" provenance). Never throws.
 */
function addMetadataDoi(citations, rawDoi) {
  if (!Array.isArray(citations) || !rawDoi || typeof rawDoi !== "string") return;
  const id = normalizeDoi(rawDoi);
  if (!/^10\.\d{4,9}\//.test(id)) return; // not a DOI — ignore rather than emit a bogus id
  if (citations.some((c) => c.type === "doi" && c.id === id)) return;
  const c = { type: "doi", id, source: "metadata" };
  const subtype = classifyDoi(id);
  if (subtype) c.subtype = subtype;
  citations.push(c);
}

/** Client-side domain allow/deny (works across every engine, unlike site:). */
function filterDomains(rows, include_domains, exclude_domains) {
  let out = rows;
  if (include_domains.length > 0) {
    out = out.filter((r) => include_domains.some((d) => hostMatchesDomain(hostOf(r.url), d)));
  }
  if (exclude_domains.length > 0) {
    out = out.filter((r) => !exclude_domains.some((d) => hostMatchesDomain(hostOf(r.url), d)));
  }
  return out;
}

/** One SearXNG row in Tavily shape, with any citation ids harvested from it (additive only). */
function normalizeRow(r) {
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
  // Scholarly engines (pubmed/crossref/openalex/semantic scholar/…) render the `paper.html`
  // template and return the record's DOI as a STRUCTURED field, which is often absent from the
  // url, title and snippet — measured at 15% of science results (61/409 across six queries).
  // Harvesting only text/url therefore made `min_citations>=1` silently discard real, cited
  // papers. Provenance is "metadata": the engine asserted it, we did not read it off the page.
  // `dedupe` keys result identity on source==="url" only, so this can never collapse two rows.
  addMetadataDoi(citations, r.doi);
  if (citations.length) row.citations = citations; // additive only — never removes a field
  return row;
}

/**
 * Filter, normalize, dedupe, cite-gate and (science) arXiv-demote one SearXNG answer's rows, then
 * judge each against the query. Annotates every row with `relevance`, `on_topic` and `matched_terms`.
 */
function prepareRows(data, { include_domains, exclude_domains, min_citations, topic, terms }) {
  const raw = Array.isArray(data && data.results) ? data.results : [];
  const mapped = filterDomains(raw, include_domains, exclude_domains).map(normalizeRow);
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
  const assessed = deduped.map((r) => {
    const a = assessRow(r, terms);
    r.relevance = a.relevance;
    r.on_topic = a.on_topic;
    if (a.matched_terms.length) r.matched_terms = a.matched_terms;
    return a;
  });
  return { rows: deduped, assessed };
}

/** A docs_search hit in the search result shape. */
function docsRowToSearchRow(d) {
  const row = {
    title: d.title || "",
    url: d.url,
    content: d.content || "",
    score: typeof d.score === "number" ? d.score : null,
    engine: `docs:${d.site}`,
    published_date: null,
    category: "docs",
  };
  const citations = extractCitations(row);
  if (citations.length) row.citations = citations;
  row.relevance = d.relevance;
  row.on_topic = true;
  if (Array.isArray(d.matched_terms) && d.matched_terms.length) row.matched_terms = d.matched_terms;
  return row;
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
 * @param {string} [params.engines]           comma-separated SearXNG engine names (disables fallback)
 * @param {boolean} [params.fallback]         default CONFIG.fallbackEnabled; false = no retries
 * @param {object} [deps]                      test seams: { docsSearch(args) }
 * @returns {Promise<object>} Tavily-shaped { query, answer, results, response_time, ... }
 */
async function search(params, deps = {}) {
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
    fallback,
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

  // SearXNG understands day/month/year; a legacy "week" is coerced to "day" (closest
  // recency bucket). The actual value applied is echoed back as applied_time_range.
  let appliedTimeRange = null;
  if (time_range) {
    appliedTimeRange = NATIVE_TIME_RANGES.has(time_range)
      ? time_range
      : time_range === "week"
        ? "day"
        : null;
  }
  const searchUrl = (engineList) => {
    const qs = new URLSearchParams({ q: effectiveQuery, format: "json", categories });
    if (language) qs.set("language", language);
    if (engineList) qs.set("engines", engineList);
    if (appliedTimeRange) qs.set("time_range", appliedTimeRange);
    return `${CONFIG.searxngBaseUrl}/search?${qs.toString()}`;
  };

  const data = await fetchSearxng(searchUrl(engines));

  const terms = queryTerms(query);
  const limit = Math.max(0, Math.min(Number(max_results) || 0, 40));
  // The guard PARTITIONS general and news answers (decoys never reach `results`); a science answer is
  // only annotated, because scholarly engines answer honestly and an abstract may use synonyms.
  const partition = topic !== "science" && terms.length > 0;
  const prep = { include_domains, exclude_domains, min_citations, topic, terms };
  const first = prepareRows(data, prep);
  const initial = assessQuality(first.assessed, terms, { limit });

  /** Rows paired with their assessments, so an off-topic report carries home_page and matched words. */
  const offTopicOf = (p) => p.rows.map((r, i) => [r, p.assessed[i]]).filter(([r]) => !r.on_topic).map(([r, a]) => compactOffTopic(r, a));
  let kept = partition ? first.rows.filter((r) => r.on_topic) : first.rows;
  const offTopic = partition ? offTopicOf(first) : [];
  const enginesTried = [
    { step: "searxng", engines: engines || "default", status: initial.status, results: first.rows.length, on_topic: first.assessed.filter((a) => a.on_topic).length },
  ];

  // Fallback: only for a judged answer that is not ok, when the caller did not pin its own engines.
  const wanted = Math.max(1, Math.min(2, limit || 1));
  const fallbackOn = (fallback === undefined ? CONFIG.fallbackEnabled : fallback !== false) && !engines;
  let fallbackUsed = false;
  if (partition && fallbackOn && limit > 0 && initial.status !== "ok") {
    fallbackUsed = true;
    // 1. Registered doc sites the query or include_domains names: no search engine involved.
    const { sites } = resolveSites({ include_domains, query });
    if (sites.length > 0) {
      const ids = sites.map((s) => s.id);
      try {
        const docsSearch = deps.docsSearch || ((a) => require("./docs-search.js").defaultDocsSearch().search(a));
        const d = await docsSearch({ query, sites: ids, max_results: Math.max(limit, 3) });
        const rows = filterDomains((d.results || []).map(docsRowToSearchRow), include_domains, exclude_domains);
        kept = dedupe([...kept, ...rows]);
        enginesTried.push({ step: "docs_search", sites: ids, status: d.quality ? d.quality.status : rows.length ? "ok" : "empty", on_topic: rows.length });
      } catch (err) {
        enginesTried.push({ step: "docs_search", sites: ids, status: "error", error: String((err && err.message) || err) });
      }
    }
    // 2. Other honest engines, one at a time, skipping any the instance already asked by default.
    if (kept.length < wanted) {
      const byDefault = await enabledEngines(categories);
      for (const eng of CONFIG.fallbackEngines) {
        if (kept.length >= wanted) break;
        if (byDefault && byDefault.has(eng)) continue;
        try {
          const more = await fetchSearxng(searchUrl(eng));
          const p = prepareRows(more, prep);
          const q = assessQuality(p.assessed, terms, { limit });
          const unresp = (more.unresponsive_engines || []).find((u) => Array.isArray(u) && u[0] === eng);
          kept = dedupe([...kept, ...p.rows.filter((r) => r.on_topic)]);
          for (const o of offTopicOf(p)) if (offTopic.length < MAX_OFF_TOPIC_REPORTED * 2) offTopic.push(o);
          enginesTried.push({ step: `engine:${eng}`, status: unresp ? "blocked" : q.status, results: p.rows.length, on_topic: q.on_topic, ...(unresp ? { reason: String(unresp[1]) } : {}) });
        } catch (err) {
          enginesTried.push({ step: `engine:${eng}`, status: "error", error: String((err && err.message) || err) });
        }
      }
    }
  }

  let results = kept.slice(0, limit);
  // fail-soft: returns `results` unchanged if disabled/anomalous. Per-call `rerank` overrides the env default.
  results = await rerank(
    query,
    results,
    rerankOverride === undefined ? {} : { enabled: rerankOverride }
  );

  const finalStatus = !partition
    ? initial.status
    : kept.length >= wanted
      ? "ok"
      : kept.length > 0
        ? "thin"
        : first.rows.length > 0 || offTopic.length > 0
          ? "degraded"
          : "empty";
  const quality = { ...initial, status: finalStatus, initial_status: initial.status, fallback_used: fallbackUsed };
  if (finalStatus === "ok") quality.reason = null;

  // SearXNG has no LLM, so `answer` is the best available instant answer / infobox
  // text rather than a synthesized paragraph. Honest, non-fabricated.
  const answer = deriveAnswer(data);

  return {
    query,
    answer,
    applied_time_range: appliedTimeRange,
    results,
    quality,
    off_topic_results: offTopic.slice(0, MAX_OFF_TOPIC_REPORTED),
    engines_tried: enginesTried,
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

module.exports = {
  search,
  hostOf,
  hostMatchesDomain,
  addMetadataDoi,
  fetchSearxngOnce,
  enabledEngines,
  normalizeRow,
};
