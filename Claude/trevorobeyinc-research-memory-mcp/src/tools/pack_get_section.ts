/**
 * pack_get_section — lazy companion to pack_diff. Returns one section's body.
 * Plan section: Phase 3 (added 2026-04-26).
 */
import { readFileSync } from "node:fs";
import { findByPackId } from "../qdrant.js";
import { findSection } from "../section_parser.js";
import type { PackGetSectionArgsT } from "../schema.js";
import { McpToolError } from "../types.js";
import { log } from "../log.js";

export async function packGetSection(args: PackGetSectionArgsT): Promise<{
  pack_id: string;
  pack_title: string;
  section_title: string;
  body: string;
  byte_size: number;
}> {
  const start = Date.now();
  const point = await findByPackId(args.pack_id);
  if (!point) {
    throw new McpToolError(
      "INVALID_PACK_ID",
      `pack_id "${args.pack_id}" not found`,
    );
  }
  const uri = point.payload.source_uri;
  let md: string | null = null;
  if (uri) {
    try {
      const path = uri.startsWith("obsidian://")
        ? uri.replace(/^obsidian:\/\/[^/]+\//, "/Users/myhome/My Digital Garden/")
        : uri.startsWith("file://")
          ? uri.replace("file://", "")
          : uri;
      md = readFileSync(path, "utf8");
    } catch {
      md = null;
    }
  }
  if (!md) md = point.payload.snippet;

  const section = findSection(md, args.section_title);
  if (!section) {
    throw new McpToolError(
      "SECTION_NOT_FOUND",
      `Section "${args.section_title}" not found in pack "${args.pack_id}"`,
    );
  }

  log("info", "pack_get_section", {
    pack_id: args.pack_id,
    section_title: section.title,
    body_bytes: Buffer.byteLength(section.body, "utf8"),
    latency_ms: Date.now() - start,
  });

  return {
    pack_id: args.pack_id,
    pack_title: point.payload.pack_title,
    section_title: section.title,
    body: section.body,
    byte_size: Buffer.byteLength(section.body, "utf8"),
  };
}
