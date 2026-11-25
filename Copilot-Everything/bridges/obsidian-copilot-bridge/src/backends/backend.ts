import type { BackendId, BackendResult, ExecutionContext, Operation } from "../types";

export interface BackendCapabilities {
  backend: BackendId;
  available: boolean;
  supportedOps: Operation[];
  reliabilityScore: number;
  p95MsByOp: Partial<Record<Operation, number>>;
  lastErrorAt?: string;
  constraints: string[];
  diagnostics?: Record<string, unknown>;
  /**
   * True when the backend cannot become available within this bridge process (no launcher pipe, a pipe that
   * closed, a launcher too old or serving another vault), so a call refused for it is not worth retrying.
   */
  permanent?: boolean;
}

export interface Backend {
  id: BackendId;
  probe(): Promise<BackendCapabilities>;
  execute(op: Operation, input: unknown, ctx: ExecutionContext): Promise<BackendResult>;
}
