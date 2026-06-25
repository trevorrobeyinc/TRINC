import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { RuntimeContext } from "./context";
import type { BackendId, Operation, ToolResult } from "../types";
import { buildFailure } from "./errors";
import { AppError } from "./errors";
import { ERROR_CODES } from "./errorCodes";
import { openVaultTool } from "./tools/openVault";
import { createNoteTool } from "./tools/createNote";
import { appendNoteTool } from "./tools/appendNote";
import { readNoteTool } from "./tools/readNote";
import { searchNotesTool } from "./tools/searchNotes";
import { obsidianHealthTool } from "./tools/obsidianHealth";
import { executeCommandTool } from "./tools/executeCommand";
import { miyoSearchContextTool } from "./tools/miyoSearchContext";
import { researchPublishTool } from "./tools/researchPublish";
import {
  devConsoleLogsTool,
  devConsoleErrorsTool,
  devConsoleEvalTool,
} from "./tools/devConsole";

const requestSchema = z.object({
  tool: z.string().min(1),
  operation: z
    .enum(["open_vault", "create_note", "append_note", "read_note", "search_notes", "execute_command"])
    .optional(),
  input: z.unknown().optional(),
  backendHint: z.literal("restApi").optional(),
  epochId: z.number().int().optional(),
});

type ToolHandler = (
  runtime: RuntimeContext,
  requestId: string,
  epochId: number | undefined,
  backendHint: BackendId | undefined,
  input: unknown
) => Promise<ToolResult<unknown>>;

const handlers: Record<string, ToolHandler> = {
  obsidian_open_vault: openVaultTool,
  obsidian_create_note: createNoteTool,
  obsidian_append_note: appendNoteTool,
  obsidian_read_note: readNoteTool,
  obsidian_search_notes: searchNotesTool,
  obsidian_execute_command: executeCommandTool,
  miyo_search_context: miyoSearchContextTool,
  research_publish: researchPublishTool,
  // Renderer-side dev console / debugging — backed by launcher IPC, NOT CDP.
  // Replaces the retired `obsidian-devtools` chrome-devtools-mcp path on :8315.
  obsidian_dev_console_logs: devConsoleLogsTool,
  obsidian_dev_console_errors: devConsoleErrorsTool,
  obsidian_dev_console_eval: devConsoleEvalTool,
};

// Security (audit DT-3): tools denied when the bridge is in read-only mode.
const READ_ONLY_BLOCKED_TOOLS = new Set<string>([
  "obsidian_create_note",
  "obsidian_append_note",
  "obsidian_execute_command",
  "obsidian_open_vault",
  "research_publish",
  "obsidian_dev_console_eval",
]);

function laneForOperation(operation: Operation | undefined): "interactive" | "mutating" {
  if (operation === "create_note" || operation === "append_note") {
    return "mutating";
  }
  return "interactive";
}

function waitTimeoutForOperation(operation: Operation | undefined): number {
  return operation === "create_note" || operation === "append_note" ? 20_000 : 5_000;
}

export async function dispatchToolRequest(runtime: RuntimeContext, rawBody: string): Promise<ToolResult<unknown>> {
  const requestId = randomUUID();

  try {
    const parsedBody = requestSchema.parse(JSON.parse(rawBody));

    if (parsedBody.tool === "obsidian_health") {
      return await obsidianHealthTool(runtime, requestId);
    }

    const handler = handlers[parsedBody.tool];
    if (!handler) {
      throw new AppError(ERROR_CODES.INTERNAL_ERROR, `Unknown tool '${parsedBody.tool}'.`);
    }

    // Security (audit DT-3): central read-only kill-switch covering every
    // mutating/execution tool (not just create/append).
    if (runtime.config.readOnlyMode && READ_ONLY_BLOCKED_TOOLS.has(parsedBody.tool)) {
      throw new AppError(
        ERROR_CODES.NO_CAPABLE_BACKEND,
        `Tool '${parsedBody.tool}' is disabled while the bridge is in read-only mode.`
      );
    }

    const lane = laneForOperation(parsedBody.operation);
    const waitTimeoutMs = waitTimeoutForOperation(parsedBody.operation);

    return await runtime.scheduler.enqueue(lane, waitTimeoutMs, async () =>
      await handler(runtime, requestId, parsedBody.epochId, parsedBody.backendHint, parsedBody.input)
    );
  } catch (error) {
    return buildFailure(error, { requestId, durationMs: 0 });
  }
}
