export type BackendId = "cli";

export type Operation =
  | "open_vault"
  | "create_note"
  | "append_note"
  | "read_note"
  | "search_notes"
  | "execute_command";

export interface PlannerState {
  epochId: number;
  refreshedAt: number;
  operationMap: Record<Operation, BackendId | null>;
  reasons: Record<Operation, string>;
}

export interface HealthResponse {
  backends: {
    cli: { capabilities: Record<string, unknown> };
  };
  routing: PlannerState;
  security: {
    transportMode: string;
    corsDisabled: boolean;
    replayGuardEnabled: boolean;
    tokenEntropyBits: number;
  };
  metrics: Record<string, unknown>;
}

export interface ToolMeta {
  requestId: string;
  durationMs: number;
  backendUsed?: BackendId;
  epochId?: number;
  consistencyHint?: string;
}

export type ToolResult<T> =
  | {
      ok: true;
      data: T;
      meta: ToolMeta;
    }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        retryable: boolean;
        diagnostics?: Record<string, unknown>;
      };
      meta: ToolMeta;
    };

export interface MCPToolRequest<TInput> {
  tool: string;
  operation: Operation;
  input: TInput;
  backendHint?: BackendId;
  epochId?: number;
}
