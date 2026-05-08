/**
 * pack_ingest — embed + store a research pack. Idempotent on content_sha256.
 * Plan section: Phase 3 + Phase 6.
 */
import { randomUUID } from "node:crypto";
import { hashPack } from "../hash.js";
import { embedDocument, MODEL_DIM, MODEL_NAME } from "../embed.js";
import {
  findByContentHash,
  findByPackId,
  upsertPack,
  deleteByPackId,
} from "../qdrant.js";
import { log } from "../log.js";
import type { PackIngestArgsT } from "../schema.js";
import type { IngestAction, PackPayload } from "../types.js";
import { McpToolError } from "../types.js";

function deriveTitle(md: string): string {
  const m = md.match(/^#\s+(.+?)\s*$/m);
  return m ? m[1].trim() : "Untitled Pack";
}

function deriveSnippet(md: string, max = 500): string {
  const noFrontmatter = md.replace(/^---\n[\s\S]*?\n---\n?/, "");
  // Strip ALL heading markers (line-by-line) so the snippet is pure prose,
  // not a flat string containing "## Background" tokens that confuse pack_diff parsers.
  const noHeadings = noFrontmatter
    .split("\n")
    .map((line) => line.replace(/^#+\s+/, ""))
    .join("\n");
  const body = noHeadings.trim().replace(/\s+/g, " ");
  return body.length > max ? body.slice(0, max).trimEnd() + "…" : body;
}

function defaultPackId(title: string, hash: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const today = new Date().toISOString().slice(0, 10);
  return `pack-${today}-${slug}-${hash.slice(0, 6)}`;
}

export async function packIngest(args: PackIngestArgsT): Promise<{
  pack_id: string;
  content_sha256: string;
  vector_count: number;
  action: IngestAction;
  ingested_at: string;
}> {
  const start = Date.now();
  const hash = hashPack(args.markdown);

  // Dedupe lookup before paying the embedding cost.
  const existing = await findByContentHash(hash);
  if (existing && !args.replace_existing) {
    log("info", "pack_ingest_skipped_duplicate", {
      pack_id: existing.payload.pack_id,
      content_sha256: hash,
      latency_ms: Date.now() - start,
    });
    return {
      pack_id: existing.payload.pack_id,
      content_sha256: hash,
      vector_count: 1,
      action: "skipped_duplicate",
      ingested_at: existing.payload.ingested_at,
    };
  }

  const title = args.pack_title ?? deriveTitle(args.markdown);
  const packId = args.pack_id ?? defaultPackId(title, hash);

  // If replace_existing is requested, ensure pack_id is one we can target.
  let action: IngestAction = "created";
  if (args.replace_existing) {
    const prior = await findByPackId(packId);
    if (prior) {
      await deleteByPackId(packId);
      action = "replaced";
    }
  } else {
    // If args.pack_id collides with an existing point that has a DIFFERENT hash, error.
    const collision = await findByPackId(packId);
    if (collision && collision.payload.content_sha256 !== hash) {
      throw new McpToolError(
        "DUPLICATE_PACK_ID",
        `pack_id "${packId}" already exists with different content. Use replace_existing: true to overwrite.`,
      );
    }
  }

  let vector: number[];
  try {
    vector = await embedDocument(args.markdown);
  } catch (err) {
    throw new McpToolError("EMBED_FAILED", (err as Error).message);
  }

  const ingestedAt = new Date().toISOString();
  const payload: PackPayload = {
    pack_id: packId,
    client: args.client ?? "internal",
    topic: args.topic ?? "general",
    tags: args.tags ?? [],
    mesh_terms: args.mesh_terms ?? [],
    ingested_at: ingestedAt,
    pack_title: title,
    source_uri: args.source_uri ?? "",
    content_sha256: hash,
    synthesizer_version: args.synthesizer_version ?? "unknown",
    model_name: MODEL_NAME,
    model_dim: MODEL_DIM,
    snippet: deriveSnippet(args.markdown),
    byte_size: Buffer.byteLength(args.markdown, "utf8"),
  };

  // Use a UUID for the Qdrant point id; pack_id lives in payload + index.
  const pointId = existing?.id?.toString() ?? randomUUID();
  await upsertPack(pointId, vector, payload);

  log("info", "pack_ingest_complete", {
    pack_id: packId,
    action,
    content_sha256: hash,
    latency_ms: Date.now() - start,
  });

  return {
    pack_id: packId,
    content_sha256: hash,
    vector_count: 1,
    action,
    ingested_at: ingestedAt,
  };
}
