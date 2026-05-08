#!/usr/bin/env node
// Thin stdio MCP adapter that forwards tool calls to the real bridge HTTP API.
// Modeled after mcpClient.service.ts and HttpMcpTransport.ts.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createHash, randomUUID } from "node:crypto";
import { evaluateInObsidian, isCdpAvailable } from "./cdp-client.mjs";
import { existsSync, readFileSync } from "node:fs";
import * as nodeHttps from "node:https";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Config — read from the same file the bridge uses
// ---------------------------------------------------------------------------

function loadBridgeConfig() {
  const configPath =
    process.env.OBSIDIAN_MCP_CONFIG ||
    resolve(__dirname, "../config/obsidian-cli-mcp.local.json");
  return JSON.parse(readFileSync(configPath, "utf8"));
}

const config = loadBridgeConfig();
if (!config.transport.tls) {
  throw new Error(
    "obsidian-bridge claude adapter requires TLS configuration; plain HTTP is not supported. " +
      "Set transport.tls.{certPath,keyPath} in obsidian-cli-mcp.local.json.",
  );
}
const BRIDGE_BASE_URL = `https://${config.transport.host}:${config.transport.port}`;

const caPath = process.env.NODE_EXTRA_CA_CERTS
  || `${process.env.HOME}/Library/Application Support/mkcert/rootCA.pem`;
if (!existsSync(caPath)) {
  throw new Error(`obsidian-bridge claude adapter could not locate trust anchor at ${caPath}`);
}
const BRIDGE_TLS_AGENT = new nodeHttps.Agent({ ca: readFileSync(caPath) });
const AUTH_TOKEN = config.security.authToken;
const DEFAULT_VAULT =
  config.cliStability?.requiredVaultNames?.[0] ?? "My Digital Garden";
const DEFAULT_VAULT_ROOT =
  config.allowedVaultRoots?.[0] ??
  "/Volumes/ExtraCurricular/My Digital Garden";
const REQUEST_TIMEOUT_MS = 20_000;

// ---------------------------------------------------------------------------
// Bridge HTTP client (matches mcpClient.service.ts:callTool pattern)
// ---------------------------------------------------------------------------

function sha256Hex(body) {
  return createHash("sha256").update(body, "utf8").digest("hex");
}

async function callBridge(payload) {
  const body = JSON.stringify(payload);
  const headers = {
    "Content-Type": "application/json",
    "X-MCP-Token": AUTH_TOKEN,
    "X-MCP-Timestamp": String(Date.now()),
    "X-MCP-Nonce": randomUUID(),
    "X-MCP-Body-Sha256": sha256Hex(body),
  };

  return await new Promise((resolvePromise, rejectPromise) => {
    const url = new URL(`${BRIDGE_BASE_URL}/mcp/tool`);
    const req = nodeHttps.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: "POST",
        headers: { ...headers, "Content-Length": Buffer.byteLength(body) },
        agent: BRIDGE_TLS_AGENT,
        timeout: REQUEST_TIMEOUT_MS,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          try { resolvePromise(JSON.parse(text)); }
          catch (e) { rejectPromise(new Error(`bridge non-JSON response: ${text.slice(0, 200)}`)); }
        });
      }
    );
    req.on("error", rejectPromise);
    req.on("timeout", () => { req.destroy(new Error("request timed out")); });
    req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Tool-to-operation mapping and default injection
// ---------------------------------------------------------------------------

// Maps MCP tool names to the bridge's operation field.
// null operation means the tool has special handling (health, miyo).
const TOOL_OPERATION_MAP = {
  obsidian_open_vault: "open_vault",
  obsidian_create_note: "create_note",
  obsidian_append_note: "append_note",
  obsidian_read_note: "read_note",
  obsidian_search_notes: "search_notes",
  obsidian_execute_command: "execute_command",
  obsidian_health: null,
  miyo_search_context: null,
  webviewer_navigate: null,
  webviewer_search: null,
  webviewer_save: null,
};

// Tools that need vault injected
const NEEDS_VAULT = new Set([
  "obsidian_open_vault",
  "obsidian_create_note",
  "obsidian_append_note",
  "obsidian_read_note",
  "obsidian_search_notes",
]);

// Tools that need vaultRoot injected
const NEEDS_VAULT_ROOT = new Set([
  "obsidian_create_note",
  "obsidian_append_note",
  "obsidian_read_note",
]);

function buildBridgePayload(toolName, args) {
  const input = { ...args };

  // Inject vault default for note/command tools
  if (NEEDS_VAULT.has(toolName) && !input.vault) {
    input.vault = DEFAULT_VAULT;
  }

  // Inject vaultRoot default for tools that require it
  if (NEEDS_VAULT_ROOT.has(toolName) && !input.vaultRoot) {
    input.vaultRoot = DEFAULT_VAULT_ROOT;
  }

  // idempotencyKey is required by the bridge for append_note in hardened mode.
  // Do NOT auto-generate a random key — that breaks retry safety. The caller
  // must provide a stable key so retries of the same logical append reconcile
  // instead of creating duplicates.

  const operation = TOOL_OPERATION_MAP[toolName];

  // Build the MCPToolRequest shape: { tool, operation, input }
  const payload = { tool: toolName, input };
  if (operation) {
    payload.operation = operation;
  }

  return payload;
}

// ---------------------------------------------------------------------------
// MCP tool definitions
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    name: "obsidian_open_vault",
    description:
      "Open a vault (or a specific note within it) in Obsidian.",
    inputSchema: {
      type: "object",
      properties: {
        vault: {
          type: "string",
          description: `Vault name (default: ${DEFAULT_VAULT})`,
        },
        path: {
          type: "string",
          description: "Optional note path to open within the vault",
        },
        paneType: {
          type: "string",
          enum: ["tab", "split", "window"],
          description: "How to open the note",
        },
      },
    },
  },
  {
    name: "obsidian_create_note",
    description:
      "Create a new note in the vault. Provide path relative to vault root (e.g., 'Daily Notes/2026-03-24.md').",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "Note path relative to vault root (e.g., 'folder/note.md')",
        },
        content: {
          type: "string",
          description: "Markdown content for the note",
        },
        vault: {
          type: "string",
          description: `Vault name (default: ${DEFAULT_VAULT})`,
        },
        vaultRoot: {
          type: "string",
          description: `Vault root path (default: ${DEFAULT_VAULT_ROOT})`,
        },
        overwrite: {
          type: "boolean",
          description: "Overwrite if note already exists (default: false)",
        },
        open: {
          type: "boolean",
          description: "Open the note in Obsidian after creation",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "obsidian_append_note",
    description:
      "Append content to an existing note. Requires an idempotencyKey for retry safety — use a stable identifier so retries of the same logical append are reconciled instead of duplicated.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "Note path relative to vault root (e.g., 'folder/note.md')",
        },
        content: {
          type: "string",
          description: "Markdown content to append",
        },
        idempotencyKey: {
          type: "string",
          description:
            "Stable unique key for this append operation. Must be the same across retries of the same logical append to prevent duplicates.",
        },
        vault: {
          type: "string",
          description: `Vault name (default: ${DEFAULT_VAULT})`,
        },
        vaultRoot: {
          type: "string",
          description: `Vault root path (default: ${DEFAULT_VAULT_ROOT})`,
        },
        inline: {
          type: "boolean",
          description: "Append inline (no newline separator)",
        },
      },
      required: ["path", "content", "idempotencyKey"],
    },
  },
  {
    name: "obsidian_read_note",
    description:
      "Read the full markdown content of a note from the vault.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "Note path relative to vault root (e.g., 'folder/note.md')",
        },
        vault: {
          type: "string",
          description: `Vault name (default: ${DEFAULT_VAULT})`,
        },
        vaultRoot: {
          type: "string",
          description: `Vault root path (default: ${DEFAULT_VAULT_ROOT})`,
        },
      },
      required: ["path"],
    },
  },
  {
    name: "obsidian_search_notes",
    description:
      "Search for notes by content. Returns matching note paths and context.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query",
        },
        vault: {
          type: "string",
          description: `Vault name (default: ${DEFAULT_VAULT})`,
        },
        path: {
          type: "string",
          description: "Optional path prefix to scope the search",
        },
        limit: {
          type: "number",
          description: "Max results (1-500)",
        },
        caseSensitive: {
          type: "boolean",
          description: "Case-sensitive search",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "obsidian_execute_command",
    description:
      "Execute an Obsidian command by its command ID (e.g., 'copilot:chat').",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Obsidian command ID to execute",
        },
        vault: {
          type: "string",
          description: "Optional vault name",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "obsidian_health",
    description:
      "Check bridge health: backend status, routing, security, and metrics.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "miyo_search_context",
    description:
      "Semantic search via Miyo (retrieval/index backend). Returns relevant note chunks scored by relevance. Vault falls back to bridge config if not specified.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Semantic search query",
        },
        vault: {
          type: "string",
          description: "Optional vault name or path (bridge uses config default if omitted)",
        },
        limit: {
          type: "number",
          description: "Max results (1-20, default: 5)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "webviewer_navigate",
    description:
      "Navigate Obsidian's built-in Web Viewer to a URL and extract page content as clean markdown via Readability. Returns title and markdown text.",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "URL to navigate to and extract content from",
        },
        saveToVault: {
          type: "boolean",
          description: "If true, also save the content as a vault note",
        },
        vaultPath: {
          type: "string",
          description: "Vault folder to save into (default: root)",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "webviewer_search",
    description:
      "Search the web via Obsidian's Web Viewer (Google) and extract search results with titles, URLs, and snippets.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query",
        },
        maxResults: {
          type: "number",
          description: "Max results to extract (1-20, default: 10)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "webviewer_save",
    description:
      "Navigate to a URL and save the page content as a markdown note in the Obsidian vault.",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "URL to navigate to and save",
        },
        vaultPath: {
          type: "string",
          description: "Vault folder to save into (default: root)",
        },
      },
      required: ["url"],
    },
  },
];

// ---------------------------------------------------------------------------
// Startup health check (non-blocking, warns on stderr)
// ---------------------------------------------------------------------------

async function checkBridgeHealth() {
  try {
    const resp = await fetch(`${BRIDGE_BASE_URL}/healthz`, {
      signal: AbortSignal.timeout(3000),
    });
    const data = await resp.json();
    if (data.ok) {
      process.stderr.write(
        `[claude-adapter] Bridge healthy at ${BRIDGE_BASE_URL}\n`
      );
    } else {
      process.stderr.write(
        `[claude-adapter] Bridge returned ok=false: ${JSON.stringify(data)}\n`
      );
    }
  } catch (err) {
    process.stderr.write(
      `[claude-adapter] Warning: bridge not reachable at ${BRIDGE_BASE_URL} — ${err.message}\n`
    );
  }
}

// ---------------------------------------------------------------------------
// MCP server
// ---------------------------------------------------------------------------

const server = new Server(
  { name: "obsidian-bridge-adapter", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (!TOOL_OPERATION_MAP.hasOwnProperty(name)) {
    return {
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
      isError: true,
    };
  }

  // Webviewer tools use CDP to call window.__trevnodus_webviewer directly
  if (name.startsWith("webviewer_")) {
    try {
      const a = args || {};
      let expr;
      if (name === "webviewer_navigate") {
        expr = `window.__trevnodus_webviewer.fetchPage(${JSON.stringify(a.url || "")}, ${JSON.stringify({ saveToVault: !!a.saveToVault, vaultPath: a.vaultPath || "" })})`;
      } else if (name === "webviewer_search") {
        expr = `window.__trevnodus_webviewer.searchWeb(${JSON.stringify(a.query || "")}, ${JSON.stringify({ maxResults: a.maxResults || 10 })})`;
      } else if (name === "webviewer_save") {
        expr = `window.__trevnodus_webviewer.fetchPage(${JSON.stringify(a.url || "")}, ${JSON.stringify({ saveToVault: true, vaultPath: a.vaultPath || "" })})`;
      } else {
        return { content: [{ type: "text", text: `Unknown webviewer tool: ${name}` }], isError: true };
      }
      const result = await evaluateInObsidian(expr);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `WebViewer CDP error: ${err.message}` }], isError: true };
    }
  }

  try {
    const payload = buildBridgePayload(name, args || {});
    const result = await callBridge(payload);

    if (result.ok) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result.data, null, 2),
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `Error [${result.error?.code}]: ${result.error?.message}`,
        },
      ],
      isError: true,
    };
  } catch (err) {
    return {
      content: [
        {
          type: "text",
          text: `Adapter error: ${err.message}`,
        },
      ],
      isError: true,
    };
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

await checkBridgeHealth();
const transport = new StdioServerTransport();
await server.connect(transport);
