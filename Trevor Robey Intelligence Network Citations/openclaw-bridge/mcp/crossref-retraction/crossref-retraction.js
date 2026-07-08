"use strict";

// crossref-retraction.js — Slice 2: literature-foundation integrity check (the cost-cutting
// brief's #1 strategy). Given DOIs, asks the Crossref REST API — which carries the Retraction
// Watch dataset — whether each has been RETRACTED. A citation-traced report must never rest on
// a retracted paper; the citation gate uses this to flag/block such citations.
//
// Fail-soft by construction: a network error or non-200 yields `checked:false` and
// `retracted:false` (NEVER a false "retracted"), so Crossref being unreachable can never wrongly
// block a report. Only an explicit Crossref signal marks a DOI retracted.

const CROSSREF = "https://api.crossref.org";

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
        return { doi: clean, retracted: false, checked: Boolean(res && res.status === 404) };
      }
      const body = await res.json();
      const msg = (body && body.message) || {};
      const rel = msg.relation || {};
      const isRetracted = Array.isArray(rel["is-retracted-by"]) && rel["is-retracted-by"].length > 0;
      const updateRetract = Array.isArray(msg["update-to"])
        && msg["update-to"].some((u) => /retract/i.test(String(u && u.type)));
      return {
        doi: clean,
        retracted: Boolean(isRetracted || updateRetract),
        checked: true,
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

module.exports = { createCrossrefRetraction };
