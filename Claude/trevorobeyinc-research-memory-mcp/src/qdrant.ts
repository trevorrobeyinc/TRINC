/**
 * Qdrant client wrapper. Collection lifecycle, dedupe lookup, point CRUD.
 * Plan section: Phase 2 (collection schema), Phase 6 (idempotency).
 */
import { QdrantClient } from "@qdrant/js-client-rest";
import { McpToolError, type PackPayload } from "./types.js";
import { log } from "./log.js";
import { MODEL_DIM, MODEL_NAME } from "./embed.js";

const URL = process.env.QDRANT_URL || "http://127.0.0.1:6333";
const COLLECTION = process.env.QDRANT_COLLECTION || "trevorobeyinc-packs";

export const collectionName = COLLECTION;

let clientInstance: QdrantClient | null = null;
let ensuredCollection = false;

export function getClient(): QdrantClient {
  if (clientInstance) return clientInstance;
  clientInstance = new QdrantClient({ url: URL });
  return clientInstance;
}

export async function ensureCollection(): Promise<void> {
  if (ensuredCollection) return;
  const client = getClient();
  try {
    const list = await client.getCollections();
    const exists = list.collections.some((c) => c.name === COLLECTION);
    if (!exists) {
      await client.createCollection(COLLECTION, {
        vectors: { size: MODEL_DIM, distance: "Cosine" },
      });
      log("info", "collection_created", {
        collection: COLLECTION,
        dim: MODEL_DIM,
      });
      // Create payload indexes for filterable fields.
      const keywordFields = [
        "pack_id",
        "client",
        "topic",
        "tags",
        "mesh_terms",
        "content_sha256",
        "model_name",
      ];
      for (const field of keywordFields) {
        await client.createPayloadIndex(COLLECTION, {
          field_name: field,
          field_schema: "keyword",
        });
      }
      await client.createPayloadIndex(COLLECTION, {
        field_name: "ingested_at",
        field_schema: "datetime",
      });
      log("info", "payload_indexes_created", { collection: COLLECTION });
    }
    ensuredCollection = true;
  } catch (err) {
    throw new McpToolError(
      "QDRANT_UNREACHABLE",
      `Qdrant at ${URL} unreachable: ${(err as Error).message}`,
    );
  }
}

export type PointWithVector = {
  id: string | number;
  payload: PackPayload;
  vector?: number[];
};

export async function findByContentHash(
  hash: string,
): Promise<PointWithVector | null> {
  await ensureCollection();
  const client = getClient();
  const res = await client.scroll(COLLECTION, {
    filter: {
      must: [{ key: "content_sha256", match: { value: hash } }],
    },
    limit: 1,
    with_payload: true,
    with_vector: false,
  });
  const p = res.points[0];
  if (!p) return null;
  return { id: p.id, payload: p.payload as unknown as PackPayload };
}

export async function findByPackId(
  packId: string,
): Promise<PointWithVector | null> {
  await ensureCollection();
  const client = getClient();
  const res = await client.scroll(COLLECTION, {
    filter: { must: [{ key: "pack_id", match: { value: packId } }] },
    limit: 1,
    with_payload: true,
    with_vector: true,
  });
  const p = res.points[0];
  if (!p) return null;
  return {
    id: p.id,
    payload: p.payload as unknown as PackPayload,
    vector: Array.isArray(p.vector) ? (p.vector as number[]) : undefined,
  };
}

/**
 * Retry-once helper. Embedding can take 5-30s, leaving the Qdrant connection
 * pool stale; the next operation can hit ECONNRESET. One retry with a fresh
 * client handles the common case.
 */
async function withRetry<T>(op: () => Promise<T>, label: string): Promise<T> {
  try {
    return await op();
  } catch (err) {
    const msg = (err as Error).message ?? "";
    const cause = ((err as { cause?: { message?: string } }).cause?.message) ?? "";
    if (
      msg.includes("fetch failed") ||
      msg.includes("ECONNRESET") ||
      cause.includes("ECONNRESET") ||
      cause.includes("socket hang up")
    ) {
      log("warn", "qdrant_retry", { label, cause });
      // Force a fresh client (the previous one may be holding a dead socket).
      clientInstance = null;
      return await op();
    }
    throw err;
  }
}

export async function upsertPack(
  pointId: string,
  vector: number[],
  payload: PackPayload,
): Promise<void> {
  await ensureCollection();
  await withRetry(async () => {
    const client = getClient();
    await client.upsert(COLLECTION, {
      points: [{ id: pointId, vector, payload: payload as unknown as Record<string, unknown> }],
    });
  }, "upsertPack");
  log("info", "point_upserted", {
    pack_id: payload.pack_id,
    model_name: MODEL_NAME,
  });
}

export async function deleteByPackId(packId: string): Promise<number> {
  await ensureCollection();
  const client = getClient();
  const existing = await findByPackId(packId);
  if (!existing) return 0;
  await client.delete(COLLECTION, { points: [existing.id] });
  return 1;
}

export type SearchHit = {
  id: string | number;
  score: number;
  payload: PackPayload;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QdrantFilter = any;

export async function searchByVector(
  vector: number[],
  limit: number,
  scoreThreshold: number,
  filter?: Record<string, unknown>,
): Promise<SearchHit[]> {
  await ensureCollection();
  const client = getClient();
  const res = await client.search(COLLECTION, {
    vector,
    limit,
    score_threshold: scoreThreshold,
    with_payload: true,
    filter: filter as QdrantFilter,
  });
  return res.map((r) => ({
    id: r.id,
    score: r.score,
    payload: r.payload as unknown as PackPayload,
  }));
}

export async function scrollPacks(
  filter: Record<string, unknown> | undefined,
  limit: number,
  offset: number,
): Promise<{ total: number; points: PointWithVector[] }> {
  await ensureCollection();
  const client = getClient();
  const countRes = await client.count(COLLECTION, {
    filter: filter as QdrantFilter,
    exact: true,
  });
  const points: PointWithVector[] = [];
  let nextOffset: string | number | undefined = undefined;
  let skipped = 0;
  while (points.length < limit) {
    const res = await client.scroll(COLLECTION, {
      filter: filter as QdrantFilter,
      limit: Math.min(64, limit + offset - skipped),
      offset: nextOffset,
      with_payload: true,
      with_vector: false,
    });
    for (const p of res.points) {
      if (skipped < offset) {
        skipped++;
        continue;
      }
      if (points.length >= limit) break;
      points.push({ id: p.id, payload: p.payload as unknown as PackPayload });
    }
    if (!res.next_page_offset || points.length >= limit) break;
    nextOffset = res.next_page_offset as string | number;
  }
  return { total: countRes.count, points };
}

/** Build a Qdrant filter from the public Filters object. */
export function buildFilter(
  f?: {
    client?: string;
    topic?: string;
    tags?: string[];
    mesh_terms?: string[];
    ingested_after?: string;
    ingested_before?: string;
  },
  extraMust: Array<Record<string, unknown>> = [],
): Record<string, unknown> | undefined {
  const must: Array<Record<string, unknown>> = [...extraMust];
  if (!f) return must.length ? { must } : undefined;
  if (f.client) must.push({ key: "client", match: { value: f.client } });
  if (f.topic) must.push({ key: "topic", match: { value: f.topic } });
  if (f.tags && f.tags.length)
    must.push({ key: "tags", match: { any: f.tags } });
  if (f.mesh_terms && f.mesh_terms.length)
    must.push({ key: "mesh_terms", match: { any: f.mesh_terms } });
  if (f.ingested_after || f.ingested_before) {
    const range: Record<string, string> = {};
    if (f.ingested_after) range.gte = f.ingested_after;
    if (f.ingested_before) range.lte = f.ingested_before;
    must.push({ key: "ingested_at", range });
  }
  return must.length ? { must } : undefined;
}
