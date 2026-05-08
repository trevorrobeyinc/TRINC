"use strict";

const { z } = require("zod");

const GDRIVE_TOOL_NAMES = Object.freeze([
  "gdrive_search",
  "gdrive_fetch"
]);

const GdriveSearchSchema = z.object({
  query: z.string(),
  page_size: z.number().int().min(1).max(100).default(10),
  order_by: z.string().default("relevance desc"),
  page_token: z.string().optional()
}).strict();

const GdriveFetchSchema = z.object({
  document_ids: z.array(z.string()).min(1).max(10)
}).strict();

const SCHEMA_BY_TOOL = Object.freeze({
  gdrive_search: GdriveSearchSchema,
  gdrive_fetch: GdriveFetchSchema
});

module.exports = {
  GDRIVE_TOOL_NAMES,
  SCHEMA_BY_TOOL,
  GdriveSearchSchema,
  GdriveFetchSchema
};
