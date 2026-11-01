#!/usr/bin/env node
/**
 * `npm run parity` — read-only embedding parity check against the live collection.
 *
 *   node dist/parity-cli.js [--min 0.999] [--json]
 *
 * Exit 0: every comparable pack re-embeds to its stored vector (cosine >= --min) and at least one
 * was comparable. Exit 1: a pack drifted, or none could be compared. Exit 2: Qdrant or the model
 * could not be reached. It never writes: it uses scroll only (not ensureCollection, which can
 * create the collection), and the embedder stays offline unless EMBED_ALLOW_REMOTE=1.
 */
import { readFile } from "node:fs/promises";
import { collectionName, getClient } from "./qdrant.js";
import { CACHE_DIR, MODEL_NAME, embedDocument } from "./embed.js";
import { hashPack } from "./hash.js";
import { DEFAULT_MIN_COSINE, checkParity, resolveSourcePath, type ParityPoint } from "./parity.js";
import type { PackPayload } from "./types.js";

function parseArgs(argv: string[]): { min: number; json: boolean } {
  let min = DEFAULT_MIN_COSINE;
  let json = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--json") json = true;
    else if (argv[i] === "--min") {
      const v = Number(argv[++i]);
      if (!Number.isFinite(v) || v <= 0 || v > 1) throw new Error("--min must be a number in (0, 1]");
      min = v;
    } else throw new Error(`unknown argument: ${argv[i]}`);
  }
  return { min, json };
}

async function loadAllPoints(): Promise<ParityPoint[]> {
  const client = getClient();
  const points: ParityPoint[] = [];
  let offset: string | number | undefined | null = undefined;
  do {
    const res = await client.scroll(collectionName, {
      limit: 64,
      offset: offset ?? undefined,
      with_payload: true,
      with_vector: true,
    });
    for (const p of res.points) {
      points.push({
        id: String(p.id),
        vector: Array.isArray(p.vector) ? (p.vector as number[]) : undefined,
        payload: p.payload as unknown as PackPayload,
      });
    }
    offset = res.next_page_offset as string | number | null | undefined;
  } while (offset !== null && offset !== undefined);
  return points;
}

async function readSource(uri: string): Promise<string | null> {
  const p = resolveSourcePath(uri);
  if (!p) return null;
  try {
    return await readFile(p, "utf8");
  } catch {
    return null;
  }
}

async function main(): Promise<number> {
  const { min, json } = parseArgs(process.argv.slice(2));
  let points: ParityPoint[];
  try {
    points = await loadAllPoints();
  } catch (err) {
    process.stderr.write(`parity: cannot read collection ${collectionName}: ${(err as Error).message}\n`);
    return 2;
  }
  let result;
  try {
    result = await checkParity(points, { readSource, hash: hashPack, embed: embedDocument }, min);
  } catch (err) {
    process.stderr.write(`parity: ${(err as Error).message}\n`);
    return 2;
  }
  if (json) {
    process.stdout.write(`${JSON.stringify({ collection: collectionName, model: MODEL_NAME, cache_dir: CACHE_DIR, points: points.length, ...result }, null, 2)}\n`);
  } else {
    process.stdout.write(`collection ${collectionName}: ${points.length} pack(s); model ${MODEL_NAME}; cache ${CACHE_DIR}\n`);
    for (const r of result.rows) {
      const c = r.cosine === undefined ? "" : ` cosine ${r.cosine.toFixed(6)}`;
      process.stdout.write(`  ${r.status.padEnd(14)} ${r.pack_id}${c}  ${r.pack_title}\n`);
    }
    const stats = result.compared
      ? `min ${result.min_cosine!.toFixed(6)}, mean ${result.mean_cosine!.toFixed(6)}`
      : "nothing comparable";
    process.stdout.write(`compared ${result.compared} of ${points.length} (${stats}); threshold ${min}: ${result.pass ? "PASS" : "FAIL"}\n`);
  }
  return result.pass ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`parity: ${(err as Error).message}\n`);
    process.exit(2);
  },
);
