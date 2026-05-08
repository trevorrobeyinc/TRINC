import {
  selfHostTurnRequestSchema,
  type SelfHostTurnRequest,
} from "../types/selfHost.js";
import type { EmulatorEnv } from "../config/env.js";

export class CopilotRequestParser {
  constructor(private readonly env: EmulatorEnv) {}

  parse(input: unknown): SelfHostTurnRequest {
    const parsed = selfHostTurnRequestSchema.parse(input);
    const model = parsed.model ?? this.buildDefaultModel();
    const streamAllowed = parsed.runtimeLane === "fork_dev";
    const stream = streamAllowed ? Boolean(parsed.responseStyle.stream) : false;

    return {
      ...parsed,
      model,
      responseStyle: {
        ...parsed.responseStyle,
        stream,
      },
      messages: parsed.messages.map((message) => ({
        ...message,
        content: message.content.trim(),
      })),
      tools: parsed.tools.filter(
        (tool, index, allTools) =>
          allTools.findIndex((candidate) => candidate.runtimeName === tool.runtimeName) === index
      ),
    };
  }

  private buildDefaultModel(): NonNullable<SelfHostTurnRequest["model"]> {
    return {
      key: this.env.SELF_HOST_DEFAULT_MODEL_KEY,
      name: this.env.SELF_HOST_DEFAULT_MODEL_NAME,
      provider: this.env.SELF_HOST_DEFAULT_MODEL_PROVIDER,
      baseUrl: this.env.SELF_HOST_DEFAULT_MODEL_BASE_URL || undefined,
      apiKey: this.env.SELF_HOST_DEFAULT_MODEL_API_KEY || undefined,
      temperature: this.env.SELF_HOST_DEFAULT_MODEL_TEMPERATURE,
      maxTokens: this.env.SELF_HOST_DEFAULT_MODEL_MAX_TOKENS,
      topP: this.env.SELF_HOST_DEFAULT_MODEL_TOP_P,
      reasoningEffort: this.env.SELF_HOST_DEFAULT_MODEL_REASONING_EFFORT,
      verbosity: this.env.SELF_HOST_DEFAULT_MODEL_VERBOSITY,
      stream: this.env.SELF_HOST_DEFAULT_MODEL_STREAM,
      streamUsage: this.env.SELF_HOST_DEFAULT_MODEL_STREAM_USAGE,
      numCtx: this.env.SELF_HOST_DEFAULT_MODEL_NUM_CTX,
    };
  }
}
