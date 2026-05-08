#!/usr/bin/env node
/**
 * Subprocess CLI entry — Mode B hook from the OpenClaw Command Center plugin.
 * Plan section: Phase 4.
 *
 * Usage:
 *   trevorobeyinc-research-memory-cli ingest --pack-file <path> [--client X] [--topic Y] [--tags a,b]
 *   trevorobeyinc-research-memory-cli search --query "..." [--limit N]
 *   trevorobeyinc-research-memory-cli list [--client X]
 *   trevorobeyinc-research-memory-cli health
 */
import { readFileSync } from "node:fs";
import { packIngest } from "./tools/pack_ingest.js";
import { packSearch } from "./tools/pack_search.js";
import { packList } from "./tools/pack_list.js";
import { ensureCollection, getClient, collectionName } from "./qdrant.js";
import { log } from "./log.js";

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        out[key] = next;
        i++;
      } else {
        out[key] = "true";
      }
    }
  }
  return out;
}

async function cmdIngest(args: Record<string, string>) {
  const path = args["pack-file"];
  if (!path) throw new Error("--pack-file <path> required");
  const md = readFileSync(path, "utf8");
  const result = await packIngest({
    markdown: md,
    client: args["client"],
    topic: args["topic"],
    tags: args["tags"]?.split(",").map((s) => s.trim()).filter(Boolean),
    mesh_terms: args["mesh-terms"]?.split(",").map((s) => s.trim()).filter(Boolean),
    source_uri: args["source-uri"] ?? `file://${path}`,
    synthesizer_version: args["synthesizer-version"],
    pack_id: args["pack-id"],
    pack_title: args["pack-title"],
    replace_existing: args["replace-existing"] === "true",
  });
  console.log(JSON.stringify(result, null, 2));
}

async function cmdSearch(args: Record<string, string>) {
  const query = args["query"];
  if (!query) throw new Error("--query <text> required");
  const result = await packSearch({
    query,
    limit: args["limit"] ? Number(args["limit"]) : 10,
    score_threshold: args["score-threshold"] ? Number(args["score-threshold"]) : 0.5,
  });
  console.log(JSON.stringify(result, null, 2));
}

async function cmdList(args: Record<string, string>) {
  const result = await packList({
    filters: args["client"] ? { client: args["client"] } : undefined,
    limit: args["limit"] ? Number(args["limit"]) : 25,
    offset: args["offset"] ? Number(args["offset"]) : 0,
    sort_by: "ingested_at",
    sort_order: "desc",
  });
  console.log(JSON.stringify(result, null, 2));
}

async function cmdHealth() {
  await ensureCollection();
  const client = getClient();
  const count = await client.count(collectionName, { exact: true });
  console.log(JSON.stringify({ ok: true, collection: collectionName, total_packs: count.count }, null, 2));
}

async function main() {
  const cmd = process.argv[2];
  const args = parseArgs(process.argv.slice(3));
  try {
    switch (cmd) {
      case "ingest":
        await cmdIngest(args);
        break;
      case "search":
        await cmdSearch(args);
        break;
      case "list":
        await cmdList(args);
        break;
      case "health":
        await cmdHealth();
        break;
      default:
        console.error("Usage: trevorobeyinc-research-memory-cli <ingest|search|list|health> [--flags]");
        process.exit(2);
    }
  } catch (err) {
    log("error", "cli_failed", { command: cmd, message: (err as Error).message });
    console.error(`error: ${(err as Error).message}`);
    process.exit(1);
  }
}

main();
