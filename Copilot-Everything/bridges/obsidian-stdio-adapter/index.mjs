#!/usr/bin/env node
// obsidian-stdio-adapter
// Consolidated stdio MCP adapter that tunnels tool calls to the canonical
// bridge daemon at https://127.0.0.1:8798. Replaces claude-adapter,
// obsidian-mcp-stdio, and raycast-obsidian-stdio.
//
// Profiles (set via OBSIDIAN_STDIO_PROFILE env):
//   "claude"  (default) — exposes the 7 standard obsidian_* tools
//   "raycast"           — adds raycast_daily_open (mapped locally to
//                         obsidian_execute_command id="daily-notes") plus
//                         video_pipeline_run/_status, proxied to the Command
//                         Center bridge on :8799 (separate daemon, unmodified)

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import * as nodeHttps from "node:https";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Config — read from the same file the bridge uses
// ---------------------------------------------------------------------------

function loadBridgeConfig() {
  // Lookup order:
  //   1. OBSIDIAN_MCP_CONFIG env var (explicit, highest priority — recommended for npx callers).
  //   2. ~/.config/obsidian-bridge/obsidian-cli-mcp.local.json (cross-host standard, host-local).
  //   3. <adapter-dir>/../obsidian-copilot-bridge/config/obsidian-cli-mcp.local.json
  //      (monorepo-internal sibling-dir fallback; only resolves when adapter runs from inside
  //      its source repo, NOT when run via npx from a temp install dir).
  const candidates = [
    process.env.OBSIDIAN_MCP_CONFIG,
    process.env.HOME && resolve(process.env.HOME, ".config/obsidian-bridge/obsidian-cli-mcp.local.json"),
    resolve(__dirname, "../obsidian-copilot-bridge/config/obsidian-cli-mcp.local.json"),
  ].filter(Boolean);

  for (const path of candidates) {
    if (existsSync(path)) {
      return JSON.parse(readFileSync(path, "utf8"));
    }
  }

  throw new Error(
    "obsidian-bridge-adapter: could not locate the bridge config file. Set OBSIDIAN_MCP_CONFIG=" +
      "/absolute/path/to/obsidian-cli-mcp.local.json in this MCP server's env, or place a copy " +
      "of the config at ~/.config/obsidian-bridge/obsidian-cli-mcp.local.json. Tried:\n  " +
      candidates.join("\n  "),
  );
}

const config = loadBridgeConfig();
if (!config.transport.tls) {
  throw new Error(
    "obsidian-stdio-adapter requires TLS configuration; plain HTTP is not supported. " +
      "Set transport.tls.{certPath,keyPath} in obsidian-cli-mcp.local.json.",
  );
}

const PROFILE = process.env.OBSIDIAN_STDIO_PROFILE || "claude";
if (PROFILE !== "claude" && PROFILE !== "raycast") {
  throw new Error(
    `obsidian-stdio-adapter: unknown profile ${JSON.stringify(PROFILE)} — allowed: "claude", "raycast"`,
  );
}

const BRIDGE_BASE_URL = `https://${config.transport.host}:${config.transport.port}`;

const caPath = process.env.NODE_EXTRA_CA_CERTS
  || `${process.env.HOME}/Library/Application Support/mkcert/rootCA.pem`;
if (!existsSync(caPath)) {
  throw new Error(`obsidian-stdio-adapter could not locate trust anchor at ${caPath}`);
}
const BRIDGE_TLS_AGENT = new nodeHttps.Agent({ ca: readFileSync(caPath) });
const AUTH_TOKEN = config.security.authToken;
const DEFAULT_VAULT =
  config.cliStability?.requiredVaultNames?.[0] ?? "My Digital Garden";
const DEFAULT_VAULT_ROOT =
  config.allowedVaultRoots?.[0] ??
  "/Users/myhome/My Digital Garden";
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
// Command Center bridge client (:8799) — raycast-profile video tools only.
// The Command Center bridge is a SEPARATE daemon owned by the command-center
// Obsidian plugin; this adapter proxies two of its tools so Raycast chat gets
// one merged tool list. The daemon itself is not modified.
// ---------------------------------------------------------------------------

// Env override exists for failure-isolation testing only (point it at a dead
// port to exercise the degraded path). HTTPS-only, like every endpoint here.
const COMMAND_CENTER_BASE_URL =
  process.env.OBSIDIAN_STDIO_COMMAND_CENTER_URL || "https://127.0.0.1:8799";
if (!COMMAND_CENTER_BASE_URL.startsWith("https://")) {
  throw new Error(
    "OBSIDIAN_STDIO_COMMAND_CENTER_URL must be an https:// URL — plaintext endpoints are not supported.",
  );
}
const COMMAND_CENTER_TOKEN_PATH = resolve(
  process.env.HOME || "",
  ".config/openclaw-command-center/bridge-token",
);
// video_pipeline_run blocks up to ~15s waiting for RUN START confirmation.
const COMMAND_CENTER_TIMEOUT_MS = 30_000;

// Hard cap on serialized tools/call arguments — rejects runaway or buggy client
// payloads before any re-serialization or network call. Applies to every tool
// on every profile.
const MAX_ARGS_BYTES = 1_048_576; // 1 MB

// Hosts video_pipeline_run accepts for https input — exact hostname match.
// Source of truth: the Raycast fork's Video Pipeline Runner (Downie/yt-dlp can
// fetch more; extend this list deliberately, updating scripts/test-profiles.mjs
// and the README "Input validation" section in the same change). Derived
// 2026-08-20 from the fork's own docs/prefs: YouTube (primary lane), LinkedIn
// Learning + TikTok (named in videoTranscribeFlow.ts), Wiley
// (docs/transcribe-and-save/README.md), Vimeo (operator-requested).
const VIDEO_URL_ALLOWED_HOSTS = [
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
  "vimeo.com",
  "www.vimeo.com",
  "linkedin.com",
  "www.linkedin.com",
  "tiktok.com",
  "www.tiktok.com",
  "onlinelibrary.wiley.com",
];
// Mirrors the :8799 daemon's accepted local-file extensions.
const VIDEO_FILE_EXTENSIONS = [".mp4", ".mkv", ".webm", ".mov", ".m4v"];

/**
 * Client-edge validation for video_pipeline_run input. Returns an error string
 * (rendered as a clean isError result) or null when acceptable. The :8799
 * daemon re-validates independently; this guardrail just refuses obviously
 * out-of-contract input before it leaves the adapter. Local absolute video
 * paths remain valid — they are part of the tool's documented input contract.
 */
function validateVideoSource(raw) {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) {
    return "videoUrl is required — an https video URL from an allowlisted host, or an absolute local video file path.";
  }
  if (value.includes("://")) {
    let parsed;
    try {
      parsed = new URL(value);
    } catch {
      return `videoUrl does not parse as a URL: ${value.slice(0, 100)}`;
    }
    if (parsed.protocol !== "https:") {
      return `URL scheme must be https (got: ${parsed.protocol.replace(":", "")})`;
    }
    if (!VIDEO_URL_ALLOWED_HOSTS.includes(parsed.hostname)) {
      return `hostname not in allowlist: ${parsed.hostname}`;
    }
    return null;
  }
  if (!value.startsWith("/")) {
    return "Local video paths must be absolute (or pass an https URL from an allowlisted host).";
  }
  if (!VIDEO_FILE_EXTENSIONS.some((ext) => value.toLowerCase().endsWith(ext))) {
    return `Local file must be a video (${VIDEO_FILE_EXTENSIONS.join(", ")}).`;
  }
  return null;
}

function loadCommandCenterToken() {
  if (!existsSync(COMMAND_CENTER_TOKEN_PATH)) {
    throw new Error(
      `Command Center bridge token not found at ${COMMAND_CENTER_TOKEN_PATH} — ` +
        "the command-center Obsidian plugin writes it on startup (is Obsidian open?).",
    );
  }
  return readFileSync(COMMAND_CENTER_TOKEN_PATH, "utf8").trim();
}

async function callCommandCenter(toolName, args) {
  // Token is read at call time so a rotation never requires an adapter restart.
  const token = loadCommandCenterToken();
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: randomUUID(),
    method: "tools/call",
    params: { name: toolName, arguments: args },
  });

  const raw = await new Promise((resolvePromise, rejectPromise) => {
    const url = new URL(`${COMMAND_CENTER_BASE_URL}/mcp`);
    const req = nodeHttps.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "Content-Length": Buffer.byteLength(body),
        },
        agent: BRIDGE_TLS_AGENT,
        timeout: COMMAND_CENTER_TIMEOUT_MS,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          try { resolvePromise(JSON.parse(text)); }
          catch { rejectPromise(new Error(`command-center non-JSON response: ${text.slice(0, 200)}`)); }
        });
      }
    );
    req.on("error", rejectPromise);
    req.on("timeout", () => { req.destroy(new Error("command-center request timed out")); });
    req.write(body);
    req.end();
  });

  if (raw.error) {
    return {
      content: [{ type: "text", text: `Error [command-center]: ${raw.error.message || JSON.stringify(raw.error)}` }],
      isError: true,
    };
  }
  // raw.result is already an MCP tool result ({ content: [...] }) — pass it through.
  return raw.result ?? { content: [{ type: "text", text: JSON.stringify(raw) }] };
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

const BASE_TOOLS = [
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
];

const RAYCAST_DAILY_OPEN_TOOL = {
  name: "raycast_daily_open",
  description:
    "Open today's Obsidian daily note via the built-in Daily Notes plugin (command id 'daily-notes'). Maps locally to obsidian_execute_command — the bridge daemon is not modified.",
  inputSchema: {
    type: "object",
    properties: {
      vault: {
        type: "string",
        description: `Vault name (default: ${DEFAULT_VAULT})`,
      },
    },
  },
};

// Mirrored from Claude/obsidian-command-center/src/bridge/mcp-bridge-server.ts
// (its tools/list entries for the video pipeline). Keep in sync by hand — same
// precedent as the Copilot fork mirroring bridge tool schemas.
const VIDEO_TOOLS = [
  {
    name: "video_pipeline_run",
    description:
      "Run the video-to-summary pipeline on a video URL (YouTube, LinkedIn Learning, etc.) or an absolute local video file path. Dispatches the Raycast 'Video Pipeline Runner': the video is downloaded (login-gated hosts like LinkedIn Learning need ONE human click in Downie's UGE window — tell the user to click the detected stream), transcribed from subtitles or Whisper, summarized by Copilot's free local relay, and saved to the vault as Copilot Summaries/'<title> summary.md' with all intermediates cleaned up. Returns immediately; poll video_pipeline_status for progress.",
    inputSchema: {
      type: "object",
      properties: {
        videoUrl: {
          type: "string",
          description:
            "http(s) video URL, or an absolute local video file path (.mp4/.mkv/.webm/.mov/.m4v)",
        },
        dry_run: {
          type: "boolean",
          description: "Validate the input and return the Raycast deeplink without dispatching.",
        },
      },
      required: ["videoUrl"],
    },
  },
  {
    name: "video_pipeline_status",
    description:
      "Progress of the most recent video pipeline run, read from its durable run log: running/success/failed, the latest stage line, and the summary confirmation when finished.",
    inputSchema: { type: "object", properties: {} },
  },
];
const VIDEO_TOOL_NAMES = new Set(VIDEO_TOOLS.map((t) => t.name));

const TOOLS = [
  ...BASE_TOOLS,
  ...(PROFILE === "raycast" ? [RAYCAST_DAILY_OPEN_TOOL, ...VIDEO_TOOLS] : []),
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
        `[obsidian-stdio-adapter:${PROFILE}] Bridge healthy at ${BRIDGE_BASE_URL}\n`
      );
    } else {
      process.stderr.write(
        `[obsidian-stdio-adapter:${PROFILE}] Bridge returned ok=false: ${JSON.stringify(data)}\n`
      );
    }
  } catch (err) {
    process.stderr.write(
      `[obsidian-stdio-adapter:${PROFILE}] Warning: bridge not reachable at ${BRIDGE_BASE_URL} — ${err.message}\n`
    );
  }
}

// ---------------------------------------------------------------------------
// MCP server
// ---------------------------------------------------------------------------

const server = new Server(
  { name: "obsidian-stdio-adapter", version: "0.2.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

/**
 * Map a bridge call result to the MCP tool-result shape. Success omits isError;
 * a failure carries isError:true with the bridge error code/message. Shared by
 * the raycast-profile helper and the standard tool path.
 */
function toMcpResult(result) {
  if (result.ok) {
    return { content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }] };
  }
  return {
    content: [{ type: "text", text: `Error [${result.error?.code}]: ${result.error?.message}` }],
    isError: true,
  };
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const startedAt = Date.now();
  const result = await handleToolCall(name, args);
  // One structured line per call for post-hoc debugging — MCP hosts capture a
  // server's stderr into their own managed logs. Never log argument values.
  const upstream = PROFILE === "raycast" && VIDEO_TOOL_NAMES.has(name) ? 8799 : 8798;
  process.stderr.write(
    `[obsidian-stdio-adapter:${PROFILE}] call tool=${name} upstream=${upstream} ` +
      `status=${result.isError ? "error" : "ok"} latency_ms=${Date.now() - startedAt}\n`,
  );
  return result;
});

async function handleToolCall(name, args) {
  const argsBytes = Buffer.byteLength(JSON.stringify(args ?? {}), "utf8");
  if (argsBytes > MAX_ARGS_BYTES) {
    return {
      content: [{ type: "text", text: `arguments exceed 1 MB limit (got: ${argsBytes} bytes)` }],
      isError: true,
    };
  }

  const isKnownStandardTool = Object.prototype.hasOwnProperty.call(TOOL_OPERATION_MAP, name);
  const isRaycastTool = PROFILE === "raycast" && name === "raycast_daily_open";
  const isVideoTool = PROFILE === "raycast" && VIDEO_TOOL_NAMES.has(name);

  if (!isKnownStandardTool && !isRaycastTool && !isVideoTool) {
    return {
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
      isError: true,
    };
  }

  // Video pipeline tools are proxied to the Command Center bridge (:8799),
  // after client-edge input validation for the run tool.
  if (isVideoTool) {
    if (name === "video_pipeline_run") {
      const violation = validateVideoSource((args || {}).videoUrl);
      if (violation) {
        return {
          content: [{ type: "text", text: `Rejected by adapter input validation: ${violation}` }],
          isError: true,
        };
      }
    }
    try {
      return await callCommandCenter(name, args || {});
    } catch (err) {
      return { content: [{ type: "text", text: `Adapter error: ${err.message}` }], isError: true };
    }
  }

  // raycast_daily_open is a profile-local helper that maps to
  // obsidian_execute_command id="daily-notes". The daemon is not modified.
  if (isRaycastTool) {
    try {
      const a = args || {};
      const payload = buildBridgePayload("obsidian_execute_command", {
        vault: a.vault || DEFAULT_VAULT,
        id: "daily-notes",
      });
      const result = await callBridge(payload);
      return toMcpResult(result);
    } catch (err) {
      return { content: [{ type: "text", text: `Adapter error: ${err.message}` }], isError: true };
    }
  }

  try {
    const payload = buildBridgePayload(name, args || {});
    const result = await callBridge(payload);
    return toMcpResult(result);
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
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

process.stderr.write(`[obsidian-stdio-adapter:${PROFILE}] starting (profile=${PROFILE})\n`);
await checkBridgeHealth();
const transport = new StdioServerTransport();
await server.connect(transport);
