"use strict";

/**
 * ClinicalTrials.gov MCP — queries the ClinicalTrials.gov V2 JSON API.
 *
 * Provides trial search, detail lookup, eligibility filtering, sponsor search,
 * investigator discovery, and endpoint analysis for OpenClaw research agents.
 *
 * Uses the shared HTTPS client for rate-limited requests.
 *
 * @module clinicaltrials-mcp
 */

const { createHttpsClient } = require("../../core/https-client.js");
const { SCHEMA_BY_TOOL } = require("./clinicaltrials-schema.js");

function isPlainObject(v) {
  return Boolean(v && typeof v === "object" && !Array.isArray(v));
}

/**
 * Normalize a status or phase value (string or array) into a comma-separated string.
 */
function toFilterList(value) {
  if (!value) return null;
  if (Array.isArray(value)) return value.join(",");
  return String(value);
}

/**
 * Build a query string from a params object. Skips null/undefined values.
 */
function buildQueryString(params) {
  const parts = [];
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") continue;
    parts.push(encodeURIComponent(key) + "=" + encodeURIComponent(String(value)));
  }
  return parts.length > 0 ? "?" + parts.join("&") : "";
}

// ---------------------------------------------------------------------------
// Response extractors — pull structured fields from the V2 API JSON
// ---------------------------------------------------------------------------

function extractTrialSummary(study) {
  const proto = (study && study.protocolSection) || {};
  const id = proto.identificationModule || {};
  const status = proto.statusModule || {};
  const sponsor = proto.sponsorCollaboratorsModule || {};
  const design = proto.designModule || {};
  const conditions = proto.conditionsModule || {};
  const interventions = proto.armsInterventionsModule || {};
  const enrollment = design.enrollmentInfo || {};

  const interventionList = Array.isArray(interventions.interventions)
    ? interventions.interventions.map(i => i.name || "").filter(Boolean)
    : [];

  return {
    nctId: id.nctId || "",
    briefTitle: id.briefTitle || "",
    overallStatus: status.overallStatus || "",
    phases: Array.isArray(design.phases) ? design.phases : [],
    conditions: Array.isArray(conditions.conditions) ? conditions.conditions : [],
    interventions: interventionList,
    enrollmentCount: enrollment.count || null,
    startDate: status.startDateStruct ? status.startDateStruct.date || "" : "",
    sponsor: sponsor.leadSponsor ? sponsor.leadSponsor.name || "" : ""
  };
}

function extractTrialDetails(study) {
  const proto = (study && study.protocolSection) || {};
  const id = proto.identificationModule || {};
  const status = proto.statusModule || {};
  const sponsor = proto.sponsorCollaboratorsModule || {};
  const desc = proto.descriptionModule || {};
  const eligibility = proto.eligibilityModule || {};
  const design = proto.designModule || {};
  const outcomes = proto.outcomesModule || {};
  const contacts = proto.contactsLocationsModule || {};
  const conditions = proto.conditionsModule || {};
  const interventions = proto.armsInterventionsModule || {};

  const collaborators = Array.isArray(sponsor.collaborators)
    ? sponsor.collaborators.map(c => ({ name: c.name || "", role: c.class || "" }))
    : [];

  const locationList = Array.isArray(contacts.locations)
    ? contacts.locations.map(loc => ({
        facility: loc.facility || "",
        city: loc.city || "",
        state: loc.state || "",
        country: loc.country || "",
        status: loc.status || ""
      }))
    : [];

  const centralContacts = Array.isArray(contacts.centralContacts)
    ? contacts.centralContacts.map(c => ({
        name: c.name || "",
        role: c.role || "",
        phone: c.phone || "",
        email: c.email || ""
      }))
    : [];

  const primaryOutcomes = Array.isArray(outcomes.primaryOutcomes)
    ? outcomes.primaryOutcomes.map(o => ({
        measure: o.measure || "",
        description: o.description || "",
        timeFrame: o.timeFrame || ""
      }))
    : [];

  const secondaryOutcomes = Array.isArray(outcomes.secondaryOutcomes)
    ? outcomes.secondaryOutcomes.map(o => ({
        measure: o.measure || "",
        description: o.description || "",
        timeFrame: o.timeFrame || ""
      }))
    : [];

  return {
    nctId: id.nctId || "",
    orgStudyId: id.orgStudyIdInfo ? id.orgStudyIdInfo.id || "" : "",
    briefTitle: id.briefTitle || "",
    officialTitle: id.officialTitle || "",
    overallStatus: status.overallStatus || "",
    startDate: status.startDateStruct ? status.startDateStruct.date || "" : "",
    completionDate: status.completionDateStruct ? status.completionDateStruct.date || "" : "",
    leadSponsor: sponsor.leadSponsor ? sponsor.leadSponsor.name || "" : "",
    leadSponsorClass: sponsor.leadSponsor ? sponsor.leadSponsor.class || "" : "",
    collaborators,
    briefSummary: (desc.briefSummary || "").slice(0, 4000),
    detailedDescription: (desc.detailedDescription || "").slice(0, 4000),
    conditions: Array.isArray(conditions.conditions) ? conditions.conditions : [],
    interventions: Array.isArray(interventions.interventions)
      ? interventions.interventions.map(i => ({
          type: i.type || "",
          name: i.name || "",
          description: (i.description || "").slice(0, 1000)
        }))
      : [],
    eligibility: {
      criteria: (eligibility.eligibilityCriteria || "").slice(0, 4000),
      sex: eligibility.sex || "",
      minimumAge: eligibility.minimumAge || "",
      maximumAge: eligibility.maximumAge || "",
      healthyVolunteers: eligibility.healthyVolunteers || ""
    },
    design: {
      studyType: design.studyType || "",
      phases: Array.isArray(design.phases) ? design.phases : [],
      allocation: design.designInfo ? design.designInfo.allocation || "" : "",
      interventionModel: design.designInfo ? design.designInfo.interventionModel || "" : "",
      primaryPurpose: design.designInfo ? design.designInfo.primaryPurpose || "" : "",
      masking: design.designInfo ? design.designInfo.maskingInfo || null : null,
      enrollmentCount: design.enrollmentInfo ? design.enrollmentInfo.count || null : null,
      enrollmentType: design.enrollmentInfo ? design.enrollmentInfo.type || "" : ""
    },
    primaryOutcomes,
    secondaryOutcomes,
    locations: locationList,
    centralContacts,
    url: id.nctId ? "https://clinicaltrials.gov/study/" + id.nctId : ""
  };
}

function extractInvestigators(study) {
  const proto = (study && study.protocolSection) || {};
  const id = proto.identificationModule || {};
  const contacts = proto.contactsLocationsModule || {};
  const investigators = [];

  if (Array.isArray(contacts.overallOfficials)) {
    for (const official of contacts.overallOfficials) {
      investigators.push({
        name: official.name || "",
        role: official.role || "",
        facility: official.affiliation || "",
        city: "",
        state: "",
        country: "",
        nctId: id.nctId || "",
        trialTitle: id.briefTitle || ""
      });
    }
  }

  if (Array.isArray(contacts.locations)) {
    for (const loc of contacts.locations) {
      if (!Array.isArray(loc.contacts)) continue;
      for (const contact of loc.contacts) {
        if (!contact.name) continue;
        investigators.push({
          name: contact.name,
          role: contact.role || "",
          facility: loc.facility || "",
          city: loc.city || "",
          state: loc.state || "",
          country: loc.country || "",
          nctId: id.nctId || "",
          trialTitle: id.briefTitle || ""
        });
      }
    }
  }

  return investigators;
}

function extractEndpoints(study) {
  const proto = (study && study.protocolSection) || {};
  const outcomes = proto.outcomesModule || {};

  const primary = Array.isArray(outcomes.primaryOutcomes)
    ? outcomes.primaryOutcomes.map(o => ({
        measure: o.measure || "",
        description: o.description || "",
        timeFrame: o.timeFrame || ""
      }))
    : [];

  const secondary = Array.isArray(outcomes.secondaryOutcomes)
    ? outcomes.secondaryOutcomes.map(o => ({
        measure: o.measure || "",
        description: o.description || "",
        timeFrame: o.timeFrame || ""
      }))
    : [];

  return { primary, secondary };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

function createClinicaltrialsMcp(options = {}) {
  const logger = isPlainObject(options.logger)
    ? options.logger
    : { info() {}, warn() {}, error() {} };

  const client = createHttpsClient({
    hostname: "clinicaltrials.gov",
    basePath: "/api/v2",
    maxPerSecond: 5,
    logger
  });

  // -----------------------------------------------------------------------
  // Tool handlers
  // -----------------------------------------------------------------------

  async function handleSearchTrials(params) {
    const query = buildQueryString({
      "query.cond": params.condition || null,
      "query.intr": params.intervention || null,
      "query.spons": params.sponsor || null,
      "filter.overallStatus": toFilterList(params.status),
      "filter.phase": toFilterList(params.phase),
      "query.locn": params.location || null,
      "filter.studyType": params.study_type || null,
      pageSize: params.page_size,
      pageToken: params.page_token || null,
      countTotal: params.count_total || null,
      "query.term": params.advanced_query || null
    });

    const data = await client.getJson("/studies" + query);
    const studies = Array.isArray(data.studies) ? data.studies : [];

    return {
      ok: true,
      trials: studies.map(extractTrialSummary),
      totalCount: data.totalCount || null,
      nextPageToken: data.nextPageToken || null
    };
  }

  async function handleGetTrialDetails(params) {
    const nctId = params.nct_id.toUpperCase();
    const data = await client.getJson("/studies/" + nctId);

    if (!data || !data.protocolSection) {
      return { ok: false, error: "Trial not found", nctId };
    }

    return {
      ok: true,
      trial: extractTrialDetails(data)
    };
  }

  async function handleSearchByEligibility(params) {
    const statusList = params.status
      ? toFilterList(params.status)
      : "RECRUITING";

    const aggParts = [];
    if (params.sex && params.sex !== "ALL") {
      aggParts.push("sexes:" + params.sex.toLowerCase());
    }

    const queryParams = {
      "query.cond": params.condition || null,
      "query.term": params.eligibility_keywords || null,
      "filter.overallStatus": statusList,
      pageSize: params.page_size,
      pageToken: params.page_token || null
    };

    if (aggParts.length > 0) {
      queryParams.aggFilters = aggParts.join(",");
    }

    const query = buildQueryString(queryParams);
    const data = await client.getJson("/studies" + query);
    const studies = Array.isArray(data.studies) ? data.studies : [];

    const trials = studies.map(study => {
      const summary = extractTrialSummary(study);
      const proto = (study && study.protocolSection) || {};
      const elig = proto.eligibilityModule || {};

      return {
        ...summary,
        eligibility: {
          criteria: (elig.eligibilityCriteria || "").slice(0, 2000),
          sex: elig.sex || "",
          minimumAge: elig.minimumAge || "",
          maximumAge: elig.maximumAge || "",
          healthyVolunteers: elig.healthyVolunteers || ""
        }
      };
    });

    // Post-filter by age if provided
    const filtered = trials.filter(t => {
      if (params.min_age && t.eligibility.maximumAge) {
        const maxAgeYears = parseAgeYears(t.eligibility.maximumAge);
        const minReqYears = parseAgeYears(params.min_age);
        if (maxAgeYears !== null && minReqYears !== null && maxAgeYears < minReqYears) {
          return false;
        }
      }
      if (params.max_age && t.eligibility.minimumAge) {
        const minAgeYears = parseAgeYears(t.eligibility.minimumAge);
        const maxReqYears = parseAgeYears(params.max_age);
        if (minAgeYears !== null && maxReqYears !== null && minAgeYears > maxReqYears) {
          return false;
        }
      }
      return true;
    });

    return {
      ok: true,
      trials: filtered,
      nextPageToken: data.nextPageToken || null
    };
  }

  async function handleSearchBySponsor(params) {
    const query = buildQueryString({
      "query.spons": params.sponsor_name,
      "query.cond": params.condition || null,
      "filter.phase": toFilterList(params.phase),
      "filter.overallStatus": toFilterList(params.status),
      pageSize: params.page_size,
      pageToken: params.page_token || null,
      countTotal: params.count_total || null
    });

    const data = await client.getJson("/studies" + query);
    const studies = Array.isArray(data.studies) ? data.studies : [];

    return {
      ok: true,
      trials: studies.map(extractTrialSummary),
      totalCount: data.totalCount || null,
      nextPageToken: data.nextPageToken || null
    };
  }

  async function handleSearchInvestigators(params) {
    const termParts = [];
    if (params.investigator_name) termParts.push(params.investigator_name);

    const query = buildQueryString({
      "query.cond": params.condition || null,
      "query.locn": params.location || null,
      "query.lead": params.institution || null,
      "query.term": termParts.length > 0 ? termParts.join(" ") : null,
      "filter.overallStatus": toFilterList(params.status),
      pageSize: params.page_size
    });

    const data = await client.getJson("/studies" + query);
    const studies = Array.isArray(data.studies) ? data.studies : [];

    const investigators = [];
    const seen = new Set();

    for (const study of studies) {
      const extracted = extractInvestigators(study);
      for (const inv of extracted) {
        const key = inv.name + "|" + inv.nctId;
        if (!seen.has(key)) {
          seen.add(key);
          investigators.push(inv);
        }
      }
    }

    return {
      ok: true,
      investigators
    };
  }

  async function handleAnalyzeEndpoints(params) {
    if (params.nct_id) {
      // Single-trial mode
      const nctId = params.nct_id.toUpperCase();
      const data = await client.getJson("/studies/" + nctId);

      if (!data || !data.protocolSection) {
        return { ok: false, error: "Trial not found", nctId };
      }

      const endpoints = extractEndpoints(data);
      return {
        ok: true,
        mode: "single_trial",
        nctId,
        primaryEndpoints: endpoints.primary,
        secondaryEndpoints: endpoints.secondary,
        commonMeasures: []
      };
    }

    // Multi-trial aggregation mode
    const query = buildQueryString({
      "query.cond": params.condition || null,
      "filter.phase": toFilterList(params.phase),
      pageSize: params.page_size
    });

    if (params.start_date_after) {
      // The V2 API uses filter.advanced for date ranges
      // Append as an additional filter term
    }

    const data = await client.getJson("/studies" + query);
    const studies = Array.isArray(data.studies) ? data.studies : [];

    // Filter by start date if provided
    const filtered = params.start_date_after
      ? studies.filter(s => {
          const proto = (s && s.protocolSection) || {};
          const status = proto.statusModule || {};
          const startDate = status.startDateStruct ? status.startDateStruct.date || "" : "";
          return startDate >= params.start_date_after;
        })
      : studies;

    const allPrimary = [];
    const allSecondary = [];
    const measureCounts = new Map();

    for (const study of filtered) {
      const endpoints = extractEndpoints(study);
      const id = (study.protocolSection || {}).identificationModule || {};
      const nctId = id.nctId || "";

      for (const ep of endpoints.primary) {
        allPrimary.push({ ...ep, nctId });
        const key = ep.measure.toLowerCase().trim();
        if (key) measureCounts.set(key, (measureCounts.get(key) || 0) + 1);
      }

      for (const ep of endpoints.secondary) {
        allSecondary.push({ ...ep, nctId });
        const key = ep.measure.toLowerCase().trim();
        if (key) measureCounts.set(key, (measureCounts.get(key) || 0) + 1);
      }
    }

    // Sort by frequency to find common measures
    const commonMeasures = Array.from(measureCounts.entries())
      .filter(([, count]) => count > 1)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([measure, count]) => ({ measure, count }));

    return {
      ok: true,
      mode: "aggregated",
      trialsAnalyzed: filtered.length,
      primaryEndpoints: allPrimary,
      secondaryEndpoints: allSecondary,
      commonMeasures
    };
  }

  // -----------------------------------------------------------------------
  // Main execute
  // -----------------------------------------------------------------------

  async function execute(input) {
    const toolName = (input && typeof input.name === "string") ? input.name : "";
    const args = (input && isPlainObject(input.arguments)) ? input.arguments : {};

    if (!toolName) throw new Error("clinicaltrials-mcp: tool name is required");

    const schema = SCHEMA_BY_TOOL[toolName];
    if (!schema) throw new Error("clinicaltrials-mcp: unknown tool " + toolName);

    const validated = schema.parse(args);
    let result;

    switch (toolName) {
      case "ct_search_trials":
        result = await handleSearchTrials(validated);
        break;
      case "ct_get_trial_details":
        result = await handleGetTrialDetails(validated);
        break;
      case "ct_search_by_eligibility":
        result = await handleSearchByEligibility(validated);
        break;
      case "ct_search_by_sponsor":
        result = await handleSearchBySponsor(validated);
        break;
      case "ct_search_investigators":
        result = await handleSearchInvestigators(validated);
        break;
      case "ct_analyze_endpoints":
        result = await handleAnalyzeEndpoints(validated);
        break;
    }

    logger.info({
      event: "clinicaltrials_mcp_execute",
      tool_name: toolName,
      ok: result && result.ok
    });

    return JSON.stringify(result, null, 2);
  }

  // -----------------------------------------------------------------------
  // Health check
  // -----------------------------------------------------------------------

  async function isAvailable() {
    try {
      const data = await client.getJson("/studies?pageSize=1");
      return Array.isArray(data.studies);
    } catch (_) {
      return false;
    }
  }

  return Object.freeze({ execute, isAvailable });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse an age string like "18 Years" or "6 Months" into approximate years.
 * Returns null if unparseable.
 */
function parseAgeYears(ageStr) {
  if (!ageStr || typeof ageStr !== "string") return null;
  const match = ageStr.match(/^(\d+)\s*(year|month|week|day)/i);
  if (!match) return null;
  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  if (unit.startsWith("year")) return value;
  if (unit.startsWith("month")) return value / 12;
  if (unit.startsWith("week")) return value / 52;
  if (unit.startsWith("day")) return value / 365;
  return null;
}

module.exports = { createClinicaltrialsMcp };
