/**
 * Embedding parity check (2026-11-01, for the @xenova/transformers -> @huggingface/transformers port).
 *
 * Re-embeds each stored pack's source markdown with the CURRENT embedder and compares the result
 * with the vector already in Qdrant. A pack is compared only when its source is still readable AND
 * hashes to the stored content_sha256, so the text is exactly what was embedded at ingest time.
 * checkParity is read-only. reembed (backup first) and restoreVectors write VECTORS only, through
 * the store they are handed; payloads and source files are never touched.
 */
import { cosine } from "./embed.js";
import type { PackPayload } from "./types.js";

export type ParityPoint = {
  id: string;
  vector: number[] | undefined;
  payload: Pick<PackPayload, "pack_id" | "pack_title" | "source_uri" | "content_sha256" | "model_name">;
};

export type ParityStatus = "match" | "drift" | "source_missing" | "source_changed" | "no_vector";

export type ParityRow = {
  point_id: string;
  pack_id: string;
  pack_title: string;
  status: ParityStatus;
  cosine?: number;
};

export type ParityDeps = {
  /** Source markdown for a stored source_uri, or null when it cannot be read. */
  readSource: (uri: string) => Promise<string | null>;
  hash: (markdown: string) => string;
  embed: (markdown: string) => Promise<number[]>;
  /** Called with the fresh vector of every pack that was compared (match or drift). */
  onCompared?: (pointId: string, fresh: number[]) => void;
};

export type ParityResult = {
  rows: ParityRow[];
  compared: number;
  min_cosine: number | null;
  mean_cosine: number | null;
  threshold: number;
  pass: boolean;
};

/** Default bar: same model file and tokenizer should agree to float noise (cosine ~1.0). */
export const DEFAULT_MIN_COSINE = 0.999;

/**
 * The source_uri forms the store writes, mapped to a local path. Same mapping as
 * tools/pack_diff.ts loadFullMarkdown (obsidian:// is the operator's vault).
 */
export function resolveSourcePath(uri: string): string | null {
  if (!uri) return null;
  if (uri.startsWith("obsidian://")) return uri.replace(/^obsidian:\/\/[^/]+\//, "/Users/myhome/My Digital Garden/");
  if (uri.startsWith("file://")) return uri.replace("file://", "");
  return uri;
}

export async function checkParity(
  points: ParityPoint[],
  deps: ParityDeps,
  threshold: number = DEFAULT_MIN_COSINE,
): Promise<ParityResult> {
  const rows: ParityRow[] = [];
  const scores: number[] = [];
  for (const p of points) {
    const base = { point_id: p.id, pack_id: p.payload.pack_id, pack_title: p.payload.pack_title };
    if (!p.vector || p.vector.length === 0) {
      rows.push({ ...base, status: "no_vector" });
      continue;
    }
    const md = await deps.readSource(p.payload.source_uri);
    if (md === null) {
      rows.push({ ...base, status: "source_missing" });
      continue;
    }
    if (deps.hash(md) !== p.payload.content_sha256) {
      rows.push({ ...base, status: "source_changed" });
      continue;
    }
    const fresh = await deps.embed(md);
    const c = fresh.length === p.vector.length ? cosine(fresh, p.vector) : 0;
    deps.onCompared?.(p.id, fresh);
    scores.push(c);
    rows.push({ ...base, status: c >= threshold ? "match" : "drift", cosine: c });
  }
  const compared = scores.length;
  return {
    rows,
    compared,
    min_cosine: compared ? Math.min(...scores) : null,
    mean_cosine: compared ? scores.reduce((a, b) => a + b, 0) / compared : null,
    threshold,
    pass: compared > 0 && scores.every((c) => c >= threshold),
  };
}

/** The vector store as reembed/restoreVectors need it: read every point, replace some vectors. */
export type VectorStore = {
  loadAll: () => Promise<ParityPoint[]>;
  updateVectors: (points: { id: string; vector: number[] }[]) => Promise<void>;
};

/** What reembed saves before it writes, and what restoreVectors puts back. */
export type VectorBackup = {
  collection: string;
  model_name: string;
  created_at: string;
  points: { id: string; pack_id: string; vector: number[] }[];
};

/**
 * Re-embed every comparable pack with the current embedder, after saving its old vector. Used when
 * an embedder change moves vectors slightly (2026-11-01: the transformers.js port), so the stored
 * packs and new queries come from one embedder again. Packs that cannot be compared are left as
 * they are. The backup is written before any vector changes; if writing it fails, nothing changes.
 */
export async function reembed(
  store: VectorStore,
  deps: Omit<ParityDeps, "onCompared">,
  opts: {
    collection: string;
    modelName: string;
    nowIso: () => string;
    writeBackup: (backup: VectorBackup) => Promise<string>;
    threshold?: number;
  },
): Promise<{ before: ParityResult; updated: number; backup_path: string | null; after: ParityResult }> {
  const threshold = opts.threshold ?? DEFAULT_MIN_COSINE;
  const points = await store.loadAll();
  const fresh = new Map<string, number[]>();
  const before = await checkParity(points, { ...deps, onCompared: (id, v) => fresh.set(id, v) }, threshold);
  if (fresh.size === 0) return { before, updated: 0, backup_path: null, after: before };

  const backup: VectorBackup = {
    collection: opts.collection,
    model_name: opts.modelName,
    created_at: opts.nowIso(),
    points: points
      .filter((p) => fresh.has(p.id) && p.vector)
      .map((p) => ({ id: p.id, pack_id: p.payload.pack_id, vector: p.vector as number[] })),
  };
  const backupPath = await opts.writeBackup(backup);
  await store.updateVectors([...fresh].map(([id, vector]) => ({ id, vector })));
  const after = await checkParity(await store.loadAll(), deps, threshold);
  return { before, updated: fresh.size, backup_path: backupPath, after };
}

/** Put back the vectors a reembed backup holds. Refuses a backup taken from another collection. */
export async function restoreVectors(
  store: Pick<VectorStore, "updateVectors">,
  backup: VectorBackup,
  collection: string,
): Promise<number> {
  if (backup.collection !== collection) {
    throw new Error(`backup is for collection "${backup.collection}", not "${collection}"`);
  }
  if (!Array.isArray(backup.points) || backup.points.some((p) => !p.id || !Array.isArray(p.vector))) {
    throw new Error("backup has no valid points");
  }
  await store.updateVectors(backup.points.map((p) => ({ id: p.id, vector: p.vector })));
  return backup.points.length;
}
