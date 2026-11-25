import type { ToolContext, ToolHandler } from "../types";
import { TOOL_NAMES } from "../bridge/toolSchemas";
import { probeMermaid } from "./mermaid";

export function createHealthTool(ctx: ToolContext): ToolHandler {
  const started = Date.now();
  return async () => {
    const mermaid = await probeMermaid();
    return {
      status: "ok",
      service: "trinc-viz-studio-bridge",
      vault: ctx.app.vault.getName(),
      inPlugin: true,
      socket: ctx.bridgeSocketName?.() ?? null,
      uptime: (Date.now() - started) / 1000,
      tools: [...TOOL_NAMES],
      mermaid,
      folders: {
        assets: ctx.settings.assetFolder,
        canvas: ctx.settings.canvasFolder,
        notes: ctx.settings.notesFolder,
      },
    };
  };
}
