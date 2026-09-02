import type { ToolContext, ToolHandler } from "../types";
import { renderStatTiles, resolveStatTiles } from "../render/statTiles";
import { insertCanvasNode } from "../canvasWriter";
import { persistSvgOutput, resolveTargets, revealResult } from "./shared";

/**
 * viz_stat_tiles — the data-viz forms that beat charts for headline numbers:
 * stat tiles (serif hero + status delta + sparkline), KPI rows, and meters.
 */
export function createStatTilesTool(ctx: ToolContext): ToolHandler {
  return async (input) => {
    const spec = resolveStatTiles(input, { background: ctx.settings.chartBackground });
    const title = spec.title ?? "Stat Tiles";
    const { targetNote, targetCanvas } = resolveTargets(ctx, input);

    const rendered = renderStatTiles(spec);
    const persistInput: Record<string, unknown> = { ...input };
    if (targetNote) persistInput.targetNote = targetNote;
    else delete persistInput.targetNote;
    const result = await persistSvgOutput(ctx, persistInput, rendered.svg, spec.warnings, {
      defaultBaseName: title,
      caption: spec.title,
      pngBackground: "transparent",
      extra: { tileCount: spec.tiles.length },
    });

    if (targetCanvas) {
      const inserted = await insertCanvasNode(ctx.app, targetCanvas, {
        file: result.path as string,
        width: 640,
        height: Math.round(640 * ((result.height as number) / (result.width as number))),
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
