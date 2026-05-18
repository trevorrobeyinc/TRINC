import type { RuntimeContext } from "../context";
import type { BackendId, Operation, ToolResult } from "../../types";
import { buildFailure } from "../errors";
import { parseJsonFromNoisyStdout } from "../../parsing/cliOutputParser";
import { AppError } from "../errors";
import { ERROR_CODES } from "../errorCodes";

export interface ToolRequest<TInput extends Record<string, unknown>> {
  requestId: string;
  operation: Operation;
  epochId?: number;
  backendHint?: BackendId;
  input: TInput;
}

function noteKey(input: Record<string, unknown>): string | null {
  const vault = typeof input.vault === "string" ? input.vault : "";
  const path = typeof input.path === "string" ? input.path : typeof input.file === "string" ? input.file : "";
  if (!vault || !path) {
    return null;
  }
  return `${vault}:${path}`;
}

export async function executeBackendOperation<T>(
  runtime: RuntimeContext,
  request: ToolRequest<Record<string, unknown>>,
  transform: (stdout: string) => T,
  lane: "interactive" | "mutating"
): Promise<ToolResult<T>> {
  const started = Date.now();
  runtime.metrics.increment("requests_total", { op: request.operation });
  let selectedBackend: BackendId | undefined;

  try {
    const key = noteKey(request.input);
    const pinned =
      request.operation === "read_note" && key
        ? runtime.readPins.get(key)
        : undefined;

    const backend = pinned
      ? await runtime.selector.selectSpecific(request.operation, pinned, request.epochId)
      : await runtime.selector.select(request.operation, request.epochId, request.backendHint);
    selectedBackend = backend.id;
    runtime.metrics.increment("requests_total", { backend: backend.id, op: request.operation });
    const timeoutMs =
      request.operation === "open_vault"
        ? runtime.config.timeouts.openVaultMs
        : request.operation === "create_note"
          ? runtime.config.timeouts.createNoteMs
          : request.operation === "append_note"
            ? runtime.config.timeouts.appendNoteMs
            : request.operation === "read_note"
              ? runtime.config.timeouts.readNoteMs
              : runtime.config.timeouts.searchNotesMs;

    const result = await runtime.withWriteLock(
      lane === "mutating"
        ? `${String(request.input.vault ?? "")}:${String(request.input.path ?? request.input.file ?? "")}`
        : `read:${request.requestId}`,
      async () =>
        await backend.execute(request.operation, request.input, {
          requestId: request.requestId,
          now: started,
          epochId: runtime.selector.currentSnapshot().epochId,
          timeoutMs,
        })
    );

    runtime.metrics.observeLatency("latency_ms", result.durationMs, {
      backend: backend.id,
      op: request.operation,
    });
    runtime.metrics.observeLatency("latency_ms_all", result.durationMs, { op: request.operation });

    const durationMs = Date.now() - started;
    if (durationMs > runtime.config.logging.slowThresholdMs[request.operation]) {
      runtime.logger.warn("slow_operation", {
        requestId: request.requestId,
        op: request.operation,
        backend: backend.id,
        durationMs,
      });
    }

    if (lane === "mutating" && key) {
      runtime.readPins.pin(key, backend.id);
    }

    return {
      ok: true,
      data: transform(result.stdout),
      meta: {
        requestId: request.requestId,
        durationMs,
        backendUsed: backend.id,
        epochId: runtime.selector.currentSnapshot().epochId,
        consistencyHint: lane === "mutating" ? "strict-fifo-per-note" : pinned ? "read-after-write-pinned<=2s" : "eventual-cross-backend<=2s",
      },
    };
  } catch (error) {
    const appError = error instanceof AppError ? error : new AppError(ERROR_CODES.INTERNAL_ERROR, String(error));
    runtime.metrics.recordFailure(selectedBackend ?? request.backendHint ?? "restApi", request.operation, appError.code);
    return buildFailure(appError, {
      requestId: request.requestId,
      durationMs: Date.now() - started,
      epochId: runtime.selector.currentSnapshot().epochId,
    });
  }
}

export function parseJsonOutput<T>(stdout: string): T {
  return parseJsonFromNoisyStdout(stdout) as T;
}
