import type { RuntimeContext } from "../context";
import type { ToolResult } from "../../types";

export async function obsidianHealthTool(runtime: RuntimeContext, requestId: string): Promise<ToolResult<Record<string, unknown>>> {
  // Diagnostics should reflect the current backend state rather than a cached routing snapshot.
  const snapshot = await runtime.selector.refresh(true);

  const backends: Record<string, { capabilities: unknown }> = {
    cli: { capabilities: snapshot.capabilities.cli },
  };
  if (snapshot.capabilities.plugin) {
    backends.plugin = { capabilities: snapshot.capabilities.plugin };
  }

  return {
    ok: true,
    data: {
      backends,
      routing: {
        epochId: snapshot.epochId,
        refreshedAt: snapshot.refreshedAt,
        operationMap: snapshot.operationMap,
        reasons: snapshot.reasons,
      },
      security: {
        transportMode: runtime.config.transport.mode,
        corsDisabled: true,
        replayGuardEnabled: true,
        tokenEntropyBits: runtime.tokenEntropyBits,
      },
      metrics: {
        ...runtime.metrics.snapshot(),
        queue: runtime.scheduler.snapshot(),
      },
    },
    meta: {
      requestId,
      durationMs: 0,
      epochId: snapshot.epochId,
      consistencyHint: "n/a",
    },
  };
}
