/**
 * pack_list — metadata-only listing with filters / sort / pagination.
 * Plan section: Phase 3.
 */
import { buildFilter, scrollPacks } from "../qdrant.js";
import type { PackListArgsT } from "../schema.js";
import type { PackPayload } from "../types.js";
import { log } from "../log.js";

export async function packList(args: PackListArgsT): Promise<{
  total: number;
  packs: { pack_id: string; pack_title: string; payload: PackPayload }[];
}> {
  const start = Date.now();
  const filter = buildFilter(args.filters);
  // Scroll fetches more than needed so we can sort properly.
  const fetched = await scrollPacks(filter, Math.max(args.limit + args.offset, 64), 0);
  const sorted = [...fetched.points].sort((a, b) => {
    const av =
      args.sort_by === "ingested_at" ? a.payload.ingested_at : a.payload.pack_title;
    const bv =
      args.sort_by === "ingested_at" ? b.payload.ingested_at : b.payload.pack_title;
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return args.sort_order === "asc" ? cmp : -cmp;
  });
  const page = sorted.slice(args.offset, args.offset + args.limit);
  log("info", "pack_list", {
    total: fetched.total,
    returned: page.length,
    latency_ms: Date.now() - start,
  });
  return {
    total: fetched.total,
    packs: page.map((p) => ({
      pack_id: p.payload.pack_id,
      pack_title: p.payload.pack_title,
      payload: p.payload,
    })),
  };
}
