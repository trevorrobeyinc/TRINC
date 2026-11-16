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
// Failure contract (the section gate depends on it):
//   * BOTH sources failing (network error, timeout, non-2xx) throws, so the gate marks the section
//     UNCHECKED (infra) and never fails it on that basis;
//   * one source failing still returns the other source's rows;
//   * both answering with no hits returns [] — a genuine zero, which the gate fails closed on.
// Deterministic for the same responses: no wall-clock or RNG globals (forbidden under openclaw-bridge/).

const EUROPE_PMC_SEARCH = "https://www.ebi.ac.uk/europepmc/webservices/rest/search";
const CROSSREF_WORKS = "https://api.crossref.org/works";

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
const EPMC_SOURCES = "(SRC:MED OR SRC:PPR)";
function cleanTerm(s) {
  return String(s || "").replace(/["()\\]/g, " ").replace(/\s+/g, " ").trim();
}
function europePmcQuery(query, subject) {
  const subj = cleanTerm(subject);
  const text = cleanTerm(query);
  const rest = subj && text.toLowerCase().startsWith(subj.toLowerCase())
    ? text.slice(subj.length)
    : subj
      ? text.split(" ").filter((w) => !subj.toLowerCase().split(" ").includes(w.toLowerCase())).join(" ")
      : text;
  const terms = [...new Set(rest.split(" ").filter((w) => w.length >= 3).map((w) => w.toLowerCase()))].slice(0, 8);
  const anyTerm = terms.length ? `(${terms.map((t) => `TITLE_ABS:"${t}"`).join(" OR ")})` : "";
  if (subj && anyTerm) return `TITLE_ABS:"${subj}" AND ${anyTerm} AND ${EPMC_SOURCES}`;
  if (subj) return `TITLE_ABS:"${subj}" AND ${EPMC_SOURCES}`;
  if (anyTerm) return `${anyTerm} AND ${EPMC_SOURCES}`;
  return "";
}

// Crossref record types that are a citable work. Crossref's relevance search also returns grants
// (untitled), "report" items (news pieces), peer-review records and datasets for the same words.
const CROSSREF_WORK_TYPES = new Set(["journal-article", "posted-content", "proceedings-article", "book-chapter"]);

// Europe PMC "lite" hits → gate rows. A PubMed id links to its PubMed record; otherwise a DOI to doi.org;
// otherwise the Europe PMC article page.
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
    const url = pmid
      ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`
      : doi
        ? `https://doi.org/${doi}`
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

function createScholarlySearch(options = {}) {
  const httpImpl = options.httpImpl || (typeof fetch === "function" ? fetch : null);
  const timeoutMs = Number(options.timeoutMs) || 15_000;
  // A generic client name on purpose: no business name or contact address goes out with a search
  // (Crossref then answers from its public pool, which is plenty for one search per section).
  const userAgent = String(options.userAgent || "scholarly-search/1.0");

  async function getJson(url) {
    if (typeof httpImpl !== "function") throw new Error("no HTTP client available");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await httpImpl(url, { signal: controller.signal, headers: { Accept: "application/json", "User-Agent": userAgent } });
      if (!res || !res.ok) throw new Error(`HTTP ${res ? res.status : "no response"}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * @param {object} params
   * @param {string} params.query
   * @param {number} [params.max_results=8]
   * @param {string} [params.primary_subject] the report's subject (the section gate passes it)
   * @returns {Promise<{results: object[], sources: object}>}
   */
  async function search(params = {}) {
    const query = String(params.query || "").trim();
    const max = Math.max(1, Math.min(50, Number(params.max_results) || 8));
    const epmcQuery = europePmcQuery(query, params.primary_subject);
    if (!query || !epmcQuery) return { results: [], sources: {} };
    const epmcUrl = `${EUROPE_PMC_SEARCH}?${new URLSearchParams({ query: epmcQuery, format: "json", pageSize: String(max), resultType: "lite" })}`;
    // Twice the rows, because the work-type filter drops grants, news items and the like.
    const crossrefUrl = `${CROSSREF_WORKS}?${new URLSearchParams({ "query.bibliographic": query, rows: String(Math.min(50, max * 2)), select: "DOI,title,container-title,issued,type" })}`;
    const [epmc, crossref] = await Promise.allSettled([getJson(epmcUrl), getJson(crossrefUrl)]);
    if (epmc.status === "rejected" && crossref.status === "rejected") {
      throw new Error(`scholarly search unreachable: europepmc: ${String(epmc.reason && epmc.reason.message)}; crossref: ${String(crossref.reason && crossref.reason.message)}`);
    }
    const lists = [
      epmc.status === "fulfilled" ? europePmcRows(epmc.value) : [],
      crossref.status === "fulfilled" ? crossrefRows(crossref.value) : []
    ];
    return {
      results: mergeRows(lists, max),
      sources: {
        europepmc: epmc.status === "fulfilled" ? "ok" : String(epmc.reason && epmc.reason.message),
        crossref: crossref.status === "fulfilled" ? "ok" : String(crossref.reason && crossref.reason.message)
      }
    };
  }

  return Object.freeze({ search });
}

module.exports = { createScholarlySearch, europePmcRows, crossrefRows, europePmcQuery, mergeRows, normalizeDoi, PREPRINT_DOI_PREFIXES };
