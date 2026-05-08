import type { ExecutedToolCall } from "../types/mcp.js";
import type {
  SelfHostTurnRequest,
  SelfHostTurnSuccess,
} from "../types/selfHost.js";
import type { TokenUsage } from "../types/model.js";

type LiveState = {
  reasoningSteps: string[];
  assistantText: string;
};

export class ResponseTransformer {
  createLiveState(): LiveState {
    return {
      reasoningSteps: [],
      assistantText: "",
    };
  }

  addReasoningStep(state: LiveState, summary: string): string {
    state.reasoningSteps.push(summary);
    return this.serializeDisplayContent(state);
  }

  appendAssistantDelta(state: LiveState, delta: string): string {
    state.assistantText += delta;
    return this.serializeDisplayContent(state);
  }

  setAssistantText(state: LiveState, text: string): string {
    state.assistantText = text;
    return this.serializeDisplayContent(state);
  }

  serializeDisplayContent(state: LiveState): string {
    const reasoningMarkup = `<!--AGENT_REASONING:complete:0:${JSON.stringify(state.reasoningSteps)}-->`;
    return state.assistantText.trim()
      ? `${reasoningMarkup}\n\n${state.assistantText.trim()}`
      : reasoningMarkup;
  }

  buildSuccess(
    request: SelfHostTurnRequest,
    state: LiveState,
    toolCalls: ExecutedToolCall[],
    sources: Array<{ title: string; path: string; score?: number; explanation?: unknown }>,
    tokenUsage?: TokenUsage
  ): SelfHostTurnSuccess {
    const content = this.serializeDisplayContent(state);
    return {
      ok: true,
      mode: "exact_backend_emulator",
      requestId: request.requestId,
      assistant: {
        content,
        reply: state.assistantText.trim(),
        sources,
        trace: {
          reasoning: state.reasoningSteps.map((summary) => ({ summary })),
          toolCalls,
        },
        ...(tokenUsage ? { tokenUsage } : {}),
      },
      responseMetadata: {
        wasTruncated: false,
        ...(tokenUsage ? { tokenUsage } : {}),
      },
      meta: {
        modelProvider: request.model.provider,
        modelName: request.model.name,
        executionMode: "exact_backend_emulator",
        toolCount: toolCalls.length,
        usedTools: toolCalls.length > 0,
      },
    };
  }
}
