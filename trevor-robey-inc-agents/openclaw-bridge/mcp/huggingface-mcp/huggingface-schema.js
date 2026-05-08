"use strict";

const { z } = require("zod");

const HF_TOOL_NAMES = Object.freeze([
  "hf_paper_search",
  "hf_repo_search",
  "hf_repo_details",
  "hf_space_search",
  "hf_hub_query"
]);

const HfPaperSearchSchema = z.object({
  query: z.string().min(3).max(200),
  results_limit: z.number().int().min(1).max(100).default(12),
  concise_only: z.boolean().default(false)
}).strict();

const HfRepoSearchSchema = z.object({
  query: z.string().optional(),
  repo_types: z.array(z.enum(["model", "dataset", "space"])).default(["model", "dataset"]),
  author: z.string().optional(),
  filters: z.array(z.string()).optional(),
  sort: z.enum(["trendingScore", "downloads", "likes", "createdAt", "lastModified"]).optional(),
  limit: z.number().int().min(1).max(100).default(20)
}).strict();

const HfRepoDetailsSchema = z.object({
  repo_ids: z.array(z.string()).min(1).max(10),
  repo_type: z.enum(["model", "dataset", "space"]).optional()
}).strict();

const HfSpaceSearchSchema = z.object({
  query: z.string().min(1).max(100),
  limit: z.number().int().min(1).max(100).default(10),
  mcp: z.boolean().default(false)
}).strict();

const HfHubQuerySchema = z.object({
  message: z.string().min(1)
}).strict();

const SCHEMA_BY_TOOL = Object.freeze({
  hf_paper_search: HfPaperSearchSchema,
  hf_repo_search: HfRepoSearchSchema,
  hf_repo_details: HfRepoDetailsSchema,
  hf_space_search: HfSpaceSearchSchema,
  hf_hub_query: HfHubQuerySchema
});

module.exports = {
  HF_TOOL_NAMES,
  SCHEMA_BY_TOOL,
  HfPaperSearchSchema,
  HfRepoSearchSchema,
  HfRepoDetailsSchema,
  HfSpaceSearchSchema,
  HfHubQuerySchema
};
