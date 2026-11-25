"use strict";

/**
 * docs_search: search vendor documentation sites WITHOUT a web search engine.
 *
 * General web search is unreliable for this instance (measured 2026-11-24: Bing serves decoy results to
 * it, every other scraped engine walls it), but the documentation sites the research engine needs all
 * publish their own page lists. So:
 *
 *   1. inventory  every page url of a site, from its sitemaps (robots.txt `Sitemap:` lines included),
 *                 llms.txt and crawl seeds (see src/doc-sites.js), cached per site (24 h default)
 *   2. stage 1    rank the urls locally: BM25 over path words, link/llms titles and descriptions, plus
 *                 a bonus for a query word found inside a run-together slug ("listmonitoredapsv1")
 *   3. stage 2    read the best candidates through the SSRF-guarded extractor (a Zendesk site's own
 *                 search API answers with article bodies, so those need no read), rank them again on
 *                 their text, judge each with the relevance guard, and return the best passage of each
 *
 * Every network step goes through injected functions, so tests run offline.
 *
 * @module docs-search
 */

const { CONFIG } = require("./config.js");
const { REGISTRY, applyRewrite, inScope, resolveSites, siteForUrl, adHocSite } = require("./doc-sites.js");
const {
  collectSitemapUrls,
  robotsSitemaps,
  parseLlmsTxt,
  bodyText,
  anchorsFromHtml,
  htmlToText,
} = require("./sitemap.js");
const { queryTerms, stemTokens, urlTokens, bm25, normalize, bestPassage } = require("./rank.js");
const { assessRow, assessQuality, compactOffTopic } = require("./relevance.js");
const { TTLCache } = require("./robust.js");

/** Characters of a page kept for stage-2 scoring (the returned snippet is a passage of it). */
const PAGE_SCORE_CHARS = 60000;
const PASSAGE_CHARS = 600;
/** Hard cap on pages read per call, tie extension included (the read_pages schema maximum). */
const MAX_READ = 12;

/**
 * How many of the stage-1-ranked candidates to read: `want`, extended through any candidates TIED with
 * the last one, up to MAX_READ. A sitemap gives urls without titles, so a family of sibling pages often
 * scores identically: on 2026-11-24 seven wids-wips pages tied at 9.173 for "AOS 10 WIDS containment
 * tarpit", the cutoff of 6 fell inside the tie, and the one page that says "tarpit" (9th) went unread.
 * @param {{score:number}[]} ranked sorted best first
 * @param {number} want
 */
function readCut(ranked, want) {
  let n = Math.min(want, ranked.length);
  if (n === 0) return 0;
  const cut = ranked[n - 1].score;
  while (n < ranked.length && n < MAX_READ && Math.abs(ranked[n].score - cut) <= 1e-9 * Math.max(1, cut)) n++;
  return n;
}

/** Dedup key: host lower-cased, fragment dropped, trailing slash and a trailing ".md" or "/index.md" dropped. */
function canonical(url) {
  try {
    const u = new URL(String(url));
    u.hash = "";
    const path = u.pathname.replace(/\/index\.md$/i, "/").replace(/\.md$/i, "").replace(/\/+$/, "");
    return `${u.protocol}//${u.hostname.toLowerCase()}${path}${u.search}`;
  } catch {
    return String(url || "");
  }
}

/** The https origins of a site's hosts. */
function originsOf(site) {
  return site.hosts.map((h) => `https://${h}`);
}

/** Simple promise pool (kept local so this module has no hard dependency on extract.js internals). */
async function pool(items, worker, concurrency) {
  const out = new Array(items.length);
  let i = 0;
  const lanes = Math.max(1, Math.min(Math.trunc(concurrency) || 1, items.length));
  await Promise.all(
    Array.from({ length: lanes }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await worker(items[idx], idx);
      }
    })
  );
  return out;
}

/** Path words (no host: it is the same for every page of a site) for stage-1 scoring. */
function pathText(url) {
  try {
    const u = new URL(String(url));
    return decodeURIComponent(u.pathname);
  } catch {
    return String(url || "");
  }
}

/**
 * Stage 1: score inventory entries against the query from their url, title and description.
 * @param {{url:string, title?:string, description?:string}[]} entries
 * @param {{stem:string, word:string}[]} terms
 * @returns {number[]} one score per entry
 */
function rankEntries(entries, terms) {
  const stems = terms.map((t) => t.stem);
  const docs = entries.map((e) => [
    ...stemTokens(pathText(e.url)),
    ...stemTokens(e.title || ""),
    ...stemTokens(e.title || ""), // titles count twice
    ...stemTokens(e.description || ""),
  ]);
  const base = bm25(docs, stems);
  return entries.map((e, i) => {
    const { slugs } = urlTokens(e.url);
    const slugHits = slugs.length ? stems.filter((s) => s.length >= 4 && slugs.some((x) => x.includes(s))).length : 0;
    return base[i] + slugHits * 0.75;
  });
}

/**
 * Build the docs searcher. Every dependency is injectable; the defaults are the connector's
 * SSRF-guarded fetcher and Readability extractor (loaded lazily, so tests never load jsdom).
 *
 * @param {object} [deps]
 * @param {(url:string) => Promise<{ok:boolean, status:number, text:string, url?:string}>} [deps.fetchText]
 * @param {(url:string) => Promise<{raw_content:string, title:string|null}>} [deps.readPage]
 * @param {() => number} [deps.now]
 * @param {number} [deps.inventoryTtlMs]
 */
function createDocsSearch(deps = {}) {
  const fetchText =
    deps.fetchText ||
    (async (url) => {
      const { fetchUrl } = require("./extract.js");
      const r = await fetchUrl(url, {
        binary: true,
        maxBytes: CONFIG.docsMaxBytes,
        accept: "application/xml,text/xml,text/plain,application/json,text/html;q=0.9,*/*;q=0.8",
      });
      return { ok: r.ok, status: r.status, contentType: r.contentType, text: r.ok ? bodyText(r.bytes, CONFIG.docsMaxBytes) : "", url: r.url };
    });
  const readPage =
    deps.readPage ||
    ((url) => require("./extract.js").extractOne(url, { format: "markdown", maxChars: PAGE_SCORE_CHARS }));
  const now = deps.now || Date.now;
  const ttl = deps.inventoryTtlMs ?? CONFIG.docsInventoryTtlMs;
  const inventories = new Map(); // site id -> { at, promise }
  const answers = new TTLCache(600000, 100);

  async function buildInventory(site) {
    const entries = new Map();
    const sources = [];
    const add = (url, meta) => {
      const u = applyRewrite(site, url);
      if (!inScope(site, u)) return false;
      const key = canonical(u);
      const cur = entries.get(key);
      if (cur) {
        // Another source names the same page: keep its title too (a sitemap url has none, a sidebar
        // link has the endpoint's name, an llms.txt entry has a section title), bounded.
        if (meta.title && !cur.title.includes(meta.title) && cur.title.length < 300) {
          cur.title = cur.title ? `${cur.title} · ${meta.title}` : meta.title;
        }
        if (!cur.description && meta.description) cur.description = meta.description;
        return false;
      }
      entries.set(key, { url: u, title: meta.title || "", description: meta.description || "", source: meta.source });
      return true;
    };
    const fail = (kind, url, err) =>
      sources.push({ kind, url, ok: false, error: String((err && err.message) || err).slice(0, 200) });

    // 1. Sitemaps: the registry's own list, plus whatever each host's robots.txt declares.
    const sitemapUrls = [...(site.sitemaps || [])];
    if (site.robots) {
      for (const origin of originsOf(site)) {
        const url = `${origin}/robots.txt`;
        try {
          const r = await fetchText(url);
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const found = robotsSitemaps(r.text);
          sitemapUrls.push(...found);
          sources.push({ kind: "robots", url, ok: true, count: found.length });
        } catch (err) {
          fail("robots", url, err);
        }
      }
    }
    if (sitemapUrls.length) {
      const walked = await collectSitemapUrls(sitemapUrls, {
        fetchText,
        rewrite: (u) => applyRewrite(site, u),
        maxSitemaps: CONFIG.docsMaxSitemaps,
        maxUrls: CONFIG.docsMaxUrls,
      });
      sources.push(...walked.sources);
      let kept = 0;
      for (const e of walked.urls) if (add(e.loc, { source: "sitemap" })) kept++;
      if (walked.truncated) sources.push({ kind: "sitemap", ok: true, note: "budget reached: inventory truncated" });
      if (walked.urls.length && kept === 0) {
        sources.push({ kind: "sitemap", ok: true, note: `${walked.urls.length} urls listed, none inside the site's scope` });
      }
    }

    // 2. llms.txt: section links with titles and one-line descriptions.
    for (const url of site.llms || []) {
      try {
        const r = await fetchText(url);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const items = parseLlmsTxt(r.text, url);
        let added = 0;
        for (const it of items) if (add(it.url, { title: it.title, description: it.description, source: "llms" })) added++;
        sources.push({ kind: "llms", url, ok: true, count: items.length, added });
      } catch (err) {
        fail("llms", url, err);
      }
    }

    // 3. Crawl seeds: pages whose links (with their anchor text) are the index.
    for (const seed of site.crawl || []) {
      try {
        const r = await fetchText(seed);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        let added = 0;
        for (const a of anchorsFromHtml(r.text, r.url || seed)) if (add(a.url, { title: a.text, source: "crawl" })) added++;
        sources.push({ kind: "crawl", url: seed, ok: true, count: added });
      } catch (err) {
        fail("crawl", seed, err);
      }
    }

    return { site: site.id, urls: [...entries.values()], sources, built_at: new Date(now()).toISOString() };
  }

  /** A site's inventory, built once per TTL; concurrent callers share the build. Empty builds are not kept. */
  function inventory(site) {
    const hit = inventories.get(site.id);
    if (hit && now() - hit.at < ttl) return hit.promise;
    const promise = buildInventory(site).then(
      (inv) => {
        if (inv.urls.length === 0) inventories.delete(site.id);
        return inv;
      },
      (err) => {
        inventories.delete(site.id);
        throw err;
      }
    );
    inventories.set(site.id, { at: now(), promise });
    return promise;
  }

  /** Ask a Zendesk Help Center's own search API; its hits come back with the article body. */
  async function zendeskPages(site, terms, query) {
    const z = site.zendesk;
    const q = terms.map((t) => t.word).join(" ") || query;
    const params = new URLSearchParams({ query: q, per_page: "8" });
    if (z.locale) params.set("locale", z.locale);
    const url = `${z.base}/api/v2/help_center/articles/search.json?${params}`;
    const r = await fetchText(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = JSON.parse(r.text);
    return (Array.isArray(data.results) ? data.results : [])
      .filter((a) => a && a.html_url && !a.draft && inScope(site, a.html_url))
      .map((a) => ({
        site: site.id,
        url: a.html_url,
        title: a.title || "",
        text: htmlToText(a.body || a.snippet || ""),
        s1: 1,
        source: "zendesk",
      }));
  }

  /**
   * Search the docs.
   * @param {object} args
   * @param {string} args.query
   * @param {string[]} [args.sites]           registry ids or hostnames (default: inferred from the query, else all)
   * @param {number} [args.max_results=5]
   * @param {number} [args.read_pages]        candidates to read (default CONFIG.docsReadPages)
   * @param {boolean} [args.include_raw_content]
   */
  async function search(args) {
    const started = now();
    const query = String((args && args.query) || "").trim();
    if (!query) throw new Error("`query` is required and must be a non-empty string.");
    const terms = queryTerms(query);
    if (terms.length === 0) throw new Error("the query has no searchable words (only stopwords or operators)");
    const stems = terms.map((t) => t.stem);
    const maxResults = Math.max(1, Math.min(Math.trunc(Number(args.max_results)) || 5, 20));
    const readCount = Math.max(1, Math.min(Math.trunc(Number(args.read_pages)) || CONFIG.docsReadPages, MAX_READ));

    const resolved = resolveSites({ sites: args.sites, query });
    const chosen = resolved.sites.length ? resolved.sites : args.sites && args.sites.length ? [] : [...REGISTRY];
    if (chosen.length === 0) {
      throw new Error(
        `no registered doc site matches ${JSON.stringify(resolved.unknown)}. Registered: ${REGISTRY.map((s) => s.id).join(", ")}`
      );
    }

    const cacheKey = JSON.stringify([query, chosen.map((s) => s.id), maxResults, readCount, !!args.include_raw_content]);
    const cached = answers.get(cacheKey);
    if (cached) return { ...cached, cached: true };

    // 1. Inventories, all sites in parallel (different hosts), each fail-soft.
    const invs = await Promise.all(
      chosen.map((site) =>
        inventory(site).catch((err) => ({
          site: site.id,
          urls: [],
          sources: [{ kind: "inventory", ok: false, error: String((err && err.message) || err) }],
        }))
      )
    );

    // 2. Stage 1 over every site's entries at once, so scores are comparable across sites.
    const candidates = [];
    for (const inv of invs) for (const e of inv.urls) candidates.push({ site: inv.site, entry: e });
    const s1 = rankEntries(candidates.map((c) => c.entry), terms);
    const ranked = candidates
      .map((c, i) => ({ ...c, score: s1[i] }))
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score);

    // Zendesk sites answer the query themselves (with bodies), in parallel with nothing else to wait on.
    const failed = [];
    const zd = (
      await Promise.all(
        chosen
          .filter((s) => s.zendesk)
          .map((s) =>
            zendeskPages(s, terms, query).catch((err) => {
              failed.push({ url: s.zendesk.base, error: `zendesk search: ${String((err && err.message) || err)}` });
              return [];
            })
          )
      )
    ).flat();
    const zdKeys = new Set(zd.map((p) => canonical(p.url)));

    // 3. Stage 2: read the best candidates not already answered by a Zendesk body (ties at the cutoff
    //    are read too, see readCut).
    const readable = ranked.filter((c) => !zdKeys.has(canonical(c.entry.url)));
    const toRead = readable.slice(0, readCut(readable, readCount));
    const read = await pool(
      toRead,
      async (c) => {
        try {
          const p = await readPage(c.entry.url);
          return {
            site: c.site,
            url: c.entry.url,
            title: (p && p.title) || c.entry.title || "",
            text: String((p && p.raw_content) || "").slice(0, PAGE_SCORE_CHARS),
            s1: c.score,
            source: c.entry.source,
          };
        } catch (err) {
          failed.push({ url: c.entry.url, error: String((err && err.message) || err) });
          return null;
        }
      },
      CONFIG.extractConcurrency
    );
    const pages = [...read.filter(Boolean), ...zd];

    const s2 = normalize(bm25(pages.map((p) => stemTokens(`${p.title}\n${p.title}\n${p.text}`)), stems));
    const s1n = normalize(pages.map((p) => p.s1 || 0));
    const scored = pages
      .map((p, i) => {
        const a = assessRow({ title: p.title, content: p.text, url: p.url }, terms);
        const score = 0.45 * s2[i] + 0.35 * a.relevance + 0.2 * s1n[i] + (a.title_hit ? 0.05 : 0);
        return { p, a, score };
      })
      .sort((x, y) => Number(y.a.on_topic) - Number(x.a.on_topic) || y.score - x.score);

    const results = scored
      .filter((x) => x.a.on_topic)
      .slice(0, maxResults)
      .map(({ p, a, score }) => {
        const row = {
          title: p.title,
          url: p.url,
          content: bestPassage(p.text, stems, PASSAGE_CHARS),
          score: Math.round(score * 1000) / 1000,
          site: p.site,
          matched_terms: a.matched_terms,
          relevance: a.relevance,
          found_via: p.source || null,
        };
        if (args.include_raw_content) row.raw_content = p.text.slice(0, CONFIG.maxExtractChars);
        return row;
      });

    const out = {
      query,
      sites: chosen.map((s) => ({ id: s.id, label: s.label })),
      results,
      off_topic_results: scored.filter((x) => !x.a.on_topic).slice(0, 10).map(({ p, a }) => compactOffTopic(p, a)),
      failed_results: failed,
      quality: assessQuality(scored.map((x) => x.a), terms, { limit: maxResults }),
      inventory: Object.fromEntries(invs.map((inv) => [inv.site, { urls: inv.urls.length, sources: inv.sources }])),
      candidates: { inventoried: candidates.length, matched: ranked.length, read: read.filter(Boolean).length, zendesk: zd.length },
      unknown_sites: resolved.unknown,
      response_time: (now() - started) / 1000,
      provider: "docs",
    };
    if (results.length) answers.set(cacheKey, out); // never cache an empty answer (see searxng.js)
    return out;
  }

  /**
   * The inventory `map` needs for a url: the registered site's (cut down to the url's directory when the
   * url is deeper than the site's root), or an ad-hoc one from the host's robots.txt and /sitemap.xml.
   * @param {string} url
   * @returns {Promise<{site: string, registered: boolean, entries: object[], sources: object[]}>}
   */
  async function mapInventory(url) {
    const registered = siteForUrl(url);
    const site = registered || adHocSite(url);
    const inv = await inventory(site);
    const u = new URL(String(url));
    const dir = u.pathname.endsWith("/") ? u.pathname : u.pathname.replace(/[^/]*$/, "");
    const prefix = `${u.origin}${dir}`;
    const rewritten = applyRewrite(site, prefix);
    const entries = inv.urls.filter((e) => e.url.startsWith(rewritten));
    return { site: site.id, registered: Boolean(registered), entries, sources: inv.sources };
  }

  /** The registry, for `docs_search` with list_sites. */
  function listSites() {
    return REGISTRY.map((s) => ({
      id: s.id,
      label: s.label,
      hosts: s.hosts,
      sources: [
        s.robots ? "robots.txt sitemaps" : null,
        s.sitemaps && s.sitemaps.length ? `${s.sitemaps.length} sitemap(s)` : null,
        s.llms && s.llms.length ? "llms.txt" : null,
        s.crawl && s.crawl.length ? `${s.crawl.length} crawl seed(s)` : null,
        s.zendesk ? "Zendesk search API" : null,
      ].filter(Boolean),
      aliases: s.aliases,
    }));
  }

  return { search, inventory, mapInventory, listSites, rankEntries };
}

/** The process-wide instance the tools use (one inventory cache per server process). */
let _default = null;
function defaultDocsSearch() {
  if (!_default) _default = createDocsSearch();
  return _default;
}

module.exports = { createDocsSearch, defaultDocsSearch, rankEntries, canonical, readCut, PASSAGE_CHARS, MAX_READ };
