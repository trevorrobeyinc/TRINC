import { z } from "zod";
import type { McpServerConfig } from "./types";

export interface McpCatalogEntry {
  toolName: string;
  displayName: string;
  description: string;
  categoryDescription?: string;
  /**
   * Bridge operation hint. The bridge validates this against a STRICT zod enum
   * (obsidian ops only) BEFORE dispatching, so a tool whose name is not in this
   * list MUST omit `operation` entirely — the dispatcher keys on `tool` anyway.
   * Verified 2026-08-12: sending operation:"miyo_search_context" returns HTTP 400
   * invalid_enum_value.
   */
  operation?:
    | "open_vault"
    | "create_note"
    | "append_note"
    | "read_note"
    | "search_notes"
    | "execute_command";
  isMutating: boolean;
  schema: z.ZodTypeAny;
  buildInput: (args: Record<string, unknown>, server: McpServerConfig) => Record<string, unknown>;
}

export const MCP_TOOL_CATALOG: Record<string, McpCatalogEntry> = {
  obsidian_health: {
    toolName: "obsidian_health",
    displayName: "Obsidian MCP Health",
    description: "Check the configured MCP bridge health, routing, and security state.",
    isMutating: false,
    schema: z.object({}),
    buildInput: () => ({}),
  },
  obsidian_open_vault: {
    toolName: "obsidian_open_vault",
    displayName: "Open Vault",
    description: "Open the configured Obsidian vault or a path within it via the MCP bridge.",
    operation: "open_vault",
    isMutating: false,
    schema: z.object({
      path: z.string().optional().describe("Optional vault-relative path to open"),
      paneType: z
        .enum(["tab", "split", "window"])
        .optional()
        .describe("How the target should open in Obsidian"),
    }),
    buildInput: (args, server) => ({
      vault: server.vaultName,
      path: args.path,
      paneType: args.paneType,
    }),
  },
  obsidian_read_note: {
    toolName: "obsidian_read_note",
    displayName: "Read Note via MCP",
    description: "Read a vault note through the configured MCP bridge.",
    operation: "read_note",
    isMutating: false,
    schema: z.object({
      path: z.string().min(1).describe("Vault-relative path to read"),
    }),
    buildInput: (args, server) => ({
      vault: server.vaultName,
      vaultRoot: server.vaultRoot,
      path: args.path,
    }),
  },
  obsidian_search_notes: {
    toolName: "obsidian_search_notes",
    displayName: "Search Notes via MCP",
    description: "Search notes through the configured MCP bridge.",
    operation: "search_notes",
    isMutating: false,
    schema: z.object({
      query: z.string().min(1).describe("Search query"),
      path: z.string().optional().describe("Optional folder path limit"),
      limit: z.number().int().positive().max(500).optional().describe("Optional result limit"),
      caseSensitive: z.boolean().optional().describe("Whether the search should be case sensitive"),
    }),
    buildInput: (args, server) => ({
      vault: server.vaultName,
      query: args.query,
      path: args.path,
      limit: args.limit,
      caseSensitive: args.caseSensitive,
    }),
  },
  obsidian_execute_command: {
    toolName: "obsidian_execute_command",
    displayName: "Execute Command via MCP",
    description: "Execute an Obsidian command ID through the MCP bridge.",
    operation: "execute_command",
    // Security (audit RF-3): command execution is mutating/dangerous — classify it as such
    // so read-only / prompt-on-writes policies correctly withhold it.
    isMutating: true,
    schema: z.object({
      id: z.string().min(1).describe("Obsidian command ID to execute"),
    }),
    buildInput: (args, server) => ({
      vault: server.vaultName,
      id: args.id,
    }),
  },
  obsidian_create_note: {
    toolName: "obsidian_create_note",
    displayName: "Create Note via MCP",
    description: "Create a note through the configured MCP bridge.",
    operation: "create_note",
    isMutating: true,
    schema: z.object({
      path: z.string().min(1).describe("Vault-relative note path to create"),
      content: z.string().default("").describe("Initial note content"),
      overwrite: z.boolean().optional().describe("Whether to overwrite an existing note"),
      open: z.boolean().optional().describe("Whether to open the note after creation"),
      newtab: z.boolean().optional().describe("Whether to open the note in a new tab"),
    }),
    buildInput: (args, server) => ({
      vault: server.vaultName,
      vaultRoot: server.vaultRoot,
      path: args.path,
      content: args.content,
      overwrite: args.overwrite,
      open: args.open,
      newtab: args.newtab,
    }),
  },
  obsidian_append_note: {
    toolName: "obsidian_append_note",
    displayName: "Append Note via MCP",
    description: "Append content to a note through the configured MCP bridge.",
    operation: "append_note",
    isMutating: true,
    schema: z.object({
      path: z.string().min(1).describe("Vault-relative note path"),
      content: z.string().min(1).describe("Content to append"),
      inline: z.boolean().optional().describe("Append without a leading newline"),
      idempotencyKey: z
        .string()
        .optional()
        .describe("Optional idempotency key; generated automatically if omitted"),
    }),
    buildInput: (args, server) => ({
      vault: server.vaultName,
      vaultRoot: server.vaultRoot,
      path: args.path,
      content: args.content,
      inline: args.inline,
      idempotencyKey: args.idempotencyKey,
    }),
  },
  // ── OpenClaw research-engine control surface ──────────────────────
  // Served by the Command Center bridge (:8799), which spawns run-workflow.js.
  // Completed-run output is pushed back into chat via the :8798 bridge's
  // `research` SSE stream (see McpEventBridge), so these tools drive the engine
  // while results arrive asynchronously as chat bubbles.
  obsidian_openclaw_run_workflow: {
    toolName: "obsidian_openclaw_run_workflow",
    displayName: "Run OpenClaw Research Workflow",
    description:
      "Start an OpenClaw research-engine workflow via the Command Center bridge. Launches a real, compute-costing run (typically 5-10 minutes); monitor with obsidian_openclaw_status and read output with obsidian_openclaw_results (results also arrive as a chat bubble when the run finishes).",
    // Mutating: launches a real research run (spawns run-workflow.js, consumes compute).
    isMutating: true,
    schema: z.object({
      template: z
        .string()
        .min(1)
        .describe("Workflow template id (use obsidian_openclaw_templates to list available ids)"),
      inputs: z
        // Zod v4 (upstream 4.0.0) requires explicit key AND value types for
        // z.record(); v3 allowed z.record(valueType) alone. Ported 2026-08-12.
        .record(z.string(), z.string())
        .optional()
        .describe("Template inputs as string key/value pairs (e.g. { indication: 'NSCLC' })"),
    }),
    buildInput: (args) => ({
      template: args.template,
      inputs: args.inputs ?? {},
    }),
  },
  obsidian_openclaw_status: {
    toolName: "obsidian_openclaw_status",
    displayName: "OpenClaw Workflow Status",
    description:
      "Check the status (idle / running / completed) of the current or most recent OpenClaw research workflow.",
    isMutating: false,
    schema: z.object({}),
    buildInput: () => ({}),
  },
  obsidian_openclaw_results: {
    toolName: "obsidian_openclaw_results",
    displayName: "OpenClaw Workflow Results",
    description: "Fetch the results of the most recent completed OpenClaw research workflow.",
    isMutating: false,
    schema: z.object({}),
    buildInput: () => ({}),
  },
  obsidian_openclaw_templates: {
    toolName: "obsidian_openclaw_templates",
    displayName: "OpenClaw Workflow Templates",
    description: "List the OpenClaw research workflow templates available to run.",
    isMutating: false,
    schema: z.object({}),
    buildInput: () => ({}),
  },
  // Added 2026-08-12 during the 4.0.0 port. Schema mirrors the bridge's own
  // zod schema in obsidian-copilot-bridge/src/server/tools/miyoSearchContext.ts:
  //   { query: string().min(1), vault?: string().min(1), limit?: int 1..20 (default 5) }
  // NOTE: deliberately NO `operation` field — the bridge validates `operation`
  // against a strict enum of the 6 obsidian ops and 400s on anything else.
  // The dispatcher keys on the full tool name, sent as `tool`. Verified live.
  miyo_search_context: {
    toolName: "miyo_search_context",
    displayName: "Miyo Semantic Vault Search",
    description:
      "Semantic (embedding-based) search over the vault via Miyo, through the MCP bridge. " +
      "Use for meaning-based recall; use obsidian_search_notes for literal keyword matches.",
    isMutating: false,
    schema: z.object({
      query: z.string().min(1).describe("Natural-language search query"),
      limit: z
        .number()
        .int()
        .positive()
        .max(20)
        .optional()
        .describe("Max results (1-20, bridge default 5)"),
    }),
    buildInput: (args, server) => ({
      vault: server.vaultName,
      query: args.query,
      limit: args.limit,
    }),
  },
};

export function getMcpCatalogEntry(toolName: string): McpCatalogEntry | undefined {
  return MCP_TOOL_CATALOG[toolName];
}

export function getMcpCatalogToolNames(): string[] {
  return Object.keys(MCP_TOOL_CATALOG);
}
