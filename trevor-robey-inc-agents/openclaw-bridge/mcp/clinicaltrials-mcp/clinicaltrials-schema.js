"use strict";

const { z } = require("zod");

const CLINICALTRIALS_TOOL_NAMES = Object.freeze([
  "ct_search_trials",
  "ct_get_trial_details",
  "ct_search_by_eligibility",
  "ct_search_by_sponsor",
  "ct_search_investigators",
  "ct_analyze_endpoints"
]);

const StatusEnum = z.enum([
  "NOT_YET_RECRUITING",
  "RECRUITING",
  "ENROLLING_BY_INVITATION",
  "ACTIVE_NOT_RECRUITING",
  "COMPLETED",
  "SUSPENDED",
  "TERMINATED",
  "WITHDRAWN",
  "AVAILABLE",
  "NO_LONGER_AVAILABLE",
  "TEMPORARILY_NOT_AVAILABLE",
  "APPROVED_FOR_MARKETING",
  "WITHHELD",
  "UNKNOWN"
]);

const PhaseEnum = z.enum([
  "EARLY_PHASE1",
  "PHASE1",
  "PHASE2",
  "PHASE3",
  "PHASE4",
  "NA"
]);

const StatusFilter = z.union([StatusEnum, z.array(StatusEnum).min(1)]).optional();
const PhaseFilter = z.union([PhaseEnum, z.array(PhaseEnum).min(1)]).optional();
const DateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional();

const CtSearchTrialsSchema = z.object({
  condition: z.string().optional(),
  intervention: z.string().optional(),
  sponsor: z.string().optional(),
  status: StatusFilter,
  phase: PhaseFilter,
  location: z.string().optional(),
  study_type: z.enum(["INTERVENTIONAL", "OBSERVATIONAL", "EXPANDED_ACCESS"]).optional(),
  page_size: z.number().int().min(1).max(1000).default(10),
  page_token: z.string().optional(),
  count_total: z.boolean().default(false),
  advanced_query: z.string().optional()
}).strict();

const CtGetTrialDetailsSchema = z.object({
  nct_id: z.string().regex(/^NCT\d{8}$/i)
}).strict();

const CtSearchByEligibilitySchema = z.object({
  condition: z.string().optional(),
  eligibility_keywords: z.string().optional(),
  min_age: z.string().optional(),
  max_age: z.string().optional(),
  sex: z.enum(["ALL", "MALE", "FEMALE"]).optional(),
  status: StatusFilter,
  page_size: z.number().int().min(1).max(1000).default(10),
  page_token: z.string().optional()
}).strict();

const CtSearchBySponsorSchema = z.object({
  sponsor_name: z.string().min(1),
  condition: z.string().optional(),
  phase: PhaseFilter,
  status: StatusFilter,
  page_size: z.number().int().min(1).max(1000).default(10),
  page_token: z.string().optional(),
  count_total: z.boolean().default(false)
}).strict();

const CtSearchInvestigatorsSchema = z.object({
  condition: z.string().optional(),
  investigator_name: z.string().optional(),
  institution: z.string().optional(),
  location: z.string().optional(),
  status: StatusFilter,
  page_size: z.number().int().min(1).max(1000).default(20)
}).strict();

const CtAnalyzeEndpointsSchema = z.object({
  nct_id: z.string().optional(),
  condition: z.string().optional(),
  phase: PhaseFilter,
  start_date_after: DateString,
  page_size: z.number().int().min(1).max(1000).default(50)
}).strict();

const SCHEMA_BY_TOOL = Object.freeze({
  ct_search_trials: CtSearchTrialsSchema,
  ct_get_trial_details: CtGetTrialDetailsSchema,
  ct_search_by_eligibility: CtSearchByEligibilitySchema,
  ct_search_by_sponsor: CtSearchBySponsorSchema,
  ct_search_investigators: CtSearchInvestigatorsSchema,
  ct_analyze_endpoints: CtAnalyzeEndpointsSchema
});

module.exports = {
  CLINICALTRIALS_TOOL_NAMES,
  SCHEMA_BY_TOOL,
  CtSearchTrialsSchema,
  CtGetTrialDetailsSchema,
  CtSearchByEligibilitySchema,
  CtSearchBySponsorSchema,
  CtSearchInvestigatorsSchema,
  CtAnalyzeEndpointsSchema
};
