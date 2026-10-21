"use strict";

// web-evidence.js — business-lane local fetcher: search the web, READ the top pages, and hand the
// model citable snapshots (2026-10-21).
//
// The SearXNG connector already searches (search) and reads pages behind an SSRF guard (extract).
// This fetcher joins the two and stores every page it shows the model in the web snapshot store,
// so the model can cite `WEB: <id>` and the gate can ground and re-resolve it. Search snippets
// alone are never shown as evidence: a snippet is the search engine's summary, not the source.
//
// Both connector functions are injected (tests run offline) and otherwise required LAZILY from the
// repo copy of the connector, the same seam mcp/searxng-mcp/searchfn.js uses — a connector problem
// surfaces as a caught failure at call time, never as a module-load break.
//
// Fail-soft like every sibling fetcher: any error returns [] and the run continues.

const path = require("node:path");

const DEFAULT_PAGES = 5;
const MAX_PAGES = 10;
// Characters of page text rendered into the prompt per source. The full text is kept in the
// snapshot; the prompt gets the opening of the page, which is what the model can quote from.
const DEFAULT_EXCERPT_CHARS = 2500;
const MAX_STORED_CHARS = 60_000;

const SUBJECT_KEYS = ["query", "question", "topic", "company", "industry", "market"];

function firstNonEmpty(args, keys) {
  for (const key of keys) {
    const value = args && args[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function connectorModule(file) {
  return require(path.resolve(__dirname, "../../../../Claude/searxng-search-mcp/src", file));
}

function createWebEvidence(options = {}) {
  const logger =
    options.logger && typeof options.logger.warn === "function"
      ? options.logger
      : { info() {}, warn() {}, error() {} };
  const store = options.snapshotStore;
  const searchImpl = options.searchFn || ((params) => connectorModule("searxng.js").search(params));
  const extractImpl = options.extractOne || ((url, opts) => connectorModule("extract.js").extractOne(url, opts));
  const cache = new Map();

  /**
   * @param {object} args
   * @param {string} [args.query]  search text; falls back to question/topic/company/industry/market
   * @param {string} [args.focus]  extra words appended to the query (e.g. "cost benchmark 2026")
   * @param {number} [args.pages]  pages to read, clamped to MAX_PAGES
   * @param {string} [args.topic]  SearXNG topic: general (default) or news
   * @returns {Promise<Array<object>>} [] on ANY error — never throws.
   */
  async function searchAndRead(args = {}) {
    if (!store || typeof store.put !== "function") {
      logger.warn({ event: "web_evidence_no_store", note: "no snapshot store wired — skipped" });
      return [];
    }
    const subject = firstNonEmpty(args, SUBJECT_KEYS);
    if (!subject) {
      logger.info({ event: "web_evidence_no_subject", note: "no query or subject key supplied — skipped" });
      return [];
    }
    const focus = typeof args.focus === "string" ? args.focus.trim() : "";
    const query = [subject, focus].filter(Boolean).join(" ");
    const pages = Math.max(1, Math.min(Number(args.pages) || DEFAULT_PAGES, MAX_PAGES));
    const topic = args.topic === "news" ? "news" : "general";

    const cacheKey = JSON.stringify({ query, pages, topic });
    if (cache.has(cacheKey)) return cache.get(cacheKey);

    let hits;
    try {
      const out = await searchImpl({ query, max_results: Math.min(pages * 2, 20), topic });
      hits = Array.isArray(out && out.results) ? out.results : [];
    } catch (err) {
      logger.warn({ event: "web_evidence_search_failed", query, error: String(err && err.message) });
      return [];
    }

    const records = [];
    const seen = new Set();
    for (const hit of hits) {
      if (records.length >= pages) break;
      const url = hit && typeof hit.url === "string" ? hit.url : "";
      if (!/^https:\/\//i.test(url) || seen.has(url)) continue; // HTTPS-only, like every engine source
      seen.add(url);
      let page;
      try {
        page = await extractImpl(url, { format: "text", maxChars: MAX_STORED_CHARS });
      } catch (err) {
        logger.info({ event: "web_evidence_page_unreadable", url, error: String(err && err.message) });
        continue;
      }
      const text = page && typeof page.raw_content === "string" ? page.raw_content.trim() : "";
      if (text.length < 200) continue; // too thin to support a claim
      let snap;
      try {
        snap = store.put({ url, title: (page && page.title) || hit.title || "", text });
      } catch (err) {
        logger.warn({ event: "web_evidence_store_failed", url, error: String(err && err.message) });
        continue;
      }
      const excerpt = text.length > DEFAULT_EXCERPT_CHARS ? `${text.slice(0, DEFAULT_EXCERPT_CHARS)} …` : text;
      records.push({
        title: snap.title || url,
        year: hit.published_date ? String(hit.published_date).slice(0, 4) : "",
        text: `WEB: ${snap.id}\n${excerpt}`,
        url,
        webSnapshotId: snap.id
      });
    }

    logger.info({ event: "web_evidence_completed", query, searched: hits.length, read: records.length });
    cache.set(cacheKey, records);
    return records;
  }

  return Object.freeze({ searchAndRead });
}

module.exports = { createWebEvidence, DEFAULT_PAGES, MAX_PAGES, SUBJECT_KEYS };
