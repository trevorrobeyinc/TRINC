"use strict";

// sec-filings.js — business-lane wrapper that makes SEC EDGAR filings CITABLE (2026-10-21).
//
// mcp/sec-edgar/sec-edgar.js is deliberately context-only on the biomedical lane: its records say
// "Accession 0001…", which no extractor pattern captures. Its header names the condition for
// making filings citable: "a deliberate, separate change to citation-extractor.js AND
// citation-reresolver.js". This is that change, scoped to the business lane: the same search,
// re-rendered with an `SEC: <CIK>/<accession>` line that the extractor grounds and the re-resolver
// checks against the filing's EDGAR index. The biomedical fetcher is untouched.

const BUSINESS_SUBJECT_KEYS = ["company", "query", "question", "topic", "industry", "market"];

function firstNonEmpty(args, keys) {
  for (const key of keys) {
    const value = args && args[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function createSecFilings(options = {}) {
  const secEdgar = options.secEdgar;
  const logger =
    options.logger && typeof options.logger.warn === "function"
      ? options.logger
      : { info() {}, warn() {}, error() {} };

  /**
   * @param {object} args  as sec-edgar searchDisclosures, plus the business subject keys
   * @returns {Promise<Array<object>>} [] on ANY error — never throws.
   */
  async function searchCitable(args = {}) {
    if (!secEdgar || typeof secEdgar.searchDisclosures !== "function") return [];
    const explicit = typeof args.query === "string" ? args.query.trim() : "";
    const subject = explicit || firstNonEmpty(args, BUSINESS_SUBJECT_KEYS);
    if (!subject) return [];
    let records;
    try {
      records = await secEdgar.searchDisclosures({
        query: `"${subject.replace(/"/g, "")}"${args.terms ? ` ${String(args.terms)}` : ""}`,
        forms: args.forms || "10-K,10-Q,8-K",
        limit: args.limit,
        dateFrom: args.dateFrom,
        dateTo: args.dateTo
      });
    } catch (err) {
      logger.warn({ event: "sec_filings_search_failed", subject, error: String(err && err.message) });
      return [];
    }
    const out = [];
    for (const r of Array.isArray(records) ? records : []) {
      const cik = String((r && r.cik) || "").replace(/^0+/, "");
      const adsh = String((r && r.accessionNumber) || "");
      if (!cik || !/^\d{10}-\d{2}-\d{6}$/.test(adsh)) continue; // uncitable without both parts
      out.push({
        title: r.title,
        year: r.year,
        status: r.status,
        text: `SEC: ${cik}/${adsh}\n${r.description || ""}`,
        url: r.url
      });
    }
    return out;
  }

  return Object.freeze({ searchCitable });
}

module.exports = { createSecFilings };
