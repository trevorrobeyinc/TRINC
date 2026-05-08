#!/usr/bin/env node
// obsidian-mcp-stdio
// ───────────────────────────────────────────────────────────────────────────
// Lean stdio MCP server that wraps the official Obsidian CLI directly.
//
// Replaces the claude-adapter + obsidian-copilot-bridge pair for the Claude
// Code and Claude Desktop flows. No HTTP, no signed auth headers, no
// idempotency ledger, no queue scheduling — those were the bridge's
// reason-for-being and aren't needed when there is a single trusted client
// process talking over a private stdio pipe.
//
// Tool surface mirrors the bridge's:
//   obsidian_health
//   obsidian_open_vault
//   obsidian_create_note
//   obsidian_append_note
//   obsidian_read_note
//   obsidian_search_notes
//   obsidian_execute_command
//
// Configuration via environment variables (with sensible defaults):
//   OBSIDIAN_VAULT       default vault name      (default: "My Digital Garden")
//   OBSIDIAN_VAULT_ROOT  default vault abs path  (default: /Volumes/ExtraCurricular/My Digital Garden)
//   OBSIDIAN_BIN         CLI path                (default: /Applications/Obsidian.app/Contents/MacOS/obsidian)
//   OBSIDIAN_CLI_TIMEOUT timeout ms per CLI call (default: 20000)
// ───────────────────────────────────────────────────────────────────────────

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve as resolvePath, isAbsolute, sep } from "node:path";
import { z } from "zod";

const execFileAsync = promisify(execFile);

const VAULT      = process.env.OBSIDIAN_VAULT      || "My Digital Garden";
const VAULT_ROOT = process.env.OBSIDIAN_VAULT_ROOT || "/Volumes/ExtraCurricular/My Digital Garden";
const OBSIDIAN_BIN = process.env.OBSIDIAN_BIN     || "/Applications/Obsidian.app/Contents/MacOS/obsidian";
const CLI_TIMEOUT  = Number(process.env.OBSIDIAN_CLI_TIMEOUT || 20000);

// ───────────────────────────────────────────────────────────────────────────
// Path safety: refuse anything that resolves outside vaultRoot.
// ───────────────────────────────────────────────────────────────────────────
function assertSafeRelativePath(relativePath, vaultRoot = VAULT_ROOT) {
  if (typeof relativePath !== "string" || relativePath.length === 0) {
    throw new Error("path must be a non-empty string");
  }
  if (isAbsolute(relativePath)) {
    throw new Error(`path must be vault-relative, got absolute: ${relativePath}`);
  }
  const resolved = resolvePath(vaultRoot, relativePath);
  const root = resolvePath(vaultRoot) + sep;
  if (resolved !== resolvePath(vaultRoot) && !resolved.startsWith(root)) {
    throw new Error(`path escapes vault root: ${relativePath}`);
  }
  return relativePath;
}

// ───────────────────────────────────────────────────────────────────────────
// Thin wrapper around the Obsidian CLI. Always uses execFile with arg arrays
// (no shell), so user-supplied content can never be interpreted as commands.
// ───────────────────────────────────────────────────────────────────────────
async function runCli(args, { input } = {}) {
  try {
    const { stdout, stderr } = await execFileAsync(OBSIDIAN_BIN, args, {
      timeout: CLI_TIMEOUT,
      maxBuffer: 32 * 1024 * 1024, // 32 MB — generous for big notes
      input,
    });
    return { ok: true, stdout, stderr };
  } catch (err) {
    return {
      ok: false,
      error: {
        code: err.code,
        signal: err.signal,
        message: err.message,
        stdout: err.stdout || "",
        stderr: err.stderr || "",
      },
    };
  }
}

const okText = (text) => ({ content: [{ type: "text", text: typeof text === "string" ? text : JSON.stringify(text, null, 2) }] });
const failText = (msg) => ({ isError: true, content: [{ type: "text", text: msg }] });

// ───────────────────────────────────────────────────────────────────────────
// Tool definitions
// ───────────────────────────────────────────────────────────────────────────
const tools = [
  {
    name: "obsidian_health",
    description: "Probe the Obsidian CLI: returns binary version + vault registration. Used to verify the wrapper can talk to a running Obsidian.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
    schema: z.object({}),
    handler: async () => {
      const v  = await runCli(["version"]);
      const vs = await runCli(["vaults"]);
      return okText({
        bin: OBSIDIAN_BIN,
        version: v.ok ? v.stdout.trim() : `(error: ${v.error.message})`,
        vaults: vs.ok ? vs.stdout.trim().split("\n") : `(error: ${vs.error.message})`,
        defaultVault: VAULT,
        defaultVaultRoot: VAULT_ROOT,
      });
    },
  },
  {
    name: "obsidian_open_vault",
    description: "Open a vault, optionally focusing a specific note. Equivalent to `obsidian vault=<...> open file=<path>`.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        vault: { type: "string", description: "Vault name (default: My Digital Garden)" },
        path: { type: "string", description: "Optional note path relative to vault root" },
      },
    },
    schema: z.object({ vault: z.string().optional(), path: z.string().optional() }),
    handler: async (input) => {
      const vault = input.vault || VAULT;
      const args = [`vault=${vault}`];
      if (input.path) {
        assertSafeRelativePath(input.path);
        args.push("open", `path=${input.path}`);
      } else {
        args.push("open");
      }
      const r = await runCli(args);
      if (!r.ok) return failText(r.error.message + "\n" + r.error.stderr);
      return okText({ opened: true, vault, path: input.path || null });
    },
  },
  {
    name: "obsidian_create_note",
    description: "Create a new note. Set overwrite=true to replace an existing note. Set open=true to also open it.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["path"],
      properties: {
        vault: { type: "string" },
        path: { type: "string", description: "Vault-relative path (e.g. 'Tests/foo.md')" },
        content: { type: "string", description: "Markdown content (default: empty)" },
        open: { type: "boolean", description: "Open the note after creation" },
        overwrite: { type: "boolean", description: "Overwrite if it exists" },
      },
    },
    schema: z.object({
      vault: z.string().optional(),
      path: z.string(),
      content: z.string().optional(),
      open: z.boolean().optional(),
      overwrite: z.boolean().optional(),
    }),
    handler: async (input) => {
      assertSafeRelativePath(input.path);
      const vault = input.vault || VAULT;
      const args = [`vault=${vault}`, "create", `path=${input.path}`, `content=${input.content || ""}`];
      if (input.overwrite) args.push("overwrite");
      if (input.open) args.push("open");
      const r = await runCli(args);
      if (!r.ok) return failText(r.error.message + "\n" + r.error.stderr);
      return okText({ created: true, path: input.path, output: r.stdout.trim() });
    },
  },
  {
    name: "obsidian_append_note",
    description: "Append content to an existing note. Set inline=true to append without a leading newline.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["path", "content"],
      properties: {
        vault: { type: "string" },
        path: { type: "string" },
        content: { type: "string" },
        inline: { type: "boolean" },
      },
    },
    schema: z.object({ vault: z.string().optional(), path: z.string(), content: z.string(), inline: z.boolean().optional() }),
    handler: async (input) => {
      assertSafeRelativePath(input.path);
      const vault = input.vault || VAULT;
      const args = [`vault=${vault}`, "append", `path=${input.path}`, `content=${input.content}`];
      if (input.inline) args.push("inline");
      const r = await runCli(args);
      if (!r.ok) return failText(r.error.message + "\n" + r.error.stderr);
      return okText({ appended: true, path: input.path });
    },
  },
  {
    name: "obsidian_read_note",
    description: "Read the full markdown content of a note.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["path"],
      properties: {
        vault: { type: "string" },
        path: { type: "string" },
      },
    },
    schema: z.object({ vault: z.string().optional(), path: z.string() }),
    handler: async (input) => {
      assertSafeRelativePath(input.path);
      const vault = input.vault || VAULT;
      const r = await runCli([`vault=${vault}`, "read", `path=${input.path}`]);
      if (!r.ok) return failText(r.error.message + "\n" + r.error.stderr);
      return okText({ path: input.path, content: r.stdout });
    },
  },
  {
    name: "obsidian_search_notes",
    description: "Search the vault by query. Returns matching paths.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["query"],
      properties: {
        vault: { type: "string" },
        query: { type: "string" },
        format: { type: "string", enum: ["json", "tsv", "csv"], description: "Output format (default: json)" },
      },
    },
    schema: z.object({ vault: z.string().optional(), query: z.string(), format: z.enum(["json", "tsv", "csv"]).optional() }),
    handler: async (input) => {
      const vault = input.vault || VAULT;
      const fmt = input.format || "json";
      const r = await runCli([`vault=${vault}`, "search", `query=${input.query}`, `format=${fmt}`]);
      if (!r.ok) return failText(r.error.message + "\n" + r.error.stderr);
      return okText({ query: input.query, format: fmt, results: r.stdout.trim() });
    },
  },
  {
    name: "obsidian_execute_command",
    description: "Execute an Obsidian command by id (e.g. 'contextual-wiki-definitions:regenerate-definition'). Use 'commands' tool of the CLI to discover available ids.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["id"],
      properties: {
        vault: { type: "string" },
        id: { type: "string" },
      },
    },
    schema: z.object({ vault: z.string().optional(), id: z.string() }),
    handler: async (input) => {
      const vault = input.vault || VAULT;
      const r = await runCli([`vault=${vault}`, "command", `id=${input.id}`]);
      if (!r.ok) return failText(r.error.message + "\n" + r.error.stderr);
      return okText({ executed: true, id: input.id, output: r.stdout.trim() });
    },
  },
];

const toolByName = Object.fromEntries(tools.map((t) => [t.name, t]));

// ───────────────────────────────────────────────────────────────────────────
// MCP server boilerplate
// ───────────────────────────────────────────────────────────────────────────
const server = new Server(
  { name: "obsidian-mcp-stdio", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = toolByName[request.params.name];
  if (!tool) return failText(`unknown tool: ${request.params.name}`);
  try {
    const parsed = tool.schema.parse(request.params.arguments || {});
    return await tool.handler(parsed);
  } catch (err) {
    return failText(`${tool.name} failed: ${err.message}`);
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
// Don't log to stdout — MCP uses stdout for JSON-RPC. stderr is fine.
process.stderr.write(`[obsidian-mcp-stdio] ready (vault=${VAULT}, root=${VAULT_ROOT})\n`);
