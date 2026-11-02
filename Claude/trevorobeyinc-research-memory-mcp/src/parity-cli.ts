#!/usr/bin/env node
/**
 * `npm run parity` — embedding parity check against the live collection.
 *
 *   node dist/parity-cli.js [--min 0.999] [--json]          read-only check (the default)
 *   node dist/parity-cli.js --reembed [--backup-dir DIR]    back up, then re-embed comparable packs
 *   node dist/parity-cli.js --restore FILE                  put a backup's vectors back
 *
 * Exit 0: every comparable pack matches its stored vector (cosine >= --min) and at least one was
 * comparable (after --reembed: the re-check passes; after --restore: the vectors were written).
 * Exit 1: a pack drifted, or none could be compared. Exit 2: Qdrant or the model is unreachable,
 * or the arguments are wrong. The check uses scroll only (never ensureCollection, which can create
 * the collection). --reembed and --restore change vectors only, never payloads, and --reembed writes
 * its backup (default ~/.local/share/trinc-rollback/) before it changes anything. The embedder stays
 * offline unless EMBED_ALLOW_REMOTE=1.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { collectionName, getClient } from "./qdrant.js";
import { CACHE_DIR, MODEL_NAME, embedDocument } from "./embed.js";
import { hashPack } from "./hash.js";
import {
  DEFAULT_MIN_COSINE,
  checkParity,
  reembed,
  resolveSourcePath,
  restoreVectors,
  type ParityPoint,
  type ParityResult,
  type VectorBackup,
  type VectorStore,
} from "./parity.js";
import type { PackPayload } from "./types.js";

type Args = { min: number; json: boolean; reembed: boolean; restore: string | null; backupDir: string };

function parseArgs(argv: string[]): Args {
  const out: Args = {
    min: DEFAULT_MIN_COSINE,
    json: false,
    reembed: false,
    restore: null,
    backupDir: path.join(os.homedir(), ".local", "share", "trinc-rollback"),
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") out.json = true;
    else if (a === "--reembed") out.reembed = true;
    else if (a === "--restore") out.restore = argv[++i] ?? "";
    else if (a === "--backup-dir") out.backupDir = argv[++i] ?? "";
    else if (a === "--min") {
      const v = Number(argv[++i]);
      if (!Number.isFinite(v) || v <= 0 || v > 1) throw new Error("--min must be a number in (0, 1]");
      out.min = v;
    } else throw new Error(`unknown argument: ${a}`);
  }
  if (out.reembed && out.restore !== null) throw new Error("use --reembed or --restore, not both");
  if (out.restore === "") throw new Error("--restore needs a backup file");
  if (!out.backupDir) throw new Error("--backup-dir needs a directory");
  return out;
}

const store: VectorStore = {
  async loadAll(): Promise<ParityPoint[]> {
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
  },
  async updateVectors(points) {
    await getClient().updateVectors(collectionName, { wait: true, points });
  },
};

async function readSource(uri: string): Promise<string | null> {
  const p = resolveSourcePath(uri);
  if (!p) return null;
  try {
    return await readFile(p, "utf8");
  } catch {
    return null;
  }
}

const deps = { readSource, hash: hashPack, embed: embedDocument };

function print(label: string, total: number, r: ParityResult): void {
  process.stdout.write(`${label}collection ${collectionName}: ${total} pack(s); model ${MODEL_NAME}; cache ${CACHE_DIR}\n`);
  for (const row of r.rows) {
    const c = row.cosine === undefined ? "" : ` cosine ${row.cosine.toFixed(6)}`;
    process.stdout.write(`  ${row.status.padEnd(14)} ${row.pack_id}${c}  ${row.pack_title}\n`);
  }
  const stats = r.compared ? `min ${r.min_cosine!.toFixed(6)}, mean ${r.mean_cosine!.toFixed(6)}` : "nothing comparable";
  process.stdout.write(`compared ${r.compared} of ${total} (${stats}); threshold ${r.threshold}: ${r.pass ? "PASS" : "FAIL"}\n`);
}

async function writeBackup(backupDir: string, backup: VectorBackup): Promise<string> {
  await mkdir(backupDir, { recursive: true });
  const file = path.join(backupDir, `research-memory-vectors-${backup.created_at.replace(/[:.]/g, "-")}.json`);
  await writeFile(file, `${JSON.stringify(backup)}\n`, { encoding: "utf8", flag: "wx" });
  return file;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));

  if (args.restore !== null) {
    const backup = JSON.parse(await readFile(args.restore, "utf8")) as VectorBackup;
    const n = await restoreVectors(store, backup, collectionName);
    process.stdout.write(`restored ${n} vector(s) from ${args.restore} (taken ${backup.created_at}, model ${backup.model_name})\n`);
    return 0;
  }

  if (args.reembed) {
    const r = await reembed(store, deps, {
      collection: collectionName,
      modelName: MODEL_NAME,
      nowIso: () => new Date().toISOString(),
      writeBackup: (b) => writeBackup(args.backupDir, b),
      threshold: args.min,
    });
    if (args.json) {
      process.stdout.write(`${JSON.stringify({ collection: collectionName, model: MODEL_NAME, ...r }, null, 2)}\n`);
    } else {
      print("before: ", r.before.rows.length, r.before);
      if (r.updated === 0) {
        process.stdout.write("nothing comparable, so nothing was re-embedded and no backup was written\n");
        return 1;
      }
      process.stdout.write(`re-embedded ${r.updated} pack(s); old vectors saved to ${r.backup_path}\n`);
      process.stdout.write(`undo with: node dist/parity-cli.js --restore "${r.backup_path}"\n`);
      print("after:  ", r.after.rows.length, r.after);
    }
    return r.updated > 0 && r.after.pass ? 0 : 1;
  }

  const points = await store.loadAll();
  const result = await checkParity(points, deps, args.min);
  if (args.json) {
    process.stdout.write(`${JSON.stringify({ collection: collectionName, model: MODEL_NAME, cache_dir: CACHE_DIR, points: points.length, ...result }, null, 2)}\n`);
  } else {
    print("", points.length, result);
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
