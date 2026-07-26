/**
 * pack_diff — section-keyed comparison with lazy-fetch model.
 * Plan section: Phase 3 (refined 2026-04-26).
 *
 * Returns a skeleton: per-section status + ~150 char excerpts. Caller uses
 * pack_get_section to pull the full body of any section that matters.
 */
import { findByPackId, getClient, collectionName } from "../qdrant.js";
import { cosine } from "../embed.js";
import { excerptOf, parseSections } from "../section_parser.js";
import type { PackDiffArgsT } from "../schema.js";
import { McpToolError, type DiffSection, type SectionStatus } from "../types.js";
import { log } from "../log.js";
import type { PackPayload, Section } from "../types.js";
import { hashPack } from "../hash.js";

async function loadFullMarkdown(packId: string): Promise<string | null> {
  // Snippet is in payload but not the full body. We need the source markdown.
  // Strategy: re-read from source_uri if it's a local vault file path; otherwise return null.
  const point = await findByPackId(packId);
  if (!point) return null;
  const uri = point.payload.source_uri;
  if (!uri) return null;
  try {
    const path = uri.startsWith("obsidian://")
      ? uri.replace(/^obsidian:\/\/[^/]+\//, "/Users/myhome/My Digital Garden/")
      : uri.startsWith("file://")
        ? uri.replace("file://", "")
        : uri;
    const { readFileSync } = await import("node:fs");
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

async function loadPack(
  packId: string,
): Promise<{ payload: PackPayload; markdown: string | null; vector: number[] | undefined }> {
  const client = getClient();
  const res = await client.scroll(collectionName, {
    filter: { must: [{ key: "pack_id", match: { value: packId } }] },
    limit: 1,
    with_payload: true,
    with_vector: true,
  });
  const p = res.points[0];
  if (!p) {
    throw new McpToolError("INVALID_PACK_ID", `pack_id "${packId}" not found`);
  }
  const payload = p.payload as unknown as PackPayload;
  const markdown = await loadFullMarkdown(packId);
  return {
    payload,
    markdown,
    vector: Array.isArray(p.vector) ? (p.vector as number[]) : undefined,
  };
}

function statusFor(
  a: Section | undefined,
  b: Section | undefined,
): SectionStatus {
  if (a && !b) return "removed";
  if (!a && b) return "added";
  if (a && b) {
    return hashPack(a.body) === hashPack(b.body) ? "unchanged" : "modified";
  }
  return "unchanged";
}

export async function packDiff(args: PackDiffArgsT): Promise<{
  pack_a_title: string;
  pack_b_title: string;
  whole_pack_cosine_similarity: number;
  shared_tags: string[];
  shared_mesh_terms: string[];
  sections: DiffSection[];
  fallback_used?: boolean;
}> {
  const start = Date.now();
  const [a, b] = await Promise.all([loadPack(args.pack_a), loadPack(args.pack_b)]);

  // If we can't load source markdown, fall back to snippet-only comparison.
  const aMd = a.markdown ?? a.payload.snippet;
  const bMd = b.markdown ?? b.payload.snippet;

  const aParse = parseSections(aMd);
  const bParse = parseSections(bMd);
  const fallbackUsed = aParse.fallbackUsed || bParse.fallbackUsed;

  const aMap = new Map(aParse.sections.map((s) => [s.title.toLowerCase(), s]));
  const bMap = new Map(bParse.sections.map((s) => [s.title.toLowerCase(), s]));
  const allTitlesOrdered: string[] = [];
  const seen = new Set<string>();
  for (const s of [...aParse.sections, ...bParse.sections]) {
    const key = s.title.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      allTitlesOrdered.push(s.title);
    }
  }

  const sections: DiffSection[] = allTitlesOrdered.map((title) => {
    const key = title.toLowerCase();
    const sa = aMap.get(key);
    const sb = bMap.get(key);
    const status = statusFor(sa, sb);
    return {
      title,
      status,
      a_excerpt: sa ? excerptOf(sa, args.excerpt_chars) : undefined,
      b_excerpt: sb ? excerptOf(sb, args.excerpt_chars) : undefined,
    };
  });

  const wholeCos =
    a.vector && b.vector ? cosine(a.vector, b.vector) : 0;

  const sharedTags = a.payload.tags.filter((t) => b.payload.tags.includes(t));
  const sharedMesh = a.payload.mesh_terms.filter((m) =>
    b.payload.mesh_terms.includes(m),
  );

  log("info", "pack_diff", {
    pack_a: args.pack_a,
    pack_b: args.pack_b,
    sections: sections.length,
    fallback_used: fallbackUsed,
    latency_ms: Date.now() - start,
  });

  return {
    pack_a_title: a.payload.pack_title,
    pack_b_title: b.payload.pack_title,
    whole_pack_cosine_similarity: wholeCos,
    shared_tags: sharedTags,
    shared_mesh_terms: sharedMesh,
    sections,
    ...(fallbackUsed ? { fallback_used: true } : {}),
  };
}
