/**
 * In-Process Plugin Backend (UDS + HMAC)
 *
 * Forwards bridge operations to the `claude-mcp-inproc` Obsidian community
 * plugin over a Unix domain socket at /tmp/claude-mcp-inproc.sock with HMAC
 * authentication (X-MCP-Token + X-MCP-Timestamp + X-MCP-Nonce + X-MCP-Body-SHA256
 * — same scheme as the bridge's public surface).
 *
 * Why: the legacy CLI backend dispatches via the un-authed Obsidian CLI binary
 * (`/Applications/Obsidian.app/Contents/MacOS/obsidian`). Any local process can
 * call that CLI, so once it's enabled, it's a privilege escalation surface.
 * This plugin backend keeps the HMAC chain end-to-end: bridge auth front + UDS
 * auth back, no un-authed step in between.
 *
 * Token storage: the plugin auto-generates a 32-byte random base64 token on
 * first load and writes it to ~/.claude/config/obsidian-mcp-inproc.local.json
 * with mode 0600. This backend reads from the same file at probe time.
 *
 * Failure mode: if the plugin isn't loaded, the socket isn't listening, or the
 * config file isn't readable, probe() returns { available: false } and the
 * BackendSelector falls back to the cli backend automatically.
 */

import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { Backend, BackendCapabilities } from "./backend";
import type { BackendResult, ExecutionContext, Operation } from "../types";

const DEFAULT_SOCKET_PATH = "/tmp/claude-mcp-inproc.sock";
const DEFAULT_CONFIG_PATH = path.join(os.homedir(), ".claude", "config", "obsidian-mcp-inproc.local.json");
const DEFAULT_PROBE_TIMEOUT_MS = 3_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

const SUPPORTED_OPS: Operation[] = [
  "open_vault",
  "create_note",
  "append_note",
  "read_note",
  "search_notes",
  "execute_command",
];

const OPERATION_TO_TOOL: Record<Operation, string> = {
  open_vault: "obsidian_open_vault",
  create_note: "obsidian_create_note",
  append_note: "obsidian_append_note",
  read_note: "obsidian_read_note",
  search_notes: "obsidian_search_notes",
  execute_command: "obsidian_execute_command",
};

interface PluginConfig {
  authToken: string;
  socketPath?: string;
}

export interface InprocPluginBackendOptions {
  configPath?: string;
  socketPath?: string;
  probeTimeoutMs?: number;
  requestTimeoutMs?: number;
}

interface PluginToolResult {
  ok: boolean;
  data?: Record<string, unknown>;
  error?: { code?: string; message?: string };
  meta?: Record<string, unknown>;
}

function bodySha256Hex(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex");
}

function readConfigFile(configPath: string): PluginConfig | null {
  try {
    if (!fs.existsSync(configPath)) return null;
    const raw = fs.readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw) as PluginConfig;
    if (typeof parsed?.authToken !== "string" || parsed.authToken.length < 32) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

interface UdsResponse {
  status: number;
  body: string;
  durationMs: number;
}

function postOverUds(
  socketPath: string,
  pathname: string,
  body: string,
  headers: Record<string, string>,
  timeoutMs: number
): Promise<UdsResponse> {
  const started = Date.now();
  return new Promise<UdsResponse>((resolve, reject) => {
    const req = http.request(
      {
        socketPath,
        path: pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          ...headers,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on("end", () => {
          resolve({
            status: res.statusCode || 0,
            body: Buffer.concat(chunks).toString("utf-8"),
            durationMs: Date.now() - started,
          });
        });
      }
    );
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`UDS request timed out after ${timeoutMs}ms`));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function getOverUds(socketPath: string, pathname: string, timeoutMs: number): Promise<UdsResponse> {
  const started = Date.now();
  return new Promise<UdsResponse>((resolve, reject) => {
    const req = http.request(
      {
        socketPath,
        path: pathname,
        method: "GET",
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on("end", () => {
          resolve({
            status: res.statusCode || 0,
            body: Buffer.concat(chunks).toString("utf-8"),
            durationMs: Date.now() - started,
          });
        });
      }
    );
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`UDS GET timed out after ${timeoutMs}ms`));
    });
    req.on("error", reject);
    req.end();
  });
}

export class InprocPluginBackend implements Backend {
  readonly id = "plugin" as const;
  private readonly configPath: string;
  private readonly explicitSocketPath: string | undefined;
  private readonly probeTimeoutMs: number;
  private readonly requestTimeoutMs: number;
  private lastErrorAt: string | undefined;
  private lastErrorMessage: string | undefined;

  constructor(options: InprocPluginBackendOptions = {}) {
    this.configPath = options.configPath || DEFAULT_CONFIG_PATH;
    this.explicitSocketPath = options.socketPath;
    this.probeTimeoutMs = options.probeTimeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS;
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  }

  private resolveSocketPath(config: PluginConfig | null): string {
    if (this.explicitSocketPath) return this.explicitSocketPath;
    if (config?.socketPath) return config.socketPath;
    return DEFAULT_SOCKET_PATH;
  }

  async probe(): Promise<BackendCapabilities> {
    const config = readConfigFile(this.configPath);
    const socketPath = this.resolveSocketPath(config);

    if (!config) {
      return {
        backend: "plugin",
        available: false,
        supportedOps: [],
        reliabilityScore: 0,
        p95MsByOp: {},
        constraints: [`config not readable at ${this.configPath} (plugin not loaded?)`],
        lastErrorAt: this.lastErrorAt,
      };
    }

    if (!fs.existsSync(socketPath)) {
      return {
        backend: "plugin",
        available: false,
        supportedOps: [],
        reliabilityScore: 0,
        p95MsByOp: {},
        constraints: [`socket missing at ${socketPath} (Obsidian not running or plugin disabled)`],
        lastErrorAt: this.lastErrorAt,
      };
    }

    try {
      const response = await getOverUds(socketPath, "/healthz", this.probeTimeoutMs);
      if (response.status !== 200) {
        return {
          backend: "plugin",
          available: false,
          supportedOps: [],
          reliabilityScore: 0,
          p95MsByOp: {},
          constraints: [`/healthz returned status ${response.status}`],
          lastErrorAt: new Date().toISOString(),
        };
      }
      return {
        backend: "plugin",
        available: true,
        supportedOps: SUPPORTED_OPS,
        reliabilityScore: 1,
        p95MsByOp: {},
        constraints: [
          `claude-mcp-inproc Obsidian plugin in renderer; HMAC + replay-protected UDS at ${socketPath}`,
        ],
        diagnostics: { socketPath, configPath: this.configPath, healthzMs: response.durationMs },
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.lastErrorAt = new Date().toISOString();
      this.lastErrorMessage = message;
      return {
        backend: "plugin",
        available: false,
        supportedOps: [],
        reliabilityScore: 0,
        p95MsByOp: {},
        constraints: [`/healthz probe failed: ${message}`],
        lastErrorAt: this.lastErrorAt,
      };
    }
  }

  async execute(operation: Operation, input: unknown, ctx: ExecutionContext): Promise<BackendResult> {
    const config = readConfigFile(this.configPath);
    if (!config) {
      throw new Error(`InprocPluginBackend: config not readable at ${this.configPath}`);
    }
    const socketPath = this.resolveSocketPath(config);
    if (!fs.existsSync(socketPath)) {
      throw new Error(`InprocPluginBackend: socket missing at ${socketPath}`);
    }

    // Per-operation default tool name. AURI parity tools route through
    // execute_command and override this via input.__pluginTool so they can
    // target dispatchAduriOpen / dispatchAduriWrite / etc inside the plugin
    // without expanding the canonical Operation enum.
    const inputObj = (input as Record<string, unknown>) ?? {};
    const pluginToolOverride =
      typeof inputObj.__pluginTool === "string" ? (inputObj.__pluginTool as string) : null;
    const tool = pluginToolOverride || OPERATION_TO_TOOL[operation];
    if (!tool) {
      throw new Error(`InprocPluginBackend: unsupported operation ${operation}`);
    }
    // Strip the override marker before forwarding so it doesn't leak into the
    // plugin handler's payload.
    const cleanInput: Record<string, unknown> = { ...inputObj };
    delete cleanInput.__pluginTool;

    const requestBody = JSON.stringify({
      tool,
      operation,
      input: cleanInput,
    });

    const headers = {
      "X-MCP-Token": config.authToken,
      "X-MCP-Timestamp": String(Date.now()),
      "X-MCP-Nonce": randomUUID(),
      "X-MCP-Body-Sha256": bodySha256Hex(requestBody),
    };

    const timeoutMs = ctx?.timeoutMs && ctx.timeoutMs > 0 ? ctx.timeoutMs : this.requestTimeoutMs;
    const response = await postOverUds(socketPath, "/mcp/tool", requestBody, headers, timeoutMs);

    let parsed: PluginToolResult | null = null;
    try {
      parsed = JSON.parse(response.body) as PluginToolResult;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      throw new Error(
        `InprocPluginBackend: malformed response from plugin (status ${response.status}): ${message}; body=${response.body.slice(0, 200)}`
      );
    }

    if (!parsed || parsed.ok === false) {
      const code = parsed?.error?.code || "PLUGIN_ERROR";
      const message = parsed?.error?.message || `plugin returned ok=false (status ${response.status})`;
      const err = new Error(`[${code}] ${message}`) as Error & { code?: string };
      err.code = code;
      throw err;
    }

    // The plugin returns { ok, data, meta }. Tool handlers' transform callbacks
    // either ignore stdout (create_note, append_note, execute_command, open_vault)
    // or read it as content (read_note → text content) or as JSON (search_notes).
    // Adapt the response shape to what each handler expects.
    const data = (parsed.data ?? {}) as Record<string, unknown>;
    let stdout = "";
    if (operation === "read_note") {
      stdout = typeof data.content === "string" ? data.content : "";
    } else if (operation === "search_notes") {
      stdout = JSON.stringify(Array.isArray(data.matches) ? data.matches : []);
    } else {
      stdout = JSON.stringify(data);
    }

    return {
      statusCode: response.status,
      stdout,
      stderr: "",
      durationMs: response.durationMs || Date.now() - ctx.now,
      parsed: data,
    };
  }
}
