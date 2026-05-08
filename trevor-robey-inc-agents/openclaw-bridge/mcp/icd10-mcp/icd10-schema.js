"use strict";

const { z } = require("zod");

const ICD10_TOOL_NAMES = Object.freeze([
  "icd10_search_codes",
  "icd10_lookup_code",
  "icd10_validate_code",
  "icd10_get_by_category",
  "icd10_get_by_body_system",
  "icd10_get_hierarchy"
]);

const CodeTypeEnum = z.enum(["diagnosis", "procedure"]);
const SearchByEnum = z.enum(["code", "description"]).default("description");

const Icd10SearchCodesSchema = z.object({
  query: z.string().min(1),
  code_type: CodeTypeEnum.default("diagnosis"),
  search_by: SearchByEnum,
  exact: z.boolean().default(false),
  limit: z.number().int().min(1).max(200).default(20),
  valid_for_hipaa_only: z.boolean().default(true)
}).strict();

const Icd10LookupCodeSchema = z.object({
  code: z.string().min(1),
  code_type: CodeTypeEnum
}).strict();

const Icd10ValidateCodeSchema = z.object({
  code: z.string().min(1),
  code_type: CodeTypeEnum
}).strict();

const Icd10GetByCategorySchema = z.object({
  chapter: z.string().length(1).optional(),
  category: z.string().length(3).optional(),
  valid_for_hipaa_only: z.boolean().default(true)
}).strict();

const Icd10GetByBodySystemSchema = z.object({
  body_system_code: z.string().min(1),
  section_code: z.string().optional(),
  limit: z.number().int().min(1).max(200).default(100),
  valid_for_hipaa_only: z.boolean().default(true)
}).strict();

const Icd10GetHierarchySchema = z.object({
  code_prefix: z.string().min(1)
}).strict();

const SCHEMA_BY_TOOL = Object.freeze({
  icd10_search_codes: Icd10SearchCodesSchema,
  icd10_lookup_code: Icd10LookupCodeSchema,
  icd10_validate_code: Icd10ValidateCodeSchema,
  icd10_get_by_category: Icd10GetByCategorySchema,
  icd10_get_by_body_system: Icd10GetByBodySystemSchema,
  icd10_get_hierarchy: Icd10GetHierarchySchema
});

module.exports = {
  ICD10_TOOL_NAMES,
  SCHEMA_BY_TOOL,
  Icd10SearchCodesSchema,
  Icd10LookupCodeSchema,
  Icd10ValidateCodeSchema,
  Icd10GetByCategorySchema,
  Icd10GetByBodySystemSchema,
  Icd10GetHierarchySchema
};
