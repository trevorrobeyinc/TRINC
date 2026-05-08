import { ChatMessage } from "@/types/message";
import { BaseChainRunner, type ChainRunner } from "./BaseChainRunner";
import type ChainManager from "../chainManager";
import type { App } from "obsidian";

/**
 * VaultZK plugin API type — declared locally to avoid a hard dependency.
 * Matches vault-zettelkasten's VaultZettelkastenAPI.
 */
interface VaultZKApi {
  serendipity(
    req: Record<string, unknown>
  ): Promise<{
    ok: boolean;
    content: string;
    suggestions?: unknown[];
    metadata: Record<string, unknown>;
  }>;
  crossDomain(
    req: Record<string, unknown>
  ): Promise<{
    ok: boolean;
    content: string;
    suggestions?: unknown[];
    metadata: Record<string, unknown>;
  }>;
  echoChamber(
    req: Record<string, unknown>
  ): Promise<{
    ok: boolean;
    content: string;
    suggestions?: unknown[];
    metadata: Record<string, unknown>;
  }>;
  semanticLinker(
    req: Record<string, unknown>
  ): Promise<{
    ok: boolean;
    content: string;
    suggestions?: unknown[];
    metadata: Record<string, unknown>;
  }>;
  orphanRescue(
    req: Record<string, unknown>
  ): Promise<{
    ok: boolean;
    content: string;
    suggestions?: unknown[];
    metadata: Record<string, unknown>;
  }>;
  vaultHealth(
    req: Record<string, unknown>
  ): Promise<{
    ok: boolean;
    content: string;
    healthScore?: unknown;
    metadata: Record<string, unknown>;
  }>;
  pipeline(
    steps: Array<{ command: string }>,
    req: Record<string, unknown>
  ): Promise<{ ok: boolean; combinedContent: string; metadata: Record<string, unknown> }>;
}

type ZKCommand =
  | "serendipity"
  | "cross-domain"
  | "echo-chamber"
  | "semantic-linker"
  | "orphan-rescue"
  | "health"
  | "pipeline";

/**
 * Detect the VaultZK plugin and return its API, or null if not available.
 */
export function getVaultZKApi(app: App): VaultZKApi | null {
  const plugin = (app as any).plugins?.plugins?.["vault-zettelkasten"];
  return plugin?.api ?? null;
}

/**
 * Chain runner that intercepts Zettelkasten-related queries and routes them
 * directly to the VaultZK Obsidian plugin API (zero HTTP overhead).
 *
 * Non-ZK queries are delegated to the provided fallback chain runner,
 * so general chat, Vault QA, and other features continue working normally.
 */
export class VaultZKDirectChainRunner extends BaseChainRunner {
  private fallback: ChainRunner;

  constructor(chainManager: ChainManager, fallback: ChainRunner) {
    super(chainManager);
    this.fallback = fallback;
  }

  async run(
    userMessage: ChatMessage,
    abortController: AbortController,
    updateCurrentAiMessage: (message: string) => void,
    addMessage: (message: ChatMessage) => void,
    options: {
      debug?: boolean;
      ignoreSystemMessage?: boolean;
      updateLoading?: (loading: boolean) => void;
    }
  ): Promise<string> {
    const rawMessage = userMessage.originalMessage || userMessage.message;
    const command = classifyZKCommand(rawMessage);

    // Not a ZK query — delegate to fallback chain runner
    if (!command) {
      return this.fallback.run(
        userMessage,
        abortController,
        updateCurrentAiMessage,
        addMessage,
        options
      );
    }

    const app = this.chainManager.app;
    const vaultZK = getVaultZKApi(app);
    if (!vaultZK) {
      const errorMsg =
        "VaultZK plugin is not available. Enable it in Settings → Community Plugins.";
      updateCurrentAiMessage(errorMsg);
      return errorMsg;
    }

    const activeFile = app.workspace.getActiveFile();
    const request = {
      notePath: activeFile?.path,
      options: { limit: 10, batchMode: false, writeReport: false },
    };

    try {
      updateCurrentAiMessage(`Running VaultZK ${command}...`);

      let content: string;
      let durationMs: number;

      if (command === "pipeline") {
        const result = await vaultZK.pipeline(
          [
            { command: "serendipity" },
            { command: "cross-domain" },
            { command: "semantic-linker" },
            { command: "echo-chamber" },
          ],
          request
        );
        content = result.combinedContent;
        durationMs = (result.metadata as any).durationMs ?? 0;
      } else {
        const handler = {
          serendipity: () => vaultZK.serendipity(request),
          "cross-domain": () => vaultZK.crossDomain(request),
          "echo-chamber": () => vaultZK.echoChamber(request),
          "semantic-linker": () => vaultZK.semanticLinker(request),
          "orphan-rescue": () => vaultZK.orphanRescue(request),
          health: () => vaultZK.vaultHealth(request),
        }[command]!;

        const result = await handler();
        content = result.content;
        durationMs = (result.metadata as any).durationMs ?? 0;
      }

      if (abortController.signal.aborted) {
        updateCurrentAiMessage("");
        return "";
      }

      const header = `*VaultZK ${command}* (${(durationMs / 1000).toFixed(1)}s)\n\n`;
      const fullResponse = header + content;

      await this.handleResponse(
        fullResponse,
        userMessage,
        abortController,
        addMessage,
        updateCurrentAiMessage
      );

      return fullResponse;
    } catch (error) {
      if (abortController.signal.aborted) {
        updateCurrentAiMessage("");
        return "";
      }

      await this.handleError(error, updateCurrentAiMessage);
      return "";
    }
  }
}

/**
 * Classify a user message into a VaultZK command, or null if not ZK-related.
 */
function classifyZKCommand(message: string): ZKCommand | null {
  const lower = message.toLowerCase();

  // Explicit command triggers
  if (/\b(run\s+)?serendipity\b|surprise\s+me|unexpected\s+connection/i.test(lower))
    return "serendipity";
  if (/cross[\s-]?domain|bridge.*domain|isomorphism|structural\s+analog/i.test(lower))
    return "cross-domain";
  if (/echo[\s-]?chamber|blind\s*spot|counter[\s-]?argument|challenge.*assumption/i.test(lower))
    return "echo-chamber";
  if (/semantic[\s-]?link|typed?\s+relationship|classify.*link|dataview\s+link/i.test(lower))
    return "semantic-linker";
  if (/orphan|isolated\s+note|unlinked|rescue/i.test(lower)) return "orphan-rescue";
  if (/vault[\s-]?health|health[\s-]?check|vault\s+metric|vault\s+stat/i.test(lower))
    return "health";
  if (/full[\s-]?pipeline|run\s+(all|everything)|zettelkasten\s+pipeline/i.test(lower))
    return "pipeline";

  // Broader ZK intent patterns
  if (/zettelkasten|knowledge\s+graph\s+analy/i.test(lower)) return "pipeline";

  return null;
}
