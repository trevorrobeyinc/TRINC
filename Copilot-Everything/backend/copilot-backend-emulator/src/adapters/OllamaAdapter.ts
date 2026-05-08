import type {
  TextGenerationRequest,
  TextGenerationResult,
  TextStreamCallbacks,
  TokenUsage,
} from "../types/model.js";

export class OllamaAdapter {
  async generateText(request: TextGenerationRequest): Promise<TextGenerationResult> {
    const response = await fetch(this.getEndpoint(request), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(request.model.apiKey ? { Authorization: `Bearer ${request.model.apiKey}` } : {}),
      },
      body: JSON.stringify(this.buildBody(request, false)),
      signal: request.signal,
    });

    const json = (await response.json()) as {
      message?: { content?: string };
      prompt_eval_count?: number;
      eval_count?: number;
    };

    return {
      text: json.message?.content?.trim() || "",
      usage: mapOllamaUsage(json.prompt_eval_count, json.eval_count),
    };
  }

  async streamText(
    request: TextGenerationRequest,
    callbacks: TextStreamCallbacks
  ): Promise<TextGenerationResult> {
    const response = await fetch(this.getEndpoint(request), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(request.model.apiKey ? { Authorization: `Bearer ${request.model.apiKey}` } : {}),
      },
      body: JSON.stringify(this.buildBody(request, true)),
      signal: callbacks.signal ?? request.signal,
    });

    if (!response.body) {
      return await this.generateText(request);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let aggregated = "";
    let usage: TokenUsage | undefined;

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }

        const parsed = JSON.parse(trimmed) as {
          message?: { content?: string };
          done?: boolean;
          prompt_eval_count?: number;
          eval_count?: number;
        };

        const token = parsed.message?.content ?? "";
        if (token) {
          aggregated += token;
          callbacks.onToken(token);
        }

        if (parsed.done) {
          usage = mapOllamaUsage(parsed.prompt_eval_count, parsed.eval_count);
        }
      }
    }

    return {
      text: aggregated.trim(),
      usage,
    };
  }

  private getEndpoint(request: TextGenerationRequest): string {
    const baseUrl = (request.model.baseUrl?.trim() || "http://127.0.0.1:11434").replace(/\/+$/, "");
    return `${baseUrl}/api/chat`;
  }

  private buildBody(request: TextGenerationRequest, stream: boolean): Record<string, unknown> {
    const options: Record<string, unknown> = {};
    if (typeof request.model.temperature === "number") {
      options.temperature = request.model.temperature;
    }
    if (typeof request.model.topP === "number") {
      options.top_p = request.model.topP;
    }
    if (typeof request.model.frequencyPenalty === "number") {
      options.repeat_penalty = request.model.frequencyPenalty;
    }
    if (typeof request.model.numCtx === "number") {
      options.num_ctx = request.model.numCtx;
    }

    return {
      model: request.model.name,
      stream,
      messages: request.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      options,
    };
  }
}

function mapOllamaUsage(promptEvalCount?: number, evalCount?: number): TokenUsage | undefined {
  if (typeof promptEvalCount !== "number" && typeof evalCount !== "number") {
    return undefined;
  }
  return {
    inputTokens: promptEvalCount,
    outputTokens: evalCount,
    totalTokens: (promptEvalCount ?? 0) + (evalCount ?? 0),
  };
}
