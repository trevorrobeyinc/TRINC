import type { ToolContext, ToolHandler } from "../types";
import { sanitizeSvg } from "../render/svgSanitize";
import { persistSvgOutput, requireString } from "./shared";

export function createRenderSvgTool(ctx: ToolContext): ToolHandler {
  return async (input) => {
    const raw = requireString(input, "svg");
    const { svg, warnings } = sanitizeSvg(raw);
    return persistSvgOutput(ctx, input, svg, warnings, {
      defaultBaseName: "svg-render",
      pngBackground: ctx.settings.chartBackground,
    });
  };
}
