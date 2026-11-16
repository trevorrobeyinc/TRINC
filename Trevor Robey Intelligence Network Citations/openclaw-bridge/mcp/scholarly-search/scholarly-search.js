"use strict";

// scholarly-search.js — the search behind the quality audit's section citation-coverage gate for the
// "science" topic, straight from two free, keyless scholarly APIs: Europe PMC REST and Crossref REST
// (operator decision 2026-11-15). It replaces SearXNG's "science" category, which only relayed to these
// same sources (plus others) and stalled: on 2026-11-15 every one of its science engines timed out at
// once while this Mac reached Europe PMC, Crossref and NCBI directly in under 1.3 s, and two restarts
// left it hanging at startup. SearXNG still serves the business lane's general-web evidence search
// (business-sources/web-evidence.js); no free general-web search API remains (Brave dropped its free
// tier in 2026, and OpenAlex now needs a key).
//
// Output is the row shape the gate grades (mcp/searxng-mcp/index.js normalizeAndGrade):
// { title, url, content, score, engine, citations: [{ type, id, source: "metadata", subtype? }] }.
// Every id comes from the source's own structured field, so it is RECORD-IDENTITY ("metadata"): a
// peer-reviewed record grades A, a preprint (a known preprint DOI registrant, Crossref "posted-content",
// or Europe PMC source "PPR") grades B. Type names and DOI normalization follow the old connector's
// citation-grammar.js (lower-case types, lower-cased DOIs), so rows cluster as before.
//
// Failure contract (the section gate depends on it; fixed by the S1 review, 2026-11-15):
//   * a genuine zero is ONLY both sources answering, well-formed, with no hits: [] — the gate fails
//     the section closed on it;
//   * anything less throws, so the gate marks the section UNCHECKED and never fails it on that basis:
//     an empty query, both sources failing (network error, timeout, non-2xx, a body without its result
//     list), and one source failing or skipped while the other answered with no hits;
//   * one source failing while the other returns rows returns those rows, and `sources` names the
//     failure, which the gate records on the section (source_errors) and the ledger marks.
// Errors carry `searched`, so an UNCHECKED section still records what it would have searched.
// Deterministic for the same responses: no wall-clock or RNG globals (forbidden under openclaw-bridge/);
// the Crossref pacing reads the injected clock of core/ncbi-pacing.js.

const { createNcbiPacing } = require("../../core/ncbi-pacing.js");

const EUROPE_PMC_SEARCH = "https://www.ebi.ac.uk/europepmc/webservices/rest/search";
const CROSSREF_WORKS = "https://api.crossref.org/works";

// What the section coverage record and the buyer's ledger name as the search (integrity-rating.js).
const SEARCHED = "Europe PMC and Crossref";

// DOI prefixes of preprint registrants: the same list as Claude/searxng-search-mcp/src/citation-grammar.js
// PREPRINT_DOI_PREFIXES (kept in sync by hand; the gate never requires the connector's grammar).
const PREPRINT_DOI_PREFIXES = Object.freeze([
  "10.1101/", // Cold Spring Harbor — bioRxiv / medRxiv
  "10.21203/", // Research Square
  "10.20944/", // Preprints.org
  "10.26434/", // ChemRxiv
  "10.31219/", // OSF Preprints
  "10.31234/" // PsyArXiv
]);

function normalizeDoi(raw) {
  return String(raw || "")
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .replace(/[.,;:)\]}>"'|]+$/, "")
    .toLowerCase();
}

function isPreprintDoi(doi) {
  return PREPRINT_DOI_PREFIXES.some((p) => doi.startsWith(p));
}

function firstOf(value) {
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
}

function rankScore(index, total) {
  return total > 0 ? Math.round(((total - index) / total) * 1000) / 1000 : 0;
}

// The Europe PMC query. A free-text query there is an AND over full text, so a section query such as
// "alcohol use disorder Novo Nordisk Semaglutide GLP-1 STEER" matched conference abstract books that
// carry every word somewhere (checked live 2026-11-15). Instead: the primary subject as a phrase in the
// title or abstract, AND any one of the section's key terms there, over PubMed records and preprints
// only (SRC:MED / SRC:PPR). The subject comes from the section gate (params.primary_subject); with
// none, any key term in the title or abstract.
//
// The gate's breadth retry (opts.broad, sent as params.breadth_retry) cannot broaden this query by
// dropping the section query's last word, as reformulate.js does: the words are OR-ed, so one fewer can
// only narrow it, and past 8 words the query does not change at all (S1 review, 2026-11-15). So the
// retry searches the key terms in ANY field of the record (full text included, where Europe PMC holds
// it) while the subject stays in the title or abstract, and the subject alone anywhere when there are
// no key terms.
const EPMC_SOURCES = "(SRC:MED OR SRC:PPR)";
function cleanTerm(s) {
  return String(s || "").replace(/["()\\]/g, " ").replace(/\s+/g, " ").trim();
}
function europePmcQuery(query, subject, opts = {}) {
  const broad = opts.broad === true;
  const field = broad ? "" : "TITLE_ABS:";
  const subj = cleanTerm(subject);
  const text = cleanTerm(query);
  const rest = subj && text.toLowerCase().startsWith(subj.toLowerCase())
    ? text.slice(subj.length)
    : subj
      ? text.split(" ").filter((w) => !subj.toLowerCase().split(" ").includes(w.toLowerCase())).join(" ")
      : text;
  const terms = [...new Set(rest.split(" ").filter((w) => w.length >= 3).map((w) => w.toLowerCase()))].slice(0, 8);
  const anyTerm = terms.length ? `(${terms.map((t) => `${field}"${t}"`).join(" OR ")})` : "";
  if (subj && anyTerm) return `TITLE_ABS:"${subj}" AND ${anyTerm} AND ${EPMC_SOURCES}`;
  if (subj) return `${field}"${subj}" AND ${EPMC_SOURCES}`;
  if (anyTerm) return `${anyTerm} AND ${EPMC_SOURCES}`;
  return "";
}

// The Crossref record types kept: journal articles, preprints ("posted-content"), proceedings articles
// and book chapters. Everything else is dropped. Crossref's relevance search returns other types for the
// same words: untitled grants, peer-review records, datasets, and "report" items, which for a biomedical
// query were explainer pieces (seen live 2026-11-15) but are mostly technical and agency reports (OSTI,
// DTIC, NBER, USGS). Dissertations, books, monographs, reference entries and standards are dropped too,
// though they are citable works: whether any of them should count for a business section is the
// operator's call, open since the S1 review (2026-11-15).
const CROSSREF_WORK_TYPES = new Set(["journal-article", "posted-content", "proceedings-article", "book-chapter"]);

// Europe PMC "lite" hits → gate rows. A DOI links to doi.org, the URL of Crossref's copy of the same
// work, so the gate's clustering (cluster.js, by canonical URL) counts the two once, also when they come
// back in different passes; otherwise a PubMed id links to its PubMed record; otherwise the Europe PMC
// article page.
function europePmcRows(body) {
  const hits = body && body.resultList && Array.isArray(body.resultList.result) ? body.resultList.result : [];
  return hits.map((hit, i) => {
    const preprint = String(hit.source || "").toUpperCase() === "PPR";
    const pmid = /^\d{1,10}$/.test(String(hit.pmid || "")) ? String(hit.pmid) : "";
    const doi = normalizeDoi(hit.doi);
    const pmcid = /^PMC\d+$/i.test(String(hit.pmcid || "")) ? String(hit.pmcid).toUpperCase() : "";
    const citations = [];
    if (pmid) citations.push({ type: "pmid", id: pmid, source: "metadata" });
    if (doi) {
      const c = { type: "doi", id: doi, source: "metadata" };
      if (preprint || isPreprintDoi(doi)) c.subtype = "preprint";
      citations.push(c);
    }
    if (pmcid) citations.push({ type: "pmcid", id: pmcid, source: "metadata" });
    if (preprint) for (const c of citations) c.subtype = "preprint";
    const url = doi
      ? `https://doi.org/${doi}`
      : pmid
        ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`
        : `https://europepmc.org/article/${encodeURIComponent(String(hit.source || "MED"))}/${encodeURIComponent(String(hit.id || ""))}`;
    return {
      title: String(hit.title || "").trim(),
      url,
      content: [hit.journalTitle, hit.pubYear].filter(Boolean).join(", "),
      score: rankScore(i, hits.length),
      engine: "europepmc",
      citations
    };
  });
}

// Crossref works → gate rows. Crossref holds DOIs only; "posted-content" is its type for preprints.
function crossrefRows(body) {
  const all = body && body.message && Array.isArray(body.message.items) ? body.message.items : [];
  const items = all.filter((item) => CROSSREF_WORK_TYPES.has(String(item.type || "")) && firstOf(item.title).trim());
  return items
    .map((item, i) => {
      const doi = normalizeDoi(item.DOI);
      if (!doi) return null;
      const c = { type: "doi", id: doi, source: "metadata" };
      if (String(item.type || "") === "posted-content" || isPreprintDoi(doi)) c.subtype = "preprint";
      const year = item.issued && Array.isArray(item.issued["date-parts"]) && Array.isArray(item.issued["date-parts"][0])
        ? item.issued["date-parts"][0][0]
        : null;
      return {
        title: firstOf(item.title).trim(),
        url: `https://doi.org/${doi}`,
        content: [firstOf(item["container-title"]), year].filter(Boolean).join(", "),
        score: rankScore(i, items.length),
        engine: "crossref",
        citations: [c]
      };
    })
    .filter(Boolean);
}

// The identity of a row for de-duplication across the two sources: its DOI, else its PMID, else its URL.
function rowKey(row) {
  const doi = row.citations.find((c) => c.type === "doi");
  if (doi) return `doi:${doi.id}`;
  const pmid = row.citations.find((c) => c.type === "pmid");
  if (pmid) return `pmid:${pmid.id}`;
  return `url:${row.url}`;
}

// Interleave the sources (Europe PMC first: it carries PMIDs), keep the first row per work, cap the list.
function mergeRows(lists, max) {
  const out = [];
  const seen = new Set();
  const longest = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < longest && out.length < max; i += 1) {
    for (const list of lists) {
      if (out.length >= max) break;
      const row = list[i];
      if (!row) continue;
      const key = rowKey(row);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(row);
    }
  }
  return out;
}

// An error the section gate turns into an UNCHECKED section; it names what would have been searched.
function searchError(message) {
  const err = new Error(message);
  err.searched = SEARCHED;
  return err;
}

const EPMC_SKIPPED = "skipped (no term of 3 or more characters to search)";

function createScholarlySearch(options = {}) {
  const httpImpl = options.httpImpl || (typeof fetch === "function" ? fetch : null);
  const timeoutMs = Number(options.timeoutMs) || 15_000;
  // A generic client name on purpose: no business name or contact address goes out with a search, so
  // Crossref answers from its public pool, which allows ONE request per second, one at a time (its
  // x-rate-limit headers, live 2026-11-15). A request sent 0.6 s after the previous one drew HTTP 429
  // in the S1 review. So the Crossref leg is paced (1 s apart by default) and retried once on a 429,
  // with the NCBI politeness policy (core/ncbi-pacing.js), which is exactly that rule. `nowMs` and
  // `sleep` are injectable, so a test proves the spacing without real delays.
  const userAgent = String(options.userAgent || "scholarly-search/1.0");
  const crossrefPacing = createNcbiPacing({
    minRequestIntervalMs: Number.isFinite(options.crossrefIntervalMs) ? options.crossrefIntervalMs : 1_000,
    maxRetryAfterMs: 3_000,
    nowMs: options.nowMs,
    sleep: options.sleep
  });

  async function getJson(url, pacing) {
    if (typeof httpImpl !== "function") throw new Error("no HTTP client available");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const send = () => httpImpl(url, { signal: controller.signal, headers: { Accept: "application/json", "User-Agent": userAgent } });
      const res = pacing ? (await pacing.request(send)).out : await send();
      if (!res || !res.ok) throw new Error(`HTTP ${res ? res.status : "no response"}`);
      return await res.json();
    } catch (err) {
      if (controller.signal.aborted) throw new Error(`timed out after ${timeoutMs} ms`);
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  // Each leg resolves to its rows, or rejects. A 200 whose body lacks the result list is a failure of
  // that source, never a zero: both APIs answer a query with no hits with an empty list (checked live
  // 2026-11-15: Europe PMC resultList.result [], Crossref message.items []).
  async function europePmcLeg(url) {
    const body = await getJson(url);
    if (!(body && body.resultList && Array.isArray(body.resultList.result))) throw new Error("unexpected response: no resultList.result");
    return europePmcRows(body);
  }
  async function crossrefLeg(url) {
    const body = await getJson(url, crossrefPacing);
    if (!(body && body.message && Array.isArray(body.message.items))) throw new Error("unexpected response: no message.items");
    return crossrefRows(body);
  }
  const settle = (leg, skipped) => (leg
    ? leg.then((rows) => ({ ok: true, rows, status: "ok" }), (err) => ({ ok: false, rows: [], status: String((err && err.message) || err) }))
    : Promise.resolve({ ok: false, rows: [], status: skipped }));

  /**
   * @param {object} params
   * @param {string} params.query
   * @param {number} [params.max_results=8]
   * @param {string} [params.primary_subject] the report's subject (the section gate passes it)
   * @param {boolean} [params.breadth_retry] true on the gate's breadth retry: the broad Europe PMC form
   * @returns {Promise<{results: object[], sources: object, searched: string}>}
   */
  async function search(params = {}) {
    const query = String(params.query || "").trim();
    if (!query) throw searchError("scholarly search: empty query, nothing to search");
    const max = Math.max(1, Math.min(50, Number(params.max_results) || 8));
    const epmcQuery = europePmcQuery(query, params.primary_subject, { broad: params.breadth_retry === true });
    const epmcUrl = epmcQuery
      ? `${EUROPE_PMC_SEARCH}?${new URLSearchParams({ query: epmcQuery, format: "json", pageSize: String(max), resultType: "lite" })}`
      : null;
    // Twice the rows, because the work-type filter drops grants, reports and the like.
    const crossrefUrl = `${CROSSREF_WORKS}?${new URLSearchParams({ "query.bibliographic": query, rows: String(Math.min(50, max * 2)), select: "DOI,title,container-title,issued,type" })}`;
    const [epmc, crossref] = await Promise.all([
      settle(epmcUrl ? europePmcLeg(epmcUrl) : null, EPMC_SKIPPED),
      settle(crossrefLeg(crossrefUrl))
    ]);
    const sources = { europepmc: epmc.status, crossref: crossref.status };
    if (!epmc.ok && !crossref.ok) {
      throw searchError(`scholarly search unreachable: europepmc: ${epmc.status}; crossref: ${crossref.status}`);
    }
    const results = mergeRows([epmc.rows, crossref.rows], max);
    if (results.length === 0 && !(epmc.ok && crossref.ok)) {
      // One source answered with no hits while the other failed or was skipped: not a genuine zero.
      const [down, up] = epmc.ok ? [["crossref", crossref], "europepmc"] : [["europepmc", epmc], "crossref"];
      throw searchError(`scholarly search incomplete: ${down[0]}: ${down[1].status}; ${up} answered with no hits`);
    }
    return { results, sources, searched: SEARCHED };
  }

  return Object.freeze({ search });
}

module.exports = {
  createScholarlySearch,
  europePmcRows,
  crossrefRows,
  europePmcQuery,
  mergeRows,
  normalizeDoi,
  PREPRINT_DOI_PREFIXES,
  SEARCHED
};
