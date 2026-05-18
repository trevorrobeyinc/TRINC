import { Socket } from "node:net";
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
  error?: { code?: number; message: string };
}

export class LauncherIpcClient {
  private readonly socket: Socket;
  private readonly pending = new Map<string, PendingRequest>();
  private buffer = "";
  private closed = false;

  constructor(fd: number) {
    this.socket = new Socket({ fd, readable: true, writable: true });
    this.socket.setEncoding("utf8");
    this.socket.on("data", (chunk: string) => this.handleData(chunk));
    this.socket.on("error", (e) => this.failAll(new Error(`launcher IPC socket error: ${e.message}`)));
    this.socket.on("close", () => this.failAll(new Error("launcher IPC socket closed")));
  }

  private handleData(chunk: string): void {
    this.buffer += chunk;
    let nl: number;
    while ((nl = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, nl);
      this.buffer = this.buffer.slice(nl + 1);
      if (!line.trim()) continue;
      let msg: JsonRpcResponse;
      try {
        msg = JSON.parse(line) as JsonRpcResponse;
      } catch {
        continue;
      }
      if (!msg.id) continue;
      const pending = this.pending.get(msg.id);
      if (!pending) continue;
      this.pending.delete(msg.id);
      clearTimeout(pending.timer);
      if (msg.error) {
        pending.reject(new Error(msg.error.message));
      } else {
        pending.resolve(msg.result);
      }
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
        reject(new Error("launcher IPC channel is closed"));
        return;
      }
      const id = randomUUID();
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`launcher IPC timeout: method=${method} timeoutMs=${timeoutMs}`));
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
