/**
 * Embedding parity check (2026-11-01, for the @xenova/transformers -> @huggingface/transformers port).
 *
 * Re-embeds each stored pack's source markdown with the CURRENT embedder and compares the result
 * with the vector already in Qdrant. A pack is compared only when its source is still readable AND
 * hashes to the stored content_sha256, so the text is exactly what was embedded at ingest time.
 * Read-only: nothing here writes to Qdrant or to the source files.
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
    const base = { pack_id: p.payload.pack_id, pack_title: p.payload.pack_title };
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
