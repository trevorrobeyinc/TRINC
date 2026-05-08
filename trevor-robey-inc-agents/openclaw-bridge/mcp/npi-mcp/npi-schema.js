"use strict";

const { z } = require("zod");

const NPI_TOOL_NAMES = Object.freeze([
  "npi_search",
  "npi_lookup",
  "npi_validate"
]);

const NpiSearchSchema = z.object({
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  organization_name: z.string().optional(),
  taxonomy_description: z.string().optional(),
  city: z.string().optional(),
  state: z.string().regex(/^[A-Z]{2}$/).optional(),
  postal_code: z.string().optional(),
  country_code: z.string().regex(/^[A-Z]{2}$/).optional(),
  enumeration_type: z.enum(["NPI-1", "NPI-2"]).optional(),
  limit: z.number().int().min(1).max(200).default(10),
  skip: z.number().int().min(0).max(1000).default(0),
  use_first_name_alias: z.boolean().optional()
}).strict();

const NpiLookupSchema = z.object({
  npi: z.string().regex(/^\d{10}$/)
}).strict();

const NpiValidateSchema = z.object({
  npi: z.string()
}).strict();

const SCHEMA_BY_TOOL = Object.freeze({
  npi_search: NpiSearchSchema,
  npi_lookup: NpiLookupSchema,
  npi_validate: NpiValidateSchema
});

module.exports = {
  NPI_TOOL_NAMES,
  SCHEMA_BY_TOOL,
  NpiSearchSchema,
  NpiLookupSchema,
  NpiValidateSchema
};
