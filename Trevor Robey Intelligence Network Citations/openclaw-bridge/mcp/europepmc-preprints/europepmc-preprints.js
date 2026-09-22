"use strict";

// europepmc-preprints.js — preprint lane via Europe PMC (2026-09-19).
//
// WHY A FETCHER AND NOT A CONFIG LINE. This started as a one-line prefetch-map entry
// (`EuropePMC_search_articles` with `query: "{{indication}} ... AND SRC:PPR"`) and that was
// WRONG for two reasons found by the test suite, both of which would have shipped silently:
//   1. tool-prefetch.js skips an executeTool entry only when EVERY string argument resolves
//      empty. A template with a literal tail resolves to " AND SRC:PPR" on an empty input set —
//      non-empty, so the guard cannot fire and the run spends a call on a garbage query.
//   2. The topic fallback (which rescues topic-only templates like general-research-pack)
//      substitutes `topic` only into an argument that is EXACTLY empty. The same literal tail
//      defeats it, so general-research-pack would have searched " AND SRC:PPR" instead of its
//      topic. `EuropePMC_search_articles` has no source/preprint parameter to move the filter
//      into — only `query` takes the fielded syntax — so config alone could not express this.
// Composing the query in code fixes both: no subject means no call, and `topic` is just another
// subject alias.
//
// WHY PREPRINTS AT ALL. The registry's `biorxiv-medrxiv` entry is flagged "critical for
// Conference Synthesis Brief deliverables where peer-reviewed publication is months away" and
// "load-bearing for early-signal detection in Failed Trial Archaeology". bioRxiv's OWN API has
// no keyword, author or full-text search — date-range and category listing only, re-verified
// live 2026-09-19 — so a bioRxiv-specific fetcher could never serve a role prefetch, which is
// topical by construction. Europe PMC indexes the same preprints and IS keyword-searchable.
//
// UNLIKE the other sources added this day, these records are DOI-bearing (and often carry a
// PMID), so they DO feed the Phase-30 grounding gate rather than only adding context.
//
// Fail-soft like every sibling fetcher: any network/parse error returns [] and the run continues.

const EPMC_SEARCH = "https://www.ebi.ac.uk/europepmc/webservices/rest/search";

// Europe PMC's source code for preprints. Verified live: `<subject> AND SRC:PPR` returned 4,252
// preprint hits for glioblastoma, of which 1,890 were bioRxiv specifically.
const PREPRINT_FILTER = "SRC:PPR";

const DEFAULT_CONTACT = "trevor@trevorobeyinc.com";
const DEFAULT_ORG = "Trevor Robey Intelligence Network Citations LLC";

// PROMPT-path clamps, same reasoning as the sibling fetchers: these render into an agent prompt.
const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 25;
const ABSTRACT_CHARS = 700;

// Indication arrives under a different key on almost every workflow template. `topic` is included
// so topic-only templates work natively rather than depending on tool-prefetch's empty-string
// fallback, which a composed query would defeat anyway.
const SUBJECT_KEYS = [
  "query_subject",
  "indication",
  "disease_name",
  "disease_context",
  "therapeutic_area",
  "drug_class",
  "compound_name",
  "topic"
];

// Europe PMC's abstractText carries markup for a good share of preprints (observed live:
// "<title>Abstract</title> <p>...", "<h4>Background</h4> ..."), which would land in the agent
// prompt as literal tags. Same four lines as base-mcp.js stripHtml, inlined rather than imported
// because base-mcp pulls in crypto/tls/zod/prompt-sanitizer/api-governance/circuit-breaker and
// the local fetchers are deliberately dependency-free (see ctgov-supplemental).
function stripHtml(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function subjectFrom(args) {
  // Join the distinct alias values rather than taking only the first: a preprint search is
  // breadth-first, and "glioblastoma temozolomide" is a better query than either word alone.
  const seen = new Set();
  const parts = [];
  for (const key of SUBJECT_KEYS) {
    const value = args && args[key];
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    const norm = trimmed.toLowerCase();
    if (seen.has(norm)) continue;
    seen.add(norm);
    parts.push(trimmed);
  }
  return parts.join(" ");
}

function createEuropePmcPreprints(options = {}) {
  const logger =
    options.logger && typeof options.logger.warn === "function"
      ? options.logger
      : { info() {}, warn() {}, error() {} };
  const fetchImpl = options.fetchImpl || (typeof fetch === "function" ? fetch : null);
  const timeoutMs = Number(options.timeoutMs) || 20_000;
  const contactEmail = options.contactEmail || DEFAULT_CONTACT;
  const org = options.org || DEFAULT_ORG;
  const cache = new Map();

  async function getJson(url) {
    if (typeof fetchImpl !== "function") throw new Error("no fetch implementation available");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, {
        signal: controller.signal,
        headers: { "User-Agent": `${org} ${contactEmail}`, Accept: "application/json" }
      });
      if (!res || !res.ok) throw new Error(`HTTP ${res ? res.status : "no-response"}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Search Europe PMC restricted to preprints.
   *
   * @param {object} args  Any of SUBJECT_KEYS, plus optional `limit` and `extraQuery`.
   * @returns {Promise<Array<object>>} [] on ANY error or empty subject — never throws.
   */
  async function searchPreprints(args = {}) {
    const subject = subjectFrom(args);
    if (!subject) {
      // The whole reason this is code: no subject means NO CALL, so an empty input set cannot
      // spend a request on a bare filter clause.
      logger.info({ event: "europepmc_preprints_no_subject", note: "no subject key supplied — skipped" });
      return [];
    }

    const limit = Math.max(1, Math.min(Number(args.limit) || DEFAULT_LIMIT, MAX_LIMIT));
    const extra = typeof args.extraQuery === "string" && args.extraQuery.trim() ? args.extraQuery.trim() : "";
    const query = [subject, extra, `AND ${PREPRINT_FILTER}`].filter(Boolean).join(" ");

    const cacheKey = JSON.stringify({ query, limit });
    if (cache.has(cacheKey)) return cache.get(cacheKey);

    const params = new URLSearchParams({
      query,
      format: "json",
      resultType: "core",
      pageSize: String(limit)
    });

    let data;
    try {
      data = await getJson(`${EPMC_SEARCH}?${params.toString()}`);
    } catch (err) {
      logger.warn({ event: "europepmc_preprints_failed", query, error: String(err && err.message) });
      return [];
    }

    const rows =
      data && data.resultList && Array.isArray(data.resultList.result) ? data.resultList.result : [];
    const hitCount = data && Number.isFinite(data.hitCount) ? data.hitCount : null;

    const records = [];
    for (const row of rows.slice(0, limit)) {
      if (!row || typeof row !== "object") continue;
      const doi = typeof row.doi === "string" ? row.doi.trim() : "";
      const abstract = stripHtml(row.abstractText).slice(0, ABSTRACT_CHARS);
      records.push({
        title: typeof row.title === "string" ? row.title.trim() : "Untitled preprint",
        year: row.pubYear ? String(row.pubYear) : "",
        // Marked so a reader (and the model) never mistakes a preprint for peer-reviewed work.
        journal: "Preprint (not peer reviewed)",
        abstract,
        // Citation identifiers — these DO reach the grounding gate, unlike sec-edgar/nih-reporter.
        doi,
        pmid: typeof row.pmid === "string" ? row.pmid : "",
        pmcid: typeof row.pmcid === "string" ? row.pmcid : "",
        url: doi ? `https://doi.org/${doi}` : "",
        authors: typeof row.authorString === "string" ? row.authorString : "",
        preprintServer: typeof row.publisher === "string" ? row.publisher : ""
      });
    }

    logger.info({
      event: "europepmc_preprints_completed",
      query,
      returned: records.length,
      total_matched: hitCount
    });

    Object.defineProperty(records, "totalMatched", {
      value: hitCount,
      enumerable: false,
      configurable: true
    });
    Object.defineProperty(records, "query", { value: query, enumerable: false, configurable: true });

    cache.set(cacheKey, records);
    return records;
  }

  return Object.freeze({ searchPreprints });
}

module.exports = {
  createEuropePmcPreprints,
  subjectFrom,
  PREPRINT_FILTER,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  ABSTRACT_CHARS,
  SUBJECT_KEYS
};
