/**
 * pack_search — hybrid semantic + metadata search.
 * Plan section: Phase 3.
 */
import { embedQuery } from "../embed.js";
import { buildFilter, searchByVector } from "../qdrant.js";
import type { PackSearchArgsT } from "../schema.js";
import type { PackSearchResult } from "../types.js";
import { McpToolError } from "../types.js";
import { log } from "../log.js";

export async function packSearch(
  args: PackSearchArgsT,
): Promise<{ results: PackSearchResult[] }> {
  const start = Date.now();
  let qVec: number[];
  try {
    qVec = await embedQuery(args.query);
  } catch (err) {
    throw new McpToolError("EMBED_FAILED", (err as Error).message);
  }
  const filter = buildFilter(args.filters);
  const hits = await searchByVector(qVec, args.limit, args.score_threshold, filter);
  const results: PackSearchResult[] = hits.map((h) => ({
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
  log("info", "pack_search", {
    query_chars: args.query.length,
    hit_count: results.length,
    latency_ms: Date.now() - start,
  });
  return { results };
}
