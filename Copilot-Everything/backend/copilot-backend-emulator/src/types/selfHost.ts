import { z } from "zod";
import type { CanonicalChatMessage, ResolvedModelConfig, TokenUsage } from "./model.js";
import type { BridgeOperation, McpToolBinding } from "./mcp.js";

export const canonicalChatMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string(),
});

export const resolvedModelSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  provider: z.string().min(1),
  baseUrl: z.string().optional(),
  apiKey: z.string().optional(),
  openAIOrgId: z.string().optional(),
  azureOpenAIApiInstanceName: z.string().optional(),
  azureOpenAIApiDeploymentName: z.string().optional(),
  azureOpenAIApiVersion: z.string().optional(),
  temperature: z.number().optional(),
  maxTokens: z.number().int().positive().optional(),
  topP: z.number().optional(),
  frequencyPenalty: z.number().optional(),
  reasoningEffort: z.string().optional(),
  verbosity: z.string().optional(),
  stream: z.boolean().optional(),
  streamUsage: z.boolean().optional(),
  numCtx: z.number().int().positive().optional(),
  useResponsesApi: z.boolean().optional(),
  capabilities: z.array(z.string()).optional(),
});

export const mcpToolBindingSchema = z.object({
  runtimeName: z.string().min(1),
  displayName: z.string().min(1),
  description: z.string().min(1),
  category: z.literal("mcp"),
  isMutating: z.boolean().optional(),
  requiresConfirmation: z.boolean().optional(),
  bridge: z.object({
    toolName: z.string().min(1),
    operation: z
      .enum([
        "open_vault",
        "create_note",
        "append_note",
        "read_note",
        "search_notes",
        "execute_command",
      ])
      .optional(),
    backendHint: z.enum(["cli"]).optional(),
    serverId: z.string().min(1),
    httpEndpoint: z.string().optional(),
    vaultName: z.string().optional(),
    vaultRoot: z.string().optional(),
  }),
});

export const citedSourceSchema = z.object({
  title: z.string(),
  path: z.string(),
  score: z.number().optional(),
  explanation: z.unknown().optional(),
});

export const runtimeLaneSchema = z.enum([
  "production_official",
  "fork_dev",
  "raycast",
]);

export const selfHostTurnRequestSchema = z.object({
  requestId: z.string().min(1),
  executionMode: z.literal("exact_backend_emulator"),
  runtimeLane: runtimeLaneSchema.default("fork_dev"),
  chainType: z.string().min(1),
  rawUserMessage: z.string().min(1),
  originalUserMessage: z.string().optional(),
  messages: z.array(canonicalChatMessageSchema).min(1),
  model: resolvedModelSchema.optional(),
  tools: z.array(mcpToolBindingSchema).default([]),
  responseStyle: z.object({
    stream: z.boolean().default(false),
    includeReasoning: z.boolean().default(true),
  }),
  contextEnvelope: z.unknown().optional(),
  retrieval: z
    .object({
      mode: z.string().optional(),
      sources: z.array(citedSourceSchema).default([]),
    })
    .optional(),
  project: z
    .object({
      id: z.string().optional(),
      name: z.string().optional(),
    })
    .optional(),
  debug: z.boolean().optional(),
});

export const tokenUsageSchema = z.object({
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  totalTokens: z.number().optional(),
});

export const reasoningStepSchema = z.object({
  summary: z.string(),
});

export const toolTraceSchema = z.object({
  runtimeName: z.string(),
  bridgeToolName: z.string(),
  displayName: z.string(),
  args: z.record(z.unknown()),
  success: z.boolean(),
  rawResult: z.string(),
  displayResult: z.string(),
  meta: z
    .object({
      requestId: z.string(),
      durationMs: z.number(),
      backendUsed: z.enum(["cli"]).optional(),
      epochId: z.number().optional(),
      consistencyHint: z.string().optional(),
    })
    .optional(),
});

export const selfHostTurnSuccessSchema = z.object({
  ok: z.literal(true),
  mode: z.literal("exact_backend_emulator"),
  requestId: z.string(),
  assistant: z.object({
    content: z.string(),
    reply: z.string(),
    sources: z.array(citedSourceSchema).default([]),
    trace: z.object({
      reasoning: z.array(reasoningStepSchema),
      toolCalls: z.array(toolTraceSchema),
    }),
    tokenUsage: tokenUsageSchema.optional(),
  }),
  responseMetadata: z.object({
    wasTruncated: z.boolean().default(false),
    tokenUsage: tokenUsageSchema.optional(),
  }),
  meta: z.object({
    modelProvider: z.string(),
    modelName: z.string(),
    executionMode: z.literal("exact_backend_emulator"),
    toolCount: z.number().int(),
    usedTools: z.boolean(),
  }),
});

export const selfHostErrorSchema = z.object({
  ok: z.literal(false),
  mode: z.literal("exact_backend_emulator"),
  requestId: z.string().optional(),
  error: z.object({
    code: z.string(),
    message: z.string(),
    retryable: z.boolean(),
    details: z.record(z.unknown()).optional(),
  }),
});

export const streamEventSchema = z.object({
  type: z.enum([
    "reasoning_step",
    "tool_call_start",
    "tool_call_result",
    "assistant_delta",
    "final",
    "error",
  ]),
  data: z.record(z.unknown()),
});

type ParsedSelfHostTurnRequest = z.infer<typeof selfHostTurnRequestSchema>;
export type SelfHostTurnRequest = Omit<ParsedSelfHostTurnRequest, "model"> & {
  model: z.infer<typeof resolvedModelSchema>;
};
export type SelfHostTurnSuccess = z.infer<typeof selfHostTurnSuccessSchema>;
export type SelfHostTurnError = z.infer<typeof selfHostErrorSchema>;
export type StreamEvent = z.infer<typeof streamEventSchema>;
export type RuntimeLane = z.infer<typeof runtimeLaneSchema>;

export type CanonicalSelfHostChatMessage = CanonicalChatMessage;
export type CanonicalSelfHostModel = ResolvedModelConfig;
export type CanonicalMcpToolBinding = McpToolBinding;
export type CanonicalBridgeOperation = BridgeOperation;
export type CanonicalTokenUsage = TokenUsage;
