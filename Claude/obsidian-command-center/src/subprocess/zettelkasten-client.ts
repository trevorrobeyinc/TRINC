import { spawn, ChildProcess } from "child_process";
import { dirname } from "path";
import type { JsonRpcRequest, JsonRpcResponse, JsonRpcNotification } from "../types";
import { MCP_PROTOCOL_VERSION } from "../constants";

const SPAWN_TIMEOUT_MS = 15000;
const REQUEST_TIMEOUT_MS = 30000;

/**
 * MCP JSON-RPC 2.0 client for the Medical Zettelkasten server.
 * Mirrors the pattern in zettelkasten-process-manager.js.
 */
export class ZettelkastenClient {
  private proc: ChildProcess | null = null;
  private ready = false;
  private nextId = 1;
  private lineBuffer = "";
  private pending = new Map<
    string | number,
    {
      resolve: (value: unknown) => void;
      reject: (reason: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  constructor(
    private serverPath: string,
    private nodePath: string
  ) {}

  async ensureReady(): Promise<void> {
    if (this.proc && this.ready) return;
    await this.start();
  }

  async callTool(
    toolName: string,
    args: Record<string, unknown> = {}
  ): Promise<unknown> {
    await this.ensureReady();
    return this.sendRequest("tools/call", {
      name: toolName,
      arguments: args,
    });
  }

  shutdown(): void {
    if (this.proc) {
      try {
        this.proc.kill("SIGTERM");
      } catch {
        /* already dead */
      }
      this.proc = null;
    }
    this.ready = false;
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(new Error("Client shutdown"));
    }
    this.pending.clear();
  }

  private async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const serverDir = dirname(this.serverPath);

      const child = spawn(this.nodePath, [this.serverPath], {
        stdio: ["pipe", "pipe", "pipe"],
        cwd: serverDir,
        env: { ...process.env },
      });

      const spawnTimer = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new Error("Zettelkasten MCP did not start in time"));
      }, SPAWN_TIMEOUT_MS);

      child.stdout?.on("data", (chunk: Buffer) => {
        this.handleStdout(chunk);
      });

      child.stderr?.on("data", (chunk: Buffer) => {
        console.log("[ZK stderr]", chunk.toString().trim());
      });

      child.on("error", (err) => {
        clearTimeout(spawnTimer);
        reject(err);
      });

      child.on("exit", (code) => {
        this.proc = null;
        this.ready = false;
        if (!this.ready) {
          clearTimeout(spawnTimer);
          reject(new Error(`ZK process exited with code ${code}`));
        }
      });

      this.proc = child;

      // Perform MCP handshake
      this.performHandshake()
        .then(() => {
          clearTimeout(spawnTimer);
          this.ready = true;
          resolve();
        })
        .catch((err) => {
          clearTimeout(spawnTimer);
          child.kill("SIGTERM");
          this.proc = null;
          reject(err);
        });
    });
  }

  private async performHandshake(): Promise<void> {
    // Send initialize request
    const initResult = await this.sendRequest("initialize", {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: {
        name: "openclaw-obsidian-plugin",
        version: "0.1.0",
      },
    });

    // Send initialized notification
    this.sendNotification("notifications/initialized", {});

    return initResult as any;
  }

  private sendRequest(
    method: string,
    params: Record<string, unknown>
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.proc?.stdin) {
        reject(new Error("No stdin available"));
        return;
      }

      const id = this.nextId++;
      const request: JsonRpcRequest = {
        jsonrpc: "2.0",
        id,
        method,
        params,
      };

      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`ZK request timed out: ${method}`));
      }, REQUEST_TIMEOUT_MS);

      this.pending.set(id, { resolve, reject, timer });
      this.proc.stdin.write(JSON.stringify(request) + "\n");
    });
  }

  private sendNotification(
    method: string,
    params: Record<string, unknown>
  ): void {
    if (!this.proc?.stdin) return;
    const notification: JsonRpcNotification = {
      jsonrpc: "2.0",
      method,
      params,
    };
    this.proc.stdin.write(JSON.stringify(notification) + "\n");
  }

  private handleStdout(chunk: Buffer): void {
    this.lineBuffer += chunk.toString();
    const lines = this.lineBuffer.split("\n");
    this.lineBuffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const msg = JSON.parse(trimmed) as JsonRpcResponse;
        if (msg.id !== undefined && this.pending.has(msg.id)) {
          const entry = this.pending.get(msg.id)!;
          this.pending.delete(msg.id);
          clearTimeout(entry.timer);
          if (msg.error) {
            entry.reject(
              new Error(`ZK error ${msg.error.code}: ${msg.error.message}`)
            );
          } else {
            entry.resolve(msg.result);
          }
        }
      } catch {
        // Not JSON — ignore
      }
    }
  }
}
