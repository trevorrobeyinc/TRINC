#!/usr/bin/env node
/**
 * trevorobeyinc-research-memory-mcp — stdio MCP server entry.
 * Plan section: Phase 5.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z, type ZodSchema } from "zod";
import { McpToolError } from "./types.js";
import { log } from "./log.js";
import {
  PackIngestArgs,
  PackSearchArgs,
  PackRelatedArgs,
  PackListArgs,
  PackDiffArgs,
  PackGetSectionArgs,
} from "./schema.js";
import { packIngest } from "./tools/pack_ingest.js";
import { packSearch } from "./tools/pack_search.js";
import { packRelated } from "./tools/pack_related.js";
import { packList } from "./tools/pack_list.js";
import { packDiff } from "./tools/pack_diff.js";
import { packGetSection } from "./tools/pack_get_section.js";

const server = new Server(
  {
    name: "trevorobeyinc-research-memory",
    version: "0.1.0",
  },
  {
    capabilities: { tools: {} },
  },
);

type ToolDef = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  zod: ZodSchema;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (args: any) => Promise<unknown>;
};

// JSON-Schema converters for the tool listing — minimal hand-built schemas matching the zod ones.
const tools: ToolDef[] = [
  {
    name: "pack_ingest",
    description:
      "Embed and store a completed Trevorobeyinc research pack. Idempotent on content hash — re-ingesting the same pack returns action=skipped_duplicate. Set replace_existing=true to overwrite a prior pack with the same pack_id.",
    inputSchema: {
      type: "object",
      properties: {
        markdown: { type: "string", description: "Pack body in markdown" },
        client: { type: "string" },
        topic: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        mesh_terms: { type: "array", items: { type: "string" } },
        pack_title: { type: "string" },
        source_uri: { type: "string" },
        synthesizer_version: { type: "string" },
        pack_id: { type: "string" },
        replace_existing: { type: "boolean", default: false },
      },
      required: ["markdown"],
      additionalProperties: false,
    },
    zod: PackIngestArgs,
    handler: packIngest,
  },
  {
    name: "pack_search",
    description:
      "Hybrid semantic + metadata search across all stored research packs. Returns ranked hits with snippet, score, and key payload fields.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        filters: { type: "object" },
        limit: { type: "number", default: 10 },
        score_threshold: { type: "number", default: 0.5 },
      },
      required: ["query"],
      additionalProperties: false,
    },
    zod: PackSearchArgs,
    handler: packSearch,
  },
  {
    name: "pack_related",
    description:
      "Find conceptually adjacent prior packs to a given pack_id using vector similarity. Useful at pack-creation time to surface previously-shipped work on adjacent topics.",
    inputSchema: {
      type: "object",
      properties: {
        pack_id: { type: "string" },
        limit: { type: "number", default: 5 },
        exclude_self: { type: "boolean", default: true },
        filters: { type: "object" },
      },
      required: ["pack_id"],
      additionalProperties: false,
    },
    zod: PackRelatedArgs,
    handler: packRelated,
  },
  {
    name: "pack_list",
    description:
      "Metadata-only listing of stored packs with filters, sort, and pagination. No vector search — use for analytics, dashboards, and inventory.",
    inputSchema: {
      type: "object",
      properties: {
        filters: { type: "object" },
        sort_by: { type: "string", enum: ["ingested_at", "pack_title"], default: "ingested_at" },
        sort_order: { type: "string", enum: ["asc", "desc"], default: "desc" },
        limit: { type: "number", default: 25 },
        offset: { type: "number", default: 0 },
      },
      additionalProperties: false,
    },
    zod: PackListArgs,
    handler: packList,
  },
  {
    name: "pack_diff",
    description:
      "Section-keyed comparison of two packs. Returns a skeleton (per-section status: added/removed/modified/unchanged + ~150-char excerpts) without dumping full bodies. To read a specific section's full body, follow up with pack_get_section.",
    inputSchema: {
      type: "object",
      properties: {
        pack_a: { type: "string" },
        pack_b: { type: "string" },
        focus_topic: { type: "string" },
        excerpt_chars: { type: "number", default: 150 },
      },
      required: ["pack_a", "pack_b"],
      additionalProperties: false,
    },
    zod: PackDiffArgs,
    handler: packDiff,
  },
  {
    name: "pack_get_section",
    description:
      "Lazy-fetch the body of a single section in a pack. Companion to pack_diff — call this after pack_diff identifies which sections matter for the synthesis.",
    inputSchema: {
      type: "object",
      properties: {
        pack_id: { type: "string" },
        section_title: { type: "string" },
      },
      required: ["pack_id", "section_title"],
      additionalProperties: false,
    },
    zod: PackGetSectionArgs,
    handler: packGetSection,
  },
];

const toolByName = new Map(tools.map((t) => [t.name, t]));

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools.map(({ name, description, inputSchema }) => ({
    name,
    description,
    inputSchema,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const def = toolByName.get(req.params.name);
  if (!def) {
    return {
      content: [
        { type: "text", text: JSON.stringify({ error: { code: "INVALID_ARGS", message: `Unknown tool: ${req.params.name}` } }) },
      ],
      isError: true,
    };
  }
  try {
    const parsed = def.zod.parse(req.params.arguments ?? {});
    const result = await def.handler(parsed);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    if (err instanceof z.ZodError) {
      log("error", `${def.name}_invalid_args`, { issues: err.issues });
      return {
        content: [
          { type: "text", text: JSON.stringify({ error: { code: "INVALID_ARGS", message: err.message, issues: err.issues } }) },
        ],
        isError: true,
      };
    }
    if (err instanceof McpToolError) {
      log("error", `${def.name}_failed`, { code: err.code, message: err.message });
      return {
        content: [
          { type: "text", text: JSON.stringify({ error: { code: err.code, message: err.message } }) },
        ],
        isError: true,
      };
    }
    const message = (err as Error).message ?? String(err);
    log("error", `${def.name}_unexpected`, { message });
    return {
      content: [
        { type: "text", text: JSON.stringify({ error: { code: "INVALID_ARGS", message } }) },
      ],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log("info", "mcp_server_start", { name: "trevorobeyinc-research-memory", version: "0.1.0" });
}

main().catch((err) => {
  log("error", "mcp_server_fatal", { message: (err as Error).message });
  process.stderr.write(`research-memory MCP fatal: ${(err as Error).message}\n`);
  process.exit(1);
});
