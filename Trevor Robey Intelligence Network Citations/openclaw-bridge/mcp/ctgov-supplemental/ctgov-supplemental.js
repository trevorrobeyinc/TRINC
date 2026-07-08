"use strict";

// ctgov-supplemental.js — Slice 2 local fetchers for ClinicalTrials.gov data the ToolUniverse
// search path does not surface. v1: STOP-REASON ARCHAEOLOGY — search the public CT.gov API v2
// for TERMINATED / WITHDRAWN / SUSPENDED trials in a condition and return their `whyStopped`
// text, citation-traced by NCT id (the "graveyard memo" from the cost-cutting research brief).
//
// Search-based, so it plugs into the role prefetch as a normal tool (tool_name
// `ctgov_stopped_trials`) via the local-fetcher seam in tool-prefetch.js. Each returned record
// carries `nctId` (→ grounded citation) + `whyStopped` (→ rendered into the agent prompt).
//
// Defensive + fail-soft: any network/parse error returns [] (a prefetch source must never break
// a run). The endpoint is public (no auth); we send a polite User-Agent.

const CTGOV_V2 = "https://clinicaltrials.gov/api/v2";
// Change-history lives on the internal endpoint (the data AACT omits). Not in the published v2
// contract — treat as best-effort + defensive. Does NOT accept ?format=json (rejects with 400).
const CTGOV_INT = "https://clinicaltrials.gov/api/int";
const STOPPED_STATUSES = ["TERMINATED", "WITHDRAWN", "SUSPENDED"];
const STOPPED_FIELDS = [
  "protocolSection.identificationModule.nctId",
  "protocolSection.identificationModule.briefTitle",
  "protocolSection.statusModule.overallStatus",
  "protocolSection.statusModule.whyStopped",
  "protocolSection.designModule.phases"
].join(",");

function createCtgovSupplemental(options = {}) {
  const logger = options.logger && typeof options.logger.warn === "function"
    ? options.logger
    : { info() {}, warn() {}, error() {} };
  const fetchImpl = options.fetchImpl || (typeof fetch === "function" ? fetch : null);
  const timeoutMs = Number(options.timeoutMs) || 20_000;
  const contactEmail = options.contactEmail || "trevor@trevorobeyinc.com";
  const includeHistory = options.includeHistory !== false;
  const maxHistory = Number.isFinite(options.maxHistory) ? options.maxHistory : 5;
  // Session cache (shared by every caller of this single instance — the scout prefetch AND the
  // Slice 3 v2 deliverable-assembly re-fetch in workflow-engine): a condition's stopped-trial set
  // is stable within a run, so cache it to avoid a duplicate CT.gov round-trip (incl. history).
  // Only successful, non-empty-condition results are cached; an error is never cached (retryable).
  const cache = new Map();

  async function getJson(url) {
    if (typeof fetchImpl !== "function") throw new Error("no fetch implementation available");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, {
        signal: controller.signal,
        headers: { "User-Agent": `TRINC/1.0 (mailto:${contactEmail})`, Accept: "application/json" }
      });
      if (!res || !res.ok) throw new Error(`HTTP ${res ? res.status : "no-response"}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  // Change-history (the data AACT omits): /api/int/studies/{nct}/history → version deltas.
  // Defensive + fail-soft (returns null on any error). Summarizes version count, the
  // most-frequently-amended modules, and the date span — the "protocol-amendment" signal.
  async function getChangeHistory(nctId) {
    let data;
    try {
      data = await getJson(`${CTGOV_INT}/studies/${encodeURIComponent(nctId)}/history`);
    } catch (err) {
      logger.warn({ event: "ctgov_change_history_failed", nctId, error: String(err && err.message) });
      return null;
    }
    const changes = data && Array.isArray(data.changes) ? data.changes : [];
    if (changes.length === 0) return null;
    const moduleCounts = {};
    for (const change of changes) {
      for (const label of (Array.isArray(change.moduleLabels) ? change.moduleLabels : [])) {
        moduleCounts[label] = (moduleCounts[label] || 0) + 1;
      }
    }
    const amendedModules = Object.entries(moduleCounts)
      .sort((a, b) => b[1] - a[1]).slice(0, 5).map(([m]) => m);
    return {
      versions: changes.length,
      amended_modules: amendedModules,
      first: (changes[0] && changes[0].date) || "",
      last: (changes[changes.length - 1] && changes[changes.length - 1].date) || ""
    };
  }

  // Search stopped trials in a condition → their stop reasons (+ change-history per trial).
  // Returns plain record objects (the same shape tool-prefetch's renderRecord consumes).
  async function searchStoppedTrials(args = {}) {
    const condition = String(args.condition || args.query_term || args.query || "").trim();
    if (!condition) return [];
    const cacheKey = condition.toLowerCase();
    if (cache.has(cacheKey)) return cache.get(cacheKey);
    const pageSize = Math.min(Math.max(Number(args.pageSize) || 8, 1), 50);
    const params = new URLSearchParams({
      "filter.overallStatus": STOPPED_STATUSES.join(","),
      "query.cond": condition,
      fields: STOPPED_FIELDS,
      pageSize: String(pageSize),
      format: "json"
    });
    let data;
    try {
      data = await getJson(`${CTGOV_V2}/studies?${params.toString()}`);
    } catch (err) {
      logger.warn({ event: "ctgov_stopped_trials_failed", condition, error: String(err && err.message) });
      return [];
    }
    const studies = data && Array.isArray(data.studies) ? data.studies : [];
    const records = [];
    for (const study of studies) {
      const proto = (study && study.protocolSection) || {};
      const ident = proto.identificationModule || {};
      const status = proto.statusModule || {};
      const design = proto.designModule || {};
      if (!ident.nctId) continue;
      records.push({
        title: ident.briefTitle || ident.nctId,
        nctId: ident.nctId,
        status: status.overallStatus || "",
        phase: Array.isArray(design.phases) ? design.phases.join("/") : "",
        whyStopped: status.whyStopped || ""
      });
    }
    // Enrich the top stopped trials with their change-history (bounded + sequential to be polite
    // to the internal endpoint; fail-soft per trial — a missing history just omits the summary).
    if (includeHistory && maxHistory > 0) {
      for (let i = 0; i < records.length && i < maxHistory; i++) {
        const hist = await getChangeHistory(records[i].nctId);
        if (hist) records[i].changeSummary = hist;
      }
    }
    logger.info({ event: "ctgov_stopped_trials_ok", condition, count: records.length });
    cache.set(cacheKey, records);
    return records;
  }

  return Object.freeze({ searchStoppedTrials, getChangeHistory });
}

module.exports = { createCtgovSupplemental };
