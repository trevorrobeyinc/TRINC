import { z } from "zod";
import type { RuntimeContext } from "../context";
import type { BackendId, ToolResult } from "../../types";

/**
 * research_notify — emit-only companion to research_publish.
 *
 * Publishes a `research_arrived` event on the `research` SSE stream WITHOUT
 * touching the vault. Use this when the caller has ALREADY created the vault
 * note (e.g. the Command Center plugin's own note generator) and just wants the
 * Copilot chat to render a result bubble that links to that existing note.
 *
 * Unlike research_publish (read output.md → write Research-Output/ + atlas stubs
 * → emit), this ONLY broadcasts the event, so it never duplicates the output.
 * It is therefore a read-only-safe notification, not a mutating write.
 */

const schema = z.object({
  taskId: z.string().min(1),
  title: z.string().min(1),
  mainNotePath: z.string().min(1).optional(),
  vault: z.string().min(1).optional(),
});

interface ResearchNotifyOutput {
  emitted: boolean;
  taskId: string;
}

export async function researchNotifyTool(
  runtime: RuntimeContext,
  requestId: string,
  _epochId: number | undefined,
  _backendHint: BackendId | undefined,
  input: unknown
): Promise<ToolResult<ResearchNotifyOutput>> {
  const startedAt = Date.now();
  const payload = schema.parse(input);

  // Emit-only: broadcast to `research`-stream SSE subscribers (the Copilot
  // plugin's McpEventBridge renders it as a chat bubble and opens mainNotePath
  // when present). No vault write, so this is safe even in read-only mode.
  runtime.eventBus.publish({
    type: "research_arrived",
    stream: "research",
    taskId: payload.taskId,
    title: payload.title,
    ...(payload.vault ? { vault: payload.vault } : {}),
    ...(payload.mainNotePath ? { mainNotePath: payload.mainNotePath } : {}),
    ts: new Date().toISOString(),
  });

  runtime.logger.info("research_notify_emitted", {
    requestId,
    taskId: payload.taskId,
    mainNotePath: payload.mainNotePath || null,
  });

  return {
    ok: true,
    data: { emitted: true, taskId: payload.taskId },
    meta: {
      requestId,
      durationMs: Date.now() - startedAt,
      consistencyHint: "n/a",
    },
  };
}
