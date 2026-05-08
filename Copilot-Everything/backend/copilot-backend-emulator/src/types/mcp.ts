export type BridgeBackendId = "cli";

export type BridgeOperation =
  | "open_vault"
  | "create_note"
  | "append_note"
  | "read_note"
  | "search_notes"
  | "execute_command";

export interface McpToolBinding {
  runtimeName: string;
  displayName: string;
  description: string;
  category: "mcp";
  isMutating?: boolean;
  requiresConfirmation?: boolean;
  bridge: {
    toolName: string;
    operation?: BridgeOperation;
    backendHint?: BridgeBackendId;
    serverId: string;
    httpEndpoint?: string;
    vaultName?: string;
    vaultRoot?: string;
  };
}

export interface BridgeToolRequest {
  tool: string;
  operation?: BridgeOperation;
  input?: Record<string, unknown>;
  backendHint?: BridgeBackendId;
}

export interface BridgeToolMeta {
  requestId: string;
  durationMs: number;
  backendUsed?: BridgeBackendId;
  epochId?: number;
  consistencyHint?: string;
}

export type BridgeToolResult<T = unknown> =
  | {
      ok: true;
      data: T;
      meta: BridgeToolMeta;
    }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        retryable: boolean;
        diagnostics?: Record<string, unknown>;
      };
      meta: BridgeToolMeta;
    };

export interface ExecutedToolCall {
  runtimeName: string;
  bridgeToolName: string;
  displayName: string;
  args: Record<string, unknown>;
  success: boolean;
  rawResult: string;
  displayResult: string;
  meta?: BridgeToolMeta;
}
