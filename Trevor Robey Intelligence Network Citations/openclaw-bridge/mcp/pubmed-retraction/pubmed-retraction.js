"use strict";

// pubmed-retraction.js — PMID retraction screen. Companion to crossref-retraction.js.
//
// Why this exists (verified live 2026-07-10). The Crossref screen only sees cited DOIs, and
// Crossref's structured retraction signal is INCONSISTENT across records:
//   * 10.1016/S0140-6736(20)31180-6 (Surgisphere, retracted 2020) → `update-to: [retraction]`  ✅ caught
//   * 10.1016/S0140-6736(97)11096-0 (Wakefield, retracted 2010)   → `relation: {}`, no update-to ❌ MISSED
// The publisher never back-deposited the update relation on the older record, so the DOI screen
// scores the most notorious retraction in medicine as clean. PubMed curates this properly and
// marks that record `Retracted Publication`.
//
// Separately, many biomedical citations carry a PMID and NO DOI at all (e.g. GeneReviews,
// PMID 20301295) — those can never reach the DOI screen at all.
//
// Fail-soft by construction, exactly like crossref-retraction.js: a network error, non-200, or
// unparseable body yields `checked:false` + `retracted:false` (NEVER a false "retracted"), so
// E-utilities being unreachable can never wrongly block a report.

const { createNcbiPacing } = require("../../core/ncbi-pacing.js");

const EUTILS_ESUMMARY = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi";
const EUTILS_ESEARCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi";

// EXACT-MATCH RULE — do NOT loosen this to /retract/i. PubMed uses distinct publication types:
//   "Retracted Publication" → the article that WAS retracted        → retracted: true
//   "Retraction Notice"     → the notice announcing the retraction  → retracted: false
// A report may legitimately cite the notice (e.g. PMID 20137807, pubtype ["Retraction Notice"])
// while explaining that a paper was withdrawn. A substring match on "retract" would flag that
// notice and hard-fail a correct report — precisely the false-retraction this gate must never emit.
const RETRACTED_PUBTYPE = "retracted publication";

// The notice ANNOUNCING a retraction. Citing it is legitimate and must NEVER be flagged as a
// retracted paper. PubMed's pubtype is the ONLY reliable notice-vs-retracted discriminator —
// Crossref's `update-to: [retraction]` is ambiguous (it appears on both the Surgisphere original
// retracted paper AND the Wakefield retraction notice; verified live 2026-07-10). So the notice
// signal from here is what disambiguates a Crossref flag.
const RETRACTION_NOTICE_PUBTYPE = "retraction notice";

// T2-2 (2026-11-16): editorial notices PubMed records only as a docsum REFERENCE type (verified live
// 2026-11-15, tests/fixtures/registry-probe-2026-11-15/). A paper under an expression of concern keeps its
// publication type and carries "Expression of concern in". "Retraction in" on a record WITHOUT the
// "Retracted Publication" type may be a partial retraction or an update not yet made, and PubMed marks
// neither apart (no publication type and no filter for a partial retraction: the 2026-11-16 probe), so it
// is flagged in the ledger and never blocks (operator default D14). With the publication type, the record
// is retracted and blocks as before. Exact matches, never a regex.
const EXPRESSION_OF_CONCERN_REFTYPE = "expression of concern in";
const RETRACTION_IN_REFTYPE = "retraction in";

function editorialReftypes(rec, retracted) {
  const types = new Set((Array.isArray(rec && rec.references) ? rec.references : [])
    .map((r) => String((r && r.reftype) || "").trim().toLowerCase()));
  const out = [];
  if (types.has(EXPRESSION_OF_CONCERN_REFTYPE)) out.push("expression_of_concern");
  if (types.has(RETRACTION_IN_REFTYPE) && retracted !== true) out.push("pubmed_retraction_link");
  return out;
}

// esummary accepts a comma-separated id list; 100 keeps the URL short and the request count low.
const MAX_IDS_PER_REQUEST = 100;

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

// true = retracted, false = not retracted, null = shape unknown (caller must treat as UNCHECKED).
function isRetractedPubtype(pubtype) {
  if (!Array.isArray(pubtype)) return null;
  return pubtype.some((p) => String(p).trim().toLowerCase() === RETRACTED_PUBTYPE);
}

// true = this record is a retraction NOTICE, false = not, null = shape unknown. Exact match, for
// the same reason as isRetractedPubtype — never a substring test on "retract".
function isNoticePubtype(pubtype) {
  if (!Array.isArray(pubtype)) return null;
  return pubtype.some((p) => String(p).trim().toLowerCase() === RETRACTION_NOTICE_PUBTYPE);
}

function createPubmedRetraction(options = {}) {
  const logger = options.logger && typeof options.logger.warn === "function"
    ? options.logger
    : { info() {}, warn() {}, error() {} };
  const fetchImpl = options.fetchImpl || (typeof fetch === "function" ? fetch : null);
  const timeoutMs = Number(options.timeoutMs) || 15_000;
  const contactEmail = options.contactEmail || "trevor@trevorobeyinc.com";
  const ncbiApiKey = options.ncbiApiKey || "";
  const batchSize = Math.min(Number(options.batchSize) || MAX_IDS_PER_REQUEST, MAX_IDS_PER_REQUEST);

  // NCBI politeness — pacing across ALL eutils requests (esummary + esearch) plus ONE retry on a 429 — lives in
  // core/ncbi-pacing.js, shared with citation-reresolver.js (options: `minRequestIntervalMs`, `maxRetryAfterMs`, and
  // the injectable `nowMs`/`sleep`; production wiring in _workflow-runtime.js sets the interval from NCBI_API_KEY
  // presence). This module's sequential loops (esearch per DOI, esummary per batch) would otherwise burst well over
  // 3 req/sec and draw 429s — fail-soft here, but a rate-limited run silently degrades the escalation to
  // `checked:false` ("INCOMPLETE" in the manifest) instead of actually screening. NCBI also answers an occasional 429
  // under the limit (verified live 2026-10-08: 2 of the 21 DOI lookups of the first real dispatch-lane run, at the
  // production 350 ms spacing); one 429 used to leave a DOI unresolved or a whole esummary batch unchecked on a clean
  // report. A second 429 or a Retry-After beyond the cap stays fail-soft exactly as before: `checked:false`, never a
  // false "retracted" and never a false "clean".
  const ncbiPacing = createNcbiPacing({
    nowMs: options.nowMs,
    sleep: options.sleep,
    minRequestIntervalMs: options.minRequestIntervalMs,
    maxRetryAfterMs: options.maxRetryAfterMs
  });

  // One unpaced attempt: bounded by timeoutMs, and the JSON body (present only on an ok response) is parsed inside the
  // same timer. Throws on transport failure; callers fail soft.
  async function eutilsRequest(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, {
        signal: controller.signal,
        headers: { "User-Agent": `TRINC/1.0 (mailto:${contactEmail})`, Accept: "application/json" }
      });
      const body = res && res.ok ? await res.json() : undefined;
      return { res, body };
    } finally {
      clearTimeout(timer);
    }
  }

  // eutilsRequest, paced, plus the single 429 retry.
  async function eutilsGet(url) {
    const { out } = await ncbiPacing.request(() => eutilsRequest(url), (result) => result.res);
    return out;
  }

  function unchecked(pmid) {
    return { pmid: String(pmid), retracted: false, is_notice: false, checked: false };
  }

  // Returns the esummary `result` object, or null on ANY non-definitive outcome (fail-soft).
  async function fetchBatch(ids) {
    const keyParam = ncbiApiKey ? `&api_key=${encodeURIComponent(ncbiApiKey)}` : "";
    const url = `${EUTILS_ESUMMARY}?db=pubmed&id=${ids.map((i) => encodeURIComponent(i)).join(",")}`
      + `&retmode=json&tool=TRINC-pubmed-retraction&email=${encodeURIComponent(contactEmail)}${keyParam}`;
    try {
      const { res, body } = await eutilsGet(url);
      if (!res || !res.ok) {
        logger.warn({ event: "pubmed_retraction_check_failed", status: res && res.status, ids: ids.length });
        return null;
      }
      const result = body && body.result;
      if (!result || typeof result !== "object") return null;
      return result;
    } catch (err) {
      logger.warn({ event: "pubmed_retraction_check_failed", ids: ids.length, error: String(err && err.message) });
      return null;
    }
  }

  // Batched + fail-soft per PMID. One esummary request per `batchSize` ids.
  async function checkPmids(pmids) {
    const list = Array.isArray(pmids)
      ? [...new Set(pmids.map((p) => String(p).trim()).filter(Boolean))]
      : [];
    if (list.length === 0) return [];
    if (typeof fetchImpl !== "function") return list.map((id) => unchecked(id));

    const out = [];
    for (const batch of chunk(list, batchSize)) {
      const result = await fetchBatch(batch);
      if (!result) {
        for (const id of batch) out.push(unchecked(id));
        continue;
      }
      for (const id of batch) {
        const rec = result[String(id)];
        if (!rec) { out.push(unchecked(id)); continue; }
        // esummary answers `{ uid, error: "cannot get document summary" }` for ids not in PubMed.
        // That is a definitive "not a retracted PubMed record". Non-existence is a fabrication
        // signal, but it is the RE-RESOLVER's job to surface it (UNRESOLVED) — this screen must
        // not double-report it, and must never turn it into a retraction.
        if (rec.error) { out.push({ pmid: String(id), retracted: false, is_notice: false, checked: true }); continue; }
        const verdict = isRetractedPubtype(rec.pubtype);
        if (verdict === null) { out.push(unchecked(id)); continue; }
        // T2-2: present only when PubMed records an editorial notice, so every other row is unchanged.
        const editorial = editorialReftypes(rec, verdict);
        out.push({
          pmid: String(id),
          retracted: verdict,
          is_notice: isNoticePubtype(rec.pubtype) === true,
          checked: true,
          title: String(rec.title || ""),
          ...(editorial.length > 0 ? { editorial } : {})
        });
      }
    }
    return out;
  }

  // DOI → PMID reverse lookup via E-utilities esearch on the Article-ID (`[AID]`) field.
  //
  // Why (verified live 2026-07-10). Crossref's structured retraction signal (`relation`/`update-to`)
  // is absent on some older retracted records — e.g. 10.1016/S0140-6736(97)11096-0 (Wakefield 1998,
  // retracted 2010) returns `relation:{}` — so the DOI-only screen scores it clean. PubMed marks the
  // same record `Retracted Publication`. Resolving a cited DOI to its PMID lets the (authoritative)
  // PubMed screen catch what Crossref missed. `[AID]` is an exact article-id match; verified to
  // return the right PMID for real DOIs and zero results for a garbage DOI.
  //
  // Fail-soft: a DOI that errors, times out, or maps to no PubMed record simply yields no PMID for
  // that DOI (it is omitted from the result) — never a throw, never a fabricated mapping. Sequential
  // (one esearch in flight) to stay inside NCBI's polite-use limits; the reresolver, which also hits
  // eutils, runs in a LATER workflow slice, so the two never hammer NCBI concurrently.
  async function resolveOneDoiToPmids(doi) {
    const clean = String(doi || "").trim();
    if (!clean || typeof fetchImpl !== "function") return { doi: clean, pmids: [], resolved: false };
    const keyParam = ncbiApiKey ? `&api_key=${encodeURIComponent(ncbiApiKey)}` : "";
    const url = `${EUTILS_ESEARCH}?db=pubmed&term=${encodeURIComponent(clean)}%5BAID%5D`
      + `&retmode=json&tool=TRINC-pubmed-retraction&email=${encodeURIComponent(contactEmail)}${keyParam}`;
    try {
      const { res, body } = await eutilsGet(url);
      if (!res || !res.ok) {
        logger.warn({ event: "pubmed_doi_resolve_failed", status: res && res.status, doi: clean });
        return { doi: clean, pmids: [], resolved: false };
      }
      const idlist = body && body.esearchresult && body.esearchresult.idlist;
      if (!Array.isArray(idlist)) return { doi: clean, pmids: [], resolved: false };
      // `resolved:true` = the lookup DEFINITIVELY ran (even if it returned zero PMIDs, i.e. the DOI
      // is not in PubMed). Only a transport failure is `resolved:false`.
      return { doi: clean, pmids: idlist.map((x) => String(x)), resolved: true };
    } catch (err) {
      logger.warn({ event: "pubmed_doi_resolve_failed", doi: clean, error: String(err && err.message) });
      return { doi: clean, pmids: [], resolved: false };
    }
  }

  // Sequential, fail-soft. Returns one row per input DOI: { doi, pmids, resolved }.
  async function resolveDoisToPmids(dois) {
    const list = Array.isArray(dois)
      ? [...new Set(dois.map((d) => String(d).trim()).filter(Boolean))]
      : [];
    if (list.length === 0) return [];
    if (typeof fetchImpl !== "function") return list.map((doi) => ({ doi, pmids: [], resolved: false }));
    const out = [];
    for (const doi of list) out.push(await resolveOneDoiToPmids(doi));
    return out;
  }

  // T2-16 (2026-11-16): PMCID → the PMID and DOI its PMC record lists, so the gate can screen a cited
  // PMCID through PubMed (or, with no PMID, Crossref). esummary db=pmc, batched and paced like every
  // eutils call. One row per input PMCID: { pmcid, pmid, doi, resolved, in_pmc }. `resolved:false` is a
  // transport failure (fail-soft, never a fabricated mapping); `in_pmc:false` is PMC's definitive
  // "cannot get document summary" (verified live 2026-11-15, tests/fixtures/registry-probe-2026-11-15/).
  async function resolvePmcidsToIds(pmcids) {
    const list = Array.isArray(pmcids)
      ? [...new Set(pmcids.map((p) => String(p).trim().toUpperCase()).filter((p) => /^PMC\d{1,9}$/.test(p)))]
      : [];
    if (list.length === 0) return [];
    const none = (pmcid) => ({ pmcid, pmid: null, doi: null, resolved: false, in_pmc: null });
    if (typeof fetchImpl !== "function") return list.map(none);
    const keyParam = ncbiApiKey ? `&api_key=${encodeURIComponent(ncbiApiKey)}` : "";
    const out = [];
    for (const batch of chunk(list, batchSize)) {
      const url = `${EUTILS_ESUMMARY}?db=pmc&id=${batch.map((p) => p.slice(3)).join(",")}`
        + `&retmode=json&tool=TRINC-pubmed-retraction&email=${encodeURIComponent(contactEmail)}${keyParam}`;
      let result = null;
      try {
        const { res, body } = await eutilsGet(url);
        if (res && res.ok && body && body.result && typeof body.result === "object") result = body.result;
        else logger.warn({ event: "pmc_id_resolve_failed", status: res && res.status, ids: batch.length });
      } catch (err) {
        logger.warn({ event: "pmc_id_resolve_failed", ids: batch.length, error: String(err && err.message) });
      }
      for (const pmcid of batch) {
        const rec = result && result[pmcid.slice(3)];
        if (!rec) { out.push(none(pmcid)); continue; }
        if (rec.error) { out.push({ pmcid, pmid: null, doi: null, resolved: true, in_pmc: false }); continue; }
        const ids = Array.isArray(rec.articleids) ? rec.articleids : [];
        const value = (type) => {
          const a = ids.find((x) => x && x.idtype === type && x.value);
          return a ? String(a.value).trim() : null;
        };
        const pmid = value("pmid");
        out.push({ pmcid, pmid: pmid && /^[1-9]\d{0,9}$/.test(pmid) ? pmid : null, doi: value("doi"), resolved: true, in_pmc: true });
      }
    }
    return out;
  }

  async function checkPmid(pmid) {
    const [r] = await checkPmids([pmid]);
    return r || unchecked(pmid);
  }

  return Object.freeze({ checkPmid, checkPmids, resolveDoisToPmids, resolvePmcidsToIds });
}

module.exports = {
  createPubmedRetraction,
  editorialReftypes,
  isRetractedPubtype,
  isNoticePubtype,
  RETRACTED_PUBTYPE,
  RETRACTION_NOTICE_PUBTYPE
};
