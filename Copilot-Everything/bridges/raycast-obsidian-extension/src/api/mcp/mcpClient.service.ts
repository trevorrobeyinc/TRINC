import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { getPreferenceValues } from "@raycast/api";
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

function bodyHash(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex");
}

function loadConfigFile(configPath?: string): MCPServerConfigFile | null {
  const candidates = [
    configPath?.trim(),
    path.resolve(process.cwd(), "mcp-server/config/obsidian-cli-mcp.local.json"),
    path.resolve(process.cwd(), "../mcp-server/config/obsidian-cli-mcp.local.json"),
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
        ? `http://${discoveredConfig.transport.host}:${discoveredConfig.transport.port}`
        : "";
    this.transport = prefs.mcpTransport || "http";
    // Default points at the Raycast-flavoured MCP server (raycast-obsidian-mcp on :18799),
    // not the retired obsidian-copilot-bridge on :8798. Users can override via the Raycast
    // mcpHttpEndpoint preference if they want a different endpoint.
    this.endpoint = (prefs.mcpHttpEndpoint || discoveredEndpoint || "https://127.0.0.1:18799").replace(/\/$/, "");
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
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await fetch(`${this.endpoint}/mcp/tool`, {
          method: "POST",
          headers,
          body: payload,
          signal: controller.signal,
        });

        const text = await response.text();
        return JSON.parse(text) as ToolResult<TOutput>;
      } finally {
        clearTimeout(timeout);
      }
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
