import { logInfo, logWarn } from "@/logger";
import {
  udsOpenStream,
  type BridgeSocket,
  type ClientRequestT,
  type IncomingMessageT,
} from "./udsClient";

/**
 * Long-lived Server-Sent Events (SSE) subscriber for the vault bridge's (obsidian-copilot-bridge)
 * `/mcp/events` endpoint, reached over its Unix socket. The bridge holds the connection open and
 * pushes `data: <json>\n\n` frames when an event occurs (for example `research_arrived` after the
 * agents pipeline finishes a workflow), plus a `: ping` comment every 20 s.
 *
 * Why Node's `http` over the socket and not `fetch` / `EventSource`? Neither they nor Obsidian's
 * `requestUrl()` can dial a Unix socket, and `EventSource` cannot send the `Authorization: Bearer`
 * header the bridge requires either.
 *
 * Reconnect strategy: exponential backoff (1 s doubling to a 30 s cap) so a downed bridge does not
 * produce a tight loop, but recovers quickly when the bridge comes back. A stream that sends nothing
 * for 60 s (three missed pings) is treated as dead and reconnected. Each reconnect emits a single
 * warn log so the developer can see it.
 */
export interface McpEvent {
  type: string;
  stream: string;
  [key: string]: unknown;
}

export type McpEventHandler = (event: McpEvent) => void;

export interface McpEventClientOptions {
  /** The vault bridge's socket, from resolveBridgeSocket. */
  socket: BridgeSocket;
  /** Bearer token shared with the bridge. */
  authToken: string;
  /** Stream channel to subscribe to (default: `research`). */
  stream?: string;
  /** Initial backoff in milliseconds (default: 1000). */
  initialBackoffMs?: number;
  /** Maximum backoff in milliseconds (default: 30000). */
  maxBackoffMs?: number;
  /** A stream with no bytes for this long is dropped and reconnected (default: 60000). */
  idleTimeoutMs?: number;
}

/**
 * Holds at most one SSE subscription to the vault bridge's socket, parses its frames and hands the
 * events to subscribers, reconnecting with backoff until stop(). Choosing which server to follow is
 * McpEventBridge's job.
 */
export class McpEventClient {
  private readonly socket: BridgeSocket;
  private readonly authToken: string;
  private readonly stream: string;
  private readonly initialBackoffMs: number;
  private readonly maxBackoffMs: number;
  private readonly idleTimeoutMs: number;

  private handlers = new Set<McpEventHandler>();
  private currentRequest?: ClientRequestT;
  private currentResponse?: IncomingMessageT;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private currentBackoffMs: number;
  private stopped = false;

  constructor(options: McpEventClientOptions) {
    this.socket = options.socket;
    this.authToken = options.authToken;
    this.stream = options.stream ?? "research";
    this.initialBackoffMs = options.initialBackoffMs ?? 1000;
    this.maxBackoffMs = options.maxBackoffMs ?? 30000;
    this.idleTimeoutMs = options.idleTimeoutMs ?? 60000;
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
    if (!this.authToken) {
      logWarn("McpEventClient: authToken missing; not connecting.");
      return;
    }

    const path = `/mcp/events?stream=${encodeURIComponent(this.stream)}`;
    let req: ClientRequestT;
    try {
      req = udsOpenStream(
        this.socket,
        {
          path,
          headers: {
            Authorization: `Bearer ${this.authToken}`,
            Accept: "text/event-stream",
            // Hint to upstream proxies that this is a long-lived stream.
            "Cache-Control": "no-store",
          },
          idleTimeoutMs: this.idleTimeoutMs,
        },
        (res: IncomingMessageT) => this.onResponse(req, res)
      );
    } catch (err) {
      // Refused before connecting: ENOENT (the bridge is not up yet) or an untrusted socket.
      logWarn(
        `McpEventClient: ${err instanceof Error ? err.message : String(err)}; will retry in ${this.currentBackoffMs}ms`
      );
      this.scheduleReconnect();
      return;
    }

    req.on("error", (err: Error) => {
      if (this.currentRequest !== req) {
        return;
      }
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
  }

  /** `req` is the request this response belongs to; events of a replaced request are ignored. */
  private onResponse(req: ClientRequestT, res: IncomingMessageT): void {
    if (this.currentRequest !== req) {
      res.resume();
      return;
    }
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

    logInfo(
      `McpEventClient: connected to unix:${this.socket.socketPath} /mcp/events?stream=${this.stream}`
    );
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
      if (this.currentRequest !== req) {
        return;
      }
      this.currentRequest = undefined;
      this.currentResponse = undefined;
      if (this.stopped) {
        return;
      }
      logInfo("McpEventClient: stream ended; will reconnect.");
      this.scheduleReconnect();
    });
    res.on("error", (err: Error) => {
      if (this.currentRequest !== req) {
        return;
      }
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
    // A request and its response can both report one failure; keep a single pending retry.
    if (this.stopped || this.reconnectTimer) {
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
