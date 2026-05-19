"use strict";

const { z } = require("zod");

const OWKIN_TOOL_NAMES = Object.freeze([
  "owkin_list_cohorts",
  "owkin_cohort_description",
  "owkin_filter_slides",
  "owkin_survival_analysis",
  "owkin_list_cell_types",
  "owkin_filter_tiles",
  "owkin_get_histomics",
  "owkin_features_description"
]);

const EndpointEnum = z.enum(["OS", "PFS"]);
const LimitSchema = z.number().int().min(1).max(100);

const OwkinListCohortsSchema = z.object({}).strict();

const OwkinCohortDescriptionSchema = z.object({
  cohort: z.string().min(1),
  column_name: z.string().min(1)
}).strict();

const OwkinFilterSlidesSchema = z.object({
  cohort: z.string().min(1),
  column: z.string().min(1),
  descending: z.boolean().default(true),
  limit: LimitSchema.default(10)
}).strict();

const OwkinSurvivalAnalysisSchema = z.object({
  cohort: z.string().min(1),
  feature: z.string().min(1),
  endpoint: EndpointEnum,
  stratify: z.boolean().default(false)
}).strict();

const OwkinListCellTypesSchema = z.object({}).strict();

const OwkinFilterTilesSchema = z.object({
  cohort: z.string().min(1),
  slide_id: z.string().min(1),
  column: z.string().min(1),
  descending: z.boolean().default(true),
  limit: LimitSchema.default(25)
}).strict();

const OwkinGetHistomicsSchema = z.object({
  slide_ids: z.array(z.string().min(1)).min(1),
  column_names: z.array(z.string().min(1)).optional()
}).strict();

const OwkinFeaturesDescriptionSchema = z.object({
  cell_type: z.string().optional(),
  column_name: z.string().optional(),
  name_only: z.boolean().default(false)
}).strict();

const SCHEMA_BY_TOOL = Object.freeze({
  owkin_list_cohorts: OwkinListCohortsSchema,
  owkin_cohort_description: OwkinCohortDescriptionSchema,
  owkin_filter_slides: OwkinFilterSlidesSchema,
  owkin_survival_analysis: OwkinSurvivalAnalysisSchema,
  owkin_list_cell_types: OwkinListCellTypesSchema,
  owkin_filter_tiles: OwkinFilterTilesSchema,
  owkin_get_histomics: OwkinGetHistomicsSchema,
  owkin_features_description: OwkinFeaturesDescriptionSchema
});

module.exports = {
  OWKIN_TOOL_NAMES,
  SCHEMA_BY_TOOL,
  OwkinListCohortsSchema,
  OwkinCohortDescriptionSchema,
  OwkinFilterSlidesSchema,
  OwkinSurvivalAnalysisSchema,
  OwkinListCellTypesSchema,
  OwkinFilterTilesSchema,
  OwkinGetHistomicsSchema,
  OwkinFeaturesDescriptionSchema
};
