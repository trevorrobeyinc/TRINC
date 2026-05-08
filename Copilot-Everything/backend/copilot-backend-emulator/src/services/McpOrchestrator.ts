import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { BridgeMcpClient } from "../adapters/BridgeMcpClient.js";
import type {
  MiyoCompatibilityClient,
  MiyoForwardResponse,
} from "../adapters/MiyoCompatibilityClient.js";
import type { ExecutedToolCall, McpToolBinding } from "../types/mcp.js";
import type { SelfHostTurnRequest } from "../types/selfHost.js";
import type { ZettelkastenService } from "./ZettelkastenService.js";

export interface PreflightContextResult {
  contextBlock?: string;
  toolCall?: ExecutedToolCall;
}

export class McpOrchestrator {
  private zettelkastenService?: ZettelkastenService;

  constructor(
    private readonly bridgeClient: BridgeMcpClient,
    private readonly miyoClient?: MiyoCompatibilityClient,
    private readonly defaultMiyoVault = "",
    private readonly defaultVaultName = "",
    private readonly defaultVaultRoot = ""
  ) {}

  /**
   * Late-bind ZettelkastenService to avoid circular constructor dependencies.
   */
  setZettelkastenService(service: ZettelkastenService): void {
    this.zettelkastenService = service;
  }

  async runPreFlightIntentCheck(
    request: SelfHostTurnRequest,
    tools: McpToolBinding[],
    signal?: AbortSignal
  ): Promise<PreflightContextResult> {
    if (!looksVaultIntent(request.rawUserMessage)) {
      return {};
    }

    const inferredVault =
      inferVaultFromTools(tools) ??
      (this.defaultMiyoVault.trim() ? this.defaultMiyoVault : undefined);

    const preferredBinding =
      findMiyoBinding(tools) ??
      ({
        runtimeName: "miyo_search_context",
        displayName: "Miyo Semantic Search",
        description:
          "Search indexed vault context for note-aware questions before the final assistant response.",
        category: "mcp",
        bridge: {
          toolName: "miyo_search_context",
          serverId: "miyo-compat",
          vaultName: inferredVault,
        },
      } satisfies McpToolBinding);

    const args: Record<string, unknown> = {
      query: request.rawUserMessage,
      vault:
        preferredBinding.bridge.vaultName ??
        inferredVault,
      limit: 5,
    };

    const toolCall = await this.executeToolCall(preferredBinding, args, signal);
    if (!toolCall.success) {
      return { toolCall };
    }

    const contextBlock = buildMiyoContextBlock(toolCall.rawResult);
    return { contextBlock, toolCall };
  }

  async executeToolCall(
    binding: McpToolBinding,
    args: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<ExecutedToolCall> {
    // Route zettelkasten_* tools to the ZettelkastenService
    if (binding.bridge.serverId === "zettelkasten-internal" && this.zettelkastenService) {
      return await this.executeZettelkastenTool(binding, args, signal);
    }

    if (binding.bridge.toolName === "miyo_search_context") {
      return await this.executeMiyoSearchContext(binding, args, signal);
    }

    const input = buildBridgeInput(binding, args, this.defaultVaultName, this.defaultVaultRoot);
    const request = {
      tool: binding.bridge.toolName,
      operation: binding.bridge.operation,
      backendHint: binding.bridge.backendHint,
      input,
    };

    let response = await this.bridgeClient.callTool(request, signal);

    // For read_note: if the path wasn't found and lacks a subfolder, search for it and retry
    if (
      binding.bridge.toolName === "obsidian_read_note" &&
      response.ok &&
      typeof (response.data as Record<string, unknown>)?.content === "string" &&
      ((response.data as Record<string, unknown>).content as string).includes("not found")
    ) {
      const resolvedPath = await this.resolveNotePath(
        String(args.path ?? ""),
        binding,
        signal
      );
      if (resolvedPath) {
        args.path = resolvedPath;
        const retryInput = buildBridgeInput(binding, args, this.defaultVaultName, this.defaultVaultRoot);
        request.input = retryInput;
        response = await this.bridgeClient.callTool(request, signal);
      }
    }

    if (!response.ok) {
      return {
        runtimeName: binding.runtimeName,
        bridgeToolName: binding.bridge.toolName,
        displayName: binding.displayName,
        args,
        success: false,
        rawResult: response.error.message,
        displayResult: `${binding.displayName} failed: ${response.error.message}`,
        meta: response.meta,
      };
    }

    const rawResult = JSON.stringify(response.data);
    return {
      runtimeName: binding.runtimeName,
      bridgeToolName: binding.bridge.toolName,
      displayName: binding.displayName,
      args,
      success: true,
      rawResult,
      displayResult: summarizeResult(binding, response.data),
      meta: response.meta,
    };
  }

  /**
   * Resolve a note path by walking the vault filesystem when the flat name fails.
   * Returns the relative path (with subfolder) or undefined.
   */
  private async resolveNotePath(
    path: string,
    binding: McpToolBinding,
    _signal?: AbortSignal
  ): Promise<string | undefined> {
    const fileName = path.replace(/\.md$/, "") + ".md";
    if (fileName.includes("/")) return undefined;

    const vaultRoot = binding.bridge.vaultRoot || this.defaultVaultRoot;
    if (!vaultRoot) return undefined;

    const target = fileName.toLowerCase();
    return await findFileInDir(vaultRoot, target);
  }

  private async executeMiyoSearchContext(
    binding: McpToolBinding,
    args: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<ExecutedToolCall> {
    const bridgeResponse = await this.bridgeClient.callTool(
      {
        tool: "miyo_search_context",
        input: buildMiyoInput(binding, args, this.defaultMiyoVault),
      },
      signal
    );

    if (bridgeResponse.ok) {
      const rawResult = JSON.stringify(bridgeResponse.data);
      return {
        runtimeName: binding.runtimeName,
        bridgeToolName: binding.bridge.toolName,
        displayName: binding.displayName,
        args,
        success: true,
        rawResult,
        displayResult: summarizeResult(binding, bridgeResponse.data),
        meta: bridgeResponse.meta,
      };
    }

    const bridgeErrorMessage = resolveErrorMessage(bridgeResponse.error.message);
    if (!shouldFallbackDirectMiyo(bridgeErrorMessage) || !this.miyoClient) {
      return {
        runtimeName: binding.runtimeName,
        bridgeToolName: binding.bridge.toolName,
        displayName: binding.displayName,
        args,
        success: false,
        rawResult: bridgeErrorMessage,
        displayResult: `${binding.displayName} failed: ${bridgeErrorMessage}`,
        meta: bridgeResponse.meta,
      };
    }

    const directResponse = await this.miyoClient.forward({
      method: "POST",
      routePath: "/v0/search",
      body: buildMiyoInput(binding, args, this.defaultMiyoVault),
    });

    if (directResponse.status >= 400) {
      return {
        runtimeName: binding.runtimeName,
        bridgeToolName: binding.bridge.toolName,
        displayName: binding.displayName,
        args,
        success: false,
        rawResult: directResponse.text,
        displayResult: `${binding.displayName} failed with status ${directResponse.status}`,
      };
    }

    const rawResult = JSON.stringify(directResponse.body);
    return {
      runtimeName: binding.runtimeName,
      bridgeToolName: binding.bridge.toolName,
      displayName: binding.displayName,
      args,
      success: true,
      rawResult,
      displayResult: summarizeMiyoResult(directResponse),
    };
  }

  private async executeZettelkastenTool(
    binding: McpToolBinding,
    args: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<ExecutedToolCall> {
    const startMs = Date.now();
    const commandMap: Record<string, string> = {
      zettelkasten_serendipity: "serendipity",
      zettelkasten_cross_domain: "cross-domain",
      zettelkasten_echo_chamber: "echo-chamber",
      zettelkasten_semantic_linker: "semantic-linker",
      zettelkasten_orphan_rescue: "orphan-rescue",
      zettelkasten_vault_health: "health",
    };

    const command = commandMap[binding.bridge.toolName];
    if (!command || !this.zettelkastenService) {
      return {
        runtimeName: binding.runtimeName,
        bridgeToolName: binding.bridge.toolName,
        displayName: binding.displayName,
        args,
        success: false,
        rawResult: `Unknown zettelkasten command: ${binding.bridge.toolName}`,
        displayResult: `${binding.displayName} failed: unknown command`,
      };
    }

    try {
      const request = {
        notePath: args.notePath as string | undefined,
        noteContent: args.noteContent as string | undefined,
        vault: (args.vault as string) || this.defaultMiyoVault || this.defaultVaultName,
        options: {
          limit: (args.limit as number) ?? 10,
          batchMode: (args.batchMode as boolean) ?? false,
          writeReport: false,
        },
      };

      const handler: Record<string, (req: typeof request, sig?: AbortSignal) => Promise<unknown>> = {
        serendipity: (r, s) => this.zettelkastenService!.serendipity(r, s),
        "cross-domain": (r, s) => this.zettelkastenService!.crossDomain(r, s),
        "echo-chamber": (r, s) => this.zettelkastenService!.echoChamber(r, s),
        "semantic-linker": (r, s) => this.zettelkastenService!.semanticLinker(r, s),
        "orphan-rescue": (r, s) => this.zettelkastenService!.orphanRescue(r, s),
        health: (r, s) => this.zettelkastenService!.vaultHealth(r, s),
      };

      const result = await handler[command](request, signal);
      const rawResult = JSON.stringify(result);
      const durationMs = Date.now() - startMs;

      return {
        runtimeName: binding.runtimeName,
        bridgeToolName: binding.bridge.toolName,
        displayName: binding.displayName,
        args,
        success: true,
        rawResult,
        displayResult: `${binding.displayName} completed in ${durationMs}ms`,
        meta: {
          requestId: `zk-${Date.now()}`,
          durationMs,
        },
      };
    } catch (error) {
      return {
        runtimeName: binding.runtimeName,
        bridgeToolName: binding.bridge.toolName,
        displayName: binding.displayName,
        args,
        success: false,
        rawResult: error instanceof Error ? error.message : String(error),
        displayResult: `${binding.displayName} failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}

function buildBridgeInput(
  binding: McpToolBinding,
  args: Record<string, unknown>,
  defaultVaultName = "",
  defaultVaultRoot = ""
): Record<string, unknown> {
  const { toolName, serverId } = binding.bridge;
  const vaultName = binding.bridge.vaultName || defaultVaultName || undefined;
  const vaultRoot = binding.bridge.vaultRoot || defaultVaultRoot || undefined;

  switch (toolName) {
    case "obsidian_health":
      return {};
    case "obsidian_open_vault":
      return {
        vault: vaultName,
        path: args.path,
        paneType: args.paneType,
      };
    case "obsidian_read_note":
      return {
        vault: vaultName,
        vaultRoot,
        path: args.path,
      };
    case "obsidian_search_notes":
      return {
        vault: vaultName,
        query: args.query,
        path: args.path,
        limit: args.limit,
        caseSensitive: args.caseSensitive,
      };
    case "obsidian_execute_command":
      return {
        vault: vaultName,
        id: args.id,
      };
    case "obsidian_create_note":
      return {
        vault: vaultName,
        vaultRoot,
        path: args.path,
        content: args.content ?? "",
        overwrite: args.overwrite,
        open: args.open,
        newtab: args.newtab,
      };
    case "obsidian_append_note":
      return {
        vault: vaultName,
        vaultRoot,
        path: args.path,
        content: args.content,
        inline: args.inline,
        idempotencyKey: args.idempotencyKey ?? `${serverId}-${Date.now()}`,
      };
    default:
      return args;
  }
}

function summarizeResult(binding: McpToolBinding, data: unknown): string {
  if (binding.bridge.toolName === "obsidian_health") {
    return "Bridge health check completed.";
  }

  if (binding.bridge.toolName === "miyo_search_context") {
    return summarizeMiyoData(data);
  }

  if (typeof data === "string") {
    return data;
  }

  return JSON.stringify(data);
}

function summarizeMiyoData(data: unknown): string {
  const parsed = parseJsonObject(data);
  const results = Array.isArray(parsed?.results) ? parsed.results : [];
  return `Miyo semantic search returned ${results.length} result(s).`;
}

function summarizeMiyoResult(response: MiyoForwardResponse): string {
  const parsed = parseJsonObject(response.body);
  const results = Array.isArray(parsed?.results) ? parsed.results : [];
  return `Miyo semantic search returned ${results.length} result(s).`;
}

function parseJsonObject(data: unknown): Record<string, unknown> | null {
  if (!data) {
    return null;
  }
  if (typeof data === "object") {
    return data as Record<string, unknown>;
  }
  if (typeof data !== "string") {
    return null;
  }
  try {
    return JSON.parse(data) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function findMiyoBinding(tools: McpToolBinding[]): McpToolBinding | undefined {
  return tools.find(
    (tool) =>
      tool.runtimeName === "miyo_search_context" ||
      tool.bridge.toolName === "miyo_search_context"
  );
}

function inferVaultFromTools(tools: McpToolBinding[]): string | undefined {
  const withVault = tools.find((tool) => tool.bridge.vaultName);
  return withVault?.bridge.vaultName;
}

function buildMiyoInput(
  binding: McpToolBinding,
  args: Record<string, unknown>,
  defaultVault: string
): Record<string, unknown> {
  return {
    query: String(args.query ?? ""),
    vault:
      String(args.vault ?? binding.bridge.vaultName ?? defaultVault ?? "").trim() || undefined,
    limit: Number(args.limit ?? 5),
  };
}

function shouldFallbackDirectMiyo(message: string): boolean {
  const lowered = message.toLowerCase();
  return lowered.includes("unknown tool") || lowered.includes("miyo_search_context");
}

function resolveErrorMessage(message: unknown): string {
  if (typeof message === "string" && message.trim()) {
    return message.trim();
  }
  return "Miyo bridge request failed with an unknown error.";
}

function looksVaultIntent(rawUserMessage: string): boolean {
  const lowered = rawUserMessage.toLowerCase();
  if (lowered.includes("@vault")) {
    return true;
  }

  const keywords = [
    "vault",
    "note",
    "notes",
    "search",
    "find",
    "related",
    "semantic",
    "index",
    "document",
    "documents",
    "pdf",
    "transcript",
  ];
  return keywords.some((keyword) => lowered.includes(keyword));
}

function buildMiyoContextBlock(rawResult: string): string {
  const parsed = parseJsonObject(rawResult);
  const results = Array.isArray(parsed?.results) ? parsed.results : [];
  if (results.length === 0) {
    return "";
  }

  const lines = results.slice(0, 5).map((entry) => {
    const result = entry as Record<string, unknown>;
    const path = String(result.path ?? "").trim() || "unknown-path";
    const snippet = String(result.chunk_text ?? "").replace(/\s+/g, " ").trim().slice(0, 280);
    const score = typeof result.score === "number" ? ` (score=${result.score.toFixed(3)})` : "";
    return `- ${path}${score}${snippet ? `: ${snippet}` : ""}`;
  });

  return `<vault_context source="miyo_search_context">\n${lines.join("\n")}\n</vault_context>`;
}

/**
 * Recursively find a file by name in a directory. Returns the relative path or undefined.
 * Skips .obsidian and other hidden directories.
 */
async function findFileInDir(dir: string, targetLower: string, prefix = ""): Promise<string | undefined> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      if (entry.isFile() && entry.name.toLowerCase() === targetLower) {
        return prefix ? `${prefix}/${entry.name}` : entry.name;
      }
      if (entry.isDirectory()) {
        const subPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;
        const found = await findFileInDir(join(dir, entry.name), targetLower, subPrefix);
        if (found) return found;
      }
    }
  } catch {
    // Permission denied or other FS error — skip
  }
  return undefined;
}
