import type * as http from "http";
import * as https from "https";
import * as os from "os";
import * as path from "path";
import { readFileSync, writeFileSync, mkdirSync, chmodSync } from "fs";
import { createHash, timingSafeEqual, randomBytes } from "crypto";
import type { ToolHandlers, VizStudioSettings } from "../types";
import { TOOL_DECLARATIONS } from "./toolSchemas";
import { refuseBrowserRequest } from "./browser-guard";

const HOST = "127.0.0.1";
const MAX_BODY_BYTES = 1024 * 1024; // 1 MB
const MCP_PROTOCOL_VERSION = "2024-11-05";
const SERVER_INFO = { name: "trinc-viz-studio-bridge", version: "1.0.0" };

// Security: the bridge bearer token must NOT live in Obsidian's data.json —
// Obsidian persists it world-readably and auto-creates .bak copies (this
// leaked the Command Center token once, audit P0). Dedicated 0600 file under
// ~/.config instead, same pattern as the :8799 bridge.
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

// TLS is mandatory (monorepo HTTPS-only invariant). No disable flag, no
// silent fallback: a missing mkcert pair refuses to start, loudly.
function resolveTlsConfig(): { key: Buffer; cert: Buffer } {
  if (process.env.VIZ_BRIDGE_TLS_DISABLE) {
    throw new Error(
      "VIZ_BRIDGE_TLS_DISABLE is not honored. The Viz Studio bridge is HTTPS-only. " +
        "Unset this variable and provide a valid mkcert cert/key pair."
    );
  }
  // Obsidian's plugin host does not always inherit HOME — fall back to os.homedir().
  const home = process.env.HOME || os.homedir() || "";
  const keyPath =
    process.env.VIZ_BRIDGE_TLS_KEY || `${home}/.local/share/mkcert/localhost-key.pem`;
  const certPath =
    process.env.VIZ_BRIDGE_TLS_CERT || `${home}/.local/share/mkcert/localhost.pem`;
  try {
    return { key: readFileSync(keyPath), cert: readFileSync(certPath) };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Viz Studio bridge cannot start: TLS key/cert load failed (${detail}). ` +
        `Expected key at ${keyPath} and cert at ${certPath}. ` +
        `Install mkcert and run \`mkcert -install && mkcert localhost 127.0.0.1\` if missing.`
    );
  }
}

/**
 * Transport-only HTTPS bridge on 127.0.0.1:<port>. Speaks the same three POST
 * shapes as the Command Center :8799 bridge (Copilot /mcp/tool, bare
 * {name,arguments}, MCP JSON-RPC initialize/tools/list/tools/call) so both
 * Copilot chat lanes and the research-engine adapter reuse their existing
 * client code. All vault access lives in the injected tool handlers.
 */
export class VizBridgeServer {
  private server: https.Server | null = null;
  private startTime = Date.now();
  private bridgeToken = "";

  constructor(
    private settings: VizStudioSettings,
    private handlers: ToolHandlers
  ) {}

  get isRunning(): boolean {
    return this.server !== null;
  }

  async start(): Promise<void> {
    if (this.server) return;
    this.startTime = Date.now();
    this.bridgeToken = loadOrCreateBridgeToken();

    return new Promise((resolve, reject) => {
      let tls: { key: Buffer; cert: Buffer };
      try {
        tls = resolveTlsConfig();
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
        return;
      }
      const server: https.Server = https.createServer(tls, (req, res) => {
        this.handleRequest(req, res);
      });
      // Encrypted-by-default invariant: this bridge MUST be an https.Server.
      if (!(server instanceof https.Server)) {
        reject(new Error("Viz Studio bridge constructed a non-HTTPS server; refusing to listen."));
        return;
      }

      server.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") {
          console.warn(`[VizStudio] Bridge port ${this.settings.bridgePort} is already in use`);
          reject(new Error(`Port ${this.settings.bridgePort} already in use`));
        } else {
          console.error(`[VizStudio] Bridge server error: ${err.message}`);
          reject(err);
        }
      });

      server.listen(this.settings.bridgePort, HOST, () => {
        this.server = server;
        console.log(
          `[VizStudio] MCP bridge started on https://${HOST}:${this.settings.bridgePort} | Tools: ${TOOL_DECLARATIONS.length} viz_*`
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
        console.log("[VizStudio] MCP bridge stopped");
        this.server = null;
        resolve();
      });
    });
  }

  // ─── Request Router ──────────────────────────────────────────

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    // Browser guard first (2026-10-24): a request a web page could have caused is refused before
    // any route, the open health probes included, and before auth (see browser-guard.ts). Every
    // legitimate client is a program, so the bridge sends no CORS headers and answers no preflight.
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

    const url = new URL(req.url || "/", `http://${HOST}:${this.settings.bridgePort}`);

    // Health probes are open by design; /healthz matches what every client in
    // this monorepo probes (the canonical :8798 bridge's path).
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

  // ─── POST Router (three request shapes, same contract as :8799) ───

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
