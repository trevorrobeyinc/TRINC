import type { PromptContextEnvelope } from "@/context/PromptContextTypes";
import type { ResponseMetadata } from "@/types/message";

export type SelfHostExecutionMode =
  | "direct_plugin_mcp"
  | "exact_backend_emulator"
  | "direct_obsidian_vaultzk";
export type SelfHostRuntimeLane = "production_official" | "fork_dev" | "raycast";

export interface SelfHostChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface SelfHostModelSpec {
  key: string;
  name: string;
  provider: string;
  baseUrl?: string;
  apiKey?: string;
  openAIOrgId?: string;
  azureOpenAIApiInstanceName?: string;
  azureOpenAIApiDeploymentName?: string;
  azureOpenAIApiVersion?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  reasoningEffort?: string;
  verbosity?: string;
  stream?: boolean;
  streamUsage?: boolean;
  numCtx?: number;
  useResponsesApi?: boolean;
  capabilities?: string[];
}

export interface SelfHostMcpToolBinding {
  runtimeName: string;
  displayName: string;
  description: string;
  category: "mcp";
  isMutating?: boolean;
  requiresConfirmation?: boolean;
  bridge: {
    toolName: string;
    operation?:
      | "open_vault"
      | "create_note"
      | "append_note"
      | "read_note"
      | "search_notes"
      | "execute_command";
    backendHint?: "cli";
    serverId: string;
    httpEndpoint?: string;
    vaultName?: string;
    vaultRoot?: string;
  };
}

export interface SelfHostTurnRequest {
  requestId: string;
  executionMode: "exact_backend_emulator";
  runtimeLane: SelfHostRuntimeLane;
  chainType: string;
  rawUserMessage: string;
  originalUserMessage?: string;
  messages: SelfHostChatMessage[];
  model: SelfHostModelSpec;
  tools: SelfHostMcpToolBinding[];
  responseStyle: {
    stream: boolean;
    includeReasoning: boolean;
  };
  contextEnvelope?: PromptContextEnvelope;
  retrieval?: {
    mode?: string;
    sources?: Array<{ title: string; path: string; score?: number; explanation?: any }>;
  };
  project?: {
    id?: string;
    name?: string;
  };
  debug?: boolean;
}

export interface SelfHostToolTrace {
  runtimeName: string;
  bridgeToolName: string;
  displayName: string;
  args: Record<string, unknown>;
  success: boolean;
  rawResult: string;
  displayResult: string;
  meta?: {
    requestId: string;
    durationMs: number;
    backendUsed?: "cli";
    epochId?: number;
    consistencyHint?: string;
  };
}

export interface SelfHostTurnSuccessResponse {
  ok: true;
  mode: "exact_backend_emulator";
  requestId: string;
  assistant: {
    content: string;
    reply: string;
    sources: Array<{ title: string; path: string; score?: number; explanation?: any }>;
    trace: {
      reasoning: Array<{ summary: string }>;
      toolCalls: SelfHostToolTrace[];
    };
    tokenUsage?: ResponseMetadata["tokenUsage"];
  };
  responseMetadata: ResponseMetadata;
  meta: {
    modelProvider: string;
    modelName: string;
    executionMode: "exact_backend_emulator";
    toolCount: number;
    usedTools: boolean;
  };
}

export interface SelfHostTurnErrorResponse {
  ok: false;
  mode: "exact_backend_emulator";
  requestId?: string;
  error: {
    code: string;
    message: string;
    retryable: boolean;
    details?: Record<string, unknown>;
  };
}

export interface SelfHostStreamHandlers {
  onDisplayContent?: (content: string) => void;
  onReasoningStep?: (summary: string, content: string) => void;
  onToolCallStart?: (
    toolName: string,
    displayName: string,
    args: Record<string, unknown>,
    content: string
  ) => void;
  onToolCallResult?: (
    toolName: string,
    success: boolean,
    displayResult: string,
    content: string
  ) => void;
  onAssistantDelta?: (delta: string, content: string) => void;
}
