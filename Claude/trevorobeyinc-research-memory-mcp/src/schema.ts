/**
 * zod argument schemas for all six tools. .strict() rejects unknown fields.
 * Plan section: Phase 3 (MCP tool surface).
 */
import { z } from "zod";

const FiltersSchema = z
  .object({
    client: z.string().optional(),
    topic: z.string().optional(),
    tags: z.array(z.string()).optional(),
    mesh_terms: z.array(z.string()).optional(),
    ingested_after: z.string().datetime().optional(),
    ingested_before: z.string().datetime().optional(),
  })
  .strict();

export const PackIngestArgs = z
  .object({
    markdown: z.string().min(1),
    client: z.string().optional(),
    topic: z.string().optional(),
    tags: z.array(z.string()).optional(),
    mesh_terms: z.array(z.string()).optional(),
    pack_title: z.string().optional(),
    source_uri: z.string().optional(),
    synthesizer_version: z.string().optional(),
    pack_id: z.string().optional(),
    replace_existing: z.boolean().optional().default(false),
  })
  .strict();

export const PackSearchArgs = z
  .object({
    query: z.string().min(1),
    filters: FiltersSchema.optional(),
    limit: z.number().int().min(1).max(50).optional().default(10),
    score_threshold: z.number().min(0).max(1).optional().default(0.5),
  })
  .strict();

export const PackRelatedArgs = z
  .object({
    pack_id: z.string().min(1),
    limit: z.number().int().min(1).max(50).optional().default(5),
    exclude_self: z.boolean().optional().default(true),
    filters: FiltersSchema.optional(),
  })
  .strict();

export const PackListArgs = z
  .object({
    filters: FiltersSchema.optional(),
    sort_by: z.enum(["ingested_at", "pack_title"]).optional().default("ingested_at"),
    sort_order: z.enum(["asc", "desc"]).optional().default("desc"),
    limit: z.number().int().min(1).max(200).optional().default(25),
    offset: z.number().int().min(0).optional().default(0),
  })
  .strict();

export const PackDiffArgs = z
  .object({
    pack_a: z.string().min(1),
    pack_b: z.string().min(1),
    focus_topic: z.string().optional(),
    excerpt_chars: z.number().int().min(50).max(500).optional().default(150),
  })
  .strict();

export const PackGetSectionArgs = z
  .object({
    pack_id: z.string().min(1),
    section_title: z.string().min(1),
  })
  .strict();

export type PackIngestArgsT = z.infer<typeof PackIngestArgs>;
export type PackSearchArgsT = z.infer<typeof PackSearchArgs>;
export type PackRelatedArgsT = z.infer<typeof PackRelatedArgs>;
export type PackListArgsT = z.infer<typeof PackListArgs>;
export type PackDiffArgsT = z.infer<typeof PackDiffArgs>;
export type PackGetSectionArgsT = z.infer<typeof PackGetSectionArgs>;
