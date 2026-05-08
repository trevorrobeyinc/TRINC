import type { ToolResult } from "./contracts";

export function presentMcpError(result: Extract<ToolResult<unknown>, { ok: false }>): string {
  const base = `[${result.error.code}] ${result.error.message}`;
  const retry = result.error.retryable ? " (retryable)" : "";
  const requestId = result.meta.requestId ? ` requestId=${result.meta.requestId}` : "";
  return `${base}${retry}${requestId}`;
}
