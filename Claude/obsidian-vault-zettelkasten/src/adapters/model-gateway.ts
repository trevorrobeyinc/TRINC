import { requestUrl } from "obsidian";
import type {
  TextGenerationRequest,
  TextGenerationResult,
  TokenUsage,
  ResolvedModelConfig,
  CanonicalChatMessage,
} from "../types/model";

/**
 * LLM gateway supporting LM Studio, Ollama, and OpenAI-compatible providers.
 * Uses Obsidian's requestUrl for Electron CORS compatibility.
 * Non-streaming only — the ZettelkastenService doesn't need streaming.
 */
export class ModelGateway {
  async generateText(request: TextGenerationRequest): Promise<TextGenerationResult> {
    const provider = request.model.provider;
    if (provider === "ollama") {
      return this.generateOllama(request);
    }
    // lm-studio, openai, and anything else → OpenAI-compatible
    return this.generateOpenAI(request);
  }

  /** Build a ResolvedModelConfig from plugin settings (convenience). */
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
      apiKey: settings.llmApiKey || undefined,
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
    const defaultBase = model.provider === "lm-studio" ? "http://127.0.0.1:1234/v1" : "https://api.openai.com/v1";
    const raw = model.baseUrl?.trim() || defaultBase;
    const normalized = raw.replace(/\/+$/, "");
    if (normalized.endsWith("/chat/completions")) return normalized;
    if (normalized.endsWith("/v1")) return `${normalized}/chat/completions`;
    return `${normalized}/v1/chat/completions`;
  }

  // ── Ollama ────────────────────────────────────────────────────────

  private async generateOllama(request: TextGenerationRequest): Promise<TextGenerationResult> {
    const baseUrl = (request.model.baseUrl?.trim() || "http://127.0.0.1:11434").replace(/\/+$/, "");
    const endpoint = `${baseUrl}/api/chat`;

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (request.model.apiKey) {
      headers["Authorization"] = `Bearer ${request.model.apiKey}`;
    }

    const options: Record<string, unknown> = {};
    if (typeof request.model.temperature === "number") options.temperature = request.model.temperature;

    const res = await requestUrl({
      url: endpoint,
      method: "POST",
      headers,
      body: JSON.stringify({
        model: request.model.name,
        stream: false,
        messages: request.messages.map((m: CanonicalChatMessage) => ({
          role: m.role,
          content: m.content,
        })),
        options,
      }),
    });

    const json = res.json as {
      message?: { content?: string };
      prompt_eval_count?: number;
      eval_count?: number;
    };

    return {
      text: json.message?.content?.trim() || "",
      usage:
        typeof json.prompt_eval_count === "number" || typeof json.eval_count === "number"
          ? {
              inputTokens: json.prompt_eval_count,
              outputTokens: json.eval_count,
              totalTokens: (json.prompt_eval_count ?? 0) + (json.eval_count ?? 0),
            }
          : undefined,
    };
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
