import type { ToolContext, ToolHandler } from "../types";
import {
  buildPerceptualCanvas,
  renderPerceptualMap,
  resolvePerceptualMap,
} from "../render/perceptualMap";
import { insertCanvasNode, insertCanvasNodes } from "../canvasWriter";
import { appendBlock, buildEmbed, slugify, uniquePath, writeText } from "../vaultWriter";
import {
  optionalBoolean,
  optionalString,
  persistSvgOutput,
  resolveFolder,
  resolveTargets,
  revealResult,
} from "./shared";

/**
 * viz_perceptual_map — marketing positioning map in two forms from one spec:
 * format svg/png = a deterministic image (embed in any note), format canvas =
 * a native JSONCanvas board where every competitor stays a draggable card.
 */
export function createPerceptualMapTool(ctx: ToolContext): ToolHandler {
  return async (input) => {
    const map = resolvePerceptualMap(input, { background: ctx.settings.chartBackground });
    const format = optionalString(input, "format") ?? "svg";
    if (!["svg", "png", "canvas"].includes(format)) {
      throw new Error(`format must be svg, png, or canvas (got ${JSON.stringify(format)})`);
    }
    const title = map.title ?? "Perceptual Map";

    const { targetNote, targetCanvas } = resolveTargets(ctx, input);

    let result: Record<string, unknown>;

    if (format === "canvas") {
      const board = buildPerceptualCanvas(map);
      if (targetCanvas) {
        const inserted = await insertCanvasNodes(ctx.app, targetCanvas, board.nodes);
        result = {
          path: inserted.canvasPath,
          embed: buildEmbed(inserted.canvasPath),
          format: "canvas",
          canvasPath: inserted.canvasPath,
          canvasCreated: inserted.canvasCreated,
          itemCount: map.items.length,
          nodeCount: inserted.nodeCount,
          summary: `Inserted perceptual map (${map.items.length} competitors, ${inserted.insertedCount} nodes) into canvas ${inserted.canvasPath}${inserted.canvasCreated ? " (canvas created)" : ""}`,
        };
      } else {
        const folder = resolveFolder(input, ctx.settings.canvasFolder);
        const baseName = slugify(optionalString(input, "fileName") ?? title);
        const overwrite = optionalBoolean(input, "overwrite") ?? false;
        const path = uniquePath(ctx.app, folder, baseName, "canvas", overwrite);
        await writeText(
          ctx.app,
          path,
          `${JSON.stringify({ nodes: board.nodes, edges: [] }, null, 2)}\n`
        );
        result = {
          path,
          embed: buildEmbed(path),
          format: "canvas",
          canvasPath: path,
          itemCount: map.items.length,
          nodeCount: board.nodes.length,
          summary: `Wrote perceptual map canvas ${path} (${map.items.length} competitors)`,
        };
      }
      if (targetNote) {
        const appended = await appendBlock(ctx.app, targetNote, result.embed as string, title);
        result.targetNote = appended.targetNote;
        result.targetNoteCreated = appended.targetNoteCreated;
        result.summary = `${result.summary}; embedded in ${appended.targetNote}`;
      }
      if (map.warnings.length > 0) result.warnings = map.warnings;
      if (optionalBoolean(input, "returnContent")) {
        result.canvas = { nodes: board.nodes, edges: [] };
      }
    } else {
      const rendered = renderPerceptualMap(map);
      // persistSvgOutput reads targetNote from its input, so hand it the
      // useActiveTab-resolved value (and never a canvas path).
      const persistInput: Record<string, unknown> = { ...input };
      if (targetNote) persistInput.targetNote = targetNote;
      else delete persistInput.targetNote;
      result = await persistSvgOutput(ctx, persistInput, rendered.svg, map.warnings, {
        defaultBaseName: title,
        caption: map.title,
        // The map paints its own background rect (chart convention).
        pngBackground: "transparent",
        extra: { itemCount: map.items.length, segmentCount: map.segments.length },
      });
      if (targetCanvas) {
        const inserted = await insertCanvasNode(ctx.app, targetCanvas, {
          file: result.path as string,
          width: 640,
          height: Math.round(640 * ((result.height as number) / (result.width as number))),
        });
        result.canvasPath = inserted.canvasPath;
        result.canvasCreated = inserted.canvasCreated;
        result.canvasNodeId = inserted.nodeId;
        result.summary = `${result.summary}; added to canvas ${inserted.canvasPath}${inserted.canvasCreated ? " (canvas created)" : ""}`;
      }
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
