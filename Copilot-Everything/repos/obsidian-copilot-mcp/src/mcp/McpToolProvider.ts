import { logInfo, logWarn } from "@/logger";
import { getSettings } from "@/settings/model";
import { createLangChainTool } from "@/tools/createLangChainTool";
import { ToolDefinition, ToolRegistry } from "@/tools/ToolRegistry";
import { requestUrl } from "obsidian";
import { getMcpCatalogEntry, getMcpCatalogToolNames } from "./catalog";
import type { McpServerConfig, McpSettings } from "./types";

export interface McpServerHealth {
  serverId: string;
  displayName: string;
  ok: boolean;
  message: string;
}

interface HttpResult {
  ok: boolean;
  status: number;
  json: unknown;
  text: string;
}

function normalizeEndpoint(endpoint: string): string {
  return endpoint.replace(/\/+$/, "");
}

function wildcardToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i");
}

function matchesPatterns(value: string, patterns: string[]): boolean {
  return patterns.some((pattern) => wildcardToRegExp(pattern).test(value));
}

async function sha256Hex(body: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function postHttpToolCall(
  server: McpServerConfig,
  body: string,
  timeoutMs: number
): Promise<HttpResult> {
  const nonce = crypto.randomUUID();
  const timestamp = Date.now().toString();
  const bodyHash = await sha256Hex(body);
  return await requestWithTimeout(
    `${normalizeEndpoint(server.httpEndpoint)}/mcp/tool`,
    {
      method: "POST",
      body,
      headers: {
        "Content-Type": "application/json",
        ...(server.authToken ? { "X-MCP-Token": server.authToken } : {}),
        "X-MCP-Nonce": nonce,
        "X-MCP-Timestamp": timestamp,
        "X-MCP-Body-Sha256": bodyHash,
      },
    },
    timeoutMs
  );
}

async function requestWithTimeout(
  url: string,
  init: {
    method: string;
    headers?: Record<string, string>;
    body?: string;
  },
  timeoutMs: number
): Promise<HttpResult> {
  const headers = { ...(init.headers || {}) };
  const contentType = headers["Content-Type"] || headers["content-type"];
  delete headers["Content-Type"];
  delete headers["content-type"];

  const requestPromise = requestUrl({
    url,
    method: init.method,
    headers,
    ...(contentType ? { contentType } : {}),
    ...(typeof init.body === "string" ? { body: init.body } : {}),
    throw: false,
  });

  const timeoutPromise = new Promise<never>((_, reject) => {
    globalThis.setTimeout(() => {
      reject(new Error(`Request to ${url} timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
  });

  const response = await Promise.race([requestPromise, timeoutPromise]);

  let parsedJson = response.json;
  if (typeof parsedJson === "string") {
    try {
      parsedJson = JSON.parse(parsedJson);
    } catch {
      parsedJson = null;
    }
  }

  return {
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    json: parsedJson,
    text: response.text,
  };
}

export class McpToolProvider {
  static readonly providerId = "mcp";

  static getAvailableToolNames(): string[] {
    return getMcpCatalogToolNames();
  }

  static async probeServer(server: McpServerConfig): Promise<McpServerHealth> {
    if (!server.enabled) {
      return {
        serverId: server.id,
        displayName: server.displayName,
        ok: false,
        message: "Server is disabled.",
      };
    }

    if (server.transport !== "http") {
      return {
        serverId: server.id,
        displayName: server.displayName,
        ok: false,
        message: `Transport '${server.transport}' is configured, but the current plugin MVP supports HTTP transport only.`,
      };
    }

    if (!server.httpEndpoint) {
      return {
        serverId: server.id,
        displayName: server.displayName,
        ok: false,
        message: "Missing HTTP endpoint.",
      };
    }

    try {
      const response = await requestWithTimeout(
        `${normalizeEndpoint(server.httpEndpoint)}/healthz`,
        {
          method: "GET",
        },
        server.timeoutMs || 20_000
      );
      if (!response.ok) {
        return {
          serverId: server.id,
          displayName: server.displayName,
          ok: false,
          message: `Health probe failed with HTTP ${response.status}.`,
        };
      }

      return {
        serverId: server.id,
        displayName: server.displayName,
        ok: true,
        message: "Server responded to /healthz.",
      };
    } catch (error) {
      return {
        serverId: server.id,
        displayName: server.displayName,
        ok: false,
        message: `Health probe failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  static async probeConfiguredServers(settings?: McpSettings): Promise<McpServerHealth[]> {
    const effectiveSettings = settings ?? getSettings().mcp;
    return await Promise.all(
      effectiveSettings.servers.map((server) => McpToolProvider.probeServer(server))
    );
  }

  static syncFromSettings(settings?: McpSettings): void {
    const effectiveSettings = settings ?? getSettings().mcp;
    const registry = ToolRegistry.getInstance();

    if (!effectiveSettings.enabled) {
      registry.removeByProvider(McpToolProvider.providerId);
      return;
    }

    const definitions = effectiveSettings.servers.flatMap((server) =>
      McpToolProvider.buildServerDefinitions(server, effectiveSettings)
    );
    registry.replaceByProvider(McpToolProvider.providerId, definitions);
    logInfo(`[MCP] Registered ${definitions.length} MCP tool(s).`);
  }

  private static buildServerDefinitions(
    server: McpServerConfig,
    settings: McpSettings
  ): ToolDefinition[] {
    if (!server.enabled) {
      return [];
    }

    return server.enabledToolNames.flatMap((toolName) => {
      const entry = getMcpCatalogEntry(toolName);
      if (!entry) {
        logWarn(`[MCP] Skipping unknown catalog tool '${toolName}' on server '${server.id}'.`);
        return [];
      }

      if (entry.isMutating && settings.confirmationPolicy === "read_only_only") {
        logInfo(
          `[MCP] Skipping mutating tool '${toolName}' on server '${server.id}' due to confirmation policy '${settings.confirmationPolicy}'.`
        );
        return [];
      }

      if (settings.allowlist.length > 0 && !matchesPatterns(toolName, settings.allowlist)) {
        return [];
      }

      if (settings.denylist.length > 0 && matchesPatterns(toolName, settings.denylist)) {
        return [];
      }

      if (server.transport !== "http") {
        return [];
      }

      const runtimeToolName = `mcp_${server.id}_${toolName}`;
      const tool = createLangChainTool({
        name: runtimeToolName,
        description: `${entry.description} [MCP server: ${server.displayName}]`,
        schema: entry.schema,
        func: async (rawArgs) => {
          // Writes execute directly — no confirmation modal.
          // The read_only_only gate above (line 264) still strips
          // mutating tools when that policy is active.

          const input = entry.buildInput(rawArgs as Record<string, unknown>, server);
          if (entry.toolName === "obsidian_append_note" && !input.idempotencyKey) {
            input.idempotencyKey = crypto.randomUUID();
          }

          const body = JSON.stringify({
            tool: entry.toolName,
            operation: entry.operation,
            input,
            backendHint: server.backendHint || undefined,
          });

          const response = await postHttpToolCall(server, body, server.timeoutMs || 20_000);
          const parsed = (response.json ?? null) as {
            ok: boolean;
            data?: unknown;
            error?: { message?: string; code?: string };
            meta?: Record<string, unknown>;
          };

          if (!response.ok || !parsed.ok) {
            const errorMessage =
              parsed.error?.message ||
              `MCP tool '${entry.toolName}' failed with HTTP ${response.status}.`;
            throw new Error(errorMessage);
          }

          if (settings.redactLogs) {
            logInfo(`[MCP] ${server.id}:${entry.toolName} completed.`);
          } else {
            logInfo(`[MCP] ${server.id}:${entry.toolName} completed`, parsed);
          }

          return {
            type: "mcp_result",
            serverId: server.id,
            tool: entry.toolName,
            data: parsed.data ?? null,
            meta: parsed.meta ?? {},
          };
        },
      });

      return [
        {
          tool,
          metadata: {
            id: runtimeToolName,
            providerId: McpToolProvider.providerId,
            displayName: `${entry.displayName} (${server.displayName})`,
            description: entry.description,
            category: "mcp",
            requiresVault: false,
            timeoutMs: server.timeoutMs || 20_000,
          },
        },
      ];
    });
  }
}
