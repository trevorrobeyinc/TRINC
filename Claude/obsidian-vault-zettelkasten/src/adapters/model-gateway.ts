import { requestUrl } from "obsidian";
import type {
  TextGenerationRequest,
  TextGenerationResult,
  TokenUsage,
  ResolvedModelConfig,
  CanonicalChatMessage,
} from "../types/model";

/**
 * LLM gateway for OpenAI-compatible providers.
 * Uses Obsidian's requestUrl for Electron CORS compatibility.
 * Non-streaming only — the ZettelkastenService doesn't need streaming, and at
 * trait-prompt size the hosted model answers in ~2s (measured 2026-07-23).
 *
 * The local-model branches were removed with their runtimes: LM Studio
 * 2026-07-16, Ollama 2026-07-23. Everything now goes through the hosted
 * OpenAI-compatible path.
 */
export class ModelGateway {
  async generateText(request: TextGenerationRequest): Promise<TextGenerationResult> {
    return this.generateOpenAI(request);
  }

  /**
   * Build a ResolvedModelConfig from plugin settings (convenience).
   *
   * API-key resolution deliberately never requires the key to sit in this
   * plugin's data.json (Obsidian persists that file and auto-creates backups).
   * Order: settings.llmApiKey → the 0600 file at ~/.config/trevclaw/brevilabs-key.
   * Callers that already hold the key (the wiki-definition plugin) bypass this
   * entirely by passing `request.model` per call — see
   * ZettelkastenService.resolveModel().
   */
  static fromSettings(settings: {
    llmProvider: string;
    llmBaseUrl: string;
    llmModelName: string;
    llmApiKey: string;
    llmTemperature: number;
    llmMaxTokens: number;
  }): ResolvedModelConfig {
    return {
      key: `${settings.llmProvider}|${settings.llmModelName}`,
      name: settings.llmModelName,
      provider: settings.llmProvider,
      baseUrl: settings.llmBaseUrl,
      apiKey: settings.llmApiKey || readKeyFile() || undefined,
      temperature: settings.llmTemperature,
      maxTokens: settings.llmMaxTokens,
    };
  }

  // ── OpenAI-compatible (LM Studio, OpenAI, etc.) ──────────────────

  private async generateOpenAI(request: TextGenerationRequest): Promise<TextGenerationResult> {
    const endpoint = this.getOpenAIEndpoint(request.model);

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (request.model.apiKey) {
      headers["Authorization"] = `Bearer ${request.model.apiKey}`;
    }

    const body: Record<string, unknown> = {
      model: request.model.name,
      messages: request.messages.map((m: CanonicalChatMessage) => ({
        role: m.role,
        content: m.content,
      })),
      stream: false,
    };
    if (typeof request.model.temperature === "number") body.temperature = request.model.temperature;
    if (typeof request.model.maxTokens === "number") body.max_tokens = request.model.maxTokens;

    const res = await requestUrl({
      url: endpoint,
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    const json = res.json as {
      choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };

    const rawContent = json.choices?.[0]?.message?.content;
    const text =
      typeof rawContent === "string"
        ? rawContent
        : Array.isArray(rawContent)
          ? rawContent.map((p: any) => (typeof p?.text === "string" ? p.text : "")).join("")
          : "";

    return {
      text: stripThinkBlocks(text),
      usage: mapUsage(json.usage),
    };
  }

  private getOpenAIEndpoint(model: ResolvedModelConfig): string {
    const defaultBase = "https://models.brevilabs.com/v1";
    const raw = model.baseUrl?.trim() || defaultBase;
    const normalized = raw.replace(/\/+$/, "");
    if (normalized.endsWith("/chat/completions")) return normalized;
    if (normalized.endsWith("/v1")) return `${normalized}/chat/completions`;
    return `${normalized}/v1/chat/completions`;
  }

}

/**
 * Read the hosted-model licence key from a 0600 file outside the vault.
 *
 * Mirrors the command-center bridge-token pattern
 * (obsidian-command-center/src/bridge/mcp-bridge-server.ts loadOrCreateBridgeToken):
 * Obsidian persists plugin data.json and auto-creates .bak copies, which has
 * leaked credentials in this stack before — so the secret lives in
 * ~/.config/trevclaw/brevilabs-key instead. Absent file → undefined, and the
 * caller simply sends no Authorization header.
 */
function readKeyFile(): string | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require("fs") as typeof import("fs");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const os = require("os") as typeof import("os");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const path = require("path") as typeof import("path");
    const file = path.join(os.homedir(), ".config", "trevclaw", "brevilabs-key");
    const key = fs.readFileSync(file, "utf8").trim();
    return key.length > 0 ? key : undefined;
  } catch {
    return undefined;
  }
}

function mapUsage(
  usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined
): TokenUsage | undefined {
  if (!usage) return undefined;
  return {
    inputTokens: usage.prompt_tokens,
    outputTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
  };
}

function stripThinkBlocks(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}
