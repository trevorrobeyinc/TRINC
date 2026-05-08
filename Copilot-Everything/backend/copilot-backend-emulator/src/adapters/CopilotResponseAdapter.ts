import type { ExecutedToolCall } from "../types/mcp.js";
import type { SelfHostTurnRequest, SelfHostTurnSuccess } from "../types/selfHost.js";
import type { TokenUsage } from "../types/model.js";
import { ResponseTransformer } from "../services/ResponseTransformer.js";

export class CopilotResponseAdapter {
  constructor(private readonly transformer: ResponseTransformer) {}

  createLiveState() {
    return this.transformer.createLiveState();
  }

  addReasoningStep(
    state: ReturnType<ResponseTransformer["createLiveState"]>,
    summary: string
  ): string {
    return this.transformer.addReasoningStep(state, summary);
  }

  appendAssistantDelta(
    state: ReturnType<ResponseTransformer["createLiveState"]>,
    delta: string
  ): string {
    return this.transformer.appendAssistantDelta(state, delta);
  }

  setAssistantText(
    state: ReturnType<ResponseTransformer["createLiveState"]>,
    text: string
  ): string {
    return this.transformer.setAssistantText(state, text);
  }

  serializeDisplayContent(state: ReturnType<ResponseTransformer["createLiveState"]>): string {
    return this.transformer.serializeDisplayContent(state);
  }

  toSuccess(
    request: SelfHostTurnRequest,
    state: ReturnType<ResponseTransformer["createLiveState"]>,
    toolCalls: ExecutedToolCall[],
    sources: Array<{ title: string; path: string; score?: number; explanation?: unknown }>,
    tokenUsage?: TokenUsage
  ): SelfHostTurnSuccess {
    return this.transformer.buildSuccess(request, state, toolCalls, sources, tokenUsage);
  }
}
