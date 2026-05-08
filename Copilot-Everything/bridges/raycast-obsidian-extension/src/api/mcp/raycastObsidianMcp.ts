import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getPreferenceValues } from "@raycast/api";
import type { MCPToolRequest, ToolResult } from "./contracts";

interface RaycastObsidianMcpPreferences {
  raycastObsidianMcpEndpoint?: string;
  raycastObsidianMcpAuthToken?: string;
  raycastObsidianMcpConfigPath?: string;
  raycastObsidianMcpRequestTimeoutMs?: string;
}

interface RaycastObsidianMcpConfigFile {
  transport?: {
    mode?: string;
    host?: string;
    port?: number;
  };
  security?: {
    authToken?: string;
  };
}

const DEFAULT_ENDPOINT = "https://127.0.0.1:18799";
const DEFAULT_TIMEOUT_MS = 20_000;

function bodyHash(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex");
}

function loadConfigFile(configPath?: string): RaycastObsidianMcpConfigFile | null {
  const candidates = [
    configPath?.trim(),
    path.resolve(process.cwd(), "../raycast-obsidian-mcp/config/raycast-obsidian-mcp.local.json"),
    "/Users/trevorrobey/THE Copilot in Obsidian Everything/bridges/raycast-obsidian-mcp/config/raycast-obsidian-mcp.local.json",
  ].filter((value): value is string => Boolean(value));

  for (const candidate of new Set(candidates)) {
    try {
      if (!fs.existsSync(candidate)) {
        continue;
      }
      return JSON.parse(fs.readFileSync(candidate, "utf8")) as RaycastObsidianMcpConfigFile;
    } catch {
      // Continue trying.
    }
  }

  return null;
}

export class RaycastObsidianMcpClient {
  private readonly endpoint: string;
  private readonly token: string;
  private readonly timeoutMs: number;

  constructor() {
    const prefs = getPreferenceValues<RaycastObsidianMcpPreferences>();
    const discovered = loadConfigFile(prefs.raycastObsidianMcpConfigPath);
    const scheme = discovered?.transport?.mode === "http" ? "http" : "https";
    const discoveredEndpoint =
      discovered?.transport?.host && discovered?.transport?.port
        ? `${scheme}://${discovered.transport.host}:${discovered.transport.port}`
        : "";
    this.endpoint = (prefs.raycastObsidianMcpEndpoint || discoveredEndpoint || DEFAULT_ENDPOINT).replace(/\/$/, "");
    this.token = prefs.raycastObsidianMcpAuthToken?.trim() || discovered?.security?.authToken?.trim() || "";
    if (!this.token) {
      throw new Error(
        "raycastObsidianMcp: auth token not found. Set the raycastObsidianMcpAuthToken preference or provide a config file with security.authToken."
      );
    }
    this.timeoutMs = Number.parseInt(prefs.raycastObsidianMcpRequestTimeoutMs || "", 10) || DEFAULT_TIMEOUT_MS;
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

  async health(): Promise<{ ok: boolean; status?: string; ts?: string }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.endpoint}/healthz`, { method: "GET", signal: controller.signal });
      return (await response.json()) as { ok: boolean; status?: string; ts?: string };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export async function raycastObsidianCreateNote(input: {
  vault: string;
  vaultRoot: string;
  path: string;
  content?: string;
  overwrite?: boolean;
  open?: boolean;
  newtab?: boolean;
}): Promise<{ created: boolean; path: string }> {
  const client = new RaycastObsidianMcpClient();
  const response = await client.callTool<typeof input, { created: boolean; path: string }>({
    tool: "obsidian_create_note",
    operation: "create_note",
    input,
  });
  if (!response.ok) {
    throw new Error(`[${response.error.code}] ${response.error.message}`);
  }
  return response.data;
}

export async function raycastObsidianAppendNote(input: {
  vault: string;
  vaultRoot: string;
  path: string;
  content: string;
  inline?: boolean;
  idempotencyKey: string;
}): Promise<{ appended: boolean; path: string; idempotencyState: string }> {
  const client = new RaycastObsidianMcpClient();
  const response = await client.callTool<
    typeof input,
    { appended: boolean; path: string; idempotencyState: string }
  >({
    tool: "obsidian_append_note",
    operation: "append_note",
    input,
  });
  if (!response.ok) {
    throw new Error(`[${response.error.code}] ${response.error.message}`);
  }
  return response.data;
}
