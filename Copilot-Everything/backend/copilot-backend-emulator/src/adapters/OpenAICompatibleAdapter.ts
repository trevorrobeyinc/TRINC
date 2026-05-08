import { createParser, type EventSourceMessage } from "eventsource-parser";
import type {
  TextGenerationRequest,
  TextGenerationResult,
  TextStreamCallbacks,
  TokenUsage,
} from "../types/model.js";

type ChatCompletionsChunk = {
  choices?: Array<{
    delta?: { content?: string };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

export class OpenAICompatibleAdapter {
  constructor(private readonly defaultBaseUrl = "https://api.openai.com/v1") {}

  async generateText(request: TextGenerationRequest): Promise<TextGenerationResult> {
    const response = await fetch(this.getEndpoint(request), {
      method: "POST",
      headers: this.buildHeaders(request),
      body: JSON.stringify(this.buildBody(request, false)),
      signal: request.signal,
    });

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
    };

    const rawContent = json.choices?.[0]?.message?.content;
    const text =
      typeof rawContent === "string"
        ? rawContent
        : Array.isArray(rawContent)
          ? rawContent
              .map((part) => (typeof part?.text === "string" ? part.text : ""))
              .join("")
          : "";

    return {
      text: stripThinkBlocks(text).answer,
      usage: mapUsage(json.usage),
    };
  }

  async streamText(
    request: TextGenerationRequest,
    callbacks: TextStreamCallbacks
  ): Promise<TextGenerationResult> {
    const response = await fetch(this.getEndpoint(request), {
      method: "POST",
      headers: this.buildHeaders(request),
      body: JSON.stringify(this.buildBody(request, true)),
      signal: callbacks.signal ?? request.signal,
    });

    if (!response.body) {
      return await this.generateText(request);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let aggregated = "";
    let finishReason: string | null = null;
    let usage: TokenUsage | undefined;

    const parser = createParser({
      onEvent: (event: EventSourceMessage) => {
        if (event.data === "[DONE]") {
          return;
        }

        const parsed = JSON.parse(event.data) as ChatCompletionsChunk;
        if (parsed.usage) {
          usage = mapUsage(parsed.usage);
        }

        const choice = parsed.choices?.[0];
        const delta = choice?.delta?.content ?? "";
        if (delta) {
          aggregated += delta;
          callbacks.onToken(delta);
        }
        finishReason = choice?.finish_reason ?? finishReason;
      },
    });

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      parser.feed(decoder.decode(value, { stream: true }));
    }

    const stripped = stripThinkBlocks(aggregated);
    return {
      text: stripped.answer,
      rawReasoning: stripped.reasoning.length > 0 ? stripped.reasoning : undefined,
      usage,
      finishReason,
    };
  }

  protected getEndpoint(request: TextGenerationRequest): string {
    const rawBaseUrl = request.model.baseUrl?.trim() || this.defaultBaseUrl;
    const normalized = rawBaseUrl.replace(/\/+$/, "");
    if (normalized.endsWith("/chat/completions")) {
      return normalized;
    }
    if (normalized.endsWith("/v1")) {
      return `${normalized}/chat/completions`;
    }
    return `${normalized}/v1/chat/completions`;
  }

  protected buildHeaders(request: TextGenerationRequest): Headers {
    const headers = new Headers({
      "Content-Type": "application/json",
    });

    if (request.model.provider === "azure openai" && request.model.apiKey) {
      headers.set("api-key", request.model.apiKey);
    } else if (request.model.apiKey) {
      headers.set("Authorization", `Bearer ${request.model.apiKey}`);
    }

    if (request.model.openAIOrgId) {
      headers.set("OpenAI-Organization", request.model.openAIOrgId);
    }

    if (request.model.provider === "openrouterai") {
      headers.set("HTTP-Referer", "https://obsidiancopilot.com");
      headers.set("X-Title", "Obsidian Copilot MCP");
    }

    return headers;
  }

  protected buildBody(request: TextGenerationRequest, stream: boolean): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: request.model.name,
      messages: request.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      stream,
      stream_options: {
        include_usage: request.model.streamUsage ?? true,
      },
    };

    if (typeof request.model.temperature === "number") {
      body.temperature = request.model.temperature;
    }
    if (typeof request.model.maxTokens === "number") {
      body.max_tokens = request.model.maxTokens;
    }
    if (typeof request.model.topP === "number") {
      body.top_p = request.model.topP;
    }
    if (typeof request.model.frequencyPenalty === "number") {
      body.frequency_penalty = request.model.frequencyPenalty;
    }
    if (request.model.reasoningEffort) {
      body.reasoning = { effort: request.model.reasoningEffort };
    }
    if (request.model.verbosity) {
      body.text = { verbosity: request.model.verbosity };
    }

    return body;
  }
}

function mapUsage(
  usage:
    | {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      }
    | undefined
): TokenUsage | undefined {
  if (!usage) {
    return undefined;
  }
  return {
    inputTokens: usage.prompt_tokens,
    outputTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
  };
}

function stripThinkBlocks(text: string): { answer: string; reasoning: string[] } {
  const reasoning: string[] = [];
  let answer = text;
  const regex = /<think>([\s\S]*?)<\/think>/g;
  answer = answer.replace(regex, (_match, block) => {
    if (typeof block === "string" && block.trim()) {
      reasoning.push(block.trim());
    }
    return "";
  });
  return {
    answer: answer.trim(),
    reasoning,
  };
}
