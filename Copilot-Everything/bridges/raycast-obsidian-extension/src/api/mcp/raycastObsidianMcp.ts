import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getPreferenceValues } from "@raycast/api";
import { createLoopbackTlsAgent } from "../../utils/loopbackTlsAgent";
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

// Retargeted 2026-05-09 from the retired raycast-obsidian-mcp daemon (:18799) to
// the canonical multi-operator obsidian-copilot-bridge daemon (:8798).
const DEFAULT_ENDPOINT = "https://127.0.0.1:8798";
const DEFAULT_TIMEOUT_MS = 20_000;

// The bridge listens on loopback with an mkcert-issued cert. Trust the mkcert root CA and
// VERIFY the cert (audit RF-1) instead of disabling verification.
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

function loadConfigFile(configPath?: string): RaycastObsidianMcpConfigFile | null {
  const candidates = [
    configPath?.trim(),
    path.resolve(process.cwd(), "../raycast-obsidian-mcp/config/raycast-obsidian-mcp.local.json"),
    "/Volumes/ExtraCurricular/TrevClaw-Obsidianodus/Copilot-Everything/bridges/obsidian-copilot-bridge/config/obsidian-cli-mcp.local.json",
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
    // The launcher respawns the bridge whenever Obsidian reloads, leaving a brief
    // window where :8798 refuses connections. Retry transient fetch failures so a
    // run that lands in a restart window doesn't fail outright. All ops here are
    // idempotent (create uses overwrite, read/append are safe to repeat).
    let lastError: unknown;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
      const headers = {
        "Content-Type": "application/json",
        "X-MCP-Token": this.token,
        "X-MCP-Timestamp": String(Date.now()),
        "X-MCP-Nonce": randomUUID(),
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

  async health(): Promise<{ ok: boolean; status?: string; ts?: string }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.endpoint}/healthz`, {
        method: "GET",
        signal: controller.signal,
        // @ts-expect-error: undici's `dispatcher` is not in lib.dom.d.ts.
        dispatcher: isLoopbackEndpoint(this.endpoint) ? localhostAgent : undefined,
      });
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
