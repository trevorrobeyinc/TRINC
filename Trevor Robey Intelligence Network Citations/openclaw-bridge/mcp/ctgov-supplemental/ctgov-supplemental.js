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
//
// ── TWO MODES, deliberately asymmetric (2026-07-30) ───────────────────────────────────────────
// This fetcher serves two callers with opposite needs, and conflating them was the original bug:
//
//   PROMPT MODE (default, `census` falsy) — role prefetch. Records are rendered into an agent
//   prompt, so SIZE IS COST. Hard-clamped at PROMPT_MAX_PAGE_SIZE (50), single page, no walk.
//
//   CENSUS MODE (`census: true`) — the post-gate deliverable render in workflow-engine. Output is
//   written to a file and NEVER reaches a prompt, so it can be exhaustive. Walks `nextPageToken`
//   to the end of the result set.
//
// The two must never serve each other, so the session cache key carries the mode and sizes, and
// scripts/_workflow-runtime.js additionally forces `census: false` AND clamps pageSize on the
// prefetch seam — a defence in depth, because a prefetch-map edit must not be able to push 1000
// records into a prompt (measured: 1,000 records ≈ 228 KB ≈ 57K tokens, ~18% of one template's
// documented ~320K budget, from a single sub-source).
//
// ── WHY THIS CHANGED: the amendment band was returning the wrong answer ───────────────────────
// buildAmendmentRisk() derives LOW/MODERATE/HIGH from the median protocol-version count of the
// sampled trials. Measured 2026-07-30 on one ordered glioblastoma cohort, the SHIPPED code gave:
// MODERATE at n=5, MODERATE at n=8, LOW at n=10, MODERATE at n=20, HIGH at n=40. The band that
// ships in a $14,950 deliverable was a function of the sample size, not of the indication. This
// is a correctness fix, not an enhancement — and the band is still climbing at n=40, so the memo
// states its sample size and the band's sensitivity rather than implying the number is settled.
//
// ── MEASURED FACTS (2026-07-30, apiVersion 2.0.5) — do not "optimise" these away ──────────────
// • pageSize is SILENTLY CLAMPED at 1000: pageSize=1001 returned HTTP 200 with 1000 studies and a
//   byte-identical body. A short page is therefore NEVER an error signal, and `studies.length` is
//   a floor, not a population count. `countTotal=true` on page 1 is the only true denominator.
// • Census cost is trivial: NSCLC (totalCount 1391) = 2 round trips, 1,836 ms including politeness
//   sleeps; glioblastoma (390) and FOP (3) = 1 round trip each. Collected unique NCT ids equalled
//   totalCount exactly in all three (3/3, 390/390, 1391/1391).
// • Change-history is strictly ONE CALL PER NCT — every batch shape tested returned HTTP 400/404,
//   and the published v2 data model exposes no history field. Median 103 ms per call. So the
//   asymmetry between the legs is REQUEST COUNT (~700× for NSCLC), not latency.
// • 40 history calls at concurrency 3 with 400 ms inter-batch pauses = 6,852 ms, 0 non-200. That
//   is the LARGEST sweep actually measured; anything beyond it is arithmetic, not evidence, and
//   sustained behaviour past ~40 consecutive calls against /api/int is NOT established.

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

// The registry's own hard ceiling (silently applied). Only CENSUS mode may request this.
const CTGOV_MAX_PAGE_SIZE = 1000;
// PROMPT mode's ceiling. This preserves the pre-2026-07-30 behaviour, where 50 was a
// code-enforced cap on how many records this source could inject into an agent prompt. Raising
// the census ceiling must NOT raise this one — they are separate numbers for separate reasons.
const PROMPT_MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 8;
const DEFAULT_MAX_HISTORY = 5;

const CENSUS_MAX_RECORDS_DEFAULT = 2000; // runaway guard only; NSCLC, the densest tested, is 1391
const CENSUS_HARD_CEILING = 5000;
// Page-count guard, independent of records.length. Required because duplicate-dropping means a
// page can yield ZERO new records while still advancing the page token — records.length then
// never grows and a length-based guard can never fire.
const CENSUS_MAX_PAGES = Math.ceil(CENSUS_HARD_CEILING / CTGOV_MAX_PAGE_SIZE) + 2;
const PAGE_PAUSE_MS = 300;

const CENSUS_HISTORY_SAMPLE = 40;
const HISTORY_CONCURRENCY = 3;
const HISTORY_BATCH_PAUSE_MS = 400;

const HISTORY_SELECTION_RULE =
  "the first N stopped programs in the order ClinicalTrials.gov returned them (no sort parameter " +
  "is sent). Protocol history must be fetched one trial at a time against an undocumented " +
  "endpoint, so the sample is bounded deliberately; it is not a random sample.";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function createCtgovSupplemental(options = {}) {
  const logger = options.logger && typeof options.logger.warn === "function"
    ? options.logger
    : { info() {}, warn() {}, error() {} };
  const fetchImpl = options.fetchImpl || (typeof fetch === "function" ? fetch : null);
  const timeoutMs = Number(options.timeoutMs) || 20_000;
  const contactEmail = options.contactEmail || "trevor@trevorobeyinc.com";
  const includeHistory = options.includeHistory !== false;
  // Instance-level override wins when set; otherwise each MODE picks its own default, so a census
  // is not silently held down to the prompt path's history budget.
  const maxHistoryOverride = Number.isFinite(options.maxHistory) ? options.maxHistory : null;
  const maxRecords = Math.min(
    Number.isFinite(options.maxRecords) ? options.maxRecords : CENSUS_MAX_RECORDS_DEFAULT,
    CENSUS_HARD_CEILING
  );
  // Session cache shared by every caller of this instance. The key MUST carry the mode and the
  // sizes: the prefetch call and the deliverable census request different things, and a
  // condition-only key would silently serve one the other's array.
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

  // Bounded, mildly-concurrent history enrichment. Sequential-per-batch with a pause between
  // batches: the endpoint is undocumented and advertises no rate budget, so the concurrency is
  // deliberately low and the pause deliberately present.
  async function enrichHistory(records, limit) {
    const target = Math.min(limit, records.length);
    for (let i = 0; i < target; i += HISTORY_CONCURRENCY) {
      const batch = records.slice(i, Math.min(i + HISTORY_CONCURRENCY, target));
      const results = await Promise.all(batch.map((r) => getChangeHistory(r.nctId)));
      results.forEach((hist, k) => { if (hist) batch[k].changeSummary = hist; });
      if (i + HISTORY_CONCURRENCY < target) await sleep(HISTORY_BATCH_PAUSE_MS);
    }
    return target;
  }

  function toRecord(study) {
    const proto = (study && study.protocolSection) || {};
    const ident = proto.identificationModule || {};
    const status = proto.statusModule || {};
    const design = proto.designModule || {};
    if (!ident.nctId) return null;
    return {
      title: ident.briefTitle || ident.nctId,
      nctId: ident.nctId,
      status: status.overallStatus || "",
      phase: Array.isArray(design.phases) ? design.phases.join("/") : "",
      whyStopped: status.whyStopped || ""
    };
  }

  // Search stopped trials in a condition → their stop reasons (+ change-history per trial).
  // Returns plain record objects (the same shape tool-prefetch's renderRecord consumes), with
  // coverage metadata attached as NON-ENUMERABLE properties so renderRecord still iterates only
  // the record fields and nothing leaks into a prompt.
  async function searchStoppedTrials(args = {}) {
    // Accept every key a workflow template actually uses to name an indication. Each of the six
    // templates names it differently (drug-discovery-full -> indication, target-validation-pack ->
    // disease_context, rare-disease-brief -> disease_name, clinical-trial-landscape ->
    // therapeutic_area), and an unresolved template var arrives as "" (falsy), so the chain simply
    // advances. Before 2026-07-24 only `condition` was read while the prefetch map bound
    // `condition:"{{indication}}"` — a var present in ONE template — so this source was skipped on
    // 5 of 6 templates and `deliverables/graveyard-memo.md` came out silently empty. Silent because
    // the memo is fail-soft by design: an empty indication omits it and never blocks a passing
    // report. All aliases empty still means an honest zero with no request.
    const condition = String(
      args.condition || args.indication || args.disease_context ||
      args.disease_name || args.therapeutic_area ||
      args.query_term || args.query || ""
    ).trim();
    if (!condition) return [];

    const census = args.census === true;
    const requested = Number(args.pageSize);
    const pageSize = census
      ? CTGOV_MAX_PAGE_SIZE
      : Math.min(Math.max(Number.isFinite(requested) && requested > 0 ? requested : DEFAULT_PAGE_SIZE, 1), PROMPT_MAX_PAGE_SIZE);
    const historyLimit = maxHistoryOverride !== null
      ? maxHistoryOverride
      : (census ? CENSUS_HISTORY_SAMPLE : DEFAULT_MAX_HISTORY);

    const cacheKey = `${condition.toLowerCase()}|${census ? "census" : "prompt"}|${pageSize}|${historyLimit}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);

    const records = [];
    const seen = new Set();
    let eligibleTotal = null;
    let pageToken = null;
    let page = 0;
    let pagesExhausted = false;
    let fetchError = false;
    let droppedNoNct = 0;
    let droppedDuplicate = 0;

    while (records.length < maxRecords) {
      const params = new URLSearchParams({
        "filter.overallStatus": STOPPED_STATUSES.join(","),
        "query.cond": condition,
        fields: STOPPED_FIELDS,
        pageSize: String(pageSize),
        format: "json"
      });
      // countTotal is only meaningful on the first page — page 2 of the NSCLC walk carried no
      // totalCount key at all. It is the ONLY true denominator (studies.length is a floor).
      if (page === 0) params.set("countTotal", "true");
      if (pageToken) params.set("pageToken", pageToken);

      let data;
      try {
        data = await getJson(`${CTGOV_V2}/studies?${params.toString()}`);
      } catch (err) {
        logger.warn({ event: "ctgov_stopped_trials_failed", condition, page, error: String(err && err.message) });
        fetchError = true;
        break;
      }
      page += 1;

      if (page === 1 && Number.isFinite(Number(data && data.totalCount))) {
        eligibleTotal = Number(data.totalCount);
      }

      const studies = data && Array.isArray(data.studies) ? data.studies : [];
      const before = records.length;
      for (const study of studies) {
        const rec = toRecord(study);
        if (!rec) { droppedNoNct += 1; continue; }
        if (seen.has(rec.nctId)) { droppedDuplicate += 1; continue; }
        seen.add(rec.nctId);
        records.push(rec);
        if (records.length >= maxRecords) break;
      }

      if (!census) { pagesExhausted = true; break; }

      const prevToken = pageToken;
      // The FINAL page omits nextPageToken entirely rather than returning null, so test for the
      // key's presence — a `!data.nextPageToken` check would also swallow a legitimate falsy value.
      const hasNext = data && Object.prototype.hasOwnProperty.call(data, "nextPageToken") && data.nextPageToken;
      if (!hasNext || studies.length === 0) { pagesExhausted = true; break; }

      // Guard A — no forward progress. Duplicate-dropping means a page can add zero records while
      // still handing back a fresh token; without this the loop never terminates on its own.
      if (records.length === before || data.nextPageToken === prevToken) {
        logger.warn({ event: "ctgov_census_no_progress", condition, page });
        break;
      }
      // Guard B — page ceiling, independent of records.length. Leaves pagesExhausted false so the
      // memo reports a PARTIAL retrieval rather than claiming a complete one.
      if (page >= CENSUS_MAX_PAGES) {
        logger.warn({ event: "ctgov_census_page_ceiling", condition, page });
        break;
      }

      pageToken = data.nextPageToken;
      await sleep(PAGE_PAUSE_MS);
    }

    let historySampled = 0;
    if (includeHistory && historyLimit > 0 && records.length > 0) {
      historySampled = await enrichHistory(records, historyLimit);
    }

    // A census is COMPLETE only when the walk ended cleanly AND the collected count actually
    // reaches the registry's own denominator. Walking to the end is not sufficient: records are
    // dropped for missing NCT ids and duplicates, so N can legitimately fall short of M — and a
    // memo that printed "every one" beside "N of M" with N<M would contradict itself.
    const censusComplete = census
      && pagesExhausted
      && !fetchError
      && Number.isFinite(eligibleTotal)
      && records.length >= eligibleTotal;

    const meta = {
      mode: census ? "census" : "prompt",
      eligibleTotal: Number.isFinite(eligibleTotal) ? eligibleTotal : null,
      censusComplete,
      pagesWalked: page,
      pagesExhausted,
      fetchError,
      droppedNoNct,
      droppedDuplicate,
      historySampled,
      historyLimit,
      historySelectionRule: HISTORY_SELECTION_RULE,
      conditionQuery: condition
    };
    for (const [k, v] of Object.entries(meta)) {
      Object.defineProperty(records, k, { value: v, enumerable: false, configurable: true });
    }

    logger.info({
      event: "ctgov_stopped_trials_ok",
      condition,
      mode: meta.mode,
      count: records.length,
      eligible_total: meta.eligibleTotal,
      census_complete: censusComplete,
      pages: page,
      history_sampled: historySampled
    });
    cache.set(cacheKey, records);
    return records;
  }

  return Object.freeze({ searchStoppedTrials, getChangeHistory });
}

module.exports = {
  createCtgovSupplemental,
  STOPPED_STATUSES,
  PROMPT_MAX_PAGE_SIZE,
  CTGOV_MAX_PAGE_SIZE,
  CENSUS_HISTORY_SAMPLE,
  DEFAULT_PAGE_SIZE,
  DEFAULT_MAX_HISTORY,
  HISTORY_SELECTION_RULE
};
