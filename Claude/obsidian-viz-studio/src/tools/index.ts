import type { ToolContext, ToolHandlers } from "../types";
import { createCanvasTool } from "./canvas";
import { createChartTool } from "./chart";
import { createDiagramTool } from "./diagram";
import { createGraphSnapshotTool } from "./graph";
import { createInteractiveTool } from "./interactive";
import { createMockupTool } from "./mockup";
import { createStatTilesTool } from "./statTiles";
import { createGuidedTool } from "./guided";
import { createHealthTool } from "./health";
import { createMermaidTool } from "./mermaid";
import { createPerceptualMapTool } from "./perceptualMap";
import { createRenderSvgTool } from "./svg";

export function buildToolHandlers(ctx: ToolContext): ToolHandlers {
  return {
    viz_health: createHealthTool(ctx),
    viz_mermaid: createMermaidTool(ctx),
    viz_chart: createChartTool(ctx),
    viz_render_svg: createRenderSvgTool(ctx),
    viz_canvas: createCanvasTool(ctx),
    viz_graph_snapshot: createGraphSnapshotTool(ctx),
    viz_guided: createGuidedTool(ctx),
    viz_perceptual_map: createPerceptualMapTool(ctx),
    viz_diagram: createDiagramTool(ctx),
    viz_stat_tiles: createStatTilesTool(ctx),
    viz_mockup: createMockupTool(ctx),
    viz_interactive: createInteractiveTool(ctx),
  };
}
