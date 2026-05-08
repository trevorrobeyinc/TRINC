/**
 * Shared TypeScript types — Pack payload, tool result shapes, error codes.
 * Plan section: Phase 2 (payload schema), Phase 3 (tool surface).
 */

export type PackPayload = {
  pack_id: string;
  client: string;
  topic: string;
  tags: string[];
  mesh_terms: string[];
  ingested_at: string; // ISO-8601 UTC
  pack_title: string;
  source_uri: string;
  content_sha256: string;
  synthesizer_version: string;
  model_name: string;
  model_dim: number;
  snippet: string;
  byte_size: number;
};

export type IngestAction = "created" | "replaced" | "skipped_duplicate";

export type PackSearchResult = {
  pack_id: string;
  pack_title: string;
  score: number;
  snippet: string;
  payload: Pick<
    PackPayload,
    "client" | "topic" | "tags" | "mesh_terms" | "ingested_at" | "source_uri"
  >;
};

export type SectionStatus = "added" | "removed" | "modified" | "unchanged";

export type DiffSection = {
  title: string;
  status: SectionStatus;
  a_excerpt?: string;
  b_excerpt?: string;
  section_cosine_similarity?: number;
};

export type ErrorCode =
  | "COLLECTION_MISSING"
  | "EMBED_FAILED"
  | "QDRANT_UNREACHABLE"
  | "INVALID_PACK_ID"
  | "SECTION_NOT_FOUND"
  | "DUPLICATE_PACK_ID"
  | "INVALID_ARGS";

export class McpToolError extends Error {
  constructor(public code: ErrorCode, message: string) {
    super(message);
    this.name = "McpToolError";
  }
}

export type Section = {
  title: string;
  body: string; // raw markdown including the heading line
  startLine: number;
};
