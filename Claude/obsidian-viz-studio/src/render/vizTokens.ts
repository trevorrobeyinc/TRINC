/**
 * Design tokens captured from the visualize MCP's module specs (read_me,
 * diagram + chart/data-viz + mockup/interactive modules, 2026-08-27) and
 * baked in as literals — vault artifacts cannot reach host CSS, so the
 * classes/vars become explicit hex. ONE source of truth for every renderer:
 * cardDiagram (ramps/ink), chartRender (Cove + chrome), statTiles, mockup,
 * and the interactive HTML wrapper (which alone carries both modes as real
 * CSS custom properties, since it runs in a browser).
 */

/** 9 color ramps (stops 50…900 reduced to the stops the renderers use). */
export const RAMPS: Record<
  string,
  { s50: string; s100: string; s200: string; s600: string; s800: string }
> = {
  purple: { s50: "#EEEDFE", s100: "#CECBF6", s200: "#AFA9EC", s600: "#534AB7", s800: "#3C3489" },
  teal: { s50: "#E1F5EE", s100: "#9FE1CB", s200: "#5DCAA5", s600: "#0F6E56", s800: "#085041" },
  coral: { s50: "#FAECE7", s100: "#F5C4B3", s200: "#F0997B", s600: "#993C1D", s800: "#712B13" },
  pink: { s50: "#FBEAF0", s100: "#F4C0D1", s200: "#ED93B1", s600: "#993556", s800: "#72243E" },
  gray: { s50: "#F1EFE8", s100: "#D3D1C7", s200: "#B4B2A9", s600: "#5F5E5A", s800: "#444441" },
  blue: { s50: "#E6F1FB", s100: "#B5D4F4", s200: "#85B7EB", s600: "#185FA5", s800: "#0C447C" },
  green: { s50: "#EAF3DE", s100: "#C0DD97", s200: "#97C459", s600: "#3B6D11", s800: "#27500A" },
  amber: { s50: "#FAEEDA", s100: "#FAC775", s200: "#EF9F27", s600: "#854F0B", s800: "#633806" },
  red: { s50: "#FCEBEB", s100: "#F7C1C1", s200: "#F09595", s600: "#A32D2D", s800: "#791F1F" },
};

/** Near-black "ink" card (hub/terminal nodes in card diagrams). */
export const INK = { fill: "#16181D", stroke: "#2C2C2A", title: "#FFFFFF", subtitle: "#B4B2A9" };

/**
 * Cove categorical palette — fixed slot order, never cycled past 8 (the 9th
 * series folds into "Other"). Light-mode set; vault charts render light with
 * an explicit background.
 */
export const COVE: readonly string[] = [
  "#2a78d6", // 1 blue
  "#eb6834", // 2 orange
  "#1baf7a", // 3 aqua
  "#eda100", // 4 yellow
  "#e87ba4", // 5 magenta
  "#008300", // 6 green
  "#4a3aa7", // 7 violet
  "#e34948", // 8 red
];

/** Status colors (state — good/warning/serious/critical). Reserved; never "series 4". */
export const STATUS = {
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
};

/** Chart chrome, light mode (the CDS ink/gridline neutrals). */
export const CHROME = {
  surface1: "#fcfcfb",
  surface2: "#ffffff",
  textPrimary: "#0b0b0b",
  textSecondary: "#52514e",
  textMuted: "#898781",
  gridline: "#e1e0d9",
  baseline: "#c3c2b7",
  border: "rgba(11,11,11,0.10)",
  borderStrong: "rgba(11,11,11,0.16)",
};

/** CDS accent role (blue) for UI surfaces: pale tint + strong text + solid fill. */
export const ACCENT = { bg: "#E6F1FB", text: "#185FA5", fill: "#2a78d6", on: "#ffffff" };

/**
 * The hero-number voice: Anthropic Serif is host-only, so stat tiles pin the
 * closest universally-present serif stack (tabular lining figures requested
 * via font-variant-numeric where supported).
 */
export const VOICE_FONT = "Georgia, 'Iowan Old Style', 'Times New Roman', serif";

/**
 * Complete CSS custom-property block for standalone interactive HTML
 * documents — light values on :root, dark under prefers-color-scheme (these
 * run in a real browser, the one surface where both modes are live). Values
 * from the CDS token tables; dark surface-2 approximates gray-830 (the dump
 * documents 850 = #1a1a19 and anchors 900 = #0b0b0b).
 */
export const CDS_HTML_TOKENS = `:root {
  --surface-1: #fcfcfb; --surface-2: #ffffff;
  --text-primary: #0b0b0b; --text-secondary: #52514e; --text-muted: #898781;
  --border: rgba(11,11,11,0.10); --border-strong: rgba(11,11,11,0.16);
  --bg-accent: #E6F1FB; --text-accent: #185FA5; --fill-accent: #2a78d6; --on-accent: #ffffff;
  --bg-success: #EAF3DE; --text-success: #3B6D11;
  --bg-warning: #FAEEDA; --text-warning: #854F0B;
  --bg-danger: #FCEBEB; --text-danger: #A32D2D;
  --gridline: #e1e0d9; --baseline: #c3c2b7;
  --radius: 8px;
  --font-sans: system-ui, -apple-system, 'Segoe UI', sans-serif;
  --font-voice: Georgia, 'Iowan Old Style', 'Times New Roman', serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, monospace;
}
@media (prefers-color-scheme: dark) {
  :root {
    --surface-1: #1a1a19; --surface-2: #1e1e1d;
    --text-primary: #f0efec; --text-secondary: #c3c2b7; --text-muted: #898781;
    --border: rgba(255,255,255,0.10); --border-strong: rgba(255,255,255,0.16);
    --bg-accent: #0C447C; --text-accent: #85B7EB; --fill-accent: #3987e5;
    --bg-success: #27500A; --text-success: #C0DD97;
    --bg-warning: #633806; --text-warning: #FAC775;
    --bg-danger: #791F1F; --text-danger: #F7C1C1;
    --gridline: #2c2c2a; --baseline: #383835;
  }
}`;
