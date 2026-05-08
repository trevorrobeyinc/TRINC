export type BackendId = "cli" | "plugin";

export type Operation =
  | "open_vault"
  | "create_note"
  | "append_note"
  | "read_note"
  | "search_notes"
  | "execute_command";

export interface ToolError {
  code: string;
  message: string;
  retryable: boolean;
  diagnostics?: Record<string, unknown>;
}

export interface ToolMeta {
  requestId: string;
  durationMs: number;
  backendUsed?: BackendId;
  epochId?: number;
  consistencyHint?: string;
}

export type ToolSuccess<T> = {
  ok: true;
  data: T;
  meta: ToolMeta;
};

export type ToolFailure = {
  ok: false;
  error: ToolError;
  meta: ToolMeta;
};

export type ToolResult<T> = ToolSuccess<T> | ToolFailure;

export interface RequestContext {
  requestId: string;
  now: number;
  epochId: number;
}

export interface ExecutionContext extends RequestContext {
  timeoutMs: number;
}

export interface BackendResult {
  statusCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  parsed?: unknown;
}

export interface PlannerHint {
  operation: Operation;
  backendHint?: BackendId;
  epochId?: number;
}
