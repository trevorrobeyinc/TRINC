/**
 * Dependency-free SVG chart renderer. Pure functions: identical spec in,
 * byte-identical SVG out (no ids, no timestamps, no randomness). Charts paint
 * an explicit background so vault embeds read identically on light and dark
 * themes, and PNG rasterization matches the SVG exactly.
 */
import {
  CHART_AXIS_COLOR,
  CHART_FONT,
  CHART_GRID_COLOR,
  CHART_MUTED_TEXT,
  CHART_TEXT_COLOR,
  CHART_TICK_TEXT,
  DEFAULT_PALETTE,
} from "./palette";
import { escapeXml, estimateTextWidth, fmtNum, niceScale } from "./svgUtils";

export type ChartType = "bar" | "line" | "area" | "scatter" | "pie" | "donut";

export interface ChartSeries {
  name: string;
  values?: number[];
  points?: [number, number][];
}

export interface ChartData {
  labels?: string[];
  series: ChartSeries[];
}

export interface ChartOptions {
  width?: number;
  height?: number;
  stacked?: boolean;
  legend?: boolean;
  xLabel?: string;
  yLabel?: string;
  yMin?: number;
  yMax?: number;
  palette?: string[];
  background?: string;
}

export interface ChartSpec {
  type: ChartType;
  title?: string;
  data: ChartData;
  options?: ChartOptions;
}

export interface RenderedChart {
  svg: string;
  width: number;
  height: number;
}

const CHART_TYPES: readonly ChartType[] = ["bar", "line", "area", "scatter", "pie", "donut"];
const TITLE_SIZE = 16;
const LABEL_SIZE = 12;
const TICK_SIZE = 11;

// ─── Validation (pinpointed errors so the calling agent can self-correct) ───

function assertFinite(value: unknown, where: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${where} is not a finite number (got ${JSON.stringify(value)})`);
  }
  return value;
}

export function validateChartSpec(spec: ChartSpec): void {
  if (!CHART_TYPES.includes(spec.type)) {
    throw new Error(`type must be one of ${CHART_TYPES.join(", ")} (got ${JSON.stringify(spec.type)})`);
  }
  const series = spec.data?.series;
  if (!Array.isArray(series) || series.length === 0) {
    throw new Error("data.series must be a non-empty array");
  }
  series.forEach((s, i) => {
    if (!s || typeof s.name !== "string" || s.name.length === 0) {
      throw new Error(`data.series[${i}].name must be a non-empty string`);
    }
    if (s.values !== undefined) {
      if (!Array.isArray(s.values)) throw new Error(`data.series[${i}].values must be an array`);
      s.values.forEach((v, j) => assertFinite(v, `data.series[${i}].values[${j}]`));
    }
    if (s.points !== undefined) {
      if (!Array.isArray(s.points)) throw new Error(`data.series[${i}].points must be an array`);
      s.points.forEach((p, j) => {
        if (!Array.isArray(p) || p.length !== 2) {
          throw new Error(`data.series[${i}].points[${j}] must be a [x, y] pair`);
        }
        assertFinite(p[0], `data.series[${i}].points[${j}][0]`);
        assertFinite(p[1], `data.series[${i}].points[${j}][1]`);
      });
    }
  });

  if (spec.type === "scatter") {
    series.forEach((s, i) => {
      if (!s.points && !s.values) {
        throw new Error(`data.series[${i}] needs points ([x,y] pairs) or values for a scatter chart`);
      }
    });
  } else if (spec.type === "pie" || spec.type === "donut") {
    extractPieSlices(spec); // throws with specifics
  } else {
    const labels = spec.data.labels;
    series.forEach((s, i) => {
      if (!s.values || s.values.length === 0) {
        throw new Error(`data.series[${i}].values is required for a ${spec.type} chart`);
      }
      if (labels && s.values.length !== labels.length) {
        throw new Error(
          `data.series[${i}].values has ${s.values.length} entries but data.labels has ${labels.length} — they must match`
        );
      }
    });
  }
}

interface PieSlice {
  label: string;
  value: number;
}

function extractPieSlices(spec: ChartSpec): PieSlice[] {
  const { labels, series } = spec.data;
  let slices: PieSlice[];
  if (labels && labels.length > 0 && series[0].values && series[0].values.length > 0) {
    if (series[0].values.length !== labels.length) {
      throw new Error(
        `pie/donut: data.series[0].values has ${series[0].values.length} entries but data.labels has ${labels.length}`
      );
    }
    slices = labels.map((label, i) => ({ label, value: (series[0].values as number[])[i] }));
  } else if (series.every((s) => s.values && s.values.length >= 1)) {
    slices = series.map((s) => ({ label: s.name, value: (s.values as number[])[0] }));
  } else {
    throw new Error(
      "pie/donut needs data.labels + data.series[0].values, or one single-value series per slice"
    );
  }
  slices.forEach((s, i) => {
    if (s.value < 0) throw new Error(`pie/donut slice ${i} ("${s.label}") is negative — not representable`);
  });
  if (slices.every((s) => s.value === 0)) throw new Error("pie/donut: all slice values are zero");
  return slices;
}

// ─── Shared frame (title, legend, plot area, axes) ───

interface Frame {
  width: number;
  height: number;
  plotX: number;
  plotY: number;
  plotW: number;
  plotH: number;
  parts: string[];
  palette: readonly string[];
  /** Painted page color — markers ring in it (mark spec); "transparent" skips rings. */
  background: string;
}

interface FrameInput {
  spec: ChartSpec;
  yTickLabels: string[];
  showAxes: boolean;
}

function legendEntries(spec: ChartSpec): string[] {
  if (spec.type === "pie" || spec.type === "donut") {
    return extractPieSlices(spec).map((s) => s.label);
  }
  return spec.data.series.map((s) => s.name);
}

function buildFrame({ spec, yTickLabels, showAxes }: FrameInput): Frame {
  const opts = spec.options ?? {};
  const width = Math.min(Math.max(opts.width ?? 800, 320), 2000);
  const height = Math.min(Math.max(opts.height ?? 480, 240), 1600);
  const palette = opts.palette && opts.palette.length > 0 ? opts.palette : DEFAULT_PALETTE;
  const background = opts.background ?? "#ffffff";
  const showLegend =
    opts.legend !== false && (legendEntries(spec).length > 1 || spec.type === "pie" || spec.type === "donut");

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img"${
      spec.title ? ` aria-label="${escapeXml(spec.title)}"` : ""
    }>`
  );
  if (background !== "transparent") {
    parts.push(`<rect width="100%" height="100%" fill="${escapeXml(background)}"/>`);
  }

  let cursorY = 12;
  if (spec.title) {
    cursorY += TITLE_SIZE;
    parts.push(
      `<text x="${width / 2}" y="${cursorY}" text-anchor="middle" font-family="${CHART_FONT}" font-size="${TITLE_SIZE}" font-weight="600" fill="${CHART_TEXT_COLOR}">${escapeXml(spec.title)}</text>`
    );
    cursorY += 10;
  }

  // Legend: swatch rows wrapped to the drawable width.
  if (showLegend) {
    const entries = legendEntries(spec);
    const itemGap = 18;
    const swatch = 10;
    let x = 24;
    let rowY = cursorY + 12;
    for (let i = 0; i < entries.length; i++) {
      const label = entries[i];
      const itemW = swatch + 6 + estimateTextWidth(label, TICK_SIZE) + itemGap;
      if (x + itemW > width - 16 && x > 24) {
        x = 24;
        rowY += 18;
      }
      const color = palette[i % palette.length];
      parts.push(
        `<rect x="${x}" y="${rowY - swatch + 1}" width="${swatch}" height="${swatch}" rx="2" fill="${escapeXml(color)}"/>`,
        `<text x="${x + swatch + 6}" y="${rowY}" font-family="${CHART_FONT}" font-size="${TICK_SIZE}" fill="${CHART_MUTED_TEXT}">${escapeXml(label)}</text>`
      );
      x += itemW;
    }
    cursorY = rowY + 8;
  }

  const optsY = spec.options?.yLabel;
  const maxTickW = yTickLabels.reduce((m, t) => Math.max(m, estimateTextWidth(t, TICK_SIZE)), 0);
  const plotX = showAxes ? Math.ceil(16 + (optsY ? 22 : 0) + maxTickW + 8) : 24;
  const plotY = cursorY + 8;
  const bottom = showAxes ? 30 + (spec.options?.xLabel ? 20 : 0) : 20;
  const plotW = width - plotX - 24;
  const plotH = height - plotY - bottom;
  if (plotW < 80 || plotH < 60) {
    throw new Error("Chart area too small — increase options.width/height or shorten labels");
  }
  return { width, height, plotX, plotY, plotW, plotH, parts, palette, background };
}

function drawYAxis(frame: Frame, scale: ReturnType<typeof niceScale>, yLabel?: string): void {
  const { parts, plotX, plotY, plotW, plotH } = frame;
  const span = scale.max - scale.min;
  for (const tick of scale.ticks) {
    const y = plotY + plotH - ((tick - scale.min) / span) * plotH;
    parts.push(
      `<line x1="${plotX}" y1="${y}" x2="${plotX + plotW}" y2="${y}" stroke="${CHART_GRID_COLOR}" stroke-width="1"/>`,
      `<text x="${plotX - 8}" y="${y + 4}" text-anchor="end" font-family="${CHART_FONT}" font-size="${TICK_SIZE}" fill="${CHART_TICK_TEXT}">${fmtNum(tick, scale.decimals)}</text>`
    );
  }
  parts.push(
    `<line x1="${plotX}" y1="${plotY}" x2="${plotX}" y2="${plotY + plotH}" stroke="${CHART_AXIS_COLOR}" stroke-width="1"/>`
  );
  if (yLabel) {
    const cy = plotY + plotH / 2;
    parts.push(
      `<text x="14" y="${cy}" transform="rotate(-90 14 ${cy})" text-anchor="middle" font-family="${CHART_FONT}" font-size="${LABEL_SIZE}" fill="${CHART_MUTED_TEXT}">${escapeXml(yLabel)}</text>`
    );
  }
}

function drawXCategoryLabels(frame: Frame, labels: string[], xLabel?: string): void {
  const { parts, plotX, plotY, plotW, plotH, width, height } = frame;
  const step = plotW / labels.length;
  const every = Math.max(1, Math.ceil((labels.length * 60) / plotW));
  labels.forEach((label, i) => {
    if (i % every !== 0) return;
    const x = plotX + step * (i + 0.5);
    const text = label.length > 14 ? `${label.slice(0, 13)}…` : label;
    parts.push(
      `<text x="${x}" y="${plotY + plotH + 18}" text-anchor="middle" font-family="${CHART_FONT}" font-size="${TICK_SIZE}" fill="${CHART_TICK_TEXT}">${escapeXml(text)}</text>`
    );
  });
  parts.push(
    `<line x1="${plotX}" y1="${plotY + plotH}" x2="${plotX + plotW}" y2="${plotY + plotH}" stroke="${CHART_AXIS_COLOR}" stroke-width="1"/>`
  );
  if (xLabel) {
    parts.push(
      `<text x="${plotX + plotW / 2}" y="${height - 8}" text-anchor="middle" font-family="${CHART_FONT}" font-size="${LABEL_SIZE}" fill="${CHART_MUTED_TEXT}">${escapeXml(xLabel)}</text>`
    );
  }
  void width;
}

// ─── Value-domain helpers ───

function categoryDomain(spec: ChartSpec): { min: number; max: number } {
  const stacked = spec.options?.stacked === true;
  const series = spec.data.series;
  let min = 0;
  let max = 0;
  const length = Math.max(...series.map((s) => (s.values as number[]).length));
  for (let i = 0; i < length; i++) {
    if (stacked) {
      let posSum = 0;
      let negSum = 0;
      for (const s of series) {
        const v = (s.values as number[])[i] ?? 0;
        if (v >= 0) posSum += v;
        else negSum += v;
      }
      max = Math.max(max, posSum);
      min = Math.min(min, negSum);
    } else {
      for (const s of series) {
        const v = (s.values as number[])[i];
        if (v === undefined) continue;
        max = Math.max(max, v);
        min = Math.min(min, v);
      }
    }
  }
  return { min, max };
}

function applyDomainOverrides(spec: ChartSpec, domain: { min: number; max: number }) {
  const { yMin, yMax } = spec.options ?? {};
  return {
    min: yMin !== undefined ? assertFinite(yMin, "options.yMin") : domain.min,
    max: yMax !== undefined ? assertFinite(yMax, "options.yMax") : domain.max,
  };
}

// ─── Renderers ───

function renderCategoryChart(spec: ChartSpec): RenderedChart {
  const series = spec.data.series;
  const pointCount = Math.max(...series.map((s) => (s.values as number[]).length));
  const labels =
    spec.data.labels ?? Array.from({ length: pointCount }, (_, i) => String(i + 1));
  const stacked = spec.options?.stacked === true;

  const domain = applyDomainOverrides(spec, categoryDomain(spec));
  const scale = niceScale(domain.min, domain.max);
  const frame = buildFrame({
    spec,
    yTickLabels: scale.ticks.map((t) => fmtNum(t, scale.decimals)),
    showAxes: true,
  });
  const { parts, plotX, plotY, plotW, plotH, palette } = frame;
  drawYAxis(frame, scale, spec.options?.yLabel);

  const span = scale.max - scale.min;
  const yOf = (v: number) => plotY + plotH - ((v - scale.min) / span) * plotH;
  const zeroY = yOf(Math.min(Math.max(0, scale.min), scale.max));
  const step = plotW / labels.length;

  if (spec.type === "bar") {
    // Mark spec: bars ≤24px thick, 4px rounded data-end / square baseline,
    // 2px surface gaps between touching marks (stacked segments, grouped
    // neighbors) instead of strokes.
    const band = Math.min(step * 0.7, stacked ? 24 : 24 * series.length);
    const subBand = stacked ? band : band / series.length;
    const barGap = !stacked && series.length > 1 ? 1 : 0;
    for (let i = 0; i < labels.length; i++) {
      let posBase = 0;
      let negBase = 0;
      series.forEach((s, si) => {
        const v = (s.values as number[])[i];
        if (v === undefined) return;
        const color = palette[si % palette.length];
        let x: number;
        let y: number;
        let h: number;
        if (stacked) {
          x = plotX + step * i + (step - band) / 2;
          const base = v >= 0 ? posBase : negBase;
          y = v >= 0 ? yOf(base + v) : yOf(base);
          h = Math.abs(yOf(base) - yOf(base + v));
          if (v >= 0) posBase += v;
          else negBase += v;
          // 2px surface gap between stacked segments (shave the shared edge).
          if (h > 2 && base !== 0) {
            if (v >= 0) h -= 2;
            else {
              y += 2;
              h -= 2;
            }
          }
          parts.push(
            `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${band.toFixed(1)}" height="${Math.max(h, 0.5).toFixed(1)}" fill="${escapeXml(color)}"/>`
          );
        } else {
          x = plotX + step * i + (step - band) / 2 + subBand * si + barGap;
          y = v >= 0 ? yOf(v) : zeroY;
          h = Math.abs(yOf(v) - zeroY);
          const w = subBand - barGap * 2;
          const r = Math.min(4, w / 2, h);
          const x2 = x + w;
          // Rounded data-end (top for positive, bottom for negative), square baseline.
          const d =
            v >= 0
              ? `M ${x.toFixed(1)} ${(y + h).toFixed(1)} L ${x.toFixed(1)} ${(y + r).toFixed(1)} Q ${x.toFixed(1)} ${y.toFixed(1)} ${(x + r).toFixed(1)} ${y.toFixed(1)} L ${(x2 - r).toFixed(1)} ${y.toFixed(1)} Q ${x2.toFixed(1)} ${y.toFixed(1)} ${x2.toFixed(1)} ${(y + r).toFixed(1)} L ${x2.toFixed(1)} ${(y + h).toFixed(1)} Z`
              : `M ${x.toFixed(1)} ${y.toFixed(1)} L ${x2.toFixed(1)} ${y.toFixed(1)} L ${x2.toFixed(1)} ${(y + h - r).toFixed(1)} Q ${x2.toFixed(1)} ${(y + h).toFixed(1)} ${(x2 - r).toFixed(1)} ${(y + h).toFixed(1)} L ${(x + r).toFixed(1)} ${(y + h).toFixed(1)} Q ${x.toFixed(1)} ${(y + h).toFixed(1)} ${x.toFixed(1)} ${(y + h - r).toFixed(1)} Z`;
          parts.push(`<path d="${d}" fill="${escapeXml(color)}"/>`);
        }
      });
    }
  } else {
    // line / area — 2px round-capped strokes, area at 10% opacity, ≥8px
    // markers ringed in the surface color (mark spec).
    const ring =
      frame.background !== "transparent"
        ? ` stroke="${escapeXml(frame.background)}" stroke-width="2"`
        : "";
    series.forEach((s, si) => {
      const values = s.values as number[];
      const color = palette[si % palette.length];
      const pts = values.map((v, i) => {
        const x = plotX + step * (i + 0.5);
        return `${x.toFixed(1)},${yOf(v).toFixed(1)}`;
      });
      if (spec.type === "area") {
        const first = plotX + step * 0.5;
        const last = plotX + step * (values.length - 0.5);
        parts.push(
          `<polygon points="${first.toFixed(1)},${zeroY.toFixed(1)} ${pts.join(" ")} ${last.toFixed(1)},${zeroY.toFixed(1)}" fill="${escapeXml(color)}" fill-opacity="0.1"/>`
        );
      }
      parts.push(
        `<polyline points="${pts.join(" ")}" fill="none" stroke="${escapeXml(color)}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`
      );
      if (values.length <= 40) {
        values.forEach((v, i) => {
          const x = plotX + step * (i + 0.5);
          parts.push(
            `<circle cx="${x.toFixed(1)}" cy="${yOf(v).toFixed(1)}" r="4" fill="${escapeXml(color)}"${ring}/>`
          );
        });
      }
    });
  }

  drawXCategoryLabels(frame, labels, spec.options?.xLabel);
  parts.push("</svg>");
  return { svg: parts.join("\n"), width: frame.width, height: frame.height };
}

function renderScatter(spec: ChartSpec): RenderedChart {
  const series = spec.data.series.map((s) => ({
    name: s.name,
    points: s.points ?? (s.values as number[]).map((v, i) => [i, v] as [number, number]),
  }));
  const xs = series.flatMap((s) => s.points.map((p) => p[0]));
  const ys = series.flatMap((s) => s.points.map((p) => p[1]));
  const yDomain = applyDomainOverrides(spec, { min: Math.min(...ys, 0), max: Math.max(...ys, 0) });
  const xScale = niceScale(Math.min(...xs), Math.max(...xs));
  const yScale = niceScale(yDomain.min, yDomain.max);

  const frame = buildFrame({
    spec,
    yTickLabels: yScale.ticks.map((t) => fmtNum(t, yScale.decimals)),
    showAxes: true,
  });
  const { parts, plotX, plotY, plotW, plotH, palette, height } = frame;
  drawYAxis(frame, yScale, spec.options?.yLabel);

  const xSpan = xScale.max - xScale.min;
  const ySpan = yScale.max - yScale.min;
  const xOf = (v: number) => plotX + ((v - xScale.min) / xSpan) * plotW;
  const yOf = (v: number) => plotY + plotH - ((v - yScale.min) / ySpan) * plotH;

  for (const tick of xScale.ticks) {
    const x = xOf(tick);
    parts.push(
      `<line x1="${x.toFixed(1)}" y1="${plotY + plotH}" x2="${x.toFixed(1)}" y2="${plotY + plotH + 4}" stroke="${CHART_AXIS_COLOR}" stroke-width="1"/>`,
      `<text x="${x.toFixed(1)}" y="${plotY + plotH + 18}" text-anchor="middle" font-family="${CHART_FONT}" font-size="${TICK_SIZE}" fill="${CHART_TICK_TEXT}">${fmtNum(tick, xScale.decimals)}</text>`
    );
  }
  parts.push(
    `<line x1="${plotX}" y1="${plotY + plotH}" x2="${plotX + plotW}" y2="${plotY + plotH}" stroke="${CHART_AXIS_COLOR}" stroke-width="1"/>`
  );
  if (spec.options?.xLabel) {
    parts.push(
      `<text x="${plotX + plotW / 2}" y="${height - 8}" text-anchor="middle" font-family="${CHART_FONT}" font-size="${LABEL_SIZE}" fill="${CHART_MUTED_TEXT}">${escapeXml(spec.options.xLabel)}</text>`
    );
  }

  const ring =
    frame.background !== "transparent"
      ? ` stroke="${escapeXml(frame.background)}" stroke-width="2"`
      : "";
  series.forEach((s, si) => {
    const color = palette[si % palette.length];
    for (const [px, py] of s.points) {
      parts.push(
        `<circle cx="${xOf(px).toFixed(1)}" cy="${yOf(py).toFixed(1)}" r="4" fill="${escapeXml(color)}"${ring}/>`
      );
    }
  });

  parts.push("</svg>");
  return { svg: parts.join("\n"), width: frame.width, height: frame.height };
}

function renderPie(spec: ChartSpec): RenderedChart {
  const slices = extractPieSlices(spec);
  const frame = buildFrame({ spec, yTickLabels: [], showAxes: false });
  const { parts, plotX, plotY, plotW, plotH, palette } = frame;

  const cx = plotX + plotW / 2;
  const cy = plotY + plotH / 2;
  const r = Math.min(plotW, plotH) / 2 - 8;
  const inner = spec.type === "donut" ? r * 0.55 : 0;
  const total = slices.reduce((sum, s) => sum + s.value, 0);

  let angle = -Math.PI / 2;
  slices.forEach((slice, i) => {
    const fraction = slice.value / total;
    const sweep = fraction * 2 * Math.PI;
    const end = angle + sweep;
    const color = palette[i % palette.length];
    const largeArc = sweep > Math.PI ? 1 : 0;

    const x1 = cx + r * Math.cos(angle);
    const y1 = cy + r * Math.sin(angle);
    const x2 = cx + r * Math.cos(end);
    const y2 = cy + r * Math.sin(end);

    let d: string;
    if (fraction >= 0.999999) {
      // A single full-circle slice cannot be one arc; draw two half-circles.
      d =
        `M ${(cx - r).toFixed(2)} ${cy.toFixed(2)} ` +
        `A ${r.toFixed(2)} ${r.toFixed(2)} 0 1 1 ${(cx + r).toFixed(2)} ${cy.toFixed(2)} ` +
        `A ${r.toFixed(2)} ${r.toFixed(2)} 0 1 1 ${(cx - r).toFixed(2)} ${cy.toFixed(2)} Z`;
    } else if (inner > 0) {
      const ix1 = cx + inner * Math.cos(end);
      const iy1 = cy + inner * Math.sin(end);
      const ix2 = cx + inner * Math.cos(angle);
      const iy2 = cy + inner * Math.sin(angle);
      d =
        `M ${x1.toFixed(2)} ${y1.toFixed(2)} ` +
        `A ${r.toFixed(2)} ${r.toFixed(2)} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} ` +
        `L ${ix1.toFixed(2)} ${iy1.toFixed(2)} ` +
        `A ${inner.toFixed(2)} ${inner.toFixed(2)} 0 ${largeArc} 0 ${ix2.toFixed(2)} ${iy2.toFixed(2)} Z`;
    } else {
      d =
        `M ${cx.toFixed(2)} ${cy.toFixed(2)} L ${x1.toFixed(2)} ${y1.toFixed(2)} ` +
        `A ${r.toFixed(2)} ${r.toFixed(2)} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
    }
    // 2px surface-color gap between touching slices (mark spec).
    const gap =
      frame.background !== "transparent"
        ? ` stroke="${escapeXml(frame.background)}" stroke-width="2"`
        : "";
    parts.push(`<path d="${d}" fill="${escapeXml(color)}"${gap}/>`);

    if (fraction > 0.05) {
      const mid = angle + sweep / 2;
      const labelR = inner > 0 ? (r + inner) / 2 : r * 0.65;
      const lx = cx + labelR * Math.cos(mid);
      const ly = cy + labelR * Math.sin(mid);
      parts.push(
        `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-family="${CHART_FONT}" font-size="${TICK_SIZE}" font-weight="600" fill="#ffffff">${fmtNum(fraction * 100, 0)}%</text>`
      );
    }
    angle = end;
  });

  parts.push("</svg>");
  return { svg: parts.join("\n"), width: frame.width, height: frame.height };
}

export function renderChart(spec: ChartSpec): RenderedChart {
  validateChartSpec(spec);
  switch (spec.type) {
    case "bar":
    case "line":
    case "area":
      return renderCategoryChart(spec);
    case "scatter":
      return renderScatter(spec);
    case "pie":
    case "donut":
      return renderPie(spec);
  }
}
