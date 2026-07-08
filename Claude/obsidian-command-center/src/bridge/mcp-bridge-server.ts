import * as http from "http";
import * as https from "https";
import * as os from "os";
import * as path from "path";
import { readFileSync, writeFileSync, mkdirSync, chmodSync } from "fs";
import { createHash, timingSafeEqual, randomBytes } from "crypto";
import { App, TFile, normalizePath } from "obsidian";
import type { OpenClawSettings } from "../types";

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
 * Routes that bypass auth: GET / and GET /health (so health probes work).
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
  isRunning(): boolean;
  getLastResult(): Record<string, unknown> | null;
  getWorkflowState(): Record<string, unknown> | null;
  listTemplates(): Array<{
    id: string;
    name: string;
    description: string;
    requiredInputs: string[];
  }>;
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
          `[OpenClaw] Vault: ${this.app.vault.getName()} | Tools: 11 (7 obsidian_* + 4 obsidian_openclaw_*)`
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

    // GET /health or / — health probes are open by design (no auth required).
    if (
      req.method === "GET" &&
      (url.pathname === "/" || url.pathname === "/health")
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
        return this.handleRunWorkflow(input);
      case "obsidian_openclaw_status":
        return this.handleGetStatus();
      case "obsidian_openclaw_results":
        return this.handleGetResults();
      case "obsidian_openclaw_templates":
        return this.handleListTemplates();
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

  private handleRunWorkflow(
    params: Record<string, unknown>
  ): Record<string, unknown> {
    if (!this.pluginActions) {
      throw new Error("OpenClaw plugin actions not available");
    }
    if (this.pluginActions.isRunning()) {
      throw new Error(
        "A workflow is already running. Cancel it first or wait for it to complete."
      );
    }

    const templateId = params.template as string;
    const inputs = (params.inputs || {}) as Record<string, string>;

    if (!templateId) {
      throw new Error(
        "template is required. Use obsidian_openclaw_templates to list available templates."
      );
    }

    this.pluginActions.runWorkflow(templateId, inputs);

    return {
      success: true,
      message: `Workflow '${templateId}' started. Use obsidian_openclaw_status to check progress. Workflows typically take 5-10 minutes.`,
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
                  "Workflow template ID (e.g. 'general-research-pack', 'drug-discovery-full', 'pharmacovigilance-report', 'target-validation-pack', 'clinical-trial-landscape', 'rare-disease-brief')",
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
