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
}

export interface Backend {
  id: BackendId;
  probe(): Promise<BackendCapabilities>;
  execute(op: Operation, input: unknown, ctx: ExecutionContext): Promise<BackendResult>;
}
