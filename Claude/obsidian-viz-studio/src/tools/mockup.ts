import type { ToolContext, ToolHandler } from "../types";
import { renderMockup, resolveMockup } from "../render/mockup";
import { insertCanvasNode } from "../canvasWriter";
import { persistSvgOutput, resolveTargets, revealResult } from "./shared";

/**
 * viz_mockup — UI mockups from a typed block vocabulary in the CDS component
 * language, framed as a browser window, phone, raised card, or bare.
 */
export function createMockupTool(ctx: ToolContext): ToolHandler {
  return async (input) => {
    const spec = resolveMockup(input);
    const title = spec.title ?? "UI Mockup";
    const { targetNote, targetCanvas } = resolveTargets(ctx, input);

    const rendered = renderMockup(spec);
    const persistInput: Record<string, unknown> = { ...input };
    if (targetNote) persistInput.targetNote = targetNote;
    else delete persistInput.targetNote;
    const result = await persistSvgOutput(ctx, persistInput, rendered.svg, spec.warnings, {
      defaultBaseName: title,
      caption: spec.title,
      pngBackground: "transparent",
      extra: { frame: spec.frame, blockCount: spec.blocks.length },
    });

    if (targetCanvas) {
      const inserted = await insertCanvasNode(ctx.app, targetCanvas, {
        file: result.path as string,
        width: 560,
        height: Math.round(560 * ((result.height as number) / (result.width as number))),
      });
      result.canvasPath = inserted.canvasPath;
      result.canvasCreated = inserted.canvasCreated;
      result.summary = `${result.summary}; added to canvas ${inserted.canvasPath}${inserted.canvasCreated ? " (canvas created)" : ""}`;
    }

    const revealPath =
      (result.canvasPath as string | undefined) ??
      (result.targetNote as string | undefined) ??
      (result.path as string);
    const opened = await revealResult(ctx, input, revealPath);
    if (opened !== undefined) result.opened = opened;
    return result;
  };
}
