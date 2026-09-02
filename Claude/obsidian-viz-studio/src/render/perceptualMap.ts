/**
 * Perceptual (positioning) map — the marketing 2×2: two bipolar attribute
 * axes crossing at the center of a relative space, competitors plotted as
 * labeled bubbles, optional segment colors and quadrant captions.
 *
 * Pure functions like chartRender: identical spec in, byte-identical output
 * (no ids, no timestamps, no randomness). One resolver validates the spec
 * with pinpointed errors, then TWO builders consume the resolved form:
 *   renderPerceptualMap()  → self-contained SVG (explicit background, so the
 *                            vault embed reads identically on light/dark)
 *   buildPerceptualCanvas() → origin-centered JSONCanvas nodes: four group
 *                            frames form the quadrants and each competitor is
 *                            a draggable card, so the map stays editable.
 */
import {
  CHART_AXIS_COLOR,
  CHART_FONT,
  CHART_GRID_COLOR,
  CHART_MUTED_TEXT,
  CHART_TEXT_COLOR,
  DEFAULT_PALETTE,
} from "./palette";
import { escapeXml, estimateTextWidth } from "./svgUtils";
import type { CanvasNode } from "../canvasWriter";

export interface PerceptualAxis {
  /** Attribute name drawn small at the arrowhead (e.g. "Price"). */
  label?: string;
  /** Pole label at the low end (left / bottom), e.g. "Low Price". */
  low: string;
  /** Pole label at the high end (right / top), e.g. "High Price". */
  high: string;
}

export interface QuadrantLabels {
  topLeft?: string;
  topRight?: string;
  bottomLeft?: string;
  bottomRight?: string;
}

interface ResolvedItem {
  label: string;
  x: number;
  y: number;
  segment?: string;
  /** Resolved fill (override > segment palette > index palette). */
  fill: string;
  /** Resolved bubble radius in px (size-scaled when sizes are given). */
  r: number;
  /** Normalized plot position: fx 0..1 left→right, fy 0..1 TOP→bottom. */
  fx: number;
  fy: number;
}

export interface ResolvedPerceptualMap {
  title?: string;
  xAxis: PerceptualAxis;
  yAxis: PerceptualAxis;
  quadrants: QuadrantLabels;
  scale: { min: number; max: number };
  items: ResolvedItem[];
  /** Distinct segments in first-appearance order with their colors. */
  segments: { name: string; color: string }[];
  width: number;
  height: number;
  legend: boolean;
  grid: boolean;
  background: string;
  warnings: string[];
}

const MAX_ITEMS = 60;
const TITLE_SIZE = 16;
const POLE_SIZE = 13;
const LABEL_SIZE = 12;
const TICK_SIZE = 11;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function assertFinite(value: unknown, where: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${where} is not a finite number (got ${JSON.stringify(value)})`);
  }
  return value;
}

function parseAxis(raw: unknown, key: string): PerceptualAxis {
  if (!raw || typeof raw !== "object") {
    throw new Error(`${key} is required: { low, high, label? } — bipolar pole labels, e.g. { low: "Low Price", high: "High Price" }`);
  }
  const axis = raw as Record<string, unknown>;
  for (const pole of ["low", "high"] as const) {
    if (typeof axis[pole] !== "string" || !(axis[pole] as string).trim()) {
      throw new Error(`${key}.${pole} must be a non-empty string (the ${pole}-end pole label)`);
    }
  }
  if (axis.label !== undefined && typeof axis.label !== "string") {
    throw new Error(`${key}.label must be a string`);
  }
  return {
    label: (axis.label as string | undefined)?.trim() || undefined,
    low: (axis.low as string).trim(),
    high: (axis.high as string).trim(),
  };
}

function parseQuadrants(raw: unknown): QuadrantLabels {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("quadrantLabels must be an object: { topLeft?, topRight?, bottomLeft?, bottomRight? }");
  }
  const q = raw as Record<string, unknown>;
  const out: QuadrantLabels = {};
  for (const key of ["topLeft", "topRight", "bottomLeft", "bottomRight"] as const) {
    if (q[key] === undefined) continue;
    if (typeof q[key] !== "string") throw new Error(`quadrantLabels.${key} must be a string`);
    const v = (q[key] as string).trim();
    if (v) out[key] = v;
  }
  return out;
}

/**
 * Validate the raw tool input and resolve every derived value (colors, radii,
 * normalized positions) once, so the SVG and Canvas builders cannot drift.
 */
export function resolvePerceptualMap(
  input: Record<string, unknown>,
  defaults: { background: string }
): ResolvedPerceptualMap {
  const warnings: string[] = [];

  const title = typeof input.title === "string" && input.title.trim() ? input.title.trim() : undefined;
  const xAxis = parseAxis(input.xAxis, "xAxis");
  const yAxis = parseAxis(input.yAxis, "yAxis");
  const quadrants = parseQuadrants(input.quadrantLabels);

  // Perceptual space is relative, so one scale serves both axes.
  let scale = { min: -10, max: 10 };
  if (input.scale !== undefined && input.scale !== null) {
    const s = input.scale as Record<string, unknown>;
    if (typeof s !== "object") throw new Error("scale must be { min, max }");
    scale = {
      min: assertFinite(s.min, "scale.min"),
      max: assertFinite(s.max, "scale.max"),
    };
    if (scale.min >= scale.max) throw new Error("scale.min must be less than scale.max");
  }
  const span = scale.max - scale.min;

  const rawItems = input.items;
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new Error("items must be a non-empty array of { label, x, y, segment?, color?, size? }");
  }
  if (rawItems.length > MAX_ITEMS) {
    throw new Error(`items is capped at ${MAX_ITEMS} for legibility (got ${rawItems.length})`);
  }

  const opts = (input.options ?? {}) as Record<string, unknown>;
  const paletteRaw = opts.palette;
  let palette: readonly string[] = DEFAULT_PALETTE;
  if (paletteRaw !== undefined) {
    if (!Array.isArray(paletteRaw) || paletteRaw.some((c) => typeof c !== "string" || !HEX_RE.test(c))) {
      throw new Error('options.palette must be an array of "#rrggbb" colors');
    }
    if (paletteRaw.length > 0) palette = paletteRaw as string[];
  }

  // First pass: validate items and collect segments in first-appearance order.
  const segmentNames: string[] = [];
  const parsed = rawItems.map((raw, i) => {
    if (!raw || typeof raw !== "object") throw new Error(`items[${i}] must be an object`);
    const item = raw as Record<string, unknown>;
    if (typeof item.label !== "string" || !item.label.trim()) {
      throw new Error(`items[${i}].label must be a non-empty string`);
    }
    const label = item.label.trim();
    let x = assertFinite(item.x, `items[${i}].x`);
    let y = assertFinite(item.y, `items[${i}].y`);
    if (x < scale.min || x > scale.max) {
      warnings.push(`items[${i}] ("${label}") x=${x} clamped to scale [${scale.min}, ${scale.max}]`);
      x = Math.min(scale.max, Math.max(scale.min, x));
    }
    if (y < scale.min || y > scale.max) {
      warnings.push(`items[${i}] ("${label}") y=${y} clamped to scale [${scale.min}, ${scale.max}]`);
      y = Math.min(scale.max, Math.max(scale.min, y));
    }
    let segment: string | undefined;
    if (item.segment !== undefined) {
      if (typeof item.segment !== "string") throw new Error(`items[${i}].segment must be a string`);
      segment = item.segment.trim() || undefined;
      if (segment && !segmentNames.includes(segment)) segmentNames.push(segment);
    }
    if (item.color !== undefined && (typeof item.color !== "string" || !HEX_RE.test(item.color))) {
      throw new Error(`items[${i}].color must be "#rrggbb"`);
    }
    let size: number | undefined;
    if (item.size !== undefined) {
      size = assertFinite(item.size, `items[${i}].size`);
      if (size <= 0) throw new Error(`items[${i}].size must be positive`);
    }
    return { label, x, y, segment, color: item.color as string | undefined, size };
  });

  const dupes = parsed
    .map((p) => p.label)
    .filter((label, i, all) => all.indexOf(label) !== i);
  if (dupes.length > 0) {
    warnings.push(`duplicate item labels: ${[...new Set(dupes)].join(", ")}`);
  }

  const segments = segmentNames.map((name, i) => ({
    name,
    color: palette[i % palette.length],
  }));
  const segmentColor = new Map(segments.map((s) => [s.name, s.color]));

  const maxSize = parsed.reduce((m, p) => Math.max(m, p.size ?? 0), 0);
  const items: ResolvedItem[] = parsed.map((p, i) => ({
    label: p.label,
    x: p.x,
    y: p.y,
    segment: p.segment,
    fill:
      p.color ??
      (p.segment ? (segmentColor.get(p.segment) as string) : palette[i % palette.length]),
    // Area-true scaling (sqrt) when sizes are given; a fixed radius otherwise.
    r: p.size !== undefined && maxSize > 0 ? 7 + 15 * Math.sqrt(p.size / maxSize) : 9,
    fx: (p.x - scale.min) / span,
    fy: (scale.max - p.y) / span,
  }));

  const width = Math.min(Math.max(typeof opts.width === "number" ? opts.width : 840, 480), 2000);
  const height = Math.min(Math.max(typeof opts.height === "number" ? opts.height : 720, 420), 1600);
  const background =
    typeof opts.background === "string" && opts.background.trim()
      ? opts.background.trim()
      : defaults.background;

  return {
    title,
    xAxis,
    yAxis,
    quadrants,
    scale,
    items,
    segments,
    width,
    height,
    legend: opts.legend !== false,
    grid: opts.grid === true,
    background,
    warnings,
  };
}

// ─── SVG builder ───

export interface RenderedPerceptualMap {
  svg: string;
  width: number;
  height: number;
}

export function renderPerceptualMap(map: ResolvedPerceptualMap): RenderedPerceptualMap {
  const { width, height } = map;
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img"${
      map.title ? ` aria-label="${escapeXml(map.title)}"` : ""
    }>`
  );
  if (map.background !== "transparent") {
    parts.push(`<rect width="100%" height="100%" fill="${escapeXml(map.background)}"/>`);
  }

  let cursorY = 12;
  if (map.title) {
    cursorY += TITLE_SIZE;
    parts.push(
      `<text x="${width / 2}" y="${cursorY}" text-anchor="middle" font-family="${CHART_FONT}" font-size="${TITLE_SIZE}" font-weight="600" fill="${CHART_TEXT_COLOR}">${escapeXml(map.title)}</text>`
    );
    cursorY += 10;
  }

  // Segment legend, chart-style wrapped rows (circle swatches to match bubbles).
  if (map.legend && map.segments.length > 0) {
    const itemGap = 18;
    const swatch = 10;
    let x = 24;
    let rowY = cursorY + 12;
    for (const seg of map.segments) {
      const itemW = swatch + 6 + estimateTextWidth(seg.name, TICK_SIZE) + itemGap;
      if (x + itemW > width - 16 && x > 24) {
        x = 24;
        rowY += 18;
      }
      parts.push(
        `<circle cx="${x + swatch / 2}" cy="${rowY - swatch / 2 + 1}" r="${swatch / 2}" fill="${escapeXml(seg.color)}"/>`,
        `<text x="${x + swatch + 6}" y="${rowY}" font-family="${CHART_FONT}" font-size="${TICK_SIZE}" fill="${CHART_MUTED_TEXT}">${escapeXml(seg.name)}</text>`
      );
      x += itemW;
    }
    cursorY = rowY + 8;
  }

  // Side margins fit the horizontal pole labels; verticals are centered above/below.
  const sideMargin = Math.ceil(
    Math.max(
      64,
      estimateTextWidth(map.xAxis.low, POLE_SIZE) + 20,
      estimateTextWidth(map.xAxis.high, POLE_SIZE) + 20
    )
  );
  const plotX = sideMargin;
  const plotW = width - sideMargin * 2;
  const plotY = cursorY + 26;
  const plotH = height - plotY - 34;
  if (plotW < 160 || plotH < 160) {
    throw new Error("Map area too small — increase options.width/height or shorten pole labels");
  }
  const cx = plotX + plotW / 2;
  const cy = plotY + plotH / 2;
  const right = plotX + plotW;
  const bottom = plotY + plotH;

  if (map.grid) {
    for (const f of [0.25, 0.75]) {
      const gx = plotX + plotW * f;
      const gy = plotY + plotH * f;
      parts.push(
        `<line x1="${gx}" y1="${plotY}" x2="${gx}" y2="${bottom}" stroke="${CHART_GRID_COLOR}" stroke-width="1" stroke-dasharray="3 4"/>`,
        `<line x1="${plotX}" y1="${gy}" x2="${right}" y2="${gy}" stroke="${CHART_GRID_COLOR}" stroke-width="1" stroke-dasharray="3 4"/>`
      );
    }
  }

  // Quadrant captions sit in the corners, muted, under everything else.
  const quad = map.quadrants;
  const quadText = (label: string, x: number, y: number, anchor: string) =>
    `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${CHART_FONT}" font-size="${LABEL_SIZE}" font-style="italic" fill="${CHART_MUTED_TEXT}">${escapeXml(label)}</text>`;
  if (quad.topLeft) parts.push(quadText(quad.topLeft, plotX + 8, plotY + 16, "start"));
  if (quad.topRight) parts.push(quadText(quad.topRight, right - 8, plotY + 16, "end"));
  if (quad.bottomLeft) parts.push(quadText(quad.bottomLeft, plotX + 8, bottom - 8, "start"));
  if (quad.bottomRight) parts.push(quadText(quad.bottomRight, right - 8, bottom - 8, "end"));

  // Center crosshair with outward arrowheads at all four ends.
  parts.push(
    `<line x1="${plotX}" y1="${cy}" x2="${right}" y2="${cy}" stroke="${CHART_AXIS_COLOR}" stroke-width="1.5"/>`,
    `<line x1="${cx}" y1="${plotY}" x2="${cx}" y2="${bottom}" stroke="${CHART_AXIS_COLOR}" stroke-width="1.5"/>`,
    `<polygon points="${right},${cy} ${right - 9},${cy - 5} ${right - 9},${cy + 5}" fill="${CHART_AXIS_COLOR}"/>`,
    `<polygon points="${plotX},${cy} ${plotX + 9},${cy - 5} ${plotX + 9},${cy + 5}" fill="${CHART_AXIS_COLOR}"/>`,
    `<polygon points="${cx},${plotY} ${cx - 5},${plotY + 9} ${cx + 5},${plotY + 9}" fill="${CHART_AXIS_COLOR}"/>`,
    `<polygon points="${cx},${bottom} ${cx - 5},${bottom - 9} ${cx + 5},${bottom - 9}" fill="${CHART_AXIS_COLOR}"/>`
  );

  // Bipolar pole labels at the four ends.
  const pole = (label: string, x: number, y: number, anchor: string) =>
    `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${CHART_FONT}" font-size="${POLE_SIZE}" font-weight="600" fill="${CHART_TEXT_COLOR}">${escapeXml(label)}</text>`;
  parts.push(
    pole(map.xAxis.low, plotX - 10, cy + 4, "end"),
    pole(map.xAxis.high, right + 10, cy + 4, "start"),
    pole(map.yAxis.high, cx, plotY - 8, "middle"),
    pole(map.yAxis.low, cx, bottom + 18, "middle")
  );

  // Optional attribute names, small and muted beside the arrowheads.
  if (map.xAxis.label) {
    parts.push(
      `<text x="${right - 12}" y="${cy + 18}" text-anchor="end" font-family="${CHART_FONT}" font-size="${TICK_SIZE}" fill="${CHART_MUTED_TEXT}">${escapeXml(map.xAxis.label)}</text>`
    );
  }
  if (map.yAxis.label) {
    parts.push(
      `<text x="${cx + 9}" y="${plotY + 14}" text-anchor="start" font-family="${CHART_FONT}" font-size="${TICK_SIZE}" fill="${CHART_MUTED_TEXT}">${escapeXml(map.yAxis.label)}</text>`
    );
  }

  // Large bubbles first so small ones stay visible on top; ties broken by label
  // for deterministic output.
  const ordered = [...map.items].sort((a, b) => b.r - a.r || a.label.localeCompare(b.label));
  for (const item of ordered) {
    const px = plotX + item.fx * plotW;
    const py = plotY + item.fy * plotH;
    parts.push(
      `<circle cx="${px}" cy="${py}" r="${item.r}" fill="${escapeXml(item.fill)}" fill-opacity="0.85" stroke="${escapeXml(item.fill)}" stroke-width="1"/>`
    );
    const labelW = estimateTextWidth(item.label, LABEL_SIZE);
    const flip = px + item.r + 6 + labelW > width - 6;
    parts.push(
      `<text x="${flip ? px - item.r - 6 : px + item.r + 6}" y="${py + 4}" text-anchor="${flip ? "end" : "start"}" font-family="${CHART_FONT}" font-size="${LABEL_SIZE}" font-weight="500" fill="${CHART_TEXT_COLOR}">${escapeXml(item.label)}</text>`
    );
  }

  parts.push("</svg>");
  return { svg: parts.join(""), width, height };
}

// ─── JSONCanvas builder ───

// OPERATOR DECISION — board density. The plot square is 1500×1500 canvas units;
// four HALF×HALF group frames form the quadrant grid and competitor cards are
// ~52px tall. Larger boards give bubbles more air, smaller ones fit a laptop
// viewport without zooming. Nothing else keys on these numbers.
const BOARD = 1500;
const HALF = BOARD / 2;
const ITEM_H = 52;

function textNodeWidth(text: string): number {
  return Math.min(280, Math.max(110, 48 + text.length * 9));
}

export interface PerceptualCanvas {
  nodes: CanvasNode[];
}

/**
 * The same map as an editable board: origin-centered coordinates (canvas y
 * grows DOWNWARD, so fy maps straight through), quadrant group frames, pole
 * labels outside the frame, one draggable card per competitor.
 */
export function buildPerceptualCanvas(map: ResolvedPerceptualMap): PerceptualCanvas {
  const nodes: CanvasNode[] = [];

  const quadrantDefs = [
    { id: "pm-quad-tl", label: map.quadrants.topLeft, x: -HALF, y: -HALF },
    { id: "pm-quad-tr", label: map.quadrants.topRight, x: 0, y: -HALF },
    { id: "pm-quad-bl", label: map.quadrants.bottomLeft, x: -HALF, y: 0 },
    { id: "pm-quad-br", label: map.quadrants.bottomRight, x: 0, y: 0 },
  ];
  for (const q of quadrantDefs) {
    const node: CanvasNode = { id: q.id, type: "group", x: q.x, y: q.y, width: HALF, height: HALF };
    if (q.label) node.label = q.label;
    nodes.push(node);
  }

  if (map.title) {
    const w = textNodeWidth(map.title) + 120;
    nodes.push({
      id: "pm-title",
      type: "text",
      text: `# ${map.title}`,
      x: Math.round(-w / 2),
      y: -HALF - 260,
      width: w,
      height: 64,
    });
  }

  const poleNode = (id: string, text: string, x: number, y: number): CanvasNode => ({
    id,
    type: "text",
    text: `**${text}**`,
    x,
    y,
    width: textNodeWidth(text),
    height: 60,
  });
  const xLowW = textNodeWidth(map.xAxis.low);
  const yHighW = textNodeWidth(map.yAxis.high);
  const yLowW = textNodeWidth(map.yAxis.low);
  nodes.push(
    poleNode("pm-pole-x-low", map.xAxis.low, -HALF - 30 - xLowW, -30),
    poleNode("pm-pole-x-high", map.xAxis.high, HALF + 30, -30),
    poleNode("pm-pole-y-high", map.yAxis.high, Math.round(-yHighW / 2), -HALF - 90),
    poleNode("pm-pole-y-low", map.yAxis.low, Math.round(-yLowW / 2), HALF + 30)
  );

  for (let i = 0; i < map.items.length; i++) {
    const item = map.items[i];
    const w = textNodeWidth(item.label);
    const centerX = -HALF + item.fx * BOARD;
    const centerY = -HALF + item.fy * BOARD;
    const node: CanvasNode = {
      id: `pm-item-${i + 1}`,
      type: "text",
      text: item.label,
      x: Math.round(centerX - w / 2),
      y: Math.round(centerY - ITEM_H / 2),
      width: w,
      height: ITEM_H,
      color: item.fill,
    };
    nodes.push(node);
  }

  return { nodes };
}
