import type { ToolContext, ToolHandler } from "../types";
import { renderChart, type ChartSpec } from "../render/chartRender";
import { optionalString, persistSvgOutput } from "./shared";

export function createChartTool(ctx: ToolContext): ToolHandler {
  return async (input) => {
    const spec: ChartSpec = {
      type: input.type as ChartSpec["type"],
      title: optionalString(input, "title"),
      data: input.data as ChartSpec["data"],
      options: {
        background: ctx.settings.chartBackground,
        ...((input.options as ChartSpec["options"]) ?? {}),
      },
    };
    if (!spec.data || typeof spec.data !== "object") {
      throw new Error("data is required: { labels?, series: [{ name, values | points }] }");
    }

    const rendered = renderChart(spec); // validates with pinpointed errors
    return persistSvgOutput(ctx, input, rendered.svg, [], {
      defaultBaseName: spec.title || `chart-${spec.type}`,
      caption: spec.title,
      // Charts paint their own background rect; keep rasterization transparent
      // so options.background="transparent" stays honest in PNG too.
      pngBackground: "transparent",
    });
  };
}
