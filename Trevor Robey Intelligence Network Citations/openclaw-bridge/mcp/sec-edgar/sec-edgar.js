"use strict";

// sec-edgar.js — local fetcher for SEC EDGAR full-text search (2026-09-19).
//
// WHY THIS EXISTS. `gate.config.js` has listed `sec.gov` in `primary_source_domains` since
// 2026-07-07 — the grading layer was built expecting EDGAR — but nothing ever fetched it, and a
// name search across all 2,116 ToolUniverse tools returns ZERO SEC/EDGAR coverage. This closes
// that gap. The signal it adds is one no biomedical database carries: a public company's OWN
// disclosure that a program was discontinued, a trial failed, or a partnership was terminated,
// filed under penalty of securities law. That is the primary evidence Investor Pre-Mortem and
// Failed Trial Archaeology are sold on.
//
// ── CONTEXT-ONLY, BY DESIGN — this cannot move the grounded-citation ratio ────────────────────
// SEC accession numbers (0001564590-20-047276) are NOT in citation-extractor.js's grammar, and
// every pattern there requires a literal prefix (PMID/CID/NCT/UniProt/CHEMBL/DB/doi:), so a bare
// accession number cannot be mis-captured as one — verified by reading the patterns, not assumed.
// Consequences, all deliberate:
//   • These records add context the analyst can read and point at; they never enter the citation
//     gate's denominator, so they CANNOT lower the grounded ratio (the failure mode that would
//     have made "more sources" mean "worse grade").
//   • They never reach the Stage-3 re-resolver, which knows PMID/DOI/NCT/ChEMBL/PubChem/RxNorm/
//     UniProt only. An unknown id type there risks UNRESOLVED, which is a hard BLOCK — so
//     extending the grammar would mean extending the resolver in the same change. Deferred.
//   • Any NCT/PMID/DOI that appears in the rendered text of a filing IS extracted normally by the
//     agent-engine's grounded-id pass. That is correct: the filing genuinely referenced it.
// If SEC filings should ever count as citable primary sources, that is a deliberate, separate
// change to citation-extractor.js AND citation-reresolver.js — not a tweak here.
//
// ── WHAT EDGAR FULL-TEXT ACTUALLY RETURNS (measured 2026-09-19) ───────────────────────────────
// • NO snippet/highlight field. The hit carries filing metadata only, so a record says WHICH
//   filing matched, not WHAT it said. Do not describe this output as quoting a filing.
// • It does carry `items` — the standardized 8-K item codes — which is real semantic content at
//   zero extra cost: 2.02 is an earnings release, 1.02 a terminated material agreement, 2.05 exit
//   or disposal costs. Those distinguish "mentioned in passing" from "announced a wind-down".
// • Coverage begins 2001; full-text indexing is of the filing documents, not the exhibits' images.
// • `display_names` is pre-formatted as "COMPANY  (TICKER)  (CIK 0000000000)" — parsed here
//   defensively, falling back to the raw string rather than inventing a company name.
//
// Fail-soft like every sibling fetcher: any network/parse error returns [] and the run continues.
// A prefetch source must never break a run.

const SEC_FTS = "https://efts.sec.gov/LATEST/search-index";
const SEC_ARCHIVES = "https://www.sec.gov/Archives/edgar/data";

// SEC fair-access policy requires a declared User-Agent identifying the requester with a contact
// address. This is not optional politeness: undeclared clients get 403'd or rate-limited.
const DEFAULT_CONTACT = "trevor@trevorobeyinc.com";
const DEFAULT_ORG = "Trevor Robey Intelligence Network Citations LLC";

// PROMPT-path clamps. Same reasoning as ctgov-supplemental's PROMPT_MAX_PAGE_SIZE: these records
// are rendered into an agent prompt, so size is cost. There is no census mode here — nothing
// downstream renders an EDGAR deliverable — so one ceiling is enough.
const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 25;

// Standardized 8-K item codes. Only codes whose meaning is fixed by SEC form instructions are
// listed; anything unmapped renders as the bare code rather than an invented label — the same
// never-invent rule the graveyard memo applies to sponsor stop reasons.
const FORM_8K_ITEMS = Object.freeze({
  "1.01": "Entry into a Material Definitive Agreement",
  "1.02": "Termination of a Material Definitive Agreement",
  "1.03": "Bankruptcy or Receivership",
  "2.02": "Results of Operations and Financial Condition",
  "2.05": "Costs Associated with Exit or Disposal Activities",
  "2.06": "Material Impairments",
  "3.01": "Notice of Delisting or Failure to Satisfy a Listing Rule",
  "5.02": "Departure or Election of Directors or Principal Officers",
  "7.01": "Regulation FD Disclosure",
  "8.01": "Other Events",
  "9.01": "Financial Statements and Exhibits"
});

// Indication arrives under a different key on almost every workflow template, exactly as
// ctgov-supplemental documents. Bind all of them or this source silently starves on most runs.
const SUBJECT_KEYS = [
  "query_subject",
  "indication",
  "disease_name",
  "disease_context",
  "therapeutic_area",
  "compound_name",
  "drug_class",
  "topic"
];

function firstNonEmpty(args, keys) {
  for (const key of keys) {
    const value = args && args[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

/** "PLUS THERAPEUTICS, INC.  (PSTV)  (CIK 0001095981)" → {company, ticker, cik}. */
function parseDisplayName(raw) {
  const text = typeof raw === "string" ? raw : "";
  if (!text) return { company: "", ticker: "", cik: "" };
  const ticker = (text.match(/\(([A-Z.\-]{1,10})\)\s*\(CIK/) || [])[1] || "";
  const cik = (text.match(/\(CIK\s*(\d{1,10})\)/i) || [])[1] || "";
  // Company name is everything before the first parenthesised group; fall back to the raw string
  // so a format change degrades to "shows too much" rather than "shows a wrong name".
  const company = (text.split(/\s{2,}\(|\s\(CIK/)[0] || text).trim();
  return { company, ticker, cik };
}

/** Resolvable filing-index URL. Verified 2026-09-19 to return HTTP 200. */
function filingUrl(cik, adsh) {
  const cikNum = String(cik || "").replace(/^0+/, "");
  const bare = String(adsh || "").replace(/-/g, "");
  if (!cikNum || !bare) return "";
  return `${SEC_ARCHIVES}/${cikNum}/${bare}/${adsh}-index.htm`;
}

function describeItems(form, items) {
  if (!Array.isArray(items) || items.length === 0) return "";
  if (String(form).toUpperCase() !== "8-K") return `Items: ${items.join(", ")}`;
  const described = items.map((code) => {
    const label = FORM_8K_ITEMS[String(code)];
    return label ? `${code} (${label})` : String(code);
  });
  return `Items: ${described.join("; ")}`;
}

function createSecEdgar(options = {}) {
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
        headers: {
          // SEC fair-access: org + contact, not a browser impersonation.
          "User-Agent": `${org} ${contactEmail}`,
          Accept: "application/json"
        }
      });
      if (!res || !res.ok) throw new Error(`HTTP ${res ? res.status : "no-response"}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Search EDGAR full text for filings mentioning the workflow's subject.
   *
   * @param {object} args
   * @param {string} [args.query]    Verbatim EDGAR FTS query. Wins over the subject keys.
   * @param {string} [args.terms]    Extra quoted phrase ANDed with the subject (e.g. "discontinued").
   * @param {string} [args.forms]    Comma-separated form types. Default "8-K" (material events).
   * @param {number} [args.limit]    Records to return; clamped to MAX_LIMIT.
   * @param {string} [args.dateFrom] YYYY-MM-DD lower bound (optional).
   * @param {string} [args.dateTo]   YYYY-MM-DD upper bound (optional).
   * @returns {Promise<Array<object>>} [] on ANY error — never throws.
   */
  async function searchDisclosures(args = {}) {
    const explicit = typeof args.query === "string" ? args.query.trim() : "";
    const subject = explicit ? "" : firstNonEmpty(args, SUBJECT_KEYS);
    if (!explicit && !subject) {
      logger.info({ event: "sec_edgar_no_subject", note: "no query or subject key supplied — skipped" });
      return [];
    }

    const terms = typeof args.terms === "string" ? args.terms.trim() : "";
    // Query grammar, measured 2026-09-19 against the live endpoint:
    //   • a double-quoted run is a PHRASE; unquoted words are ORed, so a two-word indication
    //     must be quoted or "multiple myeloma" returns everything mentioning "multiple";
    //   • two quoted phrases side by side are ANDed implicitly (2,935 → 155 hits);
    //   • parenthesised OR works: `(discontinued OR terminated)` gave 298 vs 155/175 separately;
    //   • `-"phrase"` negates;
    //   • an over-long phrase matches literally and returns 0 — "glioblastoma trial discontinued"
    //     found nothing while its parts found thousands.
    // The SUBJECT is therefore quoted for us, but `terms` is inserted VERBATIM: quoting it would
    // turn a caller's `(discontinued OR terminated)` into a literal phrase and silently return
    // zero. Callers own their own quoting for `terms`.
    const query = explicit || [`"${subject}"`, terms].filter(Boolean).join(" ");
    const forms = typeof args.forms === "string" && args.forms.trim() ? args.forms.trim() : "8-K";
    const limit = Math.max(1, Math.min(Number(args.limit) || DEFAULT_LIMIT, MAX_LIMIT));

    const cacheKey = JSON.stringify({ query, forms, limit, from: args.dateFrom, to: args.dateTo });
    if (cache.has(cacheKey)) return cache.get(cacheKey);

    const params = new URLSearchParams({ q: query, forms });
    if (args.dateFrom) params.set("startdt", String(args.dateFrom));
    if (args.dateTo) params.set("enddt", String(args.dateTo));

    let data;
    try {
      data = await getJson(`${SEC_FTS}?${params.toString()}`);
    } catch (err) {
      logger.warn({ event: "sec_edgar_search_failed", query, error: String(err && err.message) });
      return [];
    }

    const hits = (data && data.hits && Array.isArray(data.hits.hits)) ? data.hits.hits : [];
    const totalMatched =
      data && data.hits && data.hits.total && Number.isFinite(data.hits.total.value)
        ? data.hits.total.value
        : null;

    const records = [];
    for (const hit of hits.slice(0, limit)) {
      const src = (hit && hit._source) || {};
      const { company, ticker, cik } = parseDisplayName((src.display_names || [])[0]);
      const resolvedCik = cik || (Array.isArray(src.ciks) ? src.ciks[0] : "") || "";
      const adsh = typeof src.adsh === "string" ? src.adsh : "";
      const form = typeof src.form === "string" ? src.form : (src.root_forms || [])[0] || "";
      const fileDate = typeof src.file_date === "string" ? src.file_date : "";

      const detail = [
        company ? `${company}${ticker ? ` (${ticker})` : ""}` : "",
        form ? `Form ${form}` : "",
        src.file_type ? `exhibit ${src.file_type}` : "",
        describeItems(form, src.items),
        Array.isArray(src.biz_locations) && src.biz_locations[0] ? `HQ ${src.biz_locations[0]}` : "",
        resolvedCik ? `CIK ${resolvedCik}` : "",
        adsh ? `Accession ${adsh}` : "",
        // Stated plainly so neither the model nor a reader infers the filing was quoted.
        "(EDGAR full-text search returns filing metadata only — open the filing for the matching text.)"
      ].filter(Boolean);

      records.push({
        title: `${company || "Unknown filer"}${ticker ? ` (${ticker})` : ""} — ${form || "filing"}, ${fileDate || "undated"}`,
        year: fileDate ? fileDate.slice(0, 4) : "",
        status: form || "",
        description: detail.join(" · "),
        url: filingUrl(resolvedCik, adsh),
        // Context fields, deliberately NOT citation identifiers (see the header note).
        accessionNumber: adsh,
        cik: resolvedCik,
        ticker,
        company,
        formType: form,
        formItems: Array.isArray(src.items) ? src.items : [],
        fileDate
      });
    }

    logger.info({
      event: "sec_edgar_search_completed",
      query,
      forms,
      returned: records.length,
      total_matched: totalMatched
    });

    // Non-enumerable so it never serializes as an array element (same convention as
    // ctgov-supplemental's provenance metadata) — callers that want the denominator can read it.
    Object.defineProperty(records, "totalMatched", {
      value: totalMatched,
      enumerable: false,
      configurable: true
    });
    Object.defineProperty(records, "query", { value: query, enumerable: false, configurable: true });

    cache.set(cacheKey, records);
    return records;
  }

  return Object.freeze({ searchDisclosures });
}

module.exports = {
  createSecEdgar,
  parseDisplayName,
  filingUrl,
  describeItems,
  FORM_8K_ITEMS,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  SUBJECT_KEYS
};
