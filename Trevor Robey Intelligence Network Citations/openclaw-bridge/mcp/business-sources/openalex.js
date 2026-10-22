"use strict";

// openalex.js — business-lane local fetcher for published research outside biomedicine
// (2026-10-21).
//
// Management, economics, operations and engineering literature is DOI-indexed, so it is already
// gradable and re-resolvable (Crossref). PubMed doesn't index it; OpenAlex does, publicly and
// keyless. Records render `doi: <doi>` through tool-prefetch's renderRecord, so a cited paper is
// grounded and re-resolved exactly like a biomedical DOI. Works without a DOI are dropped: they
// would be uncitable context.

const { toSearchQuery } = require("./search-terms.js");

const API = "https://api.openalex.org/works";
const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 25;
const SUBJECT_KEYS = ["query", "question", "topic", "industry", "market"];

function firstNonEmpty(args, keys) {
  for (const key of keys) {
    const value = args && args[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

/** OpenAlex ships abstracts as an inverted index { word: [positions] }; rebuild the text. */
function abstractFromInvertedIndex(index) {
  if (!index || typeof index !== "object") return "";
  const words = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const pos of Array.isArray(positions) ? positions : []) {
      if (Number.isInteger(pos) && pos >= 0 && pos < 5000) words[pos] = word;
    }
  }
  return words.filter(Boolean).join(" ");
}

function createOpenAlex(options = {}) {
  const logger =
    options.logger && typeof options.logger.warn === "function"
      ? options.logger
      : { info() {}, warn() {}, error() {} };
  const fetchImpl = options.fetchImpl || (typeof fetch === "function" ? fetch : null);
  const timeoutMs = Number(options.timeoutMs) || 15_000;
  const contactEmail = options.contactEmail || "trevor@trevorobeyinc.com";
  const cache = new Map();

  async function searchWorks(args = {}) {
    const subject = firstNonEmpty(args, SUBJECT_KEYS);
    if (!subject || typeof fetchImpl !== "function") return [];
    // Keywords, not the question: OpenAlex returned zero works for the verbatim question.
    const query = toSearchQuery(subject, args.focus);
    const limit = Math.max(1, Math.min(Number(args.limit) || DEFAULT_LIMIT, MAX_LIMIT));
    const cacheKey = `${query}|${limit}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);

    const params = new URLSearchParams({
      search: query,
      per_page: String(limit),
      filter: "has_doi:true",
      mailto: contactEmail
    });
    let body;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(`${API}?${params.toString()}`, {
        signal: controller.signal,
        headers: { Accept: "application/json" }
      });
      if (!res || !res.ok) throw new Error(`HTTP ${res ? res.status : "no-response"}`);
      body = await res.json();
    } catch (err) {
      logger.warn({ event: "openalex_search_failed", query, error: String(err && err.message) });
      return [];
    } finally {
      clearTimeout(timer);
    }

    const records = [];
    for (const w of Array.isArray(body && body.results) ? body.results : []) {
      const doi = typeof w.doi === "string" ? w.doi.replace(/^https?:\/\/doi\.org\//i, "") : "";
      if (!/^10\.\d{4,9}\//.test(doi)) continue;
      const venue = w.primary_location && w.primary_location.source && w.primary_location.source.display_name;
      records.push({
        title: w.display_name || w.title || doi,
        year: w.publication_year ? String(w.publication_year) : "",
        journal: venue || "",
        abstract: abstractFromInvertedIndex(w.abstract_inverted_index),
        doi
      });
    }
    logger.info({ event: "openalex_search_completed", query, returned: records.length });
    cache.set(cacheKey, records);
    return records;
  }

  return Object.freeze({ searchWorks });
}

module.exports = { createOpenAlex, abstractFromInvertedIndex };
