import { logInfo, logWarn } from "@/logger";

/**
 * Long-lived Server-Sent Events (SSE) subscriber for the obsidian-copilot-bridge
 * `/mcp/events` endpoint. The bridge holds the connection open and pushes
 * `data: <json>\n\n` frames when an event occurs (for example
 * `research_arrived` after the agents pipeline finishes a workflow).
 *
 * Why Node's `https` module and not `fetch` / `EventSource`?
 *   - `EventSource` cannot send custom headers — and the bridge only accepts
 *     the auth token via `Authorization: Bearer ...` or `x-mcp-token`.
 *   - Electron renderer `fetch()` doesn't respect `NODE_EXTRA_CA_CERTS`, so it
 *     refuses the bridge's mkcert-issued cert with `Failed to fetch`.
 *   - Node's `https` module honors `NODE_EXTRA_CA_CERTS` and the system
 *     keychain, which Obsidian's own `requestUrl()` already proves works.
 *
 * Reconnect strategy: exponential backoff with a hard cap so a downed bridge
 * does not produce a tight loop, but recovers quickly when the bridge comes
 * back. Each reconnect emits a single warn log so the developer can see it.
 */
type HttpsModule = typeof import("https");
type FsModule = typeof import("fs");
type OsModule = typeof import("os");
type PathModule = typeof import("path");
type IncomingMessageT = import("http").IncomingMessage;
type ClientRequestT = import("http").ClientRequest;

function nodeRequire(): NodeRequire | null {
  try {
    return (globalThis as { require?: NodeRequire }).require ?? null;
  } catch {
    return null;
  }
}

function getHttpsModule(): HttpsModule | null {
  const req = nodeRequire();
  if (!req) return null;
  try {
    return req("https") as HttpsModule;
  } catch {
    return null;
  }
}

/**
 * Locate and read extra trust anchors so Node's https client accepts the
 * bridge's mkcert-issued certificate. Tries:
 *   1. process.env.NODE_EXTRA_CA_CERTS (Node's standard env hook).
 *   2. The mkcert default root paths for macOS / Linux / Windows.
 *
 * Returns the PEM bundle string, or undefined if no suitable file was found.
 * Cached after the first successful read.
 */
let cachedExtraCa: string | null | undefined;
function loadExtraCa(): string | undefined {
  if (cachedExtraCa !== undefined) {
    return cachedExtraCa ?? undefined;
  }
  const req = nodeRequire();
  if (!req) {
    cachedExtraCa = null;
    return undefined;
  }
  let fs: FsModule;
  let os: OsModule;
  let path: PathModule;
  try {
    fs = req("fs") as FsModule;
    os = req("os") as OsModule;
    path = req("path") as PathModule;
  } catch {
    cachedExtraCa = null;
    return undefined;
  }

  const candidates: string[] = [];
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env;
  if (env?.NODE_EXTRA_CA_CERTS) {
    candidates.push(env.NODE_EXTRA_CA_CERTS);
  }
  const home = os.homedir();
  if (process.platform === "darwin") {
    candidates.push(path.join(home, "Library/Application Support/mkcert/rootCA.pem"));
  } else if (process.platform === "win32" && env?.LOCALAPPDATA) {
    candidates.push(path.join(env.LOCALAPPDATA, "mkcert", "rootCA.pem"));
  } else {
    candidates.push(path.join(home, ".local/share/mkcert/rootCA.pem"));
  }

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        cachedExtraCa = fs.readFileSync(candidate, "utf8");
        return cachedExtraCa;
      }
    } catch {
      // try next
    }
  }

  cachedExtraCa = null;
  return undefined;
}
export interface McpEvent {
  type: string;
  stream: string;
  [key: string]: unknown;
}

export type McpEventHandler = (event: McpEvent) => void;

export interface McpEventClientOptions {
  /** Bridge base URL, e.g. `https://127.0.0.1:8798`. */
  endpoint: string;
  /** Bearer token shared with the bridge. */
  authToken: string;
  /** Stream channel to subscribe to (default: `research`). */
  stream?: string;
  /** Initial backoff in milliseconds (default: 1000). */
  initialBackoffMs?: number;
  /** Maximum backoff in milliseconds (default: 30000). */
  maxBackoffMs?: number;
}

export class McpEventClient {
  private readonly endpoint: string;
  private readonly authToken: string;
  private readonly stream: string;
  private readonly initialBackoffMs: number;
  private readonly maxBackoffMs: number;

  private handlers = new Set<McpEventHandler>();
  private currentRequest?: ClientRequestT;
  private currentResponse?: IncomingMessageT;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private currentBackoffMs: number;
  private stopped = false;

  constructor(options: McpEventClientOptions) {
    this.endpoint = options.endpoint.replace(/\/+$/, "");
    this.authToken = options.authToken;
    this.stream = options.stream ?? "research";
    this.initialBackoffMs = options.initialBackoffMs ?? 1000;
    this.maxBackoffMs = options.maxBackoffMs ?? 30000;
    this.currentBackoffMs = this.initialBackoffMs;
  }

  /** Register an event handler. Returns a disposer. */
  subscribe(handler: McpEventHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  /** Begin streaming. Safe to call multiple times — only one connection lives at a time. */
  start(): void {
    if (this.stopped) {
      this.stopped = false;
    }
    if (this.currentRequest) {
      // Already running.
      return;
    }
    void this.connect();
  }

  /** Stop streaming and prevent reconnects. */
  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    if (this.currentResponse) {
      try {
        this.currentResponse.destroy();
      } catch {
        // ignore
      }
      this.currentResponse = undefined;
    }
    if (this.currentRequest) {
      try {
        this.currentRequest.destroy();
      } catch {
        // ignore
      }
      this.currentRequest = undefined;
    }
  }

  private connect(): void {
    if (this.stopped) {
      return;
    }
    if (!this.endpoint || !this.authToken) {
      logWarn("McpEventClient: endpoint or authToken missing; not connecting.");
      return;
    }

    const https = getHttpsModule();
    if (!https) {
      logWarn("McpEventClient: Node 'https' module unavailable; cannot subscribe.");
      return;
    }

    let parsed: URL;
    try {
      parsed = new URL(`${this.endpoint}/mcp/events?stream=${encodeURIComponent(this.stream)}`);
    } catch (err) {
      logWarn(
        `McpEventClient: invalid endpoint '${this.endpoint}': ${err instanceof Error ? err.message : String(err)}`
      );
      return;
    }

    const extraCa = loadExtraCa();
    const req = https.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.authToken}`,
          Accept: "text/event-stream",
          // Hint to upstream proxies that this is a long-lived stream.
          "Cache-Control": "no-store",
        },
        // Add the mkcert root CA so we trust the bridge's TLS cert.
        ...(extraCa ? { ca: extraCa } : {}),
      },
      (res: IncomingMessageT) => this.onResponse(res)
    );

    req.on("error", (err: Error) => {
      this.currentRequest = undefined;
      this.currentResponse = undefined;
      if (this.stopped) {
        return;
      }
      logWarn(
        `McpEventClient: connection error: ${err.message}; will reconnect in ${this.currentBackoffMs}ms`
      );
      this.scheduleReconnect();
    });

    this.currentRequest = req;
    req.end();
  }

  private onResponse(res: IncomingMessageT): void {
    this.currentResponse = res;
    if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
      logWarn(
        `McpEventClient: non-OK status ${res.statusCode}; will reconnect in ${this.currentBackoffMs}ms`
      );
      res.resume();
      this.currentRequest = undefined;
      this.currentResponse = undefined;
      if (!this.stopped) {
        this.scheduleReconnect();
      }
      return;
    }

    logInfo(`McpEventClient: connected to ${this.endpoint}/mcp/events?stream=${this.stream}`);
    // Reset backoff on successful connect.
    this.currentBackoffMs = this.initialBackoffMs;

    res.setEncoding("utf8");
    let buffer = "";
    res.on("data", (chunk: string) => {
      buffer += chunk;
      let sep = buffer.indexOf("\n\n");
      while (sep !== -1) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        this.parseFrame(frame);
        sep = buffer.indexOf("\n\n");
      }
    });
    res.on("end", () => {
      this.currentRequest = undefined;
      this.currentResponse = undefined;
      if (this.stopped) {
        return;
      }
      logInfo("McpEventClient: stream ended; will reconnect.");
      this.scheduleReconnect();
    });
    res.on("error", (err: Error) => {
      this.currentRequest = undefined;
      this.currentResponse = undefined;
      if (this.stopped) {
        return;
      }
      logWarn(
        `McpEventClient: stream error: ${err.message}; will reconnect in ${this.currentBackoffMs}ms`
      );
      this.scheduleReconnect();
    });
  }

  private parseFrame(frame: string): void {
    // A frame may have multiple lines: `event: ...`, `data: ...`, `: comment`.
    const dataLines: string[] = [];
    for (const line of frame.split("\n")) {
      if (line.startsWith(":")) {
        // Comment / heartbeat — ignore.
        continue;
      }
      if (line.startsWith("data: ")) {
        dataLines.push(line.slice(6));
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5));
      }
    }
    if (dataLines.length === 0) {
      return;
    }
    const raw = dataLines.join("\n");
    let parsed: McpEvent;
    try {
      parsed = JSON.parse(raw) as McpEvent;
    } catch {
      logWarn(`McpEventClient: dropped non-JSON frame: ${raw.slice(0, 200)}`);
      return;
    }
    for (const handler of this.handlers) {
      try {
        handler(parsed);
      } catch (err) {
        logWarn(
          `McpEventClient: handler threw: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped) {
      return;
    }
    const delay = this.currentBackoffMs;
    this.currentBackoffMs = Math.min(this.maxBackoffMs, Math.floor(this.currentBackoffMs * 2));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect();
    }, delay);
  }
}
