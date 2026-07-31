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
  // Backend id the bridge routed each operation to; null = operation unavailable.
  operationMap: Record<Operation, string | null>;
  reasons: Record<Operation, string>;
}

export interface HealthResponse {
  status: string;
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
  backendUsed?: string;
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
  // backendHint retired 2026-07-31: the :8798 bridge is REST-only (2026-05-09) and
  // 400-rejects any hint except the literal "restApi" — never send the field.
  epochId?: number;
}
