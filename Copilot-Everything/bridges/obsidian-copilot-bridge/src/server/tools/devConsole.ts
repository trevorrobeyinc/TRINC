import { z } from "zod";
import type { RuntimeContext } from "../context";
import type { BackendId, ToolResult } from "../../types";
import { AppError, buildFailure } from "../errors";
import { ERROR_CODES } from "../errorCodes";

const logsInputSchema = z
  .object({
    levels: z
      .array(z.enum(["log", "info", "warn", "error", "debug"]))
      .optional(),
    limit: z.number().int().positive().max(2000).optional(),
    sinceMs: z.number().int().nonnegative().optional(),
  })
  .strict();

const evalInputSchema = z
  .object({
    code: z.string().min(1).max(8192),
    timeoutMs: z.number().int().positive().max(10_000).optional(),
  })
  .strict();

interface ConsoleLogEntry {
  level: "log" | "info" | "warn" | "error" | "debug";
  ts: number;
  message: string;
  origin?: string;
}

interface LogsResponse {
  entries: ConsoleLogEntry[];
  totalCaptured: number;
  bufferCapacity: number;
}

interface EvalResponse {
  result: unknown;
  type: string;
  durationMs: number;
}

function requireIpc(runtime: RuntimeContext, requestId: string): void {
  if (!runtime.launcherIpc) {
    throw new AppError(
      ERROR_CODES.LAUNCHER_IPC_UNAVAILABLE,
      "Dev console tools require the bridge to be spawned by the obsidian-bridge-launcher plugin (no fd-3 IPC channel detected)."
    );
  }
}

const startedAt = () => Date.now();
const elapsed = (s: number) => Date.now() - s;

export async function devConsoleLogsTool(
  runtime: RuntimeContext,
  requestId: string,
  epochId: number | undefined,
  _backendHint: BackendId | undefined,
  rawInput: unknown
): Promise<ToolResult<LogsResponse>> {
  const t0 = startedAt();
  try {
    requireIpc(runtime, requestId);
    const input = logsInputSchema.parse(rawInput ?? {});
    const result = (await runtime.launcherIpc!.request("console.logs", input, 5000)) as LogsResponse;
    return {
      ok: true,
      data: result,
      meta: { requestId, durationMs: elapsed(t0), epochId, consistencyHint: "n/a" },
    };
  } catch (error) {
    return buildFailure(error, { requestId, durationMs: elapsed(t0), epochId });
  }
}

export async function devConsoleErrorsTool(
  runtime: RuntimeContext,
  requestId: string,
  epochId: number | undefined,
  _backendHint: BackendId | undefined,
  rawInput: unknown
): Promise<ToolResult<LogsResponse>> {
  const t0 = startedAt();
  try {
    requireIpc(runtime, requestId);
    const input = logsInputSchema.parse(rawInput ?? {});
    const result = (await runtime.launcherIpc!.request("console.errors", input, 5000)) as LogsResponse;
    return {
      ok: true,
      data: result,
      meta: { requestId, durationMs: elapsed(t0), epochId, consistencyHint: "n/a" },
    };
  } catch (error) {
    return buildFailure(error, { requestId, durationMs: elapsed(t0), epochId });
  }
}

export async function devConsoleEvalTool(
  runtime: RuntimeContext,
  requestId: string,
  epochId: number | undefined,
  _backendHint: BackendId | undefined,
  rawInput: unknown
): Promise<ToolResult<EvalResponse>> {
  const t0 = startedAt();
  try {
    requireIpc(runtime, requestId);
    const input = evalInputSchema.parse(rawInput);
    const callTimeout = (input.timeoutMs ?? 5000) + 1000;
    const result = (await runtime.launcherIpc!.request(
      "console.eval",
      input,
      callTimeout
    )) as EvalResponse;
    return {
      ok: true,
      data: result,
      meta: { requestId, durationMs: elapsed(t0), epochId, consistencyHint: "n/a" },
    };
  } catch (error) {
    return buildFailure(error, { requestId, durationMs: elapsed(t0), epochId });
  }
}
