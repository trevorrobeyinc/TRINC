import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import { getPreferenceValues } from "@raycast/api";
import { createLoopbackTlsAgent, requireHttpsEndpoint } from "../../utils/loopbackTlsAgent";
import type { MCPToolRequest, ToolResult } from "./contracts";

interface MCPPreferences {
  mcpEnabled?: boolean;
  mcpTransport?: "http" | "uds" | "pipe";
  mcpHttpEndpoint?: string;
  mcpConfigPath?: string;
  mcpAuthToken?: string;
  mcpRequestTimeoutMs?: string;
}

interface MCPServerConfigFile {
  transport?: {
    host?: string;
    port?: number;
  };
  security?: {
    authToken?: string;
  };
}

// Loopback bridge uses an mkcert-issued cert. Trust the mkcert root CA and VERIFY the
// cert (audit RF-1) instead of disabling verification.
const localhostAgent = createLoopbackTlsAgent();
function isLoopbackEndpoint(endpoint: string): boolean {
  try {
    const host = new URL(endpoint).hostname;
    return host === "127.0.0.1" || host === "localhost" || host === "::1";
  } catch {
    return false;
  }
}

function bodyHash(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex");
}

function loadConfigFile(configPath?: string): MCPServerConfigFile | null {
  // The embedded mcp-server/ package is gone — the canonical bridge config is the
  // only discovery target besides an explicit preference.
  const candidates = [
    configPath?.trim(),
    "/Users/myhome/TrevClaw-Obsidianodus/Copilot-Everything/bridges/obsidian-copilot-bridge/config/obsidian-cli-mcp.local.json",
  ].filter((value): value is string => Boolean(value));

  for (const candidate of new Set(candidates)) {
    try {
      if (!fs.existsSync(candidate)) {
        continue;
      }
      return JSON.parse(fs.readFileSync(candidate, "utf8")) as MCPServerConfigFile;
    } catch {
      // Keep trying candidates.
    }
  }

  return null;
}

export class MCPClient {
  private readonly transport: "http" | "uds" | "pipe";
  private readonly endpoint: string;
  private readonly token: string;
  private readonly timeoutMs: number;

  constructor() {
    const prefs = getPreferenceValues<MCPPreferences>();
    const discoveredConfig = loadConfigFile(prefs.mcpConfigPath);
    const discoveredEndpoint =
      discoveredConfig?.transport?.host && discoveredConfig?.transport?.port
        ? `https://${discoveredConfig.transport.host}:${discoveredConfig.transport.port}`
        : "";
    this.transport = prefs.mcpTransport || "http";
    // Default points at the canonical multi-operator obsidian-copilot-bridge on :8798.
    // The legacy raycast-flavoured raycast-obsidian-mcp on :18799 is being retired as part
    // of the bridge consolidation. Users can override via the Raycast mcpHttpEndpoint
    // preference if they want a different endpoint.
    const rawEndpoint = (prefs.mcpHttpEndpoint || discoveredEndpoint || "https://127.0.0.1:8798").replace(/\/$/, "");
    // uds/pipe speak over a filesystem socket and never dial this endpoint; the TCP
    // lane is HTTPS-only (monorepo invariant) — a plaintext endpoint must throw here.
    this.endpoint = this.transport === "http" ? requireHttpsEndpoint(rawEndpoint, "MCPClient") : rawEndpoint;
    this.token = prefs.mcpAuthToken?.trim() || discoveredConfig?.security?.authToken?.trim() || "";
    this.timeoutMs = Number.parseInt(prefs.mcpRequestTimeoutMs || "20000", 10) || 20_000;
  }

  static isEnabled(): boolean {
    const prefs = getPreferenceValues<MCPPreferences>();
    return prefs.mcpEnabled === true;
  }

  async callTool<TInput, TOutput>(request: MCPToolRequest<TInput>): Promise<ToolResult<TOutput>> {
    const payload = JSON.stringify(request);
    const timestamp = String(Date.now());
    const nonce = randomUUID();
    const headers = {
      "Content-Type": "application/json",
      "X-MCP-Token": this.token,
      "X-MCP-Timestamp": timestamp,
      "X-MCP-Nonce": nonce,
      "X-MCP-Body-Sha256": bodyHash(payload),
    };

    if (this.transport === "http") {
      // The launcher respawns the bridge when Obsidian reloads, leaving a brief
      // window where :8798 refuses connections. Retry transient fetch failures.
      let lastError: unknown;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        if (attempt > 0) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        }
        const retryHeaders = {
          ...headers,
          "X-MCP-Timestamp": String(Date.now()),
          "X-MCP-Nonce": randomUUID(),
        };
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
          const response = await fetch(`${this.endpoint}/mcp/tool`, {
            method: "POST",
            headers: retryHeaders,
            body: payload,
            signal: controller.signal,
            // @ts-expect-error: undici's `dispatcher` is not in lib.dom.d.ts but is
            // supported by Node 18+'s global fetch (which Raycast uses).
            dispatcher: isLoopbackEndpoint(this.endpoint) ? localhostAgent : undefined,
          });
          const text = await response.text();
          return JSON.parse(text) as ToolResult<TOutput>;
        } catch (error) {
          lastError = error;
        } finally {
          clearTimeout(timeout);
        }
      }
      throw lastError;
    }

    const text = await this.callOverSocket(payload, headers);
    return JSON.parse(text) as ToolResult<TOutput>;
  }

  private async callOverSocket(payload: string, headers: Record<string, string>): Promise<string> {
    const socketPath =
      this.transport === "uds"
        ? process.env.OBSIDIAN_MCP_UDS_PATH || "/tmp/obsidian-mcp-bridge.sock"
        : process.env.OBSIDIAN_MCP_PIPE_NAME
          ? `\\\\.\\pipe\\${process.env.OBSIDIAN_MCP_PIPE_NAME}`
          : "\\\\.\\pipe\\obsidian-mcp-bridge";

    return await new Promise<string>((resolve, reject) => {
      const req = http.request(
        {
          socketPath,
          path: "/mcp/tool",
          method: "POST",
          headers: {
            ...headers,
            "Content-Length": Buffer.byteLength(payload),
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          });
          res.on("end", () => {
            resolve(Buffer.concat(chunks).toString("utf8"));
          });
        }
      );

      req.setTimeout(this.timeoutMs, () => {
        req.destroy(new Error("MCP socket request timed out."));
      });
      req.on("error", reject);
      req.write(payload);
      req.end();
    });
  }
}
