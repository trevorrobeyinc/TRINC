// OPERATOR DECISION — chart look & feel, re-decided 2026-08-27: charts now
// follow the visualize MCP's data-viz design layer (operator: "i want all of
// those … to use from the visualize mcp tooling"). Series colors are the Cove
// categorical palette in its FIXED slot order (never cycled past 8 — fold a
// 9th series into "Other"), and the chrome uses the CDS ink/gridline
// neutrals. Charts still paint an explicit background rect (a vault-file SVG
// cannot see Obsidian's CSS variables when embedded via ![[...]]), keeping
// SVG and PNG identical on both themes. The pre-2026-08-27 palette lives in
// git history; nothing else keys on these values.
import { CHROME, COVE } from "./vizTokens";

export const DEFAULT_PALETTE: readonly string[] = COVE;

/** Primary ink — chart titles, values. */
export const CHART_TEXT_COLOR = CHROME.textPrimary;
/** Secondary ink — legends, axis names. */
export const CHART_MUTED_TEXT = CHROME.textSecondary;
/** Muted ink — axis tick labels, category labels. */
export const CHART_TICK_TEXT = CHROME.textMuted;
export const CHART_GRID_COLOR = CHROME.gridline;
export const CHART_AXIS_COLOR = CHROME.baseline;

/**
 * One pinned stack for every generated SVG. <img>-loaded SVG cannot reach
 * vault or web fonts, so pinning system fonts is what makes the .svg file and
 * its PNG rasterization render identically.
 */
export const CHART_FONT = "system-ui, -apple-system, 'Segoe UI', sans-serif";
