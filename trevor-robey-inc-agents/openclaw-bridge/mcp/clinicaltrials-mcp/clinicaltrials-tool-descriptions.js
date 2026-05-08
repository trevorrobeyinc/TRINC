"use strict";

/**
 * Tool descriptions for the ClinicalTrials.gov MCP, formatted for injection
 * into the agentic loop LLM prompt via buildToolInstructionBlock().
 *
 * @module clinicaltrials-tool-descriptions
 */

const CLINICALTRIALS_TOOL_DESCRIPTIONS = Object.freeze([
  {
    name: "ct_search_trials",
    description: "Search ClinicalTrials.gov for studies by condition, intervention, sponsor, status, phase, or location",
    parameters: '{ ["condition": "..."] [, "intervention": "..."] [, "sponsor": "..."] [, "status": "RECRUITING"] [, "phase": "PHASE3"] [, "location": "..."] [, "study_type": "INTERVENTIONAL|OBSERVATIONAL|EXPANDED_ACCESS"] [, "page_size": 10] [, "page_token": "..."] [, "count_total": false] [, "advanced_query": "..."] }'
  },
  {
    name: "ct_get_trial_details",
    description: "Get comprehensive details for a specific clinical trial by NCT ID",
    parameters: '{ "nct_id": "NCT00000000" }'
  },
  {
    name: "ct_search_by_eligibility",
    description: "Find recruiting trials filtered by eligibility criteria such as age, sex, and condition keywords",
    parameters: '{ ["condition": "..."] [, "eligibility_keywords": "..."] [, "min_age": "18 Years"] [, "max_age": "65 Years"] [, "sex": "ALL|MALE|FEMALE"] [, "status": "RECRUITING"] [, "page_size": 10] [, "page_token": "..."] }'
  },
  {
    name: "ct_search_by_sponsor",
    description: "Search trials by sponsor organization name with optional condition and phase filters",
    parameters: '{ "sponsor_name": "...", ["condition": "..."] [, "phase": "PHASE3"] [, "status": "RECRUITING"] [, "page_size": 10] [, "page_token": "..."] [, "count_total": false] }'
  },
  {
    name: "ct_search_investigators",
    description: "Find principal investigators and study contacts across clinical trials",
    parameters: '{ ["condition": "..."] [, "investigator_name": "..."] [, "institution": "..."] [, "location": "..."] [, "status": "RECRUITING"] [, "page_size": 20] }'
  },
  {
    name: "ct_analyze_endpoints",
    description: "Analyze primary and secondary outcome measures for a single trial or across trials for a condition",
    parameters: '{ ["nct_id": "NCT00000000"] [, "condition": "..."] [, "phase": "PHASE3"] [, "start_date_after": "YYYY-MM-DD"] [, "page_size": 50] }'
  }
]);

module.exports = { CLINICALTRIALS_TOOL_DESCRIPTIONS };
