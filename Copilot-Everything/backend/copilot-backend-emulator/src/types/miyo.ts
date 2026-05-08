import { z } from "zod";

export const miyoSearchFilterSchema = z
  .object({
    field: z.string().min(1),
    gte: z.number().optional(),
    lte: z.number().optional(),
    gt: z.number().optional(),
    lt: z.number().optional(),
    equals: z.union([z.string(), z.number(), z.boolean()]).optional(),
    containsAny: z.array(z.string()).optional(),
  })
  .strict();

export const miyoHealthResponseSchema = z
  .object({
    status: z.string(),
  })
  .passthrough();

export const miyoSearchRequestSchema = z
  .object({
    query: z.string().min(1),
    vault: z.string().min(1),
    limit: z.number().int().positive(),
    filters: z.array(miyoSearchFilterSchema).optional(),
  })
  .strict();

export const miyoSearchResultSchema = z
  .object({
    path: z.string().min(1),
    score: z.number().optional(),
    chunk_text: z.string().optional(),
  })
  .passthrough();

export const miyoSearchResponseSchema = z
  .object({
    results: z.array(miyoSearchResultSchema),
  })
  .passthrough();

export const miyoRelatedSearchRequestSchema = z
  .object({
    file_path: z.string().min(1),
    vault: z.string().min(1).optional(),
    limit: z.number().int().positive().optional(),
    filters: z.array(miyoSearchFilterSchema).optional(),
  })
  .strict();

export const miyoRelatedSearchResultSchema = z
  .object({
    path: z.string().min(1),
    score: z.number(),
  })
  .passthrough();

export const miyoRelatedSearchResponseSchema = z
  .object({
    results: z.array(miyoRelatedSearchResultSchema),
  })
  .passthrough();

export const miyoParseDocRequestSchema = z
  .object({
    path: z.string().min(1),
  })
  .strict();

export const miyoParseDocResponseSchema = z
  .object({
    text: z.string(),
    format: z.string(),
    source_path: z.string(),
    title: z.string().nullable().optional(),
    page_count: z.number().nullable().optional(),
  })
  .passthrough();

export const miyoIndexedFilesQuerySchema = z.object({
  vault: z.string().min(1),
  offset: z.coerce.number().int().nonnegative(),
  limit: z.coerce.number().int().positive(),
});

export const miyoIndexedFilesResponseSchema = z
  .object({
    files: z.array(
      z
        .object({
          path: z.string().min(1),
          mtime: z.number(),
        })
        .passthrough()
    ),
    total: z.number(),
  })
  .passthrough();

export const miyoIndexStatsQuerySchema = z.object({
  vault: z.string().min(1),
});

export const miyoIndexStatsResponseSchema = z
  .object({
    total_chunks: z.number(),
    total_files: z.number(),
    latest_mtime: z.number(),
  })
  .passthrough();

export const miyoDocumentsQuerySchema = z.object({
  vault: z.string().min(1),
  path: z.string().min(1),
});

export const miyoDocumentsResponseSchema = z
  .object({
    documents: z.array(
      z
        .object({
          id: z.string(),
          path: z.string(),
        })
        .passthrough()
    ),
  })
  .passthrough();

export const miyoUpsertDocumentSchema = z
  .object({
    id: z.string().min(1),
    path: z.string().min(1),
    title: z.string(),
    content: z.string(),
    created_at: z.number(),
    ctime: z.number(),
    mtime: z.number(),
    tags: z.array(z.string()),
    extension: z.string(),
    nchars: z.number(),
    metadata: z.record(z.unknown()),
  })
  .strict();

export const miyoIndexUpsertRequestSchema = z
  .object({
    vault: z.string().min(1),
    documents: z.array(miyoUpsertDocumentSchema),
  })
  .strict();

export const miyoIndexUpsertResponseSchema = z
  .object({
    upserted: z.number(),
  })
  .passthrough();

export const miyoIndexByPathRequestSchema = z
  .object({
    vault: z.string().min(1),
    path: z.string().min(1),
  })
  .strict();

export const miyoIndexByPathResponseSchema = z
  .object({
    deleted: z.number().optional(),
  })
  .passthrough();

export const miyoIndexClearRequestSchema = z
  .object({
    vault: z.string().min(1),
  })
  .strict();

export type MiyoSearchRequest = z.infer<typeof miyoSearchRequestSchema>;
export type MiyoRelatedSearchRequest = z.infer<typeof miyoRelatedSearchRequestSchema>;
export type MiyoParseDocRequest = z.infer<typeof miyoParseDocRequestSchema>;
export type MiyoIndexUpsertRequest = z.infer<typeof miyoIndexUpsertRequestSchema>;
export type MiyoIndexByPathRequest = z.infer<typeof miyoIndexByPathRequestSchema>;
export type MiyoIndexClearRequest = z.infer<typeof miyoIndexClearRequestSchema>;
