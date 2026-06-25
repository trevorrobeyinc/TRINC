import { z } from "zod";
import type { McpServerConfig } from "./types";

export interface McpCatalogEntry {
  toolName: string;
  displayName: string;
  description: string;
  categoryDescription?: string;
  operation?: "open_vault" | "create_note" | "append_note" | "read_note" | "search_notes" | "execute_command";
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
      caseSensitive: z
        .boolean()
        .optional()
        .describe("Whether the search should be case sensitive"),
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
};

export function getMcpCatalogEntry(toolName: string): McpCatalogEntry | undefined {
  return MCP_TOOL_CATALOG[toolName];
}

export function getMcpCatalogToolNames(): string[] {
  return Object.keys(MCP_TOOL_CATALOG);
}
