import { logInfo, logWarn } from "@/logger";
import { getSettings } from "@/settings/model";
import { createLangChainTool } from "@/tools/createLangChainTool";
import { ToolDefinition, ToolRegistry } from "@/tools/ToolRegistry";
import { getMcpCatalogEntry, getMcpCatalogToolNames } from "./catalog";
import { describeUnconvertedServer } from "./socketMigration";
import type { McpServerConfig, McpSettings } from "./types";
import { resolveBridgeSocket, UdsClientError, udsRequest, type BridgeSocket } from "./udsClient";
import { ConfirmModal } from "@/components/modals/ConfirmModal";

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

function wildcardToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i");
}

function matchesPatterns(value: string, patterns: string[]): boolean {
  return patterns.some((pattern) => wildcardToRegExp(pattern).test(value));
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * POST one tool call over the bridge socket. The replay headers hash exactly the bytes sent, and
 * Content-Type / Content-Length are explicit (Node's http sets neither from the body).
 */
async function postToolCall(
  server: McpServerConfig,
  socket: BridgeSocket,
  body: string,
  timeoutMs: number
): Promise<HttpResult> {
  const bytes = new TextEncoder().encode(body);
  const nonce = crypto.randomUUID();
  const timestamp = Date.now().toString();
  const bodyHash = await sha256Hex(bytes);
  const response = await udsRequest(socket, {
    method: "POST",
    path: "/mcp/tool",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": String(bytes.byteLength),
      ...(server.authToken ? { "X-MCP-Token": server.authToken } : {}),
      "X-MCP-Nonce": nonce,
      "X-MCP-Timestamp": timestamp,
      "X-MCP-Body-Sha256": bodyHash,
    },
    body: bytes,
    timeoutMs,
  });

  let parsedJson: unknown = null;
  try {
    parsedJson = JSON.parse(response.text);
  } catch {
    parsedJson = null;
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
    const health = (ok: boolean, message: string): McpServerHealth => ({
      serverId: server.id,
      displayName: server.displayName,
      ok,
      message,
    });

    if (!server.enabled) {
      return health(false, "Server is disabled.");
    }

    // Only Unix-socket entries are dialled; anything else is reported and never contacted.
    const unconverted = describeUnconvertedServer(server);
    if (unconverted !== null) {
      return health(false, `Not dialled: ${unconverted}.`);
    }

    let socket: BridgeSocket;
    try {
      socket = resolveBridgeSocket(server);
    } catch (error) {
      return health(
        false,
        `Socket refused: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    try {
      const response = await udsRequest(socket, {
        method: "GET",
        path: "/healthz",
        timeoutMs: server.timeoutMs || 20_000,
      });
      if (response.status < 200 || response.status >= 300) {
        return health(false, `Health probe failed with HTTP ${response.status}.`);
      }
      return health(true, `Server responded to /healthz on unix:${socket.socketPath}.`);
    } catch (error) {
      return health(
        false,
        `Health probe failed: ${error instanceof Error ? error.message : String(error)}`
      );
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
    // Only Unix-socket entries get tools; an "http" entry is reported by probeServer and never
    // dialled (bridges-uds, 2026-11-24).
    if (!server.enabled || server.transport !== "uds") {
      return [];
    }

    let socket: BridgeSocket;
    try {
      socket = resolveBridgeSocket(server);
    } catch (error) {
      if (!(error instanceof UdsClientError && error.code === "UNSUPPORTED_PLATFORM")) {
        logWarn(
          `[MCP] Skipping server '${server.id}': ${error instanceof Error ? error.message : String(error)}`
        );
      }
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

      const runtimeToolName = `mcp_${server.id}_${toolName}`;
      const tool = createLangChainTool({
        name: runtimeToolName,
        description: `${entry.description} [MCP server: ${server.displayName}]`,
        schema: entry.schema,
        func: async (rawArgs) => {
          // Security (audit RF-4): under prompt_on_writes, require explicit user
          // confirmation before any mutating tool runs. (read_only_only withholds such
          // tools at the gate above; allow_without_prompt executes directly.)
          if (entry.isMutating && settings.confirmationPolicy === "prompt_on_writes") {
            const approved = await new Promise<boolean>((resolve) => {
              new ConfirmModal(
                app,
                () => resolve(true),
                `The AI is requesting to run the mutating MCP tool "${entry.displayName}" on server "${server.displayName}". Allow it?`,
                "Confirm MCP write",
                "Run",
                "Cancel",
                () => resolve(false)
              ).open();
            });
            if (!approved) {
              return {
                type: "mcp_result",
                serverId: server.id,
                tool: entry.toolName,
                canceled: true,
                meta: { canceledByUser: true },
                error: { code: "user_declined", message: "User declined the mutating MCP tool." },
              };
            }
          }

          const input = entry.buildInput(rawArgs as Record<string, unknown>, server);
          if (entry.toolName === "obsidian_append_note" && !input.idempotencyKey) {
            input.idempotencyKey = crypto.randomUUID();
          }

          const body = JSON.stringify({
            tool: entry.toolName,
            operation: entry.operation,
            input,
          });

          const response = await postToolCall(server, socket, body, server.timeoutMs || 20_000);
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

          // Response-shape normalization (fixed 2026-08-12).
          // The canonical bridge (:8798) answers {ok, data, meta}. The OpenClaw
          // Command Center (:8799) answers with its payload at the TOP LEVEL
          // instead — e.g. {ok: true, templates: [...]} with no `data` key — so
          // `parsed.data ?? null` silently handed the model null for every
          // obsidian_openclaw_* tool. Verified live against :8799.
          // Prefer `data` when present (unchanged for :8798); otherwise surface
          // the remaining top-level fields.
          const RESERVED_RESPONSE_KEYS = new Set(["ok", "error", "meta", "data"]);
          const parsedRecord = parsed as unknown as Record<string, unknown>;
          const rawData = parsedRecord.data;
          let payload: unknown = null;
          if (rawData !== undefined) {
            payload = rawData;
          } else {
            const topLevel = Object.fromEntries(
              Object.entries(parsedRecord).filter(([key]) => !RESERVED_RESPONSE_KEYS.has(key))
            );
            payload = Object.keys(topLevel).length > 0 ? topLevel : null;
          }

          return {
            type: "mcp_result",
            serverId: server.id,
            tool: entry.toolName,
            data: payload,
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
