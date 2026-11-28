import { Socket } from "node:net";
import type { Duplex } from "node:stream";
import { randomUUID } from "node:crypto";

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

interface JsonRpcResponse {
  jsonrpc?: "2.0";
  id?: string;
  result?: unknown;
  error?: { code?: number; message: string; reason?: string };
}

/**
 * A failed launcher call. `reason` is the launcher's when it refused (obsidian-bridge-launcher src/vaultIpc.ts:
 * invalid_params, path_refused, not_found, already_exists, command_refused, unavailable), or this client's
 * own: "timeout" (no answer in time) or "closed" (the pipe is gone).
 *
 * `sent` is false only when the request never left this process (the pipe was already closed), so the launcher
 * cannot have acted on it. Everything else defaults to true: a pipe that closes while a request is in flight
 * fails it as "closed" too, but the launcher may already have run it.
 */
export class LauncherIpcError extends Error {
  readonly reason: string | undefined;
  readonly sent: boolean;

  constructor(message: string, reason?: string, sent = true) {
    super(message);
    this.name = "LauncherIpcError";
    this.reason = reason;
    this.sent = sent;
  }
}

export class LauncherIpcClient {
  private readonly socket: Duplex;
  private readonly pending = new Map<string, PendingRequest>();
  private pieces: string[] = [];
  private closed = false;

  /** `channel` is the fd the launcher gave this process (BRIDGE_IPC_FD) or, in tests, a stream standing in for it. */
  constructor(channel: number | Duplex) {
    this.socket = typeof channel === "number" ? new Socket({ fd: channel, readable: true, writable: true }) : channel;
    // A stream with an encoding decodes through one StringDecoder, so a character split across reads stays whole.
    this.socket.setEncoding("utf8");
    this.socket.on("data", (chunk: string) => this.handleData(chunk));
    this.socket.on("error", (e) => this.failAll(new LauncherIpcError(`launcher IPC socket error: ${e.message}`, "closed")));
    // Once the launcher's side has ended no answer can arrive, so pending calls fail now rather than time out.
    // (A net.Socket closes after 'end'; a stream that allows half-open use would only end.)
    this.socket.on("end", () => this.failAll(new LauncherIpcError("launcher IPC socket ended", "closed")));
    this.socket.on("close", () => this.failAll(new LauncherIpcError("launcher IPC socket closed", "closed")));
  }

  /**
   * Each read is searched for newlines only in its own text, and a frame's pieces are joined once: read_note
   * answers carry whole notes now, and rescanning the whole buffer on every read costs time in the square of a
   * frame's length.
   */
  private handleData(chunk: string): void {
    let start = 0;
    let nl = chunk.indexOf("\n", start);
    while (nl >= 0) {
      this.pieces.push(chunk.slice(start, nl));
      start = nl + 1;
      const line = this.pieces.join("");
      this.pieces = [];
      this.handleLine(line);
      nl = chunk.indexOf("\n", start);
    }
    if (start < chunk.length) this.pieces.push(chunk.slice(start));
  }

  private handleLine(line: string): void {
    if (!line.trim()) return;
    let msg: JsonRpcResponse;
    try {
      msg = JSON.parse(line) as JsonRpcResponse;
    } catch {
      return;
    }
    if (!msg.id) return;
    const pending = this.pending.get(msg.id);
    if (!pending) return;
    this.pending.delete(msg.id);
    clearTimeout(pending.timer);
    if (msg.error) {
      const reason = typeof msg.error.reason === "string" ? msg.error.reason : undefined;
      pending.reject(new LauncherIpcError(msg.error.message, reason));
    } else {
      pending.resolve(msg.result);
    }
  }

  private failAll(err: Error): void {
    this.closed = true;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(err);
    }
    this.pending.clear();
  }

  request<T = unknown>(method: string, params: unknown, timeoutMs = 5000): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (this.closed) {
        reject(new LauncherIpcError("launcher IPC channel is closed", "closed", false));
        return;
      }
      const id = randomUUID();
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new LauncherIpcError(`launcher IPC timeout: method=${method} timeoutMs=${timeoutMs}`, "timeout"));
      }, timeoutMs);
      timer.unref();
      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      });
      const frame = JSON.stringify({ jsonrpc: "2.0", id, method, params });
      this.socket.write(frame + "\n");
    });
  }
}

/** Why createLauncherIpcClient() has no channel to give, in words obsidian_health can show. */
export function launcherIpcMissingReason(): string {
  const fdEnv = process.env.BRIDGE_IPC_FD;
  if (!fdEnv) return "BRIDGE_IPC_FD is not set";
  const fd = parseInt(fdEnv, 10);
  if (!Number.isInteger(fd) || fd < 3) return `BRIDGE_IPC_FD (${JSON.stringify(fdEnv.slice(0, 16))}) is not a usable fd`;
  return `fd ${fd} from BRIDGE_IPC_FD could not be opened`;
}

export function createLauncherIpcClient(): LauncherIpcClient | null {
  const fdEnv = process.env.BRIDGE_IPC_FD;
  if (!fdEnv) return null;
  const fd = parseInt(fdEnv, 10);
  if (!Number.isInteger(fd) || fd < 3) return null;
  try {
    return new LauncherIpcClient(fd);
  } catch {
    return null;
  }
}
