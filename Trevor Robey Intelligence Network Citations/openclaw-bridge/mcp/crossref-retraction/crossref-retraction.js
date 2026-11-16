"use strict";

// crossref-retraction.js — Slice 2: literature-foundation integrity check (the cost-cutting
// brief's #1 strategy). Given DOIs, asks the Crossref REST API — which carries the Retraction
// Watch dataset, as `updated-by` entries with source "retraction-watch" — whether each has been
// RETRACTED. A citation-traced report must never rest on a retracted paper; the citation gate uses
// this to flag/block such citations.
//
// Fail-soft by construction: a network error or non-200 yields `checked:false` and
// `retracted:false` (NEVER a false "retracted"), so Crossref being unreachable can never wrongly
// block a report. Only an explicit Crossref signal marks a DOI retracted.
//
// WHICH FIELD MEANS WHAT (T1-7, verified live 2026-11-14; tests/fixtures/crossref-probe-2026-11-14/).
// Until this date the screen read only `relation["is-retracted-by"]` and `update-to`, and the probe
// showed both are the wrong place for a retracted paper:
//   * The retracted 1998 Lancet paper (10.1016/S0140-6736(97)11096-0) carries its retraction ONLY in
//     its own `updated-by` (type "retraction", source "retraction-watch"), so it read clean here.
//   * Its 2010 retraction NOTICE (10.1016/S0140-6736(10)60175-4) carries `update-to` type
//     "retraction" naming the 1998 paper, so the notice was flagged as if it were retracted.
// So a DOI is RETRACTED when its own record has `relation["is-retracted-by"]`, an `updated-by` entry
// of type exactly "retraction" from any source, or an in-place retraction: an `update-to` entry of
// type "retraction" that names the work itself (the Surgisphere original's record carries one,
// pubmed-retraction.js:7; an entry naming no work is read the strict way, as retracted). A record
// whose `update-to` retraction names ANOTHER work is a NOTICE (`is_notice`), and that alone never
// trips the block: citing a notice is legitimate. Type matching is exact, never /retract/i:
// partial_retraction, withdrawal and expression_of_concern are recorded in `editorial_updates` for
// the integrity ledger and never block (operator default D3, 2026-11-14).

const CROSSREF = "https://api.crossref.org";
const RETRACTION_TYPE = "retraction";
const EDITORIAL_TYPES = new Set(["partial_retraction", "withdrawal", "expression_of_concern"]);

function updateType(u) {
  return String((u && u.type) || "").trim();
}
function updateTarget(u) {
  return String((u && (u.DOI || u.doi || u.id)) || "").trim().toLowerCase();
}
function updateDate(u) {
  const d = u && u.updated;
  return (d && (d["date-time"] || (Array.isArray(d["date-parts"]) && d["date-parts"][0] && d["date-parts"][0].join("-")))) || null;
}

// Classify one Crossref work record for the DOI that was queried (see the header for the rules).
function classifyCrossrefRecord(message, queriedDoi) {
  const msg = message && typeof message === "object" ? message : {};
  const self = new Set([String(queriedDoi || "").trim().toLowerCase(), String(msg.DOI || "").trim().toLowerCase()].filter(Boolean));
  const rel = msg.relation && typeof msg.relation === "object" ? msg.relation : {};
  const updatedBy = Array.isArray(msg["updated-by"]) ? msg["updated-by"] : [];
  const updateTo = Array.isArray(msg["update-to"]) ? msg["update-to"] : [];
  const evidence = [];
  if (Array.isArray(rel["is-retracted-by"]) && rel["is-retracted-by"].length > 0) {
    evidence.push({ via: "relation.is-retracted-by", source: null, record_id: null, notice_doi: updateTarget(rel["is-retracted-by"][0]) || null, date: null });
  }
  for (const u of updatedBy) {
    if (updateType(u) !== RETRACTION_TYPE) continue;
    evidence.push({ via: "updated-by", source: (u && u.source) || null, record_id: (u && u["record-id"]) || null, notice_doi: updateTarget(u) || null, date: updateDate(u) });
  }
  const noticeFor = [];
  const ownUpdateTo = [];
  for (const u of updateTo) {
    const target = updateTarget(u);
    const aboutSelf = !target || self.has(target);
    if (aboutSelf) ownUpdateTo.push(u);
    if (updateType(u) !== RETRACTION_TYPE) continue;
    if (aboutSelf) evidence.push({ via: "update-to (in place)", source: (u && u.source) || null, record_id: (u && u["record-id"]) || null, notice_doi: target || null, date: updateDate(u) });
    else noticeFor.push(target);
  }
  const editorial = [...updatedBy, ...ownUpdateTo]
    .filter((u) => EDITORIAL_TYPES.has(updateType(u)))
    .map((u) => ({ type: updateType(u), source: (u && u.source) || null, notice_doi: updateTarget(u) || null }));
  return {
    retracted: evidence.length > 0,
    is_notice: evidence.length === 0 && noticeFor.length > 0,
    notice_for: noticeFor,
    retraction_evidence: evidence,
    editorial_updates: editorial
  };
}

function createCrossrefRetraction(options = {}) {
  const logger = options.logger && typeof options.logger.warn === "function"
    ? options.logger
    : { info() {}, warn() {}, error() {} };
  const fetchImpl = options.fetchImpl || (typeof fetch === "function" ? fetch : null);
  const timeoutMs = Number(options.timeoutMs) || 15_000;
  const contactEmail = options.contactEmail || "trevor@trevorobeyinc.com";

  async function checkDoi(doi) {
    const clean = String(doi || "").trim();
    if (!clean || typeof fetchImpl !== "function") return { doi: clean, retracted: false, checked: false };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(`${CROSSREF}/works/${encodeURIComponent(clean)}`, {
        signal: controller.signal,
        headers: { "User-Agent": `TRINC/1.0 (mailto:${contactEmail})`, Accept: "application/json" }
      });
      if (!res || !res.ok) {
        // 404 = DOI not in Crossref (a definitive "not retracted by us"); other codes = transient.
        // `in_crossref` (T1-7): the gate counts a DOI as screened by Crossref only when Crossref holds
        // it; a 404 DOI is screened only if PubMed resolves it to a record with a definitive verdict.
        if (res && res.status === 404) return { doi: clean, retracted: false, checked: true, in_crossref: false };
        return { doi: clean, retracted: false, checked: false };
      }
      const body = await res.json();
      const msg = (body && body.message) || {};
      return {
        doi: clean,
        ...classifyCrossrefRecord(msg, clean),
        checked: true,
        in_crossref: true,
        title: Array.isArray(msg.title) ? msg.title[0] : ""
      };
    } catch (err) {
      logger.warn({ event: "crossref_retraction_check_failed", doi: clean, error: String(err && err.message) });
      return { doi: clean, retracted: false, checked: false };
    } finally {
      clearTimeout(timer);
    }
  }

  // Sequential (Crossref's polite-pool concurrency is low) — fail-soft per DOI.
  async function checkDois(dois) {
    const list = Array.isArray(dois)
      ? [...new Set(dois.map((d) => String(d).trim()).filter(Boolean))]
      : [];
    const out = [];
    for (const doi of list) out.push(await checkDoi(doi));
    return out;
  }

  return Object.freeze({ checkDoi, checkDois });
}

module.exports = { createCrossrefRetraction, classifyCrossrefRecord };
