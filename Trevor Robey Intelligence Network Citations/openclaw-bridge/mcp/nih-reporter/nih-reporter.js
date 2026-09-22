"use strict";

// nih-reporter.js — local fetcher for the NIH RePORTER v2 API (2026-09-19).
//
// WHY THIS EXISTS. A name search across all 2,116 ToolUniverse tools returns ZERO NIH grant
// coverage, and the connector registry has no entry for it. The signal it adds is orthogonal to
// every literature and trial source already wired: who is funding work in this indication, at
// which institutions, for how much, and for how long. For an Investor Pre-Mortem that is the
// "is anyone else serious about this target" question; for a competitive landscape it names the
// academic labs a sponsor will be bidding against for the same investigators.
//
// ── CONTEXT-ONLY, BY DESIGN — this cannot move the grounded-citation ratio ────────────────────
// NIH project numbers (5R01NS127824-04) are NOT in citation-extractor.js's grammar, and every
// pattern there requires a literal prefix (PMID/CID/NCT/UniProt/CHEMBL/DB/doi:), so a project
// number cannot be mis-captured as one — verified by reading the patterns, not assumed. So these
// records inform the analyst without entering the citation gate's denominator, and they never
// reach the Stage-3 re-resolver (which knows PMID/DOI/NCT/ChEMBL/PubChem/RxNorm/UniProt only,
// and where an unknown id type risks UNRESOLVED → a hard BLOCK). Identifiers that appear inside
// a project ABSTRACT are extracted normally by the agent-engine's grounded-id pass, which is
// correct — the abstract genuinely cited them. See sec-edgar.js for the same reasoning.
//
// ── MEASURED FACTS (2026-09-19, api.reporter.nih.gov v2) ─────────────────────────────────────
// • The endpoint is POST-only. A GET returns HTTP 405, which reads like an outage but is not.
// • `meta.total` is the true denominator (9,347 for a plain "glioblastoma" title+abstract search)
//   while `results` is one page — so results.length is a page size, never a population count.
// • Records carry `project_detail_url` ready-made; do NOT construct a reporter.nih.gov URL.
// • `abstract_text` is the full project abstract — hundreds to thousands of characters. It is
//   TRUNCATED here because these records are rendered into an agent prompt, where size is cost.
// • `include_fields` is deliberately NOT used. It takes PascalCase names while responses come
//   back snake_case, so a single mistyped name would 400 the call — and because this fetcher is
//   fail-soft, that would show up as a silent capability loss rather than an error. Trimming
//   happens client-side instead, where a wrong field name degrades to a missing line.
//
// Fail-soft like every sibling fetcher: any network/parse error returns [] and the run continues.

const REPORTER_SEARCH = "https://api.reporter.nih.gov/v2/projects/search";

const DEFAULT_CONTACT = "trevor@trevorobeyinc.com";
const DEFAULT_ORG = "Trevor Robey Intelligence Network Citations LLC";

// PROMPT-path clamps — same reasoning as ctgov-supplemental's PROMPT_MAX_PAGE_SIZE. There is no
// census mode: nothing downstream renders a funding deliverable.
const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 25;
// Abstracts are the bulk of the payload. 900 chars keeps the scientific aim and drops the
// boilerplate tail; 6 records then cost roughly 1.5K tokens against a ~300K template budget.
const ABSTRACT_CHARS = 900;

// Indication arrives under a different key on almost every workflow template, exactly as
// ctgov-supplemental documents. Bind all of them or this source silently starves on most runs.
const SUBJECT_KEYS = [
  "query_subject",
  "indication",
  "disease_name",
  "disease_context",
  "therapeutic_area",
  "target_gene",
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

function usd(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return "";
  return `$${n.toLocaleString("en-US")}`;
}

/** "2023-09-01T00:00:00" → "2023-09-01". Returns "" for anything unparseable. */
function isoDay(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  const m = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}

function contactPi(record) {
  if (typeof record.contact_pi_name === "string" && record.contact_pi_name.trim()) {
    return record.contact_pi_name.trim();
  }
  const pis = Array.isArray(record.principal_investigators) ? record.principal_investigators : [];
  const contact = pis.find((p) => p && p.is_contact_pi) || pis[0];
  if (!contact) return "";
  const full = typeof contact.full_name === "string" ? contact.full_name.trim() : "";
  if (full) return full;
  return [contact.first_name, contact.last_name].filter(Boolean).join(" ").trim();
}

function createNihReporter(options = {}) {
  const logger =
    options.logger && typeof options.logger.warn === "function"
      ? options.logger
      : { info() {}, warn() {}, error() {} };
  const fetchImpl = options.fetchImpl || (typeof fetch === "function" ? fetch : null);
  const timeoutMs = Number(options.timeoutMs) || 20_000;
  const contactEmail = options.contactEmail || DEFAULT_CONTACT;
  const org = options.org || DEFAULT_ORG;
  const cache = new Map();

  async function postJson(url, body) {
    if (typeof fetchImpl !== "function") throw new Error("no fetch implementation available");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": `${org} ${contactEmail}`
        },
        body: JSON.stringify(body)
      });
      if (!res || !res.ok) throw new Error(`HTTP ${res ? res.status : "no-response"}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Search NIH-funded projects by indication / target / topic.
   *
   * @param {object} args
   * @param {string} [args.search_text]   Verbatim search text. Wins over the subject keys.
   * @param {number} [args.limit]         Records to return; clamped to MAX_LIMIT.
   * @param {number[]} [args.fiscalYears] Restrict to these fiscal years (e.g. [2025, 2026]).
   * @param {boolean} [args.activeOnly]   Only currently-active projects.
   * @returns {Promise<Array<object>>} [] on ANY error — never throws.
   */
  async function searchFunding(args = {}) {
    const explicit = typeof args.search_text === "string" ? args.search_text.trim() : "";
    const subject = explicit || firstNonEmpty(args, SUBJECT_KEYS);
    if (!subject) {
      logger.info({ event: "nih_reporter_no_subject", note: "no search_text or subject key supplied — skipped" });
      return [];
    }

    const limit = Math.max(1, Math.min(Number(args.limit) || DEFAULT_LIMIT, MAX_LIMIT));
    const years = Array.isArray(args.fiscalYears)
      ? args.fiscalYears.map(Number).filter(Number.isFinite)
      : [];

    const cacheKey = JSON.stringify({ subject, limit, years, activeOnly: !!args.activeOnly });
    if (cache.has(cacheKey)) return cache.get(cacheKey);

    const criteria = {
      advanced_text_search: {
        operator: "and",
        search_field: "projecttitle,abstracttext",
        search_text: subject
      }
    };
    if (years.length) criteria.fiscal_years = years;
    if (args.activeOnly) criteria.is_active = true;

    let data;
    try {
      data = await postJson(REPORTER_SEARCH, { criteria, limit, offset: 0 });
    } catch (err) {
      logger.warn({ event: "nih_reporter_search_failed", subject, error: String(err && err.message) });
      return [];
    }

    const rows = data && Array.isArray(data.results) ? data.results : [];
    const totalMatched =
      data && data.meta && Number.isFinite(data.meta.total) ? data.meta.total : null;

    const records = [];
    for (const row of rows.slice(0, limit)) {
      if (!row || typeof row !== "object") continue;
      const orgName =
        row.organization && typeof row.organization.org_name === "string"
          ? row.organization.org_name.trim()
          : "";
      const ic =
        row.agency_ic_admin && typeof row.agency_ic_admin.abbreviation === "string"
          ? row.agency_ic_admin.abbreviation
          : "";
      const start = isoDay(row.project_start_date);
      const end = isoDay(row.project_end_date);

      const detail = [
        orgName,
        contactPi(row) ? `PI: ${contactPi(row)}` : "",
        usd(row.award_amount) ? `FY${row.fiscal_year || "?"} award ${usd(row.award_amount)}` : "",
        ic ? `Funding IC: ${ic}` : "",
        start && end ? `Project period ${start} to ${end}` : "",
        typeof row.project_num === "string" && row.project_num ? `Project ${row.project_num}` : ""
      ].filter(Boolean);

      const abstractText =
        typeof row.abstract_text === "string" && row.abstract_text.trim()
          ? row.abstract_text.trim().replace(/\s+/g, " ").slice(0, ABSTRACT_CHARS)
          : "";

      // tool-prefetch.js renderRecord emits `abstract` BEFORE `description`. For a funding
      // record the decision-relevant facts are the institution, PI and award size, not the
      // science summary — so they are folded into the head of `abstract` and `description` is
      // left unset. Putting them in `description` would bury them under ~900 chars of abstract
      // and make them the first thing lost to any downstream truncation.
      const head = detail.join(" · ");
      const abstract = [head, abstractText].filter(Boolean).join("\n");

      records.push({
        title: typeof row.project_title === "string" ? row.project_title.trim() : "Untitled project",
        year: row.fiscal_year ? String(row.fiscal_year) : "",
        abstract,
        url: typeof row.project_detail_url === "string" ? row.project_detail_url : "",
        // Context fields, deliberately NOT citation identifiers (see the header note).
        projectNum: typeof row.project_num === "string" ? row.project_num : "",
        organization: orgName,
        awardAmount: Number.isFinite(Number(row.award_amount)) ? Number(row.award_amount) : null,
        fiscalYear: row.fiscal_year || null,
        fundingIc: ic
      });
    }

    logger.info({
      event: "nih_reporter_search_completed",
      subject,
      returned: records.length,
      total_matched: totalMatched
    });

    // Non-enumerable so it never serializes as an array element (same convention as
    // ctgov-supplemental). `total_matched` is the population; records.length is one page.
    Object.defineProperty(records, "totalMatched", {
      value: totalMatched,
      enumerable: false,
      configurable: true
    });
    Object.defineProperty(records, "subject", { value: subject, enumerable: false, configurable: true });

    cache.set(cacheKey, records);
    return records;
  }

  return Object.freeze({ searchFunding });
}

module.exports = {
  createNihReporter,
  contactPi,
  isoDay,
  usd,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  ABSTRACT_CHARS,
  SUBJECT_KEYS
};
