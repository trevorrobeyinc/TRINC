#!/usr/bin/env node
// obsidian-stdio-adapter
// Consolidated stdio MCP adapter that tunnels tool calls to the canonical
// bridge daemon at https://127.0.0.1:8798. Replaces claude-adapter,
// obsidian-mcp-stdio, and raycast-obsidian-stdio.
//
// Profiles (OBSIDIAN_STDIO_PROFILE env, required — there is no default):
//   "raycast"           — Raycast chat's video door: video_pipeline_run/_status ONLY, proxied
//                         to the Command Center bridge on :8799 (separate daemon, unmodified).
//                         Its 7 obsidian_* vault tools and raycast_daily_open were retired
//                         2026-11-18 (operator decision): Raycast AI reads and writes the vault
//                         through Security Everything's YubiKey-gated "Obsidian Vault" server
//                         (mcp-gates/OBSIDIAN-VAULT-GATE.md, decision of 2026-10-16), and an
//                         ungated write lane here would go around it. Never loads the :8798
//                         config or token.
//   "openclaw"          — Claude's one door into Obsidian (dispatch lane added 2026-10-07,
//                         widened 2026-10-23 per TRINC reorg decision D5): run dispatch,
//                         status and results plus read-only vault search/read on :8799,
//                         and the Viz Studio renders on :8800, writing only into
//                         Visualizations/. Never loads the :8798 config or token. See
//                         the "openclaw" section below.
// The "claude" profile (the 7 vault tools for Claude Desktop) was retired 2026-10-23: no Claude
// surface had registered it since 2026-10-07, and its last entry (Copilot-Everything/.mcp.json
// "obsidian-bridge") was an ungated write lane into the vault.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
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

const PROFILE = process.env.OBSIDIAN_STDIO_PROFILE;
if (PROFILE !== "raycast" && PROFILE !== "openclaw") {
  throw new Error(
    `obsidian-stdio-adapter: OBSIDIAN_STDIO_PROFILE must be "raycast" or "openclaw" (got ${JSON.stringify(PROFILE)}). ` +
      'The "claude" profile was retired 2026-10-23; Claude uses "openclaw".',
  );
}

// Neither profile talks to the canonical vault bridge (:8798), so neither loads that bridge's config:
// the file carries the :8798 auth token, and a lane that cannot use a secret should not hold it (least
// privilege; "openclaw" since 2026-10-07, "raycast" since its trim to the video tools on 2026-11-18).
// The :8798 client code below (callBridge, buildBridgePayload, BASE_TOOLS, RAYCAST_DAILY_OPEN_TOOL)
// is therefore unreachable: handleToolCall refuses every name outside a profile's allowlist.
const USES_VAULT_BRIDGE = false;
const config = USES_VAULT_BRIDGE ? loadBridgeConfig() : null;
if (config && !config.transport.tls) {
  throw new Error(
    "obsidian-stdio-adapter requires TLS configuration; plain HTTP is not supported. " +
      "Set transport.tls.{certPath,keyPath} in obsidian-cli-mcp.local.json.",
  );
}

const BRIDGE_BASE_URL = config ? `https://${config.transport.host}:${config.transport.port}` : null;

const caPath = process.env.NODE_EXTRA_CA_CERTS
  || `${process.env.HOME}/Library/Application Support/mkcert/rootCA.pem`;
if (!existsSync(caPath)) {
  throw new Error(`obsidian-stdio-adapter could not locate trust anchor at ${caPath}`);
}
const BRIDGE_TLS_AGENT = new nodeHttps.Agent({ ca: readFileSync(caPath) });
const AUTH_TOKEN = config?.security?.authToken;
const DEFAULT_VAULT =
  config?.cliStability?.requiredVaultNames?.[0] ?? "My Digital Garden";
const DEFAULT_VAULT_ROOT =
  config?.allowedVaultRoots?.[0] ??
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
const COMMAND_CENTER = {
  name: "Command Center",
  pluginId: "command-center",
  baseUrl: COMMAND_CENTER_BASE_URL,
  tokenPath: COMMAND_CENTER_TOKEN_PATH,
};

// Viz Studio bridge (:8800), the openclaw profile's second upstream (2026-10-23). Same JSON-RPC over
// HTTPS shape as :8799, with its own 0600 bearer token written by the trinc-viz-studio plugin. The env
// override exists for failure-isolation testing only, like the Command Center one.
const VIZ_STUDIO_BASE_URL = process.env.OBSIDIAN_STDIO_VIZ_URL || "https://127.0.0.1:8800";
if (!VIZ_STUDIO_BASE_URL.startsWith("https://")) {
  throw new Error("OBSIDIAN_STDIO_VIZ_URL must be an https:// URL — plaintext endpoints are not supported.");
}
const VIZ_STUDIO = {
  name: "Viz Studio",
  pluginId: "trinc-viz-studio",
  baseUrl: VIZ_STUDIO_BASE_URL,
  tokenPath: resolve(process.env.HOME || "", ".config/trinc-viz-studio/bridge-token"),
};

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
 * paths remain valid — they are part of the tool's documented input contract —
 * and since 2026-11-18 so is an absolute FOLDER path: the daemon's folder mode
 * (Claude/obsidian-command-center/src/bridge/video-pipeline-source.ts) runs every
 * video directly inside it, one after another, in one run.
 */
function validateVideoSource(raw) {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) {
    return "videoUrl is required — an https video URL from an allowlisted host, an absolute local video file path, or an absolute path to a folder of videos.";
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
  // A video file: a single-video run, exactly as before folders were accepted.
  if (VIDEO_FILE_EXTENSIONS.some((ext) => value.toLowerCase().endsWith(ext))) {
    return null;
  }
  // Folder mode: anything else passes this edge only as a folder of videos. The :8799 daemon
  // re-validates it (canonical path, at least one video directly inside, subfolders not searched).
  let stats;
  try {
    stats = statSync(value);
  } catch (err) {
    // Unreadable is not out of contract: macOS privacy controls can deny this process (Raycast's
    // child) a folder that Obsidian may read, such as one on an external drive, so the daemon decides.
    if (err?.code === "EPERM" || err?.code === "EACCES") return null;
    return err?.code === "ENOENT"
      ? `No such file or folder: ${value.slice(0, 200)}`
      : `Not a usable folder path (${err?.code ?? "unknown error"}): ${value.slice(0, 200)}`;
  }
  if (stats.isDirectory()) return null;
  return `Local file must be a video (${VIDEO_FILE_EXTENSIONS.join(", ")}) or a folder of videos.`;
}

function loadBridgeToken(upstream) {
  if (!existsSync(upstream.tokenPath)) {
    throw new Error(
      `${upstream.name} bridge token not found at ${upstream.tokenPath} — ` +
        `the ${upstream.pluginId} Obsidian plugin writes it on startup (is Obsidian open?).`,
    );
  }
  return readFileSync(upstream.tokenPath, "utf8").trim();
}

/** One JSON-RPC request to an additive bridge's /mcp endpoint (:8799 or :8800); resolves to the parsed reply. */
async function postJsonRpc(upstream, method, params, timeoutMs) {
  // Token is read at call time so a rotation never requires an adapter restart.
  const token = loadBridgeToken(upstream);
  const body = JSON.stringify({ jsonrpc: "2.0", id: randomUUID(), method, params });

  return await new Promise((resolvePromise, rejectPromise) => {
    const url = new URL(`${upstream.baseUrl}/mcp`);
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
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          try { resolvePromise(JSON.parse(text)); }
          catch { rejectPromise(new Error(`${upstream.pluginId} non-JSON response: ${text.slice(0, 200)}`)); }
        });
      }
    );
    req.on("error", rejectPromise);
    req.on("timeout", () => { req.destroy(new Error(`${upstream.pluginId} request timed out`)); });
    req.write(body);
    req.end();
  });
}

async function callBridgeTool(upstream, toolName, args, timeoutMs) {
  const raw = await postJsonRpc(upstream, "tools/call", { name: toolName, arguments: args }, timeoutMs);
  if (raw.error) {
    return {
      content: [{ type: "text", text: `Error [${upstream.pluginId}]: ${raw.error.message || JSON.stringify(raw.error)}` }],
      isError: true,
    };
  }
  // raw.result is already an MCP tool result ({ content: [...] }) — pass it through.
  return raw.result ?? { content: [{ type: "text", text: JSON.stringify(raw) }] };
}

async function callCommandCenter(toolName, args, timeoutMs = COMMAND_CENTER_TIMEOUT_MS) {
  return callBridgeTool(COMMAND_CENTER, toolName, args, timeoutMs);
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
// (its tools/list entries for the video pipeline). Keep in sync by hand, word for word:
// scripts/test-profiles.mjs fails when a description here is not in that source verbatim
// (2026-11-18, after the folder-mode change reached the bridge but not this mirror).
const VIDEO_TOOLS = [
  {
    name: "video_pipeline_run",
    description:
      "Run the video-to-summary pipeline on a video URL (YouTube, LinkedIn Learning, etc.), an absolute local video file path, or an absolute path to a FOLDER of videos already on disk. Dispatches the Raycast 'Video Pipeline Runner': a URL is downloaded first (login-gated hosts like LinkedIn Learning need ONE human click in Downie's UGE window — tell the user to click the detected stream), a local file or folder is not downloaded at all; each video is transcribed from subtitles or from the audio by the configured local transcriber (the run log's `transcription engine:` line names it; video_pipeline_status returns it as `transcriber`), summarized by Copilot's free local relay, and saved to the vault as Copilot Summaries/'<title> summary.md' with all intermediates cleaned up (the user's own local video files are never deleted). A folder runs every video directly inside it (not subfolders) one after another in ONE run, skipping any video whose summary note already exists. For several local videos, pass their folder ONCE: never call this once per file, because each new dispatch makes the run in progress stop. Returns immediately; poll video_pipeline_status for progress.",
    inputSchema: {
      type: "object",
      properties: {
        videoUrl: {
          type: "string",
          description:
            "http(s) video URL, an absolute local video file path (.mp4/.mkv/.webm/.mov/.m4v), or an absolute folder path (every video directly inside it, one after another)",
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
      "Progress of the most recent video pipeline run, read from its durable run log: running/success/failed, the latest stage line, the summary confirmation when finished, and `transcriber`: the transcription engine that actually ran, verbatim from the run's `transcription engine:` line. Report the engine only from `transcriber`. `transcriptionRequested` is what the pipeline asked for (Whisper-style settings), not what ran. Both are absent when the transcript came from subtitles or the run predates 2026-10-15. A folder run reports `folder` and `batch`: {total, summarized, failed, skipped, remaining, current (the video being worked on), summaries (vault paths), failures ({video, reason})}; it ends `failed` when any one video failed, even though the others were summarized.",
    inputSchema: { type: "object", properties: {} },
  },
];
const VIDEO_TOOL_NAMES = new Set(VIDEO_TOOLS.map((t) => t.name));

// ---------------------------------------------------------------------------
// "openclaw" profile — Claude Code -> Command Center bridge (:8799)  (2026-10-07)
// ---------------------------------------------------------------------------
//
// Lets a Claude Code session start and watch OpenClaw research runs through the SAME door the Copilot
// agent already uses, so a run is plugin-dispatched and the plugin's post-run chain (chat bubble,
// Miyo index, Zettelkasten linking, research-memory ingest) fires without anyone operating Obsidian.
// Client-edge aggregation, not a daemon merge: the :8799 daemon is unmodified apart from the
// additive status fields and dry_run (see Claude/obsidian-command-center, 2026-10-07).
//
// Since 2026-10-23 this is Claude's ONE door into Obsidian (TRINC reorg, decisions D4 and D5): the
// dispatch tools below, read-only vault search/read on :8799, and the Viz Studio renders on :8800
// (see the "Viz Studio" section after OPENCLAW_SPECS). Copilot and Raycast keep their own doors.
//
// This is a NARROW ALLOWLIST. Deliberately NOT exposed here, and why:
//   obsidian_openclaw_research_task   the `real` provider spends the one-shot operator token and
//                                     duplicates run_workflow
//   obsidian_openclaw_{research_tasks_list,research_output,feed_stats}   not pipeline-related
//   zk_*                              model analyses that write nothing; they do not close any gap
//   video_pipeline_*                  needs a human click in Downie
//   obsidian_{open_vault,create_note,append_note,execute_command} and the
//   dev-console tools                 write/exec surface. obsidian_read_note and obsidian_search_notes
//                                     ARE exposed (read-only, D5): :8799 serves both through Obsidian's
//                                     own file index, which never contains the .obsidian/ config
//   publish_vault `force` and `all`   rewriting existing notes (including an appended Zettelkasten
//                                     section) and bulk backfills are operator decisions
// The operator's YubiKey touch is NOT replaced by anything here: obsidian_openclaw_run_workflow still
// fails closed with operator_gate_* unless a fresh token was armed (`operator-approved-gate arm openclaw`).
//
// Schemas below are mirrored BY HAND from Claude/obsidian-command-center/src/bridge/mcp-bridge-server.ts
// (handleToolsList), same precedent as VIDEO_TOOLS above. scripts/test-profiles.mjs checks that every
// mirrored name and property still exists in the live :8799 tools/list whenever it is reachable.

// Mirrors the :8799 daemon's ID_RE, which it applies to template ids, input keys and workflow ids.
const OPENCLAW_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const OPENCLAW_MAX_INPUT_FIELDS = 20;
// The daemon's cleanText() cap for an input value.
const OPENCLAW_MAX_INPUT_CHARS = 2000;
const OPENCLAW_MAX_QUERY_CHARS = 500;

function rejectUnknownKeys(tool, args, allowed) {
  const extra = Object.keys(args).filter((k) => !allowed.includes(k));
  if (extra.length === 0) return null;
  return (
    `${tool} does not accept: ${extra.join(", ")} ` +
    `(accepted on this profile: ${allowed.length ? allowed.join(", ") : "no arguments"})`
  );
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function checkOptionalId(args, key) {
  if (args[key] === undefined) return null;
  if (typeof args[key] !== "string" || !OPENCLAW_ID_RE.test(args[key])) {
    return `${key} must be a string matching [A-Za-z0-9][A-Za-z0-9_-]{0,63}`;
  }
  return null;
}

function checkOptionalBoolean(args, key) {
  return args[key] === undefined || typeof args[key] === "boolean" ? null : `${key} must be a boolean`;
}

function checkOptionalIntInRange(args, key, min, max) {
  if (args[key] === undefined) return null;
  const v = args[key];
  return Number.isInteger(v) && v >= min && v <= max ? null : `${key} must be an integer from ${min} to ${max}`;
}

const noArgs = (tool) => (args) => rejectUnknownKeys(tool, args, []);

// Vault-relative path for the two read-only vault tools. The daemon's safePath() re-checks; this only
// refuses an absolute path or a '..' segment before the call leaves the adapter.
const OPENCLAW_MAX_PATH_CHARS = 512;
function checkVaultPath(args, key, required) {
  const v = args[key];
  if (v === undefined) return required ? `${key} is required: a vault-relative note path.` : null;
  if (typeof v !== "string" || v.trim() === "") return `${key} must be a non-empty string.`;
  if (v.length > OPENCLAW_MAX_PATH_CHARS) return `${key} exceeds ${OPENCLAW_MAX_PATH_CHARS} characters.`;
  if (v.startsWith("/") || v.split(/[\\/]/).includes("..")) {
    return `${key} must be vault-relative, with no leading '/' and no '..' segment.`;
  }
  return null;
}

/**
 * obsidian_openclaw_run_workflow — the one tool here that can spend model capacity, so it is the
 * strictest. The operator-approve token still gates the spend at the engine; this only refuses
 * malformed or out-of-contract requests before they leave the adapter. The daemon re-validates.
 * Policy choices worth knowing: unknown keys are REJECTED (not ignored), values must be non-empty
 * strings (the daemon's cleanText() rejects empties), and there is no pass-through for anything else.
 */
function validateRunWorkflow(args) {
  const tool = "obsidian_openclaw_run_workflow";
  const unknown = rejectUnknownKeys(tool, args, ["template", "inputs", "dry_run"]);
  if (unknown) return unknown;
  if (typeof args.template !== "string" || !OPENCLAW_ID_RE.test(args.template)) {
    return "template must be a string matching [A-Za-z0-9][A-Za-z0-9_-]{0,63} — list valid ids with obsidian_openclaw_templates.";
  }
  if (!isPlainObject(args.inputs)) return "inputs must be an object of string values.";
  const entries = Object.entries(args.inputs);
  if (entries.length > OPENCLAW_MAX_INPUT_FIELDS) {
    return `inputs has ${entries.length} fields (max ${OPENCLAW_MAX_INPUT_FIELDS}).`;
  }
  for (const [key, value] of entries) {
    if (!OPENCLAW_ID_RE.test(key)) {
      return `inputs key ${JSON.stringify(key.slice(0, 40))} must match [A-Za-z0-9][A-Za-z0-9_-]{0,63}.`;
    }
    if (typeof value !== "string" || value.trim() === "") return `inputs.${key} must be a non-empty string.`;
    if (value.length > OPENCLAW_MAX_INPUT_CHARS) return `inputs.${key} exceeds ${OPENCLAW_MAX_INPUT_CHARS} characters.`;
  }
  return checkOptionalBoolean(args, "dry_run");
}

/** publish_vault is restricted to ONE named run, optionally as a preview. No force, no all. */
function validatePublishVault(args) {
  const tool = "obsidian_openclaw_publish_vault";
  for (const banned of ["force", "all"]) {
    if (Object.prototype.hasOwnProperty.call(args, banned)) {
      return `${tool}: '${banned}' is not exposed on this profile — rewriting existing notes and bulk backfills are operator decisions.`;
    }
  }
  const unknown = rejectUnknownKeys(tool, args, ["workflow_id", "dry_run"]);
  if (unknown) return unknown;
  if (typeof args.workflow_id !== "string" || !OPENCLAW_ID_RE.test(args.workflow_id)) {
    return "workflow_id is required: a string matching [A-Za-z0-9][A-Za-z0-9_-]{0,63} (see obsidian_openclaw_history).";
  }
  return checkOptionalBoolean(args, "dry_run");
}

const WORKFLOW_ID_ONLY = (tool) => (args) =>
  rejectUnknownKeys(tool, args, ["workflow_id"]) || checkOptionalId(args, "workflow_id");

// [tool definition, client-edge validator, upstream timeout in ms]. The default is the shared 30 s;
// the longer ones match the daemon's own spawn timeouts (engine_health 20+60+120 s, publish 240 s,
// memory search 120 s, delivery evidence 300 s) plus headroom, so the adapter never cuts off work the
// daemon is still doing and leaves the caller guessing.
const OPENCLAW_SPECS = [
  {
    tool: {
      name: "obsidian_health",
      description:
        "Command Center bridge (:8799) liveness. A reply means Obsidian is running and the command-center plugin's bridge is up.",
      inputSchema: { type: "object", properties: {} },
    },
    validate: noArgs("obsidian_health"),
  },
  {
    tool: {
      name: "obsidian_search_notes",
      description:
        "Search the vault's markdown notes for a text match (read-only). Returns matching note paths with a short context snippet.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Text to find" },
          path: { type: "string", description: "Vault-relative folder prefix to scope the search" },
          limit: { type: "number", description: "Max results (1-100, default 20)" },
          caseSensitive: { type: "boolean", description: "Match case (default false)" },
        },
        required: ["query"],
      },
    },
    validate: (args) => {
      const unknown = rejectUnknownKeys("obsidian_search_notes", args, ["query", "path", "limit", "caseSensitive"]);
      if (unknown) return unknown;
      if (typeof args.query !== "string" || args.query.trim() === "") return "query is required: a non-empty string.";
      if (args.query.length > OPENCLAW_MAX_QUERY_CHARS) return `query exceeds ${OPENCLAW_MAX_QUERY_CHARS} characters.`;
      return (
        checkVaultPath(args, "path", false) ||
        checkOptionalIntInRange(args, "limit", 1, 100) ||
        checkOptionalBoolean(args, "caseSensitive")
      );
    },
  },
  {
    tool: {
      name: "obsidian_read_note",
      description: "Read the full markdown content of one vault note (read-only).",
      inputSchema: {
        type: "object",
        properties: { path: { type: "string", description: "Note path relative to the vault root" } },
        required: ["path"],
      },
    },
    validate: (args) => rejectUnknownKeys("obsidian_read_note", args, ["path"]) || checkVaultPath(args, "path", true),
  },
  {
    tool: {
      name: "obsidian_openclaw_templates",
      description:
        "List all available OpenClaw workflow templates with their IDs, descriptions, and required input fields.",
      inputSchema: { type: "object", properties: {} },
    },
    validate: noArgs("obsidian_openclaw_templates"),
  },
  {
    tool: {
      name: "obsidian_openclaw_run_workflow",
      description:
        "Start an OpenClaw research workflow through the Command Center plugin, so its post-run chain (notes, chat bubble, Miyo, Zettelkasten, research memory) runs automatically. Returns after at most ~15 s with a workflow_id; track it with obsidian_openclaw_status (runs take 5-10 minutes). A REAL run needs the operator's freshly armed YubiKey token (one-shot, 300 s): without it this fails closed with operator_gate_not_armed / operator_gate_expired and nothing is started or spent. Pass dry_run:true first to prove the door is open and the inputs are complete without touching the token — a reply WITHOUT dry_run:true means the bridge predates the parameter and a run may have started. Never re-send this call after a timeout; call obsidian_openclaw_status instead.",
      inputSchema: {
        type: "object",
        properties: {
          template: {
            type: "string",
            description: "Workflow template ID — list valid ids and required inputs with obsidian_openclaw_templates (do not guess).",
          },
          inputs: {
            type: "object",
            description: "Template inputs as key-value pairs of non-empty strings.",
          },
          dry_run: {
            type: "boolean",
            description: "Validate the template and inputs and report what would start; spawn nothing and use no operator token.",
          },
        },
        required: ["template", "inputs"],
      },
    },
    validate: validateRunWorkflow,
  },
  {
    tool: {
      name: "obsidian_openclaw_status",
      description:
        "Status of the running or most recent workflow. Besides the engine's own `status`, it reports process_running, engine_status, and post_run: the per-stage outcome (notes, notify, miyo, zk, memory, open) of the plugin's post-run chain, with post_run_done true only when every stage has finished. The engine goes 'completed' BEFORE that chain runs, so wait for post_run_done:true before reporting success or starting another run. post_run_done:null means no ledger exists for this workflow yet (poll again) or the run was not dispatched by this plugin session. When nothing has run since the plugin loaded the reply is just status:'idle', process_running:false, post_run:null, post_run_done:null (engine_status is absent).",
      inputSchema: { type: "object", properties: {} },
    },
    validate: noArgs("obsidian_openclaw_status"),
  },
  {
    tool: {
      name: "obsidian_openclaw_results",
      description:
        "Get the results of the most recently completed OpenClaw workflow, including artifact paths and quality metrics.",
      inputSchema: { type: "object", properties: {} },
    },
    validate: noArgs("obsidian_openclaw_results"),
  },
  {
    tool: {
      name: "obsidian_openclaw_cancel",
      description:
        "Cancel the currently running OpenClaw workflow (SIGTERM, then SIGKILL after 5 s). The runner's timeout is warn-only, so this is the ONLY way to stop a run. The spent operator token is not refunded.",
      inputSchema: { type: "object", properties: {} },
    },
    validate: noArgs("obsidian_openclaw_cancel"),
  },
  {
    tool: {
      name: "obsidian_openclaw_history",
      description:
        "List past workflow runs from the engine workspace, newest first: workflow_id, template, status, created/completed timestamps, inputs.",
      inputSchema: {
        type: "object",
        properties: { limit: { type: "number", description: "Max entries (1-50, default 20)" } },
      },
    },
    validate: (args) =>
      rejectUnknownKeys("obsidian_openclaw_history", args, ["limit"]) || checkOptionalIntInRange(args, "limit", 1, 50),
  },
  {
    tool: {
      name: "obsidian_openclaw_artifacts",
      description:
        "Artifacts of a workflow run: engine run-dir file list, artifact ids, the vault notes folder and its notes. Defaults to the most recent run.",
      inputSchema: {
        type: "object",
        properties: { workflow_id: { type: "string", description: "Workflow id (default: latest)" } },
      },
    },
    validate: WORKFLOW_ID_ONLY("obsidian_openclaw_artifacts"),
  },
  {
    tool: {
      name: "obsidian_openclaw_engine_health",
      description:
        "Engine health check, read-only and ungated: Node runtime verification, a mock-provider LLM probe (never real model spend), and the connector-coverage audit. Can take a few minutes.",
      inputSchema: { type: "object", properties: {} },
    },
    validate: noArgs("obsidian_openclaw_engine_health"),
    timeoutMs: 240_000,
  },
  {
    tool: {
      name: "obsidian_openclaw_delivery_evidence",
      description:
        "Verify delivery evidence for a shipped offer. Modes: full or incremental only. Re-resolves identifiers against public registries, so it can take minutes.",
      inputSchema: {
        type: "object",
        properties: {
          mode: { type: "string", enum: ["full", "incremental"], description: "Verification mode (default incremental)" },
          offer_id: { type: "string", description: "Optional offer id to scope to" },
        },
      },
    },
    validate: (args) => {
      const unknown = rejectUnknownKeys("obsidian_openclaw_delivery_evidence", args, ["mode", "offer_id"]);
      if (unknown) return unknown;
      if (args.mode !== undefined && args.mode !== "full" && args.mode !== "incremental") {
        return "mode must be 'full' or 'incremental'";
      }
      return checkOptionalId(args, "offer_id");
    },
    timeoutMs: 330_000,
  },
  {
    tool: {
      name: "obsidian_openclaw_citation_integrity",
      description:
        "Read a run's citation-integrity record: the runtime verification verdict (grounded_ratio vs the min_grounded_ratio gate), ungrounded/retracted lists, and the reproducibility manifest summary. Defaults to the most recent run.",
      inputSchema: {
        type: "object",
        properties: { workflow_id: { type: "string", description: "Workflow id (default: latest)" } },
      },
    },
    validate: WORKFLOW_ID_ONLY("obsidian_openclaw_citation_integrity"),
  },
  {
    tool: {
      name: "obsidian_openclaw_publish_vault",
      description:
        "Repair path: write ONE completed, citation-PASS run's notes into the vault through the engine's own publisher (normally the engine already did this at the end of the run). No model spend, no operator gate. Restricted on this profile to workflow_id (required) and dry_run — 'force' and 'all' are not exposed. Runs already in the vault are skipped; failed, UNVERIFIED and mock runs are always skipped with a recorded reason.",
      inputSchema: {
        type: "object",
        properties: {
          workflow_id: { type: "string", description: "Workflow id to publish (see obsidian_openclaw_history)" },
          dry_run: { type: "boolean", description: "List what would be written; write nothing" },
        },
        required: ["workflow_id"],
      },
    },
    validate: validatePublishVault,
    timeoutMs: 270_000,
  },
  {
    tool: {
      name: "obsidian_openclaw_research_memory_search",
      description:
        "Search the research-memory pack store — what earlier engine runs concluded about a similar indication. CONTEXT ONLY: never cite an identifier from a pack without a live source. While the lane is disabled in the engine config the result reports enabled:false.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Free-text query (indication, compound, question)" },
          limit: { type: "number", description: "Max packs to return, 1-10 (default 5)" },
        },
        required: ["query"],
      },
    },
    validate: (args) => {
      const unknown = rejectUnknownKeys("obsidian_openclaw_research_memory_search", args, ["query", "limit"]);
      if (unknown) return unknown;
      if (typeof args.query !== "string" || args.query.trim() === "") return "query is required: a non-empty string.";
      if (args.query.length > OPENCLAW_MAX_QUERY_CHARS) return `query exceeds ${OPENCLAW_MAX_QUERY_CHARS} characters.`;
      return checkOptionalIntInRange(args, "limit", 1, 10);
    },
    timeoutMs: 150_000,
  },
];
const OPENCLAW_TOOLS = OPENCLAW_SPECS.map((s) => s.tool);
const OPENCLAW_SPEC_BY_NAME = new Map(OPENCLAW_SPECS.map((s) => [s.tool.name, s]));

// ---------------------------------------------------------------------------
// Viz Studio (:8800) on the openclaw profile  (2026-10-23, decisions D4 + D5)
// ---------------------------------------------------------------------------
//
// A closed allowlist of the 12 viz_* tools. Their schemas are NOT mirrored by hand like the :8799 tools
// above: Viz Studio's src/bridge/toolSchemas.ts is their contract of record and runs ~900 lines, so the
// adapter takes the live declarations from :8800's tools/list and removes what this door must not offer.
// A tool the daemon adds later stays hidden until it is added to VIZ_TOOL_NAMES.
//
// D5 says renders write ONLY into Visualizations/. These properties write somewhere else, so they are
// stripped from every advertised schema and refused on every call:
//   folder                     output folder override (anywhere in the vault)
//   targetNote                 append the embed to any note, creating it if missing
//   targetCanvas               insert a card into any canvas, creating it if missing
//   useActiveTab/useActiveNote append into whatever note or canvas is open
//   overwrite                  replace an existing file instead of adding a -2/-3 suffix
const VIZ_TOOL_NAMES = [
  "viz_health", "viz_mermaid", "viz_chart", "viz_canvas", "viz_graph_snapshot", "viz_guided",
  "viz_perceptual_map", "viz_diagram", "viz_stat_tiles", "viz_mockup", "viz_interactive", "viz_render_svg",
];
const VIZ_TOOL_SET = new Set(VIZ_TOOL_NAMES);
const VIZ_BLOCKED_PROPS = ["folder", "targetNote", "targetCanvas", "useActiveTab", "useActiveNote", "overwrite"];
const VIZ_DOOR_NOTE =
  "On this door the output is written only into Visualizations/: folder, targetNote, targetCanvas, " +
  "useActiveTab/useActiveNote and overwrite are not available.";
// tools/list asks :8800 for its declarations, and a closed Obsidian must not stall session start.
const VIZ_LIST_TIMEOUT_MS = 3000;
// PNG export and graph snapshots of a large vault are the slow renders.
const VIZ_CALL_TIMEOUT_MS = 120_000;

// The stripped live schemas from the last tools/list, used to check call arguments. Empty when :8800 did
// not answer at listing time: calls then get only the blocked-property and fileName checks, and the
// daemon validates the rest.
const vizSchemas = new Map();

function stripBlockedProps(schema) {
  const base = isPlainObject(schema) ? schema : {};
  const properties = { ...(isPlainObject(base.properties) ? base.properties : {}) };
  for (const key of VIZ_BLOCKED_PROPS) delete properties[key];
  const out = { ...base, type: "object", properties };
  const required = (Array.isArray(base.required) ? base.required : []).filter((k) => !VIZ_BLOCKED_PROPS.includes(k));
  if (required.length) out.required = required;
  else delete out.required;
  return out;
}

async function listVizTools() {
  let live = [];
  try {
    const raw = await postJsonRpc(VIZ_STUDIO, "tools/list", {}, VIZ_LIST_TIMEOUT_MS);
    live = Array.isArray(raw?.result?.tools) ? raw.result.tools : [];
  } catch (err) {
    process.stderr.write(
      `[obsidian-stdio-adapter:${PROFILE}] Viz Studio tools/list unavailable (${err.message}); listing stubs\n`,
    );
  }
  vizSchemas.clear();
  return VIZ_TOOL_NAMES.map((name) => {
    const decl = live.find((t) => t?.name === name);
    if (!decl) {
      return {
        name,
        description:
          "Viz Studio tool. Its input schema comes from the Viz Studio bridge (:8800), which did not answer when " +
          `this session listed tools: open Obsidian and start a new session to see it. ${VIZ_DOOR_NOTE}`,
        inputSchema: { type: "object", properties: {} },
      };
    }
    const inputSchema = stripBlockedProps(decl.inputSchema);
    vizSchemas.set(name, inputSchema);
    return { name, description: `${decl.description ?? ""} ${VIZ_DOOR_NOTE}`.trim(), inputSchema };
  });
}

function validateVizCall(name, args) {
  const blocked = VIZ_BLOCKED_PROPS.filter((k) => Object.prototype.hasOwnProperty.call(args, k));
  if (blocked.length) {
    return `${name}: ${blocked.join(", ")} not available on this door — Viz output is written only into Visualizations/.`;
  }
  if (args.fileName !== undefined && (typeof args.fileName !== "string" || /[\\/]|\.\./.test(args.fileName))) {
    return "fileName must be a plain base name, with no '/', '\\' or '..'.";
  }
  const schema = vizSchemas.get(name);
  if (!schema) return null;
  const unknown = rejectUnknownKeys(name, args, Object.keys(schema.properties));
  if (unknown) return unknown;
  const missing = (schema.required ?? []).filter((k) => args[k] === undefined);
  return missing.length ? `${name} requires: ${missing.join(", ")}` : null;
}

function openclawFailure(code, message, action) {
  const body = { success: false, error: code, message };
  if (action) body.action = action;
  return { content: [{ type: "text", text: JSON.stringify(body, null, 2) }], isError: true };
}

/**
 * Turn a transport failure into a structured, actionable result. The point is that an agent can tell
 * "Obsidian is not running" (safe to retry after it starts) from "the connection dropped mid-call"
 * (the daemon may still have acted). For run_workflow the second case means the run MAY have started,
 * so the action says to look, never to re-send.
 */
function classifyBridgeError(toolName, err, upstream = COMMAND_CENTER) {
  const msg = String(err?.message ?? err);
  const code = err?.code;
  const isViz = upstream === VIZ_STUDIO;
  const outcomeUnknownAction =
    toolName === "obsidian_openclaw_run_workflow"
      ? "The run may have started. Call obsidian_openclaw_status to find out; do NOT re-send obsidian_openclaw_run_workflow."
      : isViz
        ? "The render may or may not have been written; look in Visualizations/ before repeating it."
        : "The call may or may not have taken effect; check state with obsidian_openclaw_status before repeating it.";

  if (/bridge token not found/.test(msg) || code === "ECONNREFUSED" || code === "EHOSTUNREACH") {
    return openclawFailure(
      "obsidian_not_running",
      `The ${upstream.name} bridge (:${new URL(upstream.baseUrl).port}) is not reachable: Obsidian is closed, or the ` +
        `${upstream.pluginId} plugin is not loaded. Nothing was sent.`,
      `Ask the operator to open Obsidian (the bridge starts with the plugin), then call ${isViz ? "viz_health" : "obsidian_health"}. ` +
        (isViz ? "Nothing was rendered." : "No run was started."),
    );
  }
  if (/timed out/.test(msg) || code === "ETIMEDOUT") {
    return openclawFailure(
      toolName === "obsidian_openclaw_run_workflow" ? "bridge_timeout_outcome_unknown" : "bridge_timeout",
      `${toolName} did not answer in time: ${msg}`,
      outcomeUnknownAction,
    );
  }
  if (code === "ECONNRESET" || code === "EPIPE" || /socket hang up/.test(msg)) {
    return openclawFailure(
      "bridge_connection_lost_outcome_unknown",
      `The connection to the ${upstream.name} bridge dropped during ${toolName}: ${msg}`,
      outcomeUnknownAction,
    );
  }
  if (/certificate|CERT_|UNABLE_TO_VERIFY|SELF_SIGNED/i.test(`${code ?? ""} ${msg}`)) {
    return openclawFailure(
      "tls_trust_failed",
      `TLS verification of the ${upstream.name} bridge failed: ${msg}`,
      "Check that NODE_EXTRA_CA_CERTS points at the mkcert root CA in this MCP server's env. Do not disable verification.",
    );
  }
  return openclawFailure("adapter_error", msg);
}

async function handleOpenclawCall(name, args) {
  const spec = OPENCLAW_SPEC_BY_NAME.get(name);
  const isViz = VIZ_TOOL_SET.has(name);
  if (!spec && !isViz) {
    return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
  }
  const input = args ?? {};
  if (!isPlainObject(input)) {
    return { content: [{ type: "text", text: "Rejected by adapter input validation: arguments must be an object." }], isError: true };
  }
  const violation = isViz ? validateVizCall(name, input) : spec.validate(input);
  if (violation) {
    return { content: [{ type: "text", text: `Rejected by adapter input validation: ${violation}` }], isError: true };
  }
  const upstream = isViz ? VIZ_STUDIO : COMMAND_CENTER;
  const timeoutMs = isViz ? VIZ_CALL_TIMEOUT_MS : (spec.timeoutMs ?? COMMAND_CENTER_TIMEOUT_MS);
  try {
    return await callBridgeTool(upstream, name, input, timeoutMs);
  } catch (err) {
    return classifyBridgeError(name, err, upstream);
  }
}

const TOOLS = PROFILE === "openclaw" ? OPENCLAW_TOOLS : VIDEO_TOOLS;

// ---------------------------------------------------------------------------
// Startup health check (non-blocking, warns on stderr)
// ---------------------------------------------------------------------------

async function checkCommandCenterHealth() {
  // The openclaw profile's main upstream (Viz Studio on :8800 is probed lazily by tools/list). Uses the
  // pinned mkcert agent, not global fetch.
  await new Promise((done) => {
    const req = nodeHttps.get(
      `${COMMAND_CENTER_BASE_URL}/healthz`,
      { agent: BRIDGE_TLS_AGENT, timeout: 3000 },
      (res) => {
        res.resume();
        process.stderr.write(
          res.statusCode === 200
            ? `[obsidian-stdio-adapter:${PROFILE}] Command Center healthy at ${COMMAND_CENTER_BASE_URL}\n`
            : `[obsidian-stdio-adapter:${PROFILE}] Command Center answered HTTP ${res.statusCode}\n`,
        );
        done();
      },
    );
    req.on("error", (err) => {
      process.stderr.write(
        `[obsidian-stdio-adapter:${PROFILE}] Warning: Command Center not reachable at ${COMMAND_CENTER_BASE_URL} — ${err.message} (is Obsidian open?)\n`,
      );
      done();
    });
    req.on("timeout", () => req.destroy(new Error("health check timed out")));
  });
}

async function checkBridgeHealth() {
  if (!USES_VAULT_BRIDGE) return checkCommandCenterHealth();
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
  { name: "obsidian-stdio-adapter", version: "0.5.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: PROFILE === "openclaw" ? [...TOOLS, ...(await listVizTools())] : TOOLS,
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
  const upstream = PROFILE === "openclaw" && VIZ_TOOL_SET.has(name)
    ? 8800
    : PROFILE === "openclaw" || VIDEO_TOOL_NAMES.has(name) ? 8799 : "none";
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

  // The openclaw profile has its own closed tool set and never reaches the :8798 paths below —
  // even the shared name `obsidian_health` is answered by the :8799 daemon there.
  if (PROFILE === "openclaw") return await handleOpenclawCall(name, args);

  // The raycast profile serves the two video tools and nothing else (2026-11-18). A Raycast that still
  // holds the old ten-tool snapshot may call a retired vault tool by name: refuse it here, by name,
  // and say where the vault went, so nothing reaches :8798 from this door.
  if (!VIDEO_TOOL_NAMES.has(name)) {
    const retired =
      Object.prototype.hasOwnProperty.call(TOOL_OPERATION_MAP, name) || name === "raycast_daily_open";
    return {
      content: [
        {
          type: "text",
          text: retired
            ? `${name} is no longer served on this door (retired 2026-11-18): Raycast AI reaches the vault ` +
              'through the YubiKey-gated "Obsidian Vault" server.'
            : `Unknown tool: ${name}`,
        },
      ],
      isError: true,
    };
  }

  // Video pipeline tools are proxied to the Command Center bridge (:8799),
  // after client-edge input validation for the run tool.
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

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

process.stderr.write(`[obsidian-stdio-adapter:${PROFILE}] starting (profile=${PROFILE})\n`);
await checkBridgeHealth();
const transport = new StdioServerTransport();
await server.connect(transport);
