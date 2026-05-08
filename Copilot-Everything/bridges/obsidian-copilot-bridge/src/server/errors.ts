import { randomUUID } from "node:crypto";
import { ERROR_CODES, type ErrorCode } from "./errorCodes";
import type { ToolFailure, ToolMeta } from "../types";

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;
  readonly diagnostics?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, retryable = false, diagnostics?: Record<string, unknown>) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.retryable = retryable;
    this.diagnostics = diagnostics;
  }
}

export function ensureError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }
  if (error instanceof Error) {
    return new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);
  }
  return new AppError(ERROR_CODES.INTERNAL_ERROR, String(error));
}

export function buildFailure(error: unknown, partialMeta?: Partial<ToolMeta>): ToolFailure {
  const appError = ensureError(error);
  const meta: ToolMeta = {
    requestId: partialMeta?.requestId ?? randomUUID(),
    durationMs: partialMeta?.durationMs ?? 0,
    backendUsed: partialMeta?.backendUsed,
    consistencyHint: partialMeta?.consistencyHint,
    epochId: partialMeta?.epochId,
  };

  return {
    ok: false,
    error: {
      code: appError.code,
      message: appError.message,
      retryable: appError.retryable,
      diagnostics: appError.diagnostics,
    },
    meta,
  };
}
