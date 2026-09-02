/**
 * Stat tiles / KPI row / meter — the data-viz forms the visualize spec
 * prescribes INSTEAD of charts: "a single current value → stat tile, not a
 * one-bar bar chart; a handful of headline numbers → KPI row; a single ratio
 * against a limit → meter, not a 2-slice pie."
 *
 * Pure functions like chartRender: deterministic, explicit background, pinned
 * fonts. Tile anatomy per spec: muted 13px label above, hero number in the
 * serif voice ≥48px with tabular figures, status-colored delta beneath,
 * optional sparkline (Cove blue) or same-ramp meter track.
 */
import { CHART_FONT } from "./palette";
import { escapeXml, estimateTextWidth, fmtNum } from "./svgUtils";
import { CHROME, COVE, RAMPS, STATUS, VOICE_FONT } from "./vizTokens";

export interface StatTileInput {
  label: string;
  /** Hero figure, preformatted by the caller (e.g. "$14,950", "82%", "37"). */
  value: string | number;
  /** Small unit/context suffix after the hero number (e.g. "/mo"). */
  unit?: string;
  /** Change readout under the hero (e.g. "+12% vs last month", -3, "▲ 4"). */
  delta?: string | number;
  /** Colors the delta: "up" good / "down" bad / "flat" muted. Inferred from a numeric delta's sign when omitted. */
  direction?: "up" | "down" | "flat";
  /** Sparkline values (drawn left→right, Cove blue, end-dot). */
  spark?: number[];
  /** Ratio-against-a-limit tile: renders a same-ramp meter instead of a spark. */
  meter?: { value: number; max: number };
}

export interface StatTilesSpec {
  title?: string;
  tiles: StatTileInput[];
  options?: {
    columns?: number;
    width?: number;
    background?: string;
  };
}

export interface ResolvedStatTiles {
  title?: string;
  tiles: StatTileInput[];
  columns: number;
  width: number;
  background: string;
  warnings: string[];
}

const MAX_TILES = 12;
const TILE_H = 128;
const SPARK_H = 30;
const GAP = 12;
const PAD = 20;
const LABEL_SIZE = 13;
const HERO_SIZE = 48;
const DELTA_SIZE = 12;

export function resolveStatTiles(
  input: Record<string, unknown>,
  defaults: { background: string }
): ResolvedStatTiles {
  const warnings: string[] = [];
  const title = typeof input.title === "string" && input.title.trim() ? input.title.trim() : undefined;
  const raw = input.tiles;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error("tiles must be a non-empty array of { label, value, unit?, delta?, direction?, spark?, meter? }");
  }
  if (raw.length > MAX_TILES) throw new Error(`tiles is capped at ${MAX_TILES} (got ${raw.length})`);

  const tiles: StatTileInput[] = raw.map((t, i) => {
    if (!t || typeof t !== "object") throw new Error(`tiles[${i}] must be an object`);
    const tile = t as Record<string, unknown>;
    if (typeof tile.label !== "string" || !tile.label.trim()) {
      throw new Error(`tiles[${i}].label must be a non-empty string`);
    }
    if (typeof tile.value !== "string" && typeof tile.value !== "number") {
      throw new Error(`tiles[${i}].value must be a string or number`);
    }
    if (typeof tile.value === "number" && !Number.isFinite(tile.value)) {
      throw new Error(`tiles[${i}].value is not finite`);
    }
    if (tile.direction !== undefined && !["up", "down", "flat"].includes(tile.direction as string)) {
      throw new Error(`tiles[${i}].direction must be up, down, or flat`);
    }
    if (tile.spark !== undefined) {
      if (!Array.isArray(tile.spark) || tile.spark.length < 2 || tile.spark.some((v) => typeof v !== "number" || !Number.isFinite(v))) {
        throw new Error(`tiles[${i}].spark must be an array of 2+ finite numbers`);
      }
    }
    if (tile.meter !== undefined) {
      const m = tile.meter as Record<string, unknown>;
      if (
        !m ||
        typeof m !== "object" ||
        typeof m.value !== "number" ||
        typeof m.max !== "number" ||
        !Number.isFinite(m.value) ||
        !Number.isFinite(m.max) ||
        m.max <= 0
      ) {
        throw new Error(`tiles[${i}].meter must be { value, max } with finite numbers and max > 0`);
      }
      if (tile.spark !== undefined) {
        warnings.push(`tiles[${i}] has both spark and meter — meter wins`);
      }
    }
    return tile as unknown as StatTileInput;
  });

  const opts = (input.options ?? {}) as Record<string, unknown>;
  const columns = Math.min(
    Math.max(typeof opts.columns === "number" ? Math.round(opts.columns) : Math.min(tiles.length, 4), 1),
    4
  );
  const width = Math.min(Math.max(typeof opts.width === "number" ? opts.width : 0, 0), 2000);
  const background =
    typeof opts.background === "string" && opts.background.trim() ? opts.background.trim() : defaults.background;
  return { title, tiles, columns, width, background, warnings };
}

function heroText(tile: StatTileInput): string {
  return typeof tile.value === "number" ? fmtNum(tile.value, Math.abs(tile.value) < 10 ? 1 : 0) : tile.value;
}

function deltaParts(tile: StatTileInput): { text: string; color: string } | undefined {
  if (tile.delta === undefined) return undefined;
  const direction =
    tile.direction ??
    (typeof tile.delta === "number" ? (tile.delta > 0 ? "up" : tile.delta < 0 ? "down" : "flat") : "flat");
  const arrow = direction === "up" ? "▲ " : direction === "down" ? "▼ " : "";
  const text =
    typeof tile.delta === "number"
      ? `${arrow}${fmtNum(Math.abs(tile.delta), Math.abs(tile.delta) < 10 ? 1 : 0)}`
      : `${arrow}${tile.delta}`;
  const color = direction === "up" ? STATUS.good : direction === "down" ? STATUS.critical : CHROME.textMuted;
  return { text, color };
}

export function renderStatTiles(spec: ResolvedStatTiles): { svg: string; width: number; height: number } {
  const { tiles, columns } = spec;
  // Tile width fits the widest hero (serif ≈ 0.62em/char at 48px) and label.
  const naturalTile = tiles.reduce((w, t) => {
    const hero = heroText(t) + (t.unit ? ` ${t.unit}` : "");
    return Math.max(
      w,
      hero.length * HERO_SIZE * 0.62 + PAD * 2,
      estimateTextWidth(t.label, LABEL_SIZE) + PAD * 2
    );
  }, 200);
  const tileW = Math.ceil(Math.min(naturalTile, 340));
  const rows = Math.ceil(tiles.length / columns);
  const titleH = spec.title ? 40 : 0;
  const width = spec.width > 0 ? spec.width : GAP + columns * (tileW + GAP);
  const height = titleH + GAP + rows * (TILE_H + GAP);

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img"${
      spec.title ? ` aria-label="${escapeXml(spec.title)}"` : ""
    }>`
  );
  if (spec.background !== "transparent") {
    parts.push(`<rect width="100%" height="100%" fill="${escapeXml(spec.background)}"/>`);
  }
  if (spec.title) {
    parts.push(
      `<text x="${GAP + 4}" y="28" font-family="${CHART_FONT}" font-size="16" font-weight="600" fill="${CHROME.textPrimary}">${escapeXml(spec.title)}</text>`
    );
  }

  tiles.forEach((tile, i) => {
    const col = i % columns;
    const row = Math.floor(i / columns);
    const x = GAP + col * (tileW + GAP);
    const y = titleH + GAP + row * (TILE_H + GAP);

    // Metric-card surface: surface-1, 8px radius. The spec's borderless card
    // relies on the host page being a step darker; on the chart's white
    // ground a 0.5px hairline is what keeps the tile visible at all.
    parts.push(
      `<rect x="${x}" y="${y}" width="${tileW}" height="${TILE_H}" rx="8" fill="${CHROME.surface1}" stroke="${CHROME.border}" stroke-width="0.5"/>`
    );
    parts.push(
      `<text x="${x + PAD}" y="${y + 28}" font-family="${CHART_FONT}" font-size="${LABEL_SIZE}" fill="${CHROME.textMuted}">${escapeXml(tile.label)}</text>`
    );
    const hero = heroText(tile);
    const heroY = y + 74;
    parts.push(
      `<text x="${x + PAD}" y="${heroY}" font-family="${VOICE_FONT}" font-size="${HERO_SIZE}" font-weight="500" fill="${CHROME.textPrimary}" style="font-variant-numeric: tabular-nums lining-nums">${escapeXml(hero)}</text>`
    );
    if (tile.unit) {
      const heroW = hero.length * HERO_SIZE * 0.6;
      parts.push(
        `<text x="${(x + PAD + heroW + 6).toFixed(1)}" y="${heroY}" font-family="${CHART_FONT}" font-size="14" fill="${CHROME.textSecondary}">${escapeXml(tile.unit)}</text>`
      );
    }

    const meter = tile.meter;
    if (meter) {
      // Same-ramp meter: blue-100 track, blue-600 fill, square ends.
      const trackY = y + TILE_H - 26;
      const trackW = tileW - PAD * 2;
      const frac = Math.min(Math.max(meter.value / meter.max, 0), 1);
      parts.push(
        `<rect x="${x + PAD}" y="${trackY}" width="${trackW}" height="6" rx="3" fill="${RAMPS.blue.s100}"/>`,
        `<rect x="${x + PAD}" y="${trackY}" width="${(trackW * frac).toFixed(1)}" height="6" rx="3" fill="${RAMPS.blue.s600}"/>`,
        `<text x="${x + tileW - PAD}" y="${trackY - 8}" text-anchor="end" font-family="${CHART_FONT}" font-size="${DELTA_SIZE}" fill="${CHROME.textMuted}">${fmtNum(frac * 100, 0)}% of ${fmtNum(meter.max, 0)}</text>`
      );
    } else {
      const delta = deltaParts(tile);
      if (delta) {
        parts.push(
          `<text x="${x + PAD}" y="${y + TILE_H - 20}" font-family="${CHART_FONT}" font-size="${DELTA_SIZE}" font-weight="500" fill="${delta.color}">${escapeXml(delta.text)}</text>`
        );
      }
      const spark = tile.spark;
      if (spark && spark.length >= 2) {
        const sparkW = Math.min(tileW * 0.42, 120);
        const sx = x + tileW - PAD - sparkW;
        const sy = y + TILE_H - 18 - SPARK_H;
        const min = Math.min(...spark);
        const max = Math.max(...spark);
        const span = max - min || 1;
        const pts = spark.map((v, j) => {
          const px = sx + (j / (spark.length - 1)) * sparkW;
          const py = sy + SPARK_H - ((v - min) / span) * SPARK_H;
          return `${px.toFixed(1)},${py.toFixed(1)}`;
        });
        const last = pts[pts.length - 1].split(",");
        parts.push(
          `<polyline points="${pts.join(" ")}" fill="none" stroke="${COVE[0]}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`,
          `<circle cx="${last[0]}" cy="${last[1]}" r="3.5" fill="${COVE[0]}" stroke="${escapeXml(spec.background === "transparent" ? "#ffffff" : spec.background)}" stroke-width="2"/>`
        );
      }
    }
  });

  parts.push("</svg>");
  return { svg: parts.join(""), width, height };
}
