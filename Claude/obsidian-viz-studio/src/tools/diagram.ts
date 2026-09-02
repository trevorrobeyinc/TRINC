import type { ToolContext, ToolHandler } from "../types";
import { renderCardDiagram, resolveCardDiagram } from "../render/cardDiagram";
import { insertCanvasNode } from "../canvasWriter";
import {
  optionalBoolean,
  optionalString,
  persistSvgOutput,
  resolveTargets,
  revealResult,
} from "./shared";

/**
 * viz_diagram — system/architecture card diagrams in the visualize design
 * language (rounded title+subtitle cards, semantic color roles, faint group
 * headers, thin grey chevron arrows). One deterministic SVG; placement via
 * the shared targetNote/targetCanvas/useActiveTab contract.
 */
export function createDiagramTool(ctx: ToolContext): ToolHandler {
  return async (input) => {
    const diagram = resolveCardDiagram(input);
    const title = diagram.title ?? "Card Diagram";
    const { targetNote, targetCanvas } = resolveTargets(ctx, input);

    const rendered = renderCardDiagram(diagram);
    const persistInput: Record<string, unknown> = { ...input };
    if (targetNote) persistInput.targetNote = targetNote;
    else delete persistInput.targetNote;
    const result = await persistSvgOutput(ctx, persistInput, rendered.svg, diagram.warnings, {
      defaultBaseName: title,
      caption: diagram.title,
      // The diagram paints its own background rect (chart convention).
      pngBackground: "transparent",
      extra: {
        nodeCount: diagram.nodes.length,
        edgeCount: diagram.edges.length,
        style: diagram.style,
      },
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

    const revealPath =
      (result.canvasPath as string | undefined) ??
      (result.targetNote as string | undefined) ??
      (result.path as string);
    const opened = await revealResult(ctx, input, revealPath);
    if (opened !== undefined) result.opened = opened;

    return result;
  };
}
