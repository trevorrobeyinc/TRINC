/**
 * pack_related — find conceptually adjacent packs to a given pack_id.
 * Plan section: Phase 3.
 */
import { buildFilter, findByPackId, searchByVector } from "../qdrant.js";
import type { PackRelatedArgsT } from "../schema.js";
import { McpToolError, type PackSearchResult } from "../types.js";
import { log } from "../log.js";

export async function packRelated(
  args: PackRelatedArgsT,
): Promise<{ results: PackSearchResult[] }> {
  const start = Date.now();
  const seed = await findByPackId(args.pack_id);
  if (!seed) {
    throw new McpToolError(
      "INVALID_PACK_ID",
      `pack_id "${args.pack_id}" not found`,
    );
  }
  if (!seed.vector) {
    throw new McpToolError(
      "INVALID_PACK_ID",
      `pack_id "${args.pack_id}" has no stored vector`,
    );
  }

  const extraMust = args.exclude_self
    ? [{ key: "pack_id", match: { except: [args.pack_id] } }]
    : [];
  const filter = buildFilter(args.filters, extraMust);
  // Slightly higher fetch to absorb potential self-match if exclude not honored.
  const hits = await searchByVector(seed.vector, args.limit + 1, 0, filter);
  const filtered = hits.filter((h) => h.payload.pack_id !== args.pack_id).slice(0, args.limit);

  const results: PackSearchResult[] = filtered.map((h) => ({
    pack_id: h.payload.pack_id,
    pack_title: h.payload.pack_title,
    score: h.score,
    snippet: h.payload.snippet,
    payload: {
      client: h.payload.client,
      topic: h.payload.topic,
      tags: h.payload.tags,
      mesh_terms: h.payload.mesh_terms,
      ingested_at: h.payload.ingested_at,
      source_uri: h.payload.source_uri,
    },
  }));
  log("info", "pack_related", {
    seed_pack_id: args.pack_id,
    hit_count: results.length,
    latency_ms: Date.now() - start,
  });
  return { results };
}
