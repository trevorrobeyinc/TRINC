import * as http from "http";
import * as https from "https";
import * as os from "os";
import * as path from "path";
import { readFileSync, writeFileSync, mkdirSync, chmodSync, existsSync, realpathSync, statSync } from "fs";
import { createHash, timingSafeEqual, randomBytes } from "crypto";
import { execFile } from "child_process";
import { App, TFile, normalizePath } from "obsidian";
import type { OpenClawSettings } from "../types";
import { getVaultZKApi, type VaultZKApi } from "../zettelkasten/linker";
import {
  isGateRefusal,
  gateNotArmedError,
  type EngineScriptResult,
} from "../util/engine-spawn";

const HOST = "127.0.0.1";

// Security (audit P0): obsidian_execute_command must NOT be an open dispatcher to
// every enabled plugin's commands — that allows lateral pivot (e.g. to runjs =
// arbitrary in-process JS). Restrict to this plugin's own command namespace by
// default. Add specific reviewed command IDs to ALLOWED_COMMAND_IDS to extend.
const ALLOWED_COMMAND_PREFIXES = ["command-center:"];
const ALLOWED_COMMAND_IDS: string[] = [];
function isCommandAllowed(commandId: string): boolean {
  if (ALLOWED_COMMAND_IDS.includes(commandId)) return true;
  return ALLOWED_COMMAND_PREFIXES.some((p) => commandId.startsWith(p));
}

// Video pipeline tools: expose the Raycast "Obsidian Bridge Fork" Video Pipeline Runner to
// MCP clients (the Copilot agent chat reaches this bridge per ACP session). The pipeline
// itself — Downie/UGE download, subtitle claim or Whisper transcription, the headless
// copilot:summarize-to-note relay, cleanup — stays in the Raycast extension; this bridge
// only dispatches its deeplink and reads its durable run log.
//
// Security posture (same audit-P0 stance as the command allowlist above): this is NOT an
// exec primitive. The binary is fixed (/usr/bin/open), arguments are an argv array (no
// shell), and the only caller-controlled value is a strictly validated http(s) URL or
// absolute local video path that travels INSIDE the URL-encoded deeplink payload.
const VIDEO_PIPELINE_DEEPLINK_BASE =
  "raycast://extensions/marcjulian/obsidian-bridge-fork/videoTranscribeRunnerCommand";
const VIDEO_PIPELINE_LOG_SEGMENTS = [".local", "share", "raycast-obsidian", "video-transcribe.log"];
const VIDEO_FILE_EXTENSIONS = [".mp4", ".mkv", ".webm", ".mov", ".m4v"];

function videoPipelineLogPath(): string {
  return path.join(os.homedir(), ...VIDEO_PIPELINE_LOG_SEGMENTS);
}

function resolveVideoPipelineSource(raw: unknown): string {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) {
    throw new Error(
      "videoUrl is required — an http(s) video URL or an absolute local video file path."
    );
  }
  // Explicit NUL reject (previously only incidentally rejected by existsSync, with a mangled message).
  if (value.includes("\0")) {
    throw new Error("videoUrl contains a null byte.");
  }
  if (/^https?:\/\//i.test(value)) {
    const parsed = new URL(value); // throws on malformed input
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error(`Unsupported URL scheme: ${parsed.protocol}`);
    }
    return value;
  }
  const localPath = value.startsWith("file://")
    ? decodeURIComponent(value.slice("file://".length))
    : value;
  if (!path.isAbsolute(localPath)) {
    throw new Error("Local video paths must be absolute (or pass an http(s) URL).");
  }
  if (!VIDEO_FILE_EXTENSIONS.includes(path.extname(localPath).toLowerCase())) {
    throw new Error(`Local file must be a video (${VIDEO_FILE_EXTENSIONS.join(", ")}).`);
  }
  if (!existsSync(localPath)) {
    throw new Error(`Local video file does not exist: ${localPath}`);
  }
  // Canonicalize: resolve symlinks and any ../ segments so the extension receives one true
  // path, then re-assert the extension on the canonical leaf (a video-named symlink could
  // otherwise smuggle a non-video target).
  const canonical = realpathSync(localPath);
  if (!VIDEO_FILE_EXTENSIONS.includes(path.extname(canonical).toLowerCase())) {
    throw new Error(`Local file must be a video (${VIDEO_FILE_EXTENSIONS.join(", ")}).`);
  }
  return canonical;
}

// Vault Zettelkasten tools: expose the vault-zettelkasten plugin's in-process
// graph-analysis api (serendipity, cross-domain, echo-chamber, semantic-linker,
// orphan-rescue, vault health, pipeline) to MCP clients — the Copilot agent
// chat reaches this bridge through its MCP catalog. This reuses the same
// in-renderer api that zettelkasten/linker.ts already consumes
// (vaultZKPreferPlugin): zero subprocess, zero new network surface. Analyses
// call the local Miyo/Qdrant services plus the configured model gateway and
// return JSON; NOTHING here writes the vault (writeReport is pinned false —
// the model saves results explicitly via obsidian_create_note if asked).
const ZK_NOTE_COMMANDS: Record<
  string,
  "serendipity" | "crossDomain" | "echoChamber" | "semanticLinker" | "orphanRescue"
> = {
  zk_serendipity: "serendipity",
  zk_cross_domain: "crossDomain",
  zk_echo_chamber: "echoChamber",
  zk_semantic_linker: "semanticLinker",
  zk_orphan_rescue: "orphanRescue",
};
const ZK_PIPELINE_STEPS = [
  "serendipity",
  "cross-domain",
  "echo-chamber",
  "semantic-linker",
  "orphan-rescue",
  "health",
];
const ZK_DEFAULT_PIPELINE: Array<{ command: string }> = [
  { command: "serendipity" },
  { command: "cross-domain" },
  { command: "semantic-linker" },
  { command: "echo-chamber" },
];
const ZK_LIMIT_MAX = 50;

// Security (audit P0): the bridge bearer token must NOT live in Obsidian's
// data.json — Obsidian persists it world-readably and auto-creates .bak copies,
// which leaked the live token. Keep it in a dedicated 0600 file under ~/.config
// (outside the synced vault) instead.
function bridgeTokenFilePath(): string {
  return path.join(os.homedir(), ".config", "openclaw-command-center", "bridge-token");
}

function loadOrCreateBridgeToken(): string {
  const file = bridgeTokenFilePath();
  try {
    const existing = readFileSync(file, "utf8").trim();
    if (existing.length >= 32) return existing;
  } catch {
    /* not present yet — create below */
  }
  const fresh = randomBytes(32).toString("hex");
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, fresh, { mode: 0o600 });
  try { chmodSync(file, 0o600); } catch { /* best effort */ }
  return fresh;
}

/**
 * Constant-time bearer-token verification (added 2026-05-04 H2 hardening).
 * Routes that bypass auth: GET /, GET /health and GET /healthz (so health probes work;
 * /healthz matches the canonical :8798 bridge's path, which is what clients probe).
 * All other routes require either Authorization: Bearer <token>
 * or X-MCP-Token: <token>.
 */
function extractToken(req: http.IncomingMessage): string | undefined {
  const xtok = req.headers["x-mcp-token"];
  if (typeof xtok === "string" && xtok.length > 0) return xtok;
  const auth = req.headers["authorization"];
  if (typeof auth === "string" && auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  return undefined;
}

function verifyToken(expected: string, provided: string | undefined): boolean {
  if (!provided) return false;
  const a = createHash("sha256").update(expected, "utf8").digest();
  const b = createHash("sha256").update(provided, "utf8").digest();
  return timingSafeEqual(a, b);
}

// TLS is mandatory. The previous OPENCLAW_BRIDGE_TLS_DISABLE escape hatch and
// silent fallback-to-http on cert read failure were removed (2026-04-30): a
// stray env var or a missing cert file must not be able to demote this bridge
// to plain HTTP. If the mkcert pair cannot be loaded, refuse to start.
function resolveTlsConfig(): { key: Buffer; cert: Buffer } {
  if (process.env.OPENCLAW_BRIDGE_TLS_DISABLE) {
    throw new Error(
      "OPENCLAW_BRIDGE_TLS_DISABLE is no longer honored. The Command Center bridge is HTTPS-only. " +
      "Unset this variable and provide a valid mkcert cert/key pair."
    );
  }
  const home = process.env.HOME || "";
  const keyPath = process.env.OPENCLAW_BRIDGE_TLS_KEY
    || `${home}/.local/share/mkcert/localhost-key.pem`;
  const certPath = process.env.OPENCLAW_BRIDGE_TLS_CERT
    || `${home}/.local/share/mkcert/localhost.pem`;
  try {
    return {
      key: readFileSync(keyPath),
      cert: readFileSync(certPath)
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Command Center bridge cannot start: TLS key/cert load failed (${detail}). ` +
      `Expected key at ${keyPath} and cert at ${certPath}. ` +
      `Install mkcert and run \`mkcert -install && mkcert localhost 127.0.0.1\` if missing.`
    );
  }
}
const MAX_BODY_BYTES = 1024 * 1024; // 1 MB
const MCP_PROTOCOL_VERSION = "2024-11-05";
const SERVER_INFO = { name: "obsidian-mcp-bridge", version: "2.0.0" };

/**
 * Narrow callback interface for plugin actions.
 * Decouples the bridge from the plugin class.
 */
export interface PluginActions {
  runWorkflow(templateId: string, inputs: Record<string, string>): void;
  /** Bounded await of the async-captured workflow id (Decision 1, 2026-08-20). */
  awaitWorkflowId(timeoutMs: number): Promise<string | null>;
  cancelWorkflow(): { cancelled: boolean; workflow_id: string | null; reason?: string };
  isRunning(): boolean;
  getLastResult(): Record<string, unknown> | null;
  getWorkflowState(): Record<string, unknown> | null;
  listTemplates(): Array<{
    id: string;
    name: string;
    description: string;
    requiredInputs: string[];
  }>;
  getHistory(limit: number): Array<Record<string, unknown>>;
  getArtifacts(workflowId?: string): Record<string, unknown>;
  /** Bounded argv-array spawn of an engine script (cwd = engine root). */
  runEngineScript(spec: {
    scriptRel: string;
    args: string[];
    timeoutMs: number;
  }): Promise<EngineScriptResult>;
  getFeedStats(): Record<string, unknown>;
  getCitationIntegrity(workflowId?: string): Record<string, unknown>;
}

/**
 * In-plugin MCP bridge HTTP server.
 *
 * Runs inside the Obsidian plugin process so it has direct access to the
 * Obsidian Vault, Workspace, and Commands APIs — no filesystem workarounds,
 * no Advanced URI subprocess spawning.
 *
 * Replicates the exact HTTP contract of the standalone bridge at
 * openclaw-bridge/obsidian-mcp-bridge.js so the Copilot MCP config
 * works without changes.
 */
export class McpBridgeServer {
  private server: http.Server | https.Server | null = null;
  private startTime: number = Date.now();

  constructor(
    private app: App,
    private settings: OpenClawSettings,
    private pluginActions?: PluginActions
  ) {}

  // Bearer token loaded from the 0600 ~/.config file (not from settings/data.json).
  private bridgeToken = "";

  get isRunning(): boolean {
    return this.server !== null;
  }

  async start(): Promise<void> {
    if (this.server) return;

    this.startTime = Date.now();

    // Load (or create) the bearer token from a 0600 file outside Obsidian's
    // settings. Previously the token lived in data.json, which Obsidian persists
    // world-readably and auto-backups — leaking the credential (audit P0).
    this.bridgeToken = loadOrCreateBridgeToken();

    return new Promise((resolve, reject) => {
      let tls: { key: Buffer; cert: Buffer };
      try {
        tls = resolveTlsConfig();
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
        return;
      }
      const handler = (req: http.IncomingMessage, res: http.ServerResponse) => {
        this.handleRequest(req, res);
      };
      const server: https.Server = https.createServer(tls, handler);
      // Encrypted-by-default invariant: this bridge MUST be an https.Server.
      if (!(server instanceof https.Server)) {
        reject(new Error("Command Center bridge constructed a non-HTTPS server; refusing to listen."));
        return;
      }

      server.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") {
          console.warn(
            `[OpenClaw] Bridge port ${this.settings.bridgePort} is already in use — is the standalone bridge running?`
          );
          reject(new Error(`Port ${this.settings.bridgePort} already in use`));
        } else {
          console.error(`[OpenClaw] Bridge server error: ${err.message}`);
          reject(err);
        }
      });

      server.listen(this.settings.bridgePort, HOST, () => {
        this.server = server;
        console.log(
          `[OpenClaw] MCP bridge started on https://${HOST}:${this.settings.bridgePort}`
        );
        console.log(
          `[OpenClaw] Vault: ${this.app.vault.getName()} | Tools: ${(this.handleHealth().tools as string[]).length}`
        );
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close(() => {
        console.log("[OpenClaw] MCP bridge stopped");
        this.server = null;
        resolve();
      });
    });
  }

  // ─── Request Router ──────────────────────────────────────────

  private handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): void {
    // CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "content-type, authorization, x-mcp-token, x-mcp-nonce, x-mcp-timestamp, x-mcp-body-sha256"
    );

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(
      req.url || "/",
      `http://${HOST}:${this.settings.bridgePort}`
    );

    // GET /health, /healthz or / — health probes are open by design (no auth required).
    // `/healthz` is an alias, not a new surface: same handler, already reachable
    // unauthenticated at `/` and `/health`. It exists because the canonical bridge on
    // :8798 serves `/healthz`, so every client in this monorepo probes that path —
    // including the Copilot fork's MCP diagnostics panel, which sends no auth header
    // and therefore hit the Bearer gate below and reported a misleading HTTP 401
    // against a bridge whose token was correct all along (diagnosed 2026-07-31).
    if (
      req.method === "GET" &&
      (url.pathname === "/" || url.pathname === "/health" || url.pathname === "/healthz")
    ) {
      this.sendJson(res, 200, this.handleHealth());
      return;
    }

    // Bearer-token gate for every other route (added 2026-05-04 H2 hardening).
    if (!verifyToken(this.bridgeToken, extractToken(req))) {
      this.sendJson(res, 401, {
        ok: false,
        error: { message: "Missing or invalid Command Center bridge token. Provide it via Authorization: Bearer <token> or X-MCP-Token: <token>." },
      });
      return;
    }

    // GET /mcp/sse or /sse or /mcp/events — SSE transport
    if (
      req.method === "GET" &&
      (url.pathname === "/mcp/sse" ||
        url.pathname === "/sse" ||
        url.pathname === "/mcp/events")
    ) {
      this.handleSse(req, res);
      return;
    }

    // POST — read body then route
    if (req.method === "POST") {
      this.readBody(req)
        .then((body) => this.routePost(url.pathname, body, res))
        .catch((err) => {
          this.sendJson(res, 400, {
            ok: false,
            error: { message: err.message || "Bad request" },
          });
        });
      return;
    }

    this.sendJson(res, 404, { error: "Not found" });
  }

  // ─── POST Router ────────────────────────────────────────────

  private async routePost(
    pathname: string,
    body: Record<string, unknown>,
    res: http.ServerResponse
  ): Promise<void> {
    // Copilot /mcp/tool format: { tool, operation, input }
    if (pathname === "/mcp/tool" || (!body.jsonrpc && body.tool && body.operation)) {
      const toolName = body.tool as string;
      const input = (body.input || {}) as Record<string, unknown>;
      if (!toolName) {
        this.sendJson(res, 200, {
          ok: false,
          error: { message: "Missing 'tool' field" },
        });
        return;
      }
      try {
        const result = await this.dispatchTool(toolName, input);
        this.sendJson(res, 200, { ok: true, ...result });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.sendJson(res, 200, { ok: false, error: { message: msg } });
      }
      return;
    }

    // Direct tool call (non-JSON-RPC): { name, arguments }
    if (!body.jsonrpc && body.name) {
      const toolName = body.name as string;
      const input = (body.arguments || {}) as Record<string, unknown>;
      try {
        const result = await this.dispatchTool(toolName, input);
        this.sendJson(res, 200, { result });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.sendJson(res, 400, { error: msg });
      }
      return;
    }

    // JSON-RPC 2.0: { jsonrpc, id, method, params }
    if (body.jsonrpc === "2.0") {
      const id = (body.id as string | number) || null;
      const method = (body.method as string) || "";
      const params = (body.params || {}) as Record<string, unknown>;
      try {
        const result = await this.routeMcpRequest(method, params);
        this.sendJson(res, 200, { jsonrpc: "2.0", id, result });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.sendJson(res, 200, {
          jsonrpc: "2.0",
          id,
          error: { code: -32603, message: msg },
        });
      }
      return;
    }

    this.sendJson(res, 400, { error: "Unrecognized request format" });
  }

  // ─── MCP JSON-RPC Methods ───────────────────────────────────

  private async routeMcpRequest(
    method: string,
    params: Record<string, unknown>
  ): Promise<unknown> {
    if (method === "initialize") {
      return {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      };
    }

    if (method === "tools/list") {
      return this.handleToolsList();
    }

    if (method === "tools/call") {
      const toolName = params.name as string;
      const toolArgs = (params.arguments || {}) as Record<string, unknown>;
      const result = await this.dispatchTool(toolName, toolArgs);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }

    throw new Error(`Unknown method: ${method}`);
  }

  // ─── Tool Dispatcher ────────────────────────────────────────

  private async dispatchTool(
    name: string,
    input: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    switch (name) {
      case "obsidian_health":
        return this.handleHealth();
      case "obsidian_open_vault":
        return await this.handleOpenVault(input);
      case "obsidian_read_note":
        return await this.handleReadNote(input);
      case "obsidian_search_notes":
        return await this.handleSearchNotes(input);
      case "obsidian_execute_command":
        return this.handleExecuteCommand(input);
      case "obsidian_create_note":
        return await this.handleCreateNote(input);
      case "obsidian_append_note":
        return await this.handleAppendNote(input);
      case "obsidian_openclaw_run_workflow":
        return await this.handleRunWorkflow(input);
      case "obsidian_openclaw_status":
        return this.handleGetStatus();
      case "obsidian_openclaw_results":
        return this.handleGetResults();
      case "obsidian_openclaw_templates":
        return this.handleListTemplates();
      case "obsidian_openclaw_cancel":
        return this.handleCancelWorkflow();
      case "obsidian_openclaw_history":
        return this.handleHistory(input);
      case "obsidian_openclaw_artifacts":
        return this.handleArtifacts(input);
      case "obsidian_openclaw_engine_health":
        return await this.handleEngineHealth();
      case "obsidian_openclaw_research_task":
        return await this.handleResearchTask(input);
      case "obsidian_openclaw_research_tasks_list":
        return await this.handleResearchTasksList();
      case "obsidian_openclaw_research_output":
        return await this.handleResearchOutput(input);
      case "obsidian_openclaw_delivery_evidence":
        return await this.handleDeliveryEvidence(input);
      case "obsidian_openclaw_citation_integrity":
        return this.handleCitationIntegrity(input);
      case "obsidian_openclaw_feed_stats":
        return this.handleFeedStats();
      case "video_pipeline_run":
        return await this.handleVideoPipelineRun(input);
      case "video_pipeline_status":
        return this.handleVideoPipelineStatus();
      case "zk_serendipity":
      case "zk_cross_domain":
      case "zk_echo_chamber":
      case "zk_semantic_linker":
      case "zk_orphan_rescue":
        return await this.handleZkAnalysis(name, input);
      case "zk_vault_health":
        return await this.handleZkVaultHealth(input);
      case "zk_full_pipeline":
        return await this.handleZkPipeline(input);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  // ─── Tool Implementations ───────────────────────────────────

  private handleHealth(): Record<string, unknown> {
    return {
      status: "ok",
      service: "obsidian-mcp-bridge",
      vault: this.app.vault.getName(),
      vaultExists: true,
      inPlugin: true,
      timestamp: new Date().toISOString(),
      uptime: (Date.now() - this.startTime) / 1000,
      tools: [
        "obsidian_health",
        "obsidian_open_vault",
        "obsidian_read_note",
        "obsidian_search_notes",
        "obsidian_execute_command",
        "obsidian_create_note",
        "obsidian_append_note",
        "obsidian_openclaw_run_workflow",
        "obsidian_openclaw_status",
        "obsidian_openclaw_results",
        "obsidian_openclaw_templates",
        "obsidian_openclaw_cancel",
        "obsidian_openclaw_history",
        "obsidian_openclaw_artifacts",
        "obsidian_openclaw_engine_health",
        "obsidian_openclaw_research_task",
        "obsidian_openclaw_research_tasks_list",
        "obsidian_openclaw_research_output",
        "obsidian_openclaw_delivery_evidence",
        "obsidian_openclaw_citation_integrity",
        "obsidian_openclaw_feed_stats",
        "video_pipeline_run",
        "video_pipeline_status",
        "zk_serendipity",
        "zk_cross_domain",
        "zk_echo_chamber",
        "zk_semantic_linker",
        "zk_orphan_rescue",
        "zk_vault_health",
        "zk_full_pipeline",
      ],
    };
  }

  private async handleOpenVault(
    params: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const notePath = (params.path as string) || "";

    if (notePath) {
      const safe = this.safePath(notePath);
      const leaf = this.app.workspace.getLeaf(false);
      await this.app.workspace.openLinkText(safe, "", false);
      return { success: true, vault: this.app.vault.getName(), path: safe };
    }

    // Just open the vault (already open since we're in plugin)
    return {
      success: true,
      vault: this.app.vault.getName(),
      path: "(root)",
    };
  }

  private async handleReadNote(
    params: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const notePath = params.path as string;
    if (!notePath) throw new Error("path is required");

    const safe = this.safePath(notePath);
    const file = this.app.vault.getAbstractFileByPath(safe);
    if (!file || !(file instanceof TFile)) {
      throw new Error(`Note not found: ${safe}`);
    }

    const content = await this.app.vault.read(file);
    const stat = file.stat;

    return {
      path: safe,
      content,
      size: stat.size,
      modified: new Date(stat.mtime).toISOString(),
      created: new Date(stat.ctime).toISOString(),
    };
  }

  private async handleSearchNotes(
    params: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const query = ((params.query as string) || "").toLowerCase();
    const searchPath = (params.path as string) || "";
    const limit = Math.min((params.limit as number) || 20, 500);
    const caseSensitive = (params.caseSensitive as boolean) || false;

    if (!query) throw new Error("query is required");

    const allFiles = this.app.vault.getMarkdownFiles();
    const results: Array<{
      path: string;
      context: string;
      score: number;
    }> = [];

    for (const file of allFiles) {
      if (results.length >= limit) break;
      if (searchPath && !file.path.startsWith(searchPath)) continue;

      const content = await this.app.vault.cachedRead(file);
      const searchContent = caseSensitive ? content : content.toLowerCase();
      const searchQuery = caseSensitive ? query : query.toLowerCase();

      if (searchContent.includes(searchQuery)) {
        const idx = searchContent.indexOf(searchQuery);
        const start = Math.max(0, idx - 60);
        const end = Math.min(content.length, idx + query.length + 60);
        const context = content
          .slice(start, end)
          .replace(/\n/g, " ")
          .trim();

        results.push({
          path: file.path,
          context:
            (start > 0 ? "..." : "") +
            context +
            (end < content.length ? "..." : ""),
          score: 1.0,
        });
      }
    }

    return { query, results, total: results.length };
  }

  private handleExecuteCommand(
    params: Record<string, unknown>
  ): Record<string, unknown> {
    const commandId = params.id as string;
    if (!commandId) throw new Error("id (command ID) is required");

    // Validate command ID format
    if (!/^[a-z0-9_-]+:[a-z0-9_-]+$/i.test(commandId)) {
      throw new Error(
        `Invalid command ID format: ${commandId}. Expected: plugin-id:command-name`
      );
    }

    // Security (audit P0): enforce the command allowlist (no open dispatch).
    if (!isCommandAllowed(commandId)) {
      throw new Error(
        `Command '${commandId}' is not permitted by the OpenClaw bridge. ` +
          `Only ${ALLOWED_COMMAND_PREFIXES.join(", ")}* commands are allowed.`
      );
    }

    // Direct API call — no Advanced URI subprocess needed
    const commands = (this.app as any).commands;
    if (!commands || typeof commands.executeCommandById !== "function") {
      throw new Error("Obsidian commands API not available");
    }

    const success = commands.executeCommandById(commandId);

    return {
      success: success !== false,
      command: commandId,
      vault: this.app.vault.getName(),
      message: `Command '${commandId}' executed via direct API`,
    };
  }

  private async handleCreateNote(
    params: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const notePath = params.path as string;
    const content = (params.content as string) || "";
    const overwrite = (params.overwrite as boolean) || false;
    const openNote = (params.open as boolean) || false;

    if (!notePath) throw new Error("path is required");

    const safe = this.safePath(notePath);
    const existing = this.app.vault.getAbstractFileByPath(safe);

    if (existing && !overwrite) {
      throw new Error(
        `Note already exists: ${safe}. Set overwrite=true to replace.`
      );
    }

    if (existing && overwrite && existing instanceof TFile) {
      await this.app.vault.modify(existing, content);
    } else {
      // Ensure parent folders exist
      const parentPath = safe.substring(0, safe.lastIndexOf("/"));
      if (parentPath) {
        await this.ensureFolder(parentPath);
      }
      await this.app.vault.create(safe, content);
    }

    if (openNote) {
      await this.app.workspace.openLinkText(safe, "", false);
    }

    return {
      success: true,
      path: safe,
      size: new TextEncoder().encode(content).length,
      created: new Date().toISOString(),
    };
  }

  private async handleAppendNote(
    params: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const notePath = params.path as string;
    const content = params.content as string;
    const inline = (params.inline as boolean) || false;

    if (!notePath) throw new Error("path is required");
    if (content === undefined || content === null) {
      throw new Error("content is required");
    }

    const safe = this.safePath(notePath);
    const file = this.app.vault.getAbstractFileByPath(safe);
    if (!file || !(file instanceof TFile)) {
      throw new Error(`Note not found: ${safe}`);
    }

    const existing = await this.app.vault.read(file);
    const separator = inline ? "" : "\n";
    const combined = existing + separator + content;
    await this.app.vault.modify(file, combined);

    const appendedBytes = new TextEncoder().encode(separator + content).length;

    return {
      success: true,
      path: safe,
      newSize: new TextEncoder().encode(combined).length,
      appendedBytes,
    };
  }

  // ─── OpenClaw Workflow Tools ─────────────────────────────────

  private async handleRunWorkflow(
    params: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const actions = this.requireActions();
    if (actions.isRunning()) {
      throw new Error(
        "A workflow is already running. Cancel it with obsidian_openclaw_cancel or wait for it to complete."
      );
    }

    const templateId = this.validateId(params.template, "template");
    if (!templateId) {
      throw new Error(
        "template is required. Use obsidian_openclaw_templates to list available templates."
      );
    }
    const rawInputs = (params.inputs || {}) as Record<string, unknown>;
    const inputs: Record<string, string> = {};
    for (const [k, v] of Object.entries(rawInputs)) {
      this.validateId(k, "inputs key");
      inputs[k] = this.cleanText(v, `inputs.${k}`, 2000);
    }

    actions.runWorkflow(templateId, inputs);

    // Decision 1 (2026-08-20): block briefly for the async-captured workflow id
    // so the agent gets a correlation handle for status/cancel/artifacts.
    const workflowId = await actions.awaitWorkflowId(15_000);

    return {
      success: true,
      started: true,
      workflow_id: workflowId,
      id_pending: !workflowId,
      message:
        `Workflow '${templateId}' started` +
        (workflowId
          ? ` (workflow_id ${workflowId}).`
          : " (id not yet visible — obsidian_openclaw_status will carry it shortly).") +
        " Poll obsidian_openclaw_status; stop with obsidian_openclaw_cancel. Runs typically take 5-10 minutes and require a freshly armed operator-approve token.",
      template: templateId,
      inputs,
    };
  }

  private handleGetStatus(): Record<string, unknown> {
    if (!this.pluginActions) {
      throw new Error("OpenClaw plugin actions not available");
    }

    const running = this.pluginActions.isRunning();
    const state = this.pluginActions.getWorkflowState();

    if (!running && !state) {
      return { status: "idle", message: "No workflow is running." };
    }

    return {
      status: running ? "running" : "completed",
      ...(state || {}),
    };
  }

  private handleGetResults(): Record<string, unknown> {
    if (!this.pluginActions) {
      throw new Error("OpenClaw plugin actions not available");
    }

    const result = this.pluginActions.getLastResult();
    if (!result) {
      return {
        status: "none",
        message: "No workflow results available yet. Run a workflow first.",
      };
    }

    return { status: "available", ...result };
  }

  private handleListTemplates(): Record<string, unknown> {
    if (!this.pluginActions) {
      throw new Error("OpenClaw plugin actions not available");
    }

    return { templates: this.pluginActions.listTemplates() };
  }

  // ─── OpenClaw Engine Suite (added 2026-08-20) ────────────────
  // Client-edge validation lives HERE (the bridge previously forwarded inputs
  // unvalidated): ids match a strict token pattern, enums are literal lists,
  // free text is length-capped and control-stripped, and every engine call is
  // an argv-array spawn — agent input never touches a shell string.

  private static readonly ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
  private static readonly TASK_TYPES = [
    "summarize",
    "extract",
    "analyze",
    "synthesize",
    "freeform",
  ];

  private requireActions(): PluginActions {
    if (!this.pluginActions) {
      throw new Error("OpenClaw plugin actions not available");
    }
    return this.pluginActions;
  }

  private validateId(value: unknown, field: string): string | undefined {
    if (value === undefined || value === null || value === "") return undefined;
    const s = String(value);
    if (!McpBridgeServer.ID_RE.test(s)) {
      throw new Error(`${field} must match [A-Za-z0-9_-] (max 64 chars)`);
    }
    return s;
  }

  private cleanText(value: unknown, field: string, max = 2000): string {
    const s = typeof value === "string" ? value : "";
    if (!s.trim()) throw new Error(`${field} is required`);
    if (s.length > max) throw new Error(`${field} exceeds ${max} characters`);
    // eslint-disable-next-line no-control-regex
    return s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "").trim();
  }

  private handleCancelWorkflow(): Record<string, unknown> {
    const result = this.requireActions().cancelWorkflow();
    return { ...result };
  }

  private handleHistory(params: Record<string, unknown>): Record<string, unknown> {
    const raw = Number(params.limit);
    const limit = Number.isFinite(raw) ? Math.min(Math.max(Math.floor(raw), 1), 50) : 20;
    return { history: this.requireActions().getHistory(limit) };
  }

  private handleArtifacts(params: Record<string, unknown>): Record<string, unknown> {
    const id = this.validateId(params.workflow_id, "workflow_id");
    return this.requireActions().getArtifacts(id);
  }

  private handleCitationIntegrity(params: Record<string, unknown>): Record<string, unknown> {
    const id = this.validateId(params.workflow_id, "workflow_id");
    return this.requireActions().getCitationIntegrity(id);
  }

  private handleFeedStats(): Record<string, unknown> {
    return this.requireActions().getFeedStats();
  }

  private async handleEngineHealth(): Promise<Record<string, unknown>> {
    const actions = this.requireActions();
    const runtime = await actions.runEngineScript({
      scriptRel: "scripts/verify-node-runtime.js",
      args: [],
      timeoutMs: 20_000,
    });
    // Mock provider only — engine_health must never trigger real model spend
    // or the operator gate.
    const llm = await actions.runEngineScript({
      scriptRel: "scripts/test-llm-connection.js",
      args: ["--provider", "mock"],
      timeoutMs: 60_000,
    });
    const audit = await actions.runEngineScript({
      scriptRel: "scripts/audit-connector-coverage.js",
      args: [],
      timeoutMs: 120_000,
    });
    const tail = (r: EngineScriptResult, lines: number) =>
      (r.stdout || r.stderr).trim().split("\n").slice(-lines).join("\n");
    return {
      ok: runtime.code === 0 && llm.code === 0 && audit.code === 0,
      node_runtime: { ok: runtime.code === 0, detail: tail(runtime, 6) },
      llm_mock_probe: { ok: llm.code === 0, detail: tail(llm, 10) },
      connector_audit: { ok: audit.code === 0, detail: tail(audit, 30) },
      note: "Mock-provider probe only; a real-provider run additionally needs an armed operator-approve token.",
    };
  }

  private async handleResearchTask(
    params: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const actions = this.requireActions();
    const task = this.cleanText(params.task, "task", 2000);
    const type = String(params.type ?? "freeform");
    if (!McpBridgeServer.TASK_TYPES.includes(type)) {
      throw new Error(`type must be one of: ${McpBridgeServer.TASK_TYPES.join(", ")}`);
    }
    const provider = String(params.provider ?? "mock");
    if (provider !== "mock" && provider !== "real") {
      throw new Error("provider must be 'mock' (fast, ungated) or 'real' (default engine provider — needs an armed operator token)");
    }

    const args = ["--task", task, "--type", type, "--format", "markdown", "--confirm"];
    if (provider === "mock") {
      args.push("--provider", "mock");
    } else {
      // Real lane: the engine's default provider chain; fail-closed behind the
      // one-shot operator-approve gate.
      args.push("--operator-approve");
    }

    const res = await actions.runEngineScript({
      scriptRel: "scripts/run-research-task.js",
      args,
      timeoutMs: provider === "mock" ? 120_000 : 600_000,
    });

    if (res.code !== 0) {
      if (isGateRefusal(res.stdout, res.stderr)) {
        return gateNotArmedError();
      }
      throw new Error(
        `run-research-task exited ${res.code}${res.timedOut ? " (timed out)" : ""}: ${(res.stderr || res.stdout).trim().slice(-800)}`
      );
    }

    let parsed: unknown = null;
    try {
      parsed = JSON.parse(res.stdout);
    } catch {
      parsed = null;
    }
    return {
      success: true,
      provider,
      type,
      ...(parsed && typeof parsed === "object"
        ? { result: parsed }
        : { output: res.stdout.trim().slice(-4000) }),
    };
  }

  private async handleResearchTasksList(): Promise<Record<string, unknown>> {
    const res = await this.requireActions().runEngineScript({
      scriptRel: "scripts/list-research-tasks.js",
      args: [],
      timeoutMs: 30_000,
    });
    if (res.code !== 0) {
      throw new Error(`list-research-tasks exited ${res.code}: ${(res.stderr || res.stdout).trim().slice(-400)}`);
    }
    try {
      return { tasks: JSON.parse(res.stdout) };
    } catch {
      return { raw: res.stdout.trim().slice(-4000) };
    }
  }

  private async handleResearchOutput(
    params: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const taskId = this.validateId(params.task_id, "task_id");
    if (!taskId) throw new Error("task_id is required");
    const res = await this.requireActions().runEngineScript({
      scriptRel: "scripts/view-research-output.js",
      args: ["--task-id", taskId],
      timeoutMs: 30_000,
    });
    if (res.code !== 0) {
      throw new Error(`view-research-output exited ${res.code}: ${(res.stderr || res.stdout).trim().slice(-400)}`);
    }
    const capped = res.stdout.length > 100_000;
    const body = capped ? res.stdout.slice(0, 100_000) : res.stdout;
    try {
      return { task_id: taskId, output: JSON.parse(body), truncated: capped };
    } catch {
      return { task_id: taskId, raw: body.trim(), truncated: capped };
    }
  }

  private async handleDeliveryEvidence(
    params: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const mode = String(params.mode ?? "incremental");
    // `rebuild` writes derived snapshots — operator-only, excluded at the enum.
    if (mode !== "full" && mode !== "incremental") {
      throw new Error("mode must be 'full' or 'incremental' (rebuild is operator-only)");
    }
    const offerId = this.validateId(params.offer_id, "offer_id");
    const args = ["--mode", mode, ...(offerId ? ["--offer-id", offerId] : [])];
    const res = await this.requireActions().runEngineScript({
      scriptRel: "scripts/verify-delivery-evidence.js",
      args,
      timeoutMs: 300_000,
    });
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(res.stdout);
    } catch {
      parsed = null;
    }
    return {
      ok: res.code === 0,
      mode,
      ...(offerId ? { offer_id: offerId } : {}),
      ...(parsed && typeof parsed === "object"
        ? { result: parsed }
        : { output: (res.stdout || res.stderr).trim().slice(-4000) }),
    };
  }

  // ─── Video Pipeline Tools ───────────────────────────────────

  private async handleVideoPipelineRun(
    params: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const source = resolveVideoPipelineSource(params.videoUrl);
    const deeplink = `${VIDEO_PIPELINE_DEEPLINK_BASE}?arguments=${encodeURIComponent(
      JSON.stringify({ videoUrl: source })
    )}`;

    if (params.dry_run === true) {
      return { dispatched: false, dryRun: true, videoUrl: source, deeplink };
    }

    // Pre-flight: report whether Raycast is up. Non-fatal — /usr/bin/open auto-launches the
    // URL handler — but a cold launch is a known replay risk, so surface it.
    const raycastWasRunning = await new Promise<boolean>((resolve) => {
      execFile("/usr/bin/pgrep", ["-x", "Raycast"], (err) => resolve(!err));
    });

    // Byte-anchor the run log BEFORE dispatch so the confirmation watch below only ever
    // matches a RUN START appended by THIS dispatch, never a previous run's.
    const logBytesBeforeDispatch = this.videoPipelineLogSize();

    await new Promise<void>((resolve, reject) => {
      execFile("/usr/bin/open", [deeplink], (err, _stdout, stderr) => {
        if (err) {
          reject(
            new Error(
              `/usr/bin/open failed (exit ${err.code ?? "?"}): ${String(stderr || err.message).trim()}`
            )
          );
        } else {
          resolve();
        }
      });
    });

    // Bounded confirmation: the runner appends RUN START within ~2s of a healthy dispatch.
    // Its absence after 15s is the stale-registration signature observed 2026-08-17 (open
    // exits 0, Raycast running, command not registered, total silence).
    const confirmation = await this.waitForVideoPipelineRunStart(
      source,
      logBytesBeforeDispatch,
      15_000
    );

    return {
      success: true,
      dispatched: true,
      videoUrl: source,
      raycastWasRunning,
      dispatchConfirmed: confirmation.confirmed,
      ...(confirmation.confirmed
        ? { startedAt: confirmation.startedAt }
        : {
            warning:
              "macOS accepted the dispatch but no RUN START appeared in the pipeline log within 15s. " +
              "Most likely the Raycast extension registration is stale (observed 2026-08-17): run " +
              "`npm run dev` once in Copilot-Everything/bridges/raycast-obsidian-extension, then retry. " +
              "A queued replay may still fire late — check video_pipeline_status before re-dispatching.",
          }),
      message:
        "Video pipeline dispatched through Raycast. Public hosts (e.g. YouTube) download " +
        "hands-free; login-gated hosts (e.g. LinkedIn Learning) open Downie's UGE window " +
        "where the HUMAN must click the detected stream once — tell the user to click it. " +
        "The finished summary lands in the vault at " +
        "Copilot Summaries/'<video title> summary.md' and intermediates are " +
        "cleaned up. Poll video_pipeline_status every ~20s; typical runs finish 1-4 " +
        "minutes after the download starts.",
    };
  }

  private handleVideoPipelineStatus(): Record<string, unknown> {
    let text: string;
    try {
      text = readFileSync(videoPipelineLogPath(), "utf8");
    } catch {
      return {
        status: "unknown",
        message: "No pipeline run log exists yet — no run has ever been dispatched on this machine.",
      };
    }

    const lines = text.trimEnd().split("\n");
    let startIdx = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].includes("RUN START")) {
        startIdx = i;
        break;
      }
    }
    if (startIdx < 0) {
      return { status: "unknown", message: "Run log exists but contains no RUN START entry." };
    }

    const run = lines.slice(startIdx);
    const terminal = run.some((l) => l.includes("RUN SUCCESS"))
      ? "success"
      : run.some((l) => l.includes("RUN FAIL"))
        ? "failed"
        : "running";
    const summaryLine = run.find((l) => l.includes("summary written via"));
    const urlMatch = run[0].match(/url=(.+)$/);

    return {
      status: terminal,
      startedAt: run[0].slice(0, 24).trim(),
      ...(urlMatch ? { videoUrl: urlMatch[1] } : {}),
      latest: run[run.length - 1],
      ...(summaryLine ? { summary: summaryLine } : {}),
      recentLines: run.slice(-8),
    };
  }

  private videoPipelineLogSize(): number {
    try {
      return statSync(videoPipelineLogPath()).size;
    } catch {
      return 0;
    }
  }

  /** Watch the run log (byte-anchored) for a RUN START naming this dispatch's source. */
  private async waitForVideoPipelineRunStart(
    source: string,
    fromByte: number,
    timeoutMs: number
  ): Promise<{ confirmed: boolean; startedAt?: string }> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      try {
        // Buffer slice by BYTES — the anchor is a byte offset, and log lines carry
        // multibyte video titles, so a string slice would mis-anchor.
        const fresh = readFileSync(videoPipelineLogPath()).subarray(fromByte).toString("utf8");
        const line = fresh
          .split("\n")
          .find((l) => l.includes("RUN START") && l.includes(source));
        if (line) return { confirmed: true, startedAt: line.slice(0, 24).trim() };
      } catch {
        /* log may not exist yet */
      }
      if (Date.now() >= deadline) return { confirmed: false };
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  // ─── Vault Zettelkasten Tools ───────────────────────────────

  private requireVaultZK(): VaultZKApi {
    const api = getVaultZKApi(this.app);
    if (!api) {
      throw new Error(
        "The vault-zettelkasten plugin is not loaded. Enable it under Settings → Community plugins, then retry."
      );
    }
    return api;
  }

  private buildZkRequest(
    input: Record<string, unknown>,
    requireNote: boolean
  ): Record<string, unknown> {
    const notePath =
      typeof input.notePath === "string" && input.notePath.trim()
        ? this.safePath(input.notePath.trim())
        : undefined;
    const noteContent =
      typeof input.noteContent === "string" && input.noteContent.trim()
        ? (input.noteContent as string)
        : undefined;

    if (requireNote && !notePath && !noteContent) {
      throw new Error(
        "Provide notePath (vault-relative) or noteContent (raw text) for this analysis."
      );
    }
    if (notePath) {
      const file = this.app.vault.getAbstractFileByPath(notePath);
      if (!file || !(file instanceof TFile)) {
        throw new Error(`Note not found: ${notePath}`);
      }
    }

    const rawLimit = typeof input.limit === "number" ? Math.floor(input.limit) : NaN;
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), ZK_LIMIT_MAX) : 10;

    return {
      ...(notePath ? { notePath } : {}),
      ...(noteContent ? { noteContent } : {}),
      vault: this.app.vault.getName(),
      options: { limit, batchMode: false, writeReport: false },
    };
  }

  /** Unwrap a VaultZK api response; surface its error variant as a thrown Error. */
  private zkResult(result: { ok: boolean } & Record<string, unknown>): Record<string, unknown> {
    if (!result || result.ok !== true) {
      const err = (result as { error?: { code?: string; message?: string } } | null)?.error;
      throw new Error(
        err?.message
          ? `VaultZK ${err.code ?? "error"}: ${err.message}`
          : "VaultZK analysis failed without an error message."
      );
    }
    return result as Record<string, unknown>;
  }

  private async handleZkAnalysis(
    toolName: string,
    input: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const api = this.requireVaultZK();
    const method = ZK_NOTE_COMMANDS[toolName];
    if (!method) throw new Error(`Unknown VaultZK tool: ${toolName}`);
    const request = this.buildZkRequest(input, true);
    const result = await api[method](request);
    return this.zkResult(result);
  }

  private async handleZkVaultHealth(
    input: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const api = this.requireVaultZK();
    const request = this.buildZkRequest(input, false);
    const result = await api.vaultHealth(request);
    return this.zkResult(result);
  }

  private async handleZkPipeline(
    input: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const api = this.requireVaultZK();
    const request = this.buildZkRequest(input, true);

    let steps: Array<{ command: string }>;
    if (Array.isArray(input.steps) && input.steps.length > 0) {
      const requested = input.steps.map((s) => String(s));
      const invalid = requested.filter((s) => !ZK_PIPELINE_STEPS.includes(s));
      if (invalid.length > 0) {
        throw new Error(
          `Unknown pipeline step(s): ${invalid.join(", ")}. Valid: ${ZK_PIPELINE_STEPS.join(", ")}.`
        );
      }
      if (requested.length > 5) {
        throw new Error("Pipeline supports at most 5 steps.");
      }
      steps = requested.map((command) => ({ command }));
    } else {
      steps = ZK_DEFAULT_PIPELINE.map((s) => ({ ...s }));
    }

    const result = await api.pipeline(steps, request);
    return this.zkResult(result);
  }

  // ─── tools/list ─────────────────────────────────────────────

  private handleToolsList(): Record<string, unknown> {
    return {
      tools: [
        {
          name: "obsidian_health",
          description: "Check bridge health, routing, and security state.",
          inputSchema: { type: "object", properties: {} },
        },
        {
          name: "obsidian_open_vault",
          description: "Open an Obsidian vault or a note within it.",
          inputSchema: {
            type: "object",
            properties: {
              vault: { type: "string", description: "Vault name" },
              path: { type: "string", description: "Note path to open" },
            },
          },
        },
        {
          name: "obsidian_read_note",
          description: "Read the full markdown content of a vault note.",
          inputSchema: {
            type: "object",
            properties: {
              path: {
                type: "string",
                description: "Note path relative to vault root",
              },
              vault: { type: "string" },
              vaultRoot: { type: "string" },
            },
            required: ["path"],
          },
        },
        {
          name: "obsidian_search_notes",
          description: "Search notes by content.",
          inputSchema: {
            type: "object",
            properties: {
              query: { type: "string", description: "Search query" },
              path: {
                type: "string",
                description: "Path prefix to scope search",
              },
              limit: { type: "number" },
              caseSensitive: { type: "boolean" },
            },
            required: ["query"],
          },
        },
        {
          name: "obsidian_execute_command",
          description: "Execute an Obsidian command by its command ID.",
          inputSchema: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description:
                  "Obsidian command ID (e.g. 'command-center:run-workflow')",
              },
              vault: { type: "string" },
            },
            required: ["id"],
          },
        },
        {
          name: "obsidian_create_note",
          description: "Create a new note in the vault.",
          inputSchema: {
            type: "object",
            properties: {
              path: {
                type: "string",
                description: "Note path relative to vault root",
              },
              content: { type: "string" },
              overwrite: { type: "boolean" },
              open: { type: "boolean" },
              vault: { type: "string" },
              vaultRoot: { type: "string" },
            },
            required: ["path"],
          },
        },
        {
          name: "obsidian_append_note",
          description: "Append content to an existing note.",
          inputSchema: {
            type: "object",
            properties: {
              path: { type: "string", description: "Note path" },
              content: { type: "string" },
              inline: { type: "boolean" },
              idempotencyKey: { type: "string" },
              vault: { type: "string" },
              vaultRoot: { type: "string" },
            },
            required: ["path", "content"],
          },
        },
        {
          name: "obsidian_openclaw_run_workflow",
          description:
            "Start an OpenClaw research workflow. Returns immediately; use obsidian_openclaw_status to track progress. Workflows take 5-10 minutes. Use obsidian_openclaw_templates to discover available templates and their required inputs.",
          inputSchema: {
            type: "object",
            properties: {
              template: {
                type: "string",
                description:
                  "Workflow template ID — list available ids and their required inputs with obsidian_openclaw_templates (do not guess; the set changes as templates are added)",
              },
              inputs: {
                type: "object",
                description:
                  "Template inputs as key-value pairs. For general-research-pack: { topic: '...' }. For drug-discovery-full: { compound_name: '...', indication: '...' }. For pharmacovigilance-report: { drug_class: '...' }.",
              },
            },
            required: ["template", "inputs"],
          },
        },
        {
          name: "obsidian_openclaw_status",
          description:
            "Get the current status of a running or recently completed OpenClaw workflow, including step progress and pipeline state.",
          inputSchema: { type: "object", properties: {} },
        },
        {
          name: "obsidian_openclaw_results",
          description:
            "Get the results of the most recently completed OpenClaw workflow, including artifact paths and quality metrics.",
          inputSchema: { type: "object", properties: {} },
        },
        {
          name: "obsidian_openclaw_templates",
          description:
            "List all available OpenClaw workflow templates with their IDs, descriptions, and required input fields.",
          inputSchema: { type: "object", properties: {} },
        },
        {
          name: "obsidian_openclaw_cancel",
          description:
            "Cancel the currently running OpenClaw workflow (SIGTERM, then SIGKILL after 5s). The runner's timeout is warn-only, so this is the ONLY way to stop a run.",
          inputSchema: { type: "object", properties: {} },
        },
        {
          name: "obsidian_openclaw_history",
          description:
            "List past workflow runs from the engine workspace, newest first: workflow_id, template, status, created/completed timestamps, inputs.",
          inputSchema: {
            type: "object",
            properties: {
              limit: { type: "number", description: "Max entries (1-50, default 20)" },
            },
          },
        },
        {
          name: "obsidian_openclaw_artifacts",
          description:
            "Artifacts of a workflow run: engine run-dir file list, artifact ids, the vault notes folder and its notes (read them with obsidian_read_note). Defaults to the most recent run.",
          inputSchema: {
            type: "object",
            properties: {
              workflow_id: { type: "string", description: "Workflow id (default: latest)" },
            },
          },
        },
        {
          name: "obsidian_openclaw_engine_health",
          description:
            "Engine health check, read-only and ungated: Node runtime verification, a mock-provider LLM probe (never real model spend), and the connector-coverage audit.",
          inputSchema: { type: "object", properties: {} },
        },
        {
          name: "obsidian_openclaw_research_task",
          description:
            "Run a single ad-hoc research task on the engine (run-research-task.js). provider 'mock' is fast and ungated (pipeline test); provider 'real' uses the engine's default provider chain and REQUIRES a freshly armed operator-approve token — if unarmed, returns operator_gate_not_armed with instructions.",
          inputSchema: {
            type: "object",
            properties: {
              task: { type: "string", description: "Task description (max 2000 chars)" },
              type: {
                type: "string",
                enum: ["summarize", "extract", "analyze", "synthesize", "freeform"],
                description: "Task type (default freeform)",
              },
              provider: {
                type: "string",
                enum: ["mock", "real"],
                description: "mock = fast/ungated; real = default provider chain, gate-protected",
              },
            },
            required: ["task"],
          },
        },
        {
          name: "obsidian_openclaw_research_tasks_list",
          description: "List past ad-hoc research tasks (read-only, instant).",
          inputSchema: { type: "object", properties: {} },
        },
        {
          name: "obsidian_openclaw_research_output",
          description:
            "Read one ad-hoc research task's stored output by task id (read-only; large outputs are truncated at 100k chars).",
          inputSchema: {
            type: "object",
            properties: {
              task_id: { type: "string", description: "Task id from research_tasks_list" },
            },
            required: ["task_id"],
          },
        },
        {
          name: "obsidian_openclaw_delivery_evidence",
          description:
            "Verify delivery evidence for a shipped offer (verify-delivery-evidence.js). Modes: full or incremental only — rebuild is operator-only and not exposed.",
          inputSchema: {
            type: "object",
            properties: {
              mode: {
                type: "string",
                enum: ["full", "incremental"],
                description: "Verification mode (default incremental)",
              },
              offer_id: { type: "string", description: "Optional offer id to scope to" },
            },
          },
        },
        {
          name: "obsidian_openclaw_citation_integrity",
          description:
            "Read a run's citation-integrity record: the runtime verification verdict (grounded_ratio vs min_grounded_ratio gate), ungrounded/retracted lists, and the reproducibility manifest summary. These are the honest fields — never quote extraction tallies as accuracy claims.",
          inputSchema: {
            type: "object",
            properties: {
              workflow_id: { type: "string", description: "Workflow id (default: latest)" },
            },
          },
        },
        {
          name: "obsidian_openclaw_feed_stats",
          description:
            "Read-only profile of the shipped Trial Graveyard Feed registers: per indication, paid/free row counts, as_of dates, status and amendment-risk distributions. Never rebuilds or modifies feed data.",
          inputSchema: { type: "object", properties: {} },
        },
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
        {
          name: "zk_serendipity",
          description:
            "Surface unexpected, cross-cutting connections between a note and the rest of the vault (vault-zettelkasten engine). Returns markdown plus wikilink suggestions with rationales; writes nothing.",
          inputSchema: {
            type: "object",
            properties: {
              notePath: { type: "string", description: "Vault-relative note path" },
              noteContent: { type: "string", description: "Raw note text instead of a path" },
              limit: { type: "number", description: "Max suggestions (default 10, max 50)" },
            },
          },
        },
        {
          name: "zk_cross_domain",
          description:
            "Identify structural isomorphisms — patterns in this note that mirror structures in other knowledge domains across the vault. Returns markdown plus suggestions; writes nothing.",
          inputSchema: {
            type: "object",
            properties: {
              notePath: { type: "string", description: "Vault-relative note path" },
              noteContent: { type: "string", description: "Raw note text instead of a path" },
              limit: { type: "number", description: "Max suggestions (default 10, max 50)" },
            },
          },
        },
        {
          name: "zk_echo_chamber",
          description:
            "Challenge a note's assumptions with vault-grounded counterarguments and missing perspectives. Returns markdown plus suggestions; writes nothing.",
          inputSchema: {
            type: "object",
            properties: {
              notePath: { type: "string", description: "Vault-relative note path" },
              noteContent: { type: "string", description: "Raw note text instead of a path" },
              limit: { type: "number", description: "Max suggestions (default 10, max 50)" },
            },
          },
        },
        {
          name: "zk_semantic_linker",
          description:
            "Propose semantically related notes and TYPED relationships (supports/contradicts/extends/…) for a note. Returns markdown, suggestions, and typed relationships; writes nothing.",
          inputSchema: {
            type: "object",
            properties: {
              notePath: { type: "string", description: "Vault-relative note path" },
              noteContent: { type: "string", description: "Raw note text instead of a path" },
              limit: { type: "number", description: "Max suggestions (default 10, max 50)" },
            },
          },
        },
        {
          name: "zk_orphan_rescue",
          description:
            "Reconnect a note into the vault's link graph: concrete [[wikilink]] suggestions with rationales, plus the vault's top orphan notes. Writes nothing.",
          inputSchema: {
            type: "object",
            properties: {
              notePath: { type: "string", description: "Vault-relative note path" },
              noteContent: { type: "string", description: "Raw note text instead of a path" },
              limit: { type: "number", description: "Max suggestions (default 10, max 50)" },
            },
          },
        },
        {
          name: "zk_vault_health",
          description:
            "Vault-wide Zettelkasten health score: totals, orphan count/ratio, average connectivity, staleness, tag coverage. No inputs; writes nothing.",
          inputSchema: { type: "object", properties: {} },
        },
        {
          name: "zk_full_pipeline",
          description:
            "Run several Zettelkasten analyses in sequence on one note and get combined markdown plus per-step results. Slowest zk tool — can take minutes. Default steps: serendipity, cross-domain, semantic-linker, echo-chamber.",
          inputSchema: {
            type: "object",
            properties: {
              notePath: { type: "string", description: "Vault-relative note path" },
              noteContent: { type: "string", description: "Raw note text instead of a path" },
              limit: { type: "number", description: "Max suggestions per step (default 10, max 50)" },
              steps: {
                type: "array",
                items: {
                  type: "string",
                  enum: [
                    "serendipity",
                    "cross-domain",
                    "echo-chamber",
                    "semantic-linker",
                    "orphan-rescue",
                    "health",
                  ],
                },
                description:
                  "Analysis steps to run in order (1-5). Default: serendipity, cross-domain, semantic-linker, echo-chamber.",
              },
            },
          },
        },
      ],
    };
  }

  // ─── SSE Endpoint ───────────────────────────────────────────

  private handleSse(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): void {
    const sessionId = `mcp-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write(
      `event: endpoint\ndata: /mcp/messages?sessionId=${sessionId}\n\n`
    );

    const keepAlive = setInterval(() => {
      try {
        res.write(`: keepalive ${Date.now()}\n\n`);
      } catch {
        /* connection closed */
      }
    }, 15000);

    req.on("close", () => clearInterval(keepAlive));
  }

  // ─── Utilities ──────────────────────────────────────────────

  private safePath(raw: string): string {
    const normalized = normalizePath(raw);
    // Prevent traversal above vault root
    if (normalized.startsWith("..") || normalized.includes("/../")) {
      throw new Error("Path traversal not allowed");
    }
    return normalized;
  }

  private async ensureFolder(folderPath: string): Promise<void> {
    const parts = folderPath.split("/");
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      const existing = this.app.vault.getAbstractFileByPath(current);
      if (!existing) {
        await this.app.vault.createFolder(current);
      }
    }
  }

  private readBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;

      req.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) {
          reject(new Error("Body too large"));
          return;
        }
        chunks.push(chunk);
      });

      req.on("end", () => {
        try {
          const raw = Buffer.concat(chunks).toString("utf-8");
          resolve(raw ? JSON.parse(raw) : {});
        } catch {
          reject(new Error("Invalid JSON body"));
        }
      });

      req.on("error", reject);
    });
  }

  private sendJson(
    res: http.ServerResponse,
    status: number,
    data: unknown
  ): void {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data, null, 2));
  }
}
