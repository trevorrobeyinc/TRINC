#!/usr/bin/env node
// raycast-obsidian-stdio
// ───────────────────────────────────────────────────────────────────────────
// Raycast-flavoured stdio MCP server wrapping the Obsidian CLI directly.
//
// Forked deliberately from bridges/obsidian-mcp-stdio so Raycast can evolve
// independently (different defaults, Raycast-only tools, alternate timeouts)
// without dragging the Claude wrapper along. Initial code is intentionally
// near-identical — the divergence point is the future, not today.
//
// Tool surface mirrors the Claude wrapper plus a Raycast-only convenience:
//   obsidian_health
//   obsidian_open_vault
//   obsidian_create_note
//   obsidian_append_note
//   obsidian_read_note
//   obsidian_search_notes
//   obsidian_execute_command
//   raycast_daily_open    (Raycast-only: open today's daily note)
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

async function runCli(args, { input } = {}) {
  try {
    const { stdout, stderr } = await execFileAsync(OBSIDIAN_BIN, args, {
      timeout: CLI_TIMEOUT,
      maxBuffer: 32 * 1024 * 1024,
      input,
    });
    return { ok: true, stdout, stderr };
  } catch (err) {
    return {
      ok: false,
      error: { code: err.code, signal: err.signal, message: err.message, stdout: err.stdout || "", stderr: err.stderr || "" },
    };
  }
}

const okText = (text) => ({ content: [{ type: "text", text: typeof text === "string" ? text : JSON.stringify(text, null, 2) }] });
const failText = (msg) => ({ isError: true, content: [{ type: "text", text: msg }] });

const tools = [
  {
    name: "obsidian_health",
    description: "Probe the Obsidian CLI binary and vault registration.",
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
        flavor: "raycast",
      });
    },
  },
  {
    name: "obsidian_open_vault",
    description: "Open a vault, optionally focusing a specific note.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: { vault: { type: "string" }, path: { type: "string" } },
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
    description: "Create a new note. Set overwrite=true to replace; open=true to also open.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["path"],
      properties: {
        vault: { type: "string" }, path: { type: "string" }, content: { type: "string" },
        open: { type: "boolean" }, overwrite: { type: "boolean" },
      },
    },
    schema: z.object({ vault: z.string().optional(), path: z.string(), content: z.string().optional(), open: z.boolean().optional(), overwrite: z.boolean().optional() }),
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
    description: "Append content to an existing note.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["path", "content"],
      properties: { vault: { type: "string" }, path: { type: "string" }, content: { type: "string" }, inline: { type: "boolean" } },
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
      properties: { vault: { type: "string" }, path: { type: "string" } },
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
    description: "Search the vault by query.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["query"],
      properties: { vault: { type: "string" }, query: { type: "string" }, format: { type: "string", enum: ["json", "tsv", "csv"] } },
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
    description: "Execute an Obsidian command by id.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["id"],
      properties: { vault: { type: "string" }, id: { type: "string" } },
    },
    schema: z.object({ vault: z.string().optional(), id: z.string() }),
    handler: async (input) => {
      const vault = input.vault || VAULT;
      const r = await runCli([`vault=${vault}`, "command", `id=${input.id}`]);
      if (!r.ok) return failText(r.error.message + "\n" + r.error.stderr);
      return okText({ executed: true, id: input.id, output: r.stdout.trim() });
    },
  },
  {
    name: "raycast_daily_open",
    description: "Raycast-only convenience: open today's daily note via the CLI's `daily` command.",
    inputSchema: { type: "object", additionalProperties: false, properties: { vault: { type: "string" } } },
    schema: z.object({ vault: z.string().optional() }),
    handler: async (input) => {
      const vault = input.vault || VAULT;
      const r = await runCli([`vault=${vault}`, "daily"]);
      if (!r.ok) return failText(r.error.message + "\n" + r.error.stderr);
      return okText({ opened: true, vault, output: r.stdout.trim() });
    },
  },
];

const toolByName = Object.fromEntries(tools.map((t) => [t.name, t]));

const server = new Server(
  { name: "raycast-obsidian-stdio", version: "0.1.0" },
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
process.stderr.write(`[raycast-obsidian-stdio] ready (vault=${VAULT}, root=${VAULT_ROOT})\n`);
