import type * as http from "http";
import * as os from "os";
import * as path from "path";
import { readFileSync, writeFileSync, mkdirSync, chmodSync } from "fs";
import { createHash, timingSafeEqual, randomBytes } from "crypto";
import type { ToolHandlers } from "../types";
import { TOOL_DECLARATIONS } from "./toolSchemas";
import { refuseBrowserRequest } from "./browser-guard";
import { listenHttpOnSocket, socketPathFor, SOCKET_NAMES } from "./uds-listener";
import type { UdsListener } from "./uds-listener";

const MAX_BODY_BYTES = 1024 * 1024; // 1 MB
const MCP_PROTOCOL_VERSION = "2024-11-05";
const SERVER_INFO = { name: "trinc-viz-studio-bridge", version: "1.0.0" };

// Security: the bridge bearer token must NOT live in Obsidian's data.json —
// Obsidian persists it world-readably and auto-creates .bak copies (this
// leaked the Command Center token once, audit P0). Dedicated 0600 file under
// ~/.config instead, same pattern as the Command Center bridge.
function bridgeTokenFilePath(): string {
  return path.join(os.homedir(), ".config", "trinc-viz-studio", "bridge-token");
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
  try {
    chmodSync(file, 0o600);
  } catch {
    /* best effort */
  }
  return fresh;
}

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

/** Where the bridge listens: <home>/.local/state/trinc/run/viz-studio.sock. Fixed; there is no setting for it. */
export function vizBridgeSocketPath(): string {
  return socketPathFor(SOCKET_NAMES.vizStudio);
}

/** For closes nobody awaits: a failure is logged, never left as an unhandled rejection. */
function logCloseFailure(err: unknown): void {
  console.warn(`[VizStudio] Bridge close failed: ${err instanceof Error ? err.message : String(err)}`);
}

/** What the owning plugin tells the bridge, and hears back from it (bridges-uds DESIGN D3). */
export interface VizBridgeHooks {
  /** True once the plugin instance that owns this bridge has unloaded: a start that finishes later closes at once. */
  isDisposed?: () => boolean;
  /** The published socket name was removed or replaced while the bridge ran; the bridge has already closed itself. */
  onLost?: (reason: string) => void;
}

/**
 * Transport-only MCP bridge: plain HTTP/1.1 on the Unix socket
 * <home>/.local/state/trinc/run/viz-studio.sock (bridges-uds, 2026-11-24; it was
 * HTTPS on 127.0.0.1:8800 until then). The run directory is 0700 and the socket
 * 0600, so only this uid's processes can connect and no browser can; that is why
 * the link has no TLS, and the bearer token stays as the defence against other
 * same-uid processes. uds-listener.ts does all socket work and never opens TCP.
 * Speaks the same three POST shapes as the Command Center bridge (Copilot
 * /mcp/tool, bare {name,arguments}, MCP JSON-RPC initialize/tools/list/tools/call)
 * so both Copilot chat lanes and Claude's door reuse their existing client code.
 * All vault access lives in the injected tool handlers.
 */
export class VizBridgeServer {
  private listener: UdsListener | null = null;
  private startPromise: Promise<UdsListener | null> | null = null;
  private stopRequested = false;
  private startTime = Date.now();
  private bridgeToken = "";

  constructor(
    private handlers: ToolHandlers,
    private hooks: VizBridgeHooks = {}
  ) {}

  get isRunning(): boolean {
    return this.listener !== null;
  }

  /** The published socket path while listening. Never server.address(): that is the hidden name the socket was bound to. */
  get socketPath(): string | null {
    return this.listener?.socketPath ?? null;
  }

  /** viz_health's `socket` field: the published socket's basename, or null while not listening. */
  get socketName(): string | null {
    return this.listener ? path.basename(this.listener.socketPath) : null;
  }

  /**
   * Start serving. A call while a start is in flight gets that start's promise. Resolves with the
   * listener, or with null when a stop came in (or the plugin unloaded) while the socket was being
   * set up, in which case that listener is closed at once. Rejects with the helper's
   * UdsListenerError (a stable `code`) when the run directory, the socket path or a file already at
   * the path is not what it must be: a live socket held by another process (this plugin in a second
   * Obsidian window) is ALREADY_SERVED, and only a stale socket left by a crash is replaced.
   */
  start(): Promise<UdsListener | null> {
    if (this.listener) return Promise.resolve(this.listener);
    if (this.startPromise) return this.startPromise;
    this.stopRequested = false;
    const starting = this.openListener().finally(() => {
      if (this.startPromise === starting) this.startPromise = null;
    });
    this.startPromise = starting;
    return starting;
  }

  private async openListener(): Promise<UdsListener | null> {
    this.startTime = Date.now();
    this.bridgeToken = loadOrCreateBridgeToken();
    const listener = await listenHttpOnSocket((req, res) => this.handleRequest(req, res), {
      socketPath: vizBridgeSocketPath(),
      onLost: (reason) => this.handleLost(reason),
    });
    if (this.stopRequested || this.hooks.isDisposed?.() === true) {
      void listener.close().catch(logCloseFailure);
      return null;
    }
    this.listener = listener;
    // The helper removes its own "error" listener once the server listens; without this one, an accept() error
    // (EMFILE, ENOBUFS) would be an uncaught exception in Obsidian's renderer.
    listener.server.on("error", (err: Error) => {
      console.error(`[VizStudio] Bridge server error: ${err.message}`);
    });
    console.log(
      `[VizStudio] MCP bridge started on unix:${listener.socketPath} | Tools: ${TOOL_DECLARATIONS.length} viz_*`
    );
    return listener;
  }

  /**
   * Stop serving. A start still in flight is chained: whatever it opens is closed. Otherwise
   * listener.close() is called before anything is awaited: it stops accepting at once, ends idle
   * connections, ends the rest after the helper's grace period, and removes the published socket
   * only while it is still this bridge's.
   */
  async stop(): Promise<void> {
    this.stopRequested = true;
    const listener = this.listener;
    this.listener = null;
    if (listener !== null) {
      await listener.close();
      console.log("[VizStudio] MCP bridge stopped");
      return;
    }
    const starting = this.startPromise;
    if (starting !== null) {
      await starting.then(
        (l) => l?.close(),
        () => undefined // the start's own caller reports why it failed
      );
    }
  }

  /** The published name was removed or replaced (another server took it): close, then tell the plugin. */
  private handleLost(reason: string): void {
    const l = this.listener;
    this.listener = null;
    void l?.close().catch(logCloseFailure); // removes nothing: the name is no longer this bridge's
    console.warn(`[VizStudio] MCP bridge stopped: ${reason}`);
    this.hooks.onLost?.(reason);
  }

  // ─── Request Router ──────────────────────────────────────────

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    // Browser guard first (2026-10-24): a request a web page could have caused is refused before
    // any route, the open health probes included, and before auth (see browser-guard.ts). Every
    // legitimate client is a program, so the bridge sends no CORS headers and answers no preflight.
    // On the Unix socket localPort is undefined, so the guard skips its Host check (no browser can
    // reach the socket) and still refuses any Origin, Referer or cross-site Sec-Fetch-Site.
    const refusal = refuseBrowserRequest(req.headers, req.socket.localPort);
    if (refusal) {
      console.warn(`[VizStudio] Bridge refused a ${refusal.code} request (${refusal.reason})`);
      this.sendJson(res, refusal.status, {
        ok: false,
        error: {
          code: refusal.code,
          message:
            refusal.code === "wrong_host"
              ? "Host must be 127.0.0.1:<port> or localhost:<port>."
              : "Browser-originated requests are refused.",
        },
      });
      return;
    }

    if (req.method === "OPTIONS") {
      this.sendJson(res, 405, { ok: false, error: { message: "CORS preflight is disabled." } });
      return;
    }

    // Only the path matters; over the Unix socket clients send Host: localhost (or localhost:80).
    const url = new URL(req.url || "/", "http://localhost");

    // Health probes are open by design; /healthz matches what every client in
    // this monorepo probes (the canonical vault bridge's path).
    if (
      req.method === "GET" &&
      (url.pathname === "/" || url.pathname === "/health" || url.pathname === "/healthz")
    ) {
      this.dispatchTool("viz_health", {})
        .then((health) => this.sendJson(res, 200, health))
        .catch((err) =>
          this.sendJson(res, 500, {
            status: "error",
            error: { message: err instanceof Error ? err.message : String(err) },
          })
        );
      return;
    }

    if (!verifyToken(this.bridgeToken, extractToken(req))) {
      this.sendJson(res, 401, {
        ok: false,
        error: {
          message:
            "Missing or invalid Viz Studio bridge token. Provide it via Authorization: Bearer <token> or X-MCP-Token: <token>.",
        },
      });
      return;
    }

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

  // ─── POST Router (three request shapes, same contract as the Command Center bridge) ───

  private async routePost(
    pathname: string,
    body: Record<string, unknown>,
    res: http.ServerResponse
  ): Promise<void> {
    // Copilot /mcp/tool format: { tool, operation?, input }
    if (pathname === "/mcp/tool" || (!body.jsonrpc && body.tool)) {
      const toolName = body.tool as string;
      const input = (body.input || {}) as Record<string, unknown>;
      if (!toolName) {
        this.sendJson(res, 200, { ok: false, error: { message: "Missing 'tool' field" } });
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

    // JSON-RPC 2.0: { jsonrpc, id, method, params } — what the ACP stdio proxy speaks.
    if (body.jsonrpc === "2.0") {
      const id = (body.id as string | number) ?? null;
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
      return { tools: TOOL_DECLARATIONS };
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

  private async dispatchTool(
    name: string,
    input: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const handler = this.handlers[name];
    if (!handler) {
      throw new Error(
        `Unknown tool: ${name}. Available: ${Object.keys(this.handlers).sort().join(", ")}`
      );
    }
    return handler(input);
  }

  // ─── Utilities ──────────────────────────────────────────────

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

  private sendJson(res: http.ServerResponse, status: number, data: unknown): void {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data, null, 2));
  }
}
