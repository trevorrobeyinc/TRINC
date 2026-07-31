"use strict";

// ctgov-design-benchmark.js — local fetcher for the Trial Design Benchmark Pack. Sibling of
// ctgov-supplemental.js (stop-reason archaeology); deliberately a separate file so that fetcher
// stays untouched. Where ctgov-supplemental asks "what died here and why", this asks "how are
// comparable Phase 3 programs in this indication actually STRUCTURED" — allocation, masking,
// intervention model, arm count, enrollment, primary endpoints, sponsor class.
//
// Search-based, so it plugs into role prefetch as a normal tool (`ctgov_design_benchmark`) through
// the local-fetcher seam in tool-prefetch.js. Every record carries `nctId`, so the cohort becomes
// grounded citation evidence rather than only prose.
//
// THE SELECTION RULE IS EXPLICIT AND IS PART OF THE PRODUCT. An earlier draft of this fetcher sent
// no status filter and no sort. Verified live against CT.gov v2: `query.cond=non-small cell lung
// cancer&aggFilters=phase:3&countTotal=true` reports totalCount **1014**, and an unsorted page of 20
// came back containing a 1995 trial with status UNKNOWN, a WITHDRAWN trial with enrollment 0 (it
// never enrolled a patient), and a NOT_YET_RECRUITING trial. Adding
// `filter.overallStatus=COMPLETED,ACTIVE_NOT_RECRUITING,RECRUITING,ENROLLING_BY_INVITATION` drops
// the same query to totalCount **665** — i.e. ~349 of the 1,014 an unfiltered denominator would
// have advertised as "eligible comparable programs" are withdrawn/terminated/suspended/unknown or
// never started. Printing 1,014 would have inflated the pool by ~34% with non-comparators, and the
// unsorted page order is not relevance (sort=@relevance returns a different 20). So: the filter and
// the sort are sent explicitly, both are returned to the renderer, and the renderer prints them.
// A buyer paying $4,950 is told exactly which slice of the registry they received and in what order.
//
// Defensive + fail-soft: any network/parse error returns [] (a prefetch source must never break a
// run). The endpoint is public (no auth); we send a polite User-Agent.

const CTGOV_V2 = "https://clinicaltrials.gov/api/v2";

// Statuses a program must hold to count as a structural comparator. A withdrawn or never-started
// trial has a protocol on paper but no executed design, and a status-UNKNOWN record has not been
// verified by its sponsor in over two years — neither is a benchmark.
const COMPARATOR_STATUSES = [
  "COMPLETED",
  "ACTIVE_NOT_RECRUITING",
  "RECRUITING",
  "ENROLLING_BY_INVITATION"
];

// Newest-first. Stated so the cohort is reproducible and so "which 20 of 665" has an answer.
const COHORT_SORT = "StartDate:desc";

const SELECTION_RULE =
  `Phase 3 (including Phase 2/3 combination) programs registered for the indication, ` +
  `status in {${COMPARATOR_STATUSES.join(", ")}}, ordered by start date descending; ` +
  `the N most recent of M eligible.`;

// Verified live to return non-empty values for all of these in a SINGLE search call — no per-study
// round-trip is needed, unlike the change-history enrichment ctgov-supplemental performs.
const BENCHMARK_FIELDS = [
  "protocolSection.identificationModule.nctId",
  "protocolSection.identificationModule.briefTitle",
  "protocolSection.statusModule.overallStatus",
  "protocolSection.statusModule.startDateStruct",
  "protocolSection.statusModule.primaryCompletionDateStruct",
  "protocolSection.sponsorCollaboratorsModule.leadSponsor",
  "protocolSection.designModule.phases",
  "protocolSection.designModule.designInfo",
  "protocolSection.designModule.enrollmentInfo",
  "protocolSection.armsInterventionsModule.armGroups",
  "protocolSection.outcomesModule.primaryOutcomes"
].join(",");

function createCtgovDesignBenchmark(options = {}) {
  const logger = options.logger && typeof options.logger.warn === "function"
    ? options.logger
    : { info() {}, warn() {}, error() {} };
  const fetchImpl = options.fetchImpl || (typeof fetch === "function" ? fetch : null);
  const timeoutMs = Number(options.timeoutMs) || 20_000;
  const contactEmail = options.contactEmail || "trevor@trevorobeyinc.com";
  // Session cache shared by every caller of this instance — the competitive_intel_analyst prefetch
  // AND the post-gate deliverable render in workflow-engine — so the second call is free.
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

  function textDate(struct) {
    return (struct && struct.date) ? String(struct.date) : "";
  }

  // Search the comparator cohort in an indication → flat structural records, each NCT-traced.
  async function searchDesignCohort(args = {}) {
    // Same alias chain as ctgov-supplemental.searchStoppedTrials, for the same documented reason:
    // each workflow template names the indication differently and an unresolved template var
    // arrives as "" (falsy), so the chain simply advances. All aliases empty = an honest zero with
    // no request made.
    const condition = String(
      args.condition || args.indication || args.disease_context ||
      args.disease_name || args.therapeutic_area ||
      args.query_term || args.query || ""
    ).trim();
    if (!condition) return [];

    // Default 20, NOT the 8 used by ctgov-supplemental. That 8 is the documented precedent that
    // would silently under-deliver against a pack whose whole promise is a 10–20 program cohort.
    const target = Math.min(Math.max(Number(args.pageSize) || 20, 1), 50);
    const drugClass = String(args.drug_class || "").trim();

    // The cache key carries size and drug_class, not the condition alone: the prefetch call and the
    // engine re-fetch may request different cohorts, and a condition-only key would silently serve
    // the wrong one.
    const cacheKey = `${condition.toLowerCase()}|${target}|${drugClass.toLowerCase()}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);

    const params = new URLSearchParams({
      "query.cond": condition,
      aggFilters: "phase:3",
      "filter.overallStatus": COMPARATOR_STATUSES.join(","),
      sort: COHORT_SORT,
      fields: BENCHMARK_FIELDS,
      pageSize: String(target),
      countTotal: "true",
      format: "json"
    });
    if (drugClass) params.set("query.intr", drugClass);

    let data;
    try {
      data = await getJson(`${CTGOV_V2}/studies?${params.toString()}`);
    } catch (err) {
      logger.warn({
        event: "ctgov_design_benchmark_failed",
        condition,
        error: String(err && err.message)
      });
      return [];
    }

    const studies = data && Array.isArray(data.studies) ? data.studies : [];
    const records = [];
    for (const study of studies) {
      const proto = (study && study.protocolSection) || {};
      const ident = proto.identificationModule || {};
      const status = proto.statusModule || {};
      const design = proto.designModule || {};
      const sponsors = proto.sponsorCollaboratorsModule || {};
      const arms = proto.armsInterventionsModule || {};
      const outcomes = proto.outcomesModule || {};
      if (!ident.nctId) continue;

      const info = design.designInfo || {};
      const lead = sponsors.leadSponsor || {};
      const enrollment = design.enrollmentInfo || {};
      records.push({
        title: ident.briefTitle || ident.nctId,
        nctId: ident.nctId,
        status: status.overallStatus || "",
        // aggFilters=phase:3 also returns PHASE2/PHASE3 combination trials (verified: 18 pure
        // PHASE3 + 2 PHASE2/PHASE3 in a 20-study probe). They are legitimate comparators, so they
        // are neither dropped nor relabelled — the true phase string is carried through and the
        // renderer prints it per row.
        phase: Array.isArray(design.phases) ? design.phases.join("/") : "",
        sponsor: lead.name || "",
        sponsorClass: lead.class || "",
        allocation: info.allocation || "",
        interventionModel: info.interventionModel || "",
        primaryPurpose: info.primaryPurpose || "",
        masking: (info.maskingInfo && info.maskingInfo.masking) || "",
        enrollmentCount: Number.isFinite(Number(enrollment.count)) && enrollment.count !== undefined
          ? Number(enrollment.count)
          : null,
        enrollmentType: enrollment.type || "",
        armCount: Array.isArray(arms.armGroups) ? arms.armGroups.length : null,
        primaryOutcomes: (Array.isArray(outcomes.primaryOutcomes) ? outcomes.primaryOutcomes : [])
          .map((o) => ({ measure: (o && o.measure) || "", timeFrame: (o && o.timeFrame) || "" }))
          .filter((o) => o.measure),
        startDate: textDate(status.startDateStruct),
        primaryCompletionDate: textDate(status.primaryCompletionDateStruct)
      });
    }

    // The eligible-population denominator, the selection rule and the sort ride along as
    // non-enumerable properties so the array still renders normally through tool-prefetch's
    // renderRecord (which iterates enumerable record fields) while the renderer can state exactly
    // which slice of the registry this is. countTotal is computed under the SAME filter as the
    // page, so N-of-M is a true ratio rather than N of an unfiltered registry count.
    const eligibleTotal = Number(data && data.totalCount);
    Object.defineProperty(records, "eligibleTotal", {
      value: Number.isFinite(eligibleTotal) ? eligibleTotal : records.length,
      enumerable: false
    });
    Object.defineProperty(records, "selectionRule", { value: SELECTION_RULE, enumerable: false });
    Object.defineProperty(records, "sort", { value: COHORT_SORT, enumerable: false });

    logger.info({
      event: "ctgov_design_benchmark_ok",
      condition,
      count: records.length,
      eligible_total: records.eligibleTotal
    });
    cache.set(cacheKey, records);
    return records;
  }

  return Object.freeze({ searchDesignCohort });
}

module.exports = {
  createCtgovDesignBenchmark,
  COMPARATOR_STATUSES,
  COHORT_SORT,
  SELECTION_RULE
};
