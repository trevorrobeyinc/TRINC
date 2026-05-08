import type { ModelGateway } from "./ModelGateway.js";
import type { McpOrchestrator } from "./McpOrchestrator.js";
import type { ToolRouter } from "./ToolRouter.js";
import type { CopilotResponseAdapter } from "../adapters/CopilotResponseAdapter.js";
import type {
  SelfHostTurnRequest,
  SelfHostTurnSuccess,
} from "../types/selfHost.js";
import type { ExecutedToolCall } from "../types/mcp.js";

export interface ExecutionEventHandler {
  onReasoningStep?: (summary: string, displayContent: string) => void;
  onToolCallStart?: (
    toolName: string,
    displayName: string,
    args: Record<string, unknown>,
    displayContent: string
  ) => void;
  onToolCallResult?: (
    toolName: string,
    success: boolean,
    displayResult: string,
    displayContent: string
  ) => void;
  onAssistantDelta?: (delta: string, displayContent: string) => void;
}

export class SelfHostExecutionEngine {
  constructor(
    private readonly modelGateway: ModelGateway,
    private readonly mcpOrchestrator: McpOrchestrator,
    private readonly toolRouter: ToolRouter,
    private readonly responseAdapter: CopilotResponseAdapter
  ) {}

  async execute(
    request: SelfHostTurnRequest,
    callbacks?: ExecutionEventHandler,
    signal?: AbortSignal
  ): Promise<SelfHostTurnSuccess> {
    const liveState = this.responseAdapter.createLiveState();
    const toolCalls: ExecutedToolCall[] = [];
    const sources = request.retrieval?.sources ?? [];
    let totalTokenUsage: Required<{
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
    }> = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    const planningTools = this.toolRouter.getPlanningTools(
      request.rawUserMessage,
      request.tools
    );

    const emitReasoning = (summary: string) => {
      const displayContent = this.responseAdapter.addReasoningStep(liveState, summary);
      callbacks?.onReasoningStep?.(summary, displayContent);
    };

    emitReasoning("Analyzing request");

    const preflight = await this.mcpOrchestrator.runPreFlightIntentCheck(
      request,
      planningTools,
      signal
    );
    if (preflight.toolCall) {
      toolCalls.push(preflight.toolCall);
      emitReasoning(preflight.toolCall.displayResult);
    }

    const rawPlan = await this.planToolCalls(request, planningTools, signal);
    const { result: readAugmented, injectedReads } = this.toolRouter.augmentWithReadIntent(
      request.rawUserMessage,
      planningTools,
      rawPlan.toolCalls
    );
    if (injectedReads.length > 0) {
      emitReasoning(`Read-intent augmentation injected read for: ${injectedReads.join(", ")}`);
    }
    const { result: augmentedCalls, injected, writeIntentDetected } = this.toolRouter.augmentWithWriteIntent(
      request.rawUserMessage,
      planningTools,
      readAugmented
    );
    if (injected) {
      emitReasoning(`Write-intent augmentation injected ${injected}`);
    }
    const planned = { toolCalls: augmentedCalls, usage: rawPlan.usage };
    totalTokenUsage = sumUsage(totalTokenUsage, planned.usage);
    const hasSuccessfulPreflightMiyo =
      preflight.toolCall?.bridgeToolName === "miyo_search_context" &&
      preflight.toolCall.success;

    // Deferred writes: write tools with sentinel content are held until after the LLM
    // streams its response, so the note contains the polished summary instead of raw results.
    const deferredWrites: Array<{
      binding: (typeof planningTools)[number];
      args: Record<string, unknown>;
    }> = [];

    for (const toolPlan of planned.toolCalls) {
      const binding = this.toolRouter.resolveBinding(toolPlan.runtimeName, planningTools);
      if (!binding) {
        continue;
      }

      if (binding.requiresConfirmation) {
        toolCalls.push({
          runtimeName: binding.runtimeName,
          bridgeToolName: binding.bridge.toolName,
          displayName: binding.displayName,
          args: toolPlan.args,
          success: false,
          rawResult:
            `Tool "${binding.displayName}" requires user confirmation and cannot be ` +
            "executed in exact-emulator mode. The note was NOT created or modified.",
          displayResult: `Skipped: "${binding.displayName}" requires confirmation.`,
        });
        emitReasoning(`Skipped ${binding.displayName} (requires confirmation)`);
        continue;
      }

      if (
        hasSuccessfulPreflightMiyo &&
        binding.bridge.toolName === "miyo_search_context"
      ) {
        continue;
      }

      // Enrich read tools: extract referenced note path if planner omitted it
      if (binding.bridge.toolName === "obsidian_read_note" && !toolPlan.args.path) {
        const refs = this.toolRouter.extractReferencedNoteNames(request.rawUserMessage);
        if (refs.length > 0) {
          const noteName = refs[0];
          toolPlan.args.path = noteName.endsWith(".md") ? noteName : `${noteName}.md`;
        }
      }

      // Always defer write tools — the LLM's polished response is always better content
      if (
        binding.bridge.toolName === "obsidian_create_note" ||
        binding.bridge.toolName === "obsidian_append_note"
      ) {
        if (!toolPlan.args.path) {
          toolPlan.args.path = this.toolRouter.extractNotePath(request.rawUserMessage)
            ?? `Copilot Note ${new Date().toISOString().split("T")[0]}.md`;
        }
        toolPlan.args.content = "__PENDING_FROM_SEARCH_RESULTS__";
        deferredWrites.push({ binding, args: { ...toolPlan.args } });
        emitReasoning(`Deferred ${binding.displayName} until after summary`);
        continue;
      }

      let toolArgs = toolPlan.args;
      if (
        binding.bridge.toolName === "miyo_search_context" &&
        (toolPlan.args.query === undefined || String(toolPlan.args.query).trim().length === 0)
      ) {
        toolArgs = { ...toolPlan.args, query: request.rawUserMessage, limit: toolPlan.args.limit ?? 5 };
      }

      emitReasoning(`Calling ${binding.displayName}`);
      const startDisplay = this.responseAdapter.serializeDisplayContent(liveState);
      callbacks?.onToolCallStart?.(
        binding.runtimeName,
        binding.displayName,
        toolArgs,
        startDisplay
      );

      const result = await this.mcpOrchestrator.executeToolCall(binding, toolArgs, signal);
      toolCalls.push(result);

      const resultDisplay = this.responseAdapter.serializeDisplayContent(liveState);
      callbacks?.onToolCallResult?.(
        binding.runtimeName,
        result.success,
        result.displayResult,
        resultDisplay
      );
      emitReasoning(result.displayResult);
    }

    emitReasoning(toolCalls.length > 0 ? "Drafting final response" : "Generating response");

    const finalPrompt = this.buildFinalMessages(
      request,
      toolCalls,
      preflight.contextBlock
    );
    const answer = await this.modelGateway.streamText(
      {
        model: request.model,
        messages: finalPrompt,
        signal,
      },
      {
        signal,
        onToken: (delta) => {
          const displayContent = this.responseAdapter.appendAssistantDelta(liveState, delta);
          callbacks?.onAssistantDelta?.(delta, displayContent);
        },
      }
    );

    totalTokenUsage = sumUsage(totalTokenUsage, answer.usage);

    if (!answer.text || answer.text.trim().length === 0) {
      throw new Error(
        "Model returned empty response text. This usually means the model API key " +
        "is missing or invalid. Check that the provider credentials are configured " +
        `correctly for model "${request.model.name}" (provider: ${request.model.provider}).`
      );
    }

    // Replace raw streamed text (which may contain <think> blocks) with the
    // properly stripped version from the adapter.
    this.responseAdapter.setAssistantText(liveState, answer.text);

    // Execute deferred writes now that we have the LLM's polished summary
    for (const deferred of deferredWrites) {
      deferred.args.content = liveState.assistantText.trim();
      deferred.args.overwrite = true;
      emitReasoning(`Creating note with summary`);
      const result = await this.mcpOrchestrator.executeToolCall(
        deferred.binding,
        deferred.args,
        signal
      );
      toolCalls.push(result);
      emitReasoning(result.displayResult);
    }

    // Show disclaimer only when a write was clearly intended but no write tool
    // was available at all (e.g. MCP disabled, no server configured).
    const anyMutatingSucceeded = toolCalls.some(
      (tc) =>
        tc.success &&
        (tc.bridgeToolName.includes("create_note") || tc.bridgeToolName.includes("append_note"))
    );
    const anyMutatingAvailable = request.tools.some((t) => t.isMutating);
    if (writeIntentDetected && !anyMutatingAvailable && !anyMutatingSucceeded) {
      const disclaimer =
        "\n\n---\n\n> **Note:** No note was created or modified. " +
        "Write tools were not available for this turn. Check that MCP is enabled " +
        "and a server with write-capable tools is configured in Copilot Settings → MCP.";
      this.responseAdapter.appendAssistantDelta(liveState, disclaimer);
    }

    return this.responseAdapter.toSuccess(
      request,
      liveState,
      toolCalls,
      sources,
      totalTokenUsage.totalTokens ? totalTokenUsage : undefined
    );
  }

  private async planToolCalls(
    request: SelfHostTurnRequest,
    tools: SelfHostTurnRequest["tools"],
    signal?: AbortSignal
  ): Promise<{
    toolCalls: Array<{ runtimeName: string; args: Record<string, unknown> }>;
    usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
  }> {
    if (tools.length === 0) {
      return { toolCalls: [] };
    }

    const plannerPrompt = [
      {
        role: "system" as const,
        content:
          "You are the MCP tool planner for a self-host Copilot backend emulator. " +
          "Return strict JSON only with shape " +
          '{"reasoning":"short summary","toolCalls":[{"toolName":"runtime tool name","arguments":{}}]}. ' +
          "Choose no tools when the request can be answered without MCP.",
      },
      ...request.messages,
      {
        role: "user" as const,
        content:
          `Available MCP tools:\n${this.toolRouter.describeTools(tools)}\n\n` +
          `Latest user request: ${request.rawUserMessage}`,
      },
    ];

    const plan = await this.modelGateway.generateText({
      model: request.model,
      messages: plannerPrompt,
      signal,
    });

    const parsed = parseToolPlan(plan.text);
    if (parsed.toolCalls.length > 0) {
      return {
        toolCalls: parsed.toolCalls,
        usage: plan.usage,
      };
    }

    return {
      toolCalls: this.toolRouter.chooseFallbackTool(request.rawUserMessage, tools),
      usage: plan.usage,
    };
  }

  private buildFinalMessages(
    request: SelfHostTurnRequest,
    toolCalls: ExecutedToolCall[],
    preflightContext?: string
  ): SelfHostTurnRequest["messages"] {
    if (toolCalls.length === 0 && !preflightContext) {
      return request.messages;
    }

    const toolSummary = toolCalls
      .map(
        (tool) =>
          `<tool_result name="${tool.displayName}" success="${tool.success}">\n${tool.rawResult}\n</tool_result>`
      )
      .join("\n\n");

    const contextPrefix = preflightContext
      ? `Use this semantic vault context when relevant:\n\n${preflightContext}\n\n`
      : "";

    const followupContent = toolSummary
      ? `${contextPrefix}Use the following MCP tool results to answer the request accurately.\n\n${toolSummary}`
      : `${contextPrefix}Use the semantic vault context above when relevant to answer accurately.`;

    return [...request.messages, { role: "user", content: followupContent }];
  }

  private assembleNoteContent(
    rawUserMessage: string,
    toolCalls: ExecutedToolCall[]
  ): string {
    const searchResults = toolCalls
      .filter((tc) => tc.success && tc.bridgeToolName.includes("search"))
      .map((tc) => {
        // Try to extract structured matches from raw result JSON
        try {
          const parsed = JSON.parse(tc.rawResult);
          if (parsed.matches && Array.isArray(parsed.matches)) {
            return parsed.matches
              .slice(0, 10)
              .map((m: { path?: string; score?: number }) =>
                `- [[${m.path?.replace(/\.md$/, "") ?? "unknown"}]]${m.score ? ` (score: ${m.score})` : ""}`
              )
              .join("\n");
          }
        } catch {
          // Not JSON — use displayResult as fallback
        }
        return tc.displayResult;
      })
      .join("\n\n");

    if (!searchResults) {
      return `# Vault Search Summary\n\nQuery: ${rawUserMessage}\n\nNo search results available.`;
    }

    const lines = [
      "# Vault Search Summary",
      "",
      `> Auto-generated by Copilot exact-emulator on ${new Date().toISOString().split("T")[0]}`,
      "",
      `## Query`,
      "",
      rawUserMessage,
      "",
      "## Results",
      "",
      searchResults.slice(0, 3000),
    ];
    return lines.join("\n");
  }
}

function parseToolPlan(text: string): {
  reasoning?: string;
  toolCalls: Array<{ runtimeName: string; args: Record<string, unknown> }>;
} {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    return { toolCalls: [] };
  }

  try {
    const parsed = JSON.parse(match[0]) as {
      reasoning?: string;
      toolCalls?: Array<{ toolName?: string; arguments?: Record<string, unknown> }>;
    };

    return {
      reasoning: parsed.reasoning,
      toolCalls: (parsed.toolCalls ?? [])
        .filter((toolCall) => typeof toolCall.toolName === "string")
        .map((toolCall) => ({
          runtimeName: toolCall.toolName as string,
          args: toolCall.arguments ?? {},
        })),
    };
  } catch {
    return { toolCalls: [] };
  }
}

function sumUsage(
  current: { inputTokens: number; outputTokens: number; totalTokens: number },
  next?: { inputTokens?: number; outputTokens?: number; totalTokens?: number }
) {
  if (!next) {
    return current;
  }

  return {
    inputTokens: (current.inputTokens ?? 0) + (next.inputTokens ?? 0),
    outputTokens: (current.outputTokens ?? 0) + (next.outputTokens ?? 0),
    totalTokens:
      (current.totalTokens ?? 0) +
      (next.totalTokens ?? next.inputTokens ?? 0) +
      (next.totalTokens ? 0 : next.outputTokens ?? 0),
  };
}
