/**
 * Visual Explainer Card composer: banner + diagram + legend + step key, as ONE
 * self-contained SVG.
 *
 * Why one SVG rather than rich markdown: a transcluded mermaid fence does not
 * render reliably in Obsidian (verified 2026-08-16 — it was the defect that
 * prompted this feature), while an image embed renders in every view mode.
 *
 * Two rules keep the composition safe:
 *   1. Mermaid's SVG is NESTED, not merged — its own <style> is id-scoped
 *      (#vz-mermaid-export …) so it cannot leak into the card chrome.
 *   2. All card chrome uses inline presentation attributes, never CSS classes,
 *      so nothing mermaid emits can restyle the banner, legend, or key.
 */
import { CHART_FONT } from "../palette";
import { escapeXml, estimateTextWidth } from "../svgUtils";
import { wrapText } from "../textWrap";
import type { EdgeKind, GuidedPreset } from "./presets";
import { nodeKindStyle } from "./presets";

export interface CardStep {
  title: string;
  detail?: string;
}

export interface LegendEntry {
  label: string;
  /** Swatch color for a node kind. */
  swatch?: string;
  /** Line sample for an edge kind. */
  line?: { color: string; dashed: boolean; width: number };
}

export interface CardTheme {
  background: string;
  panel: string;
  border: string;
  title: string;
  muted: string;
  body: string;
}

export const CARD_THEMES: Record<string, CardTheme> = {
  contrast: {
    background: "#ffffff",
    panel: "#f4f6f8",
    border: "#d0d4da",
    title: "#12181f",
    muted: "#57606a",
    body: "#1f2328",
  },
  slate: {
    background: "#f7f8fa",
    panel: "#eceff3",
    border: "#c7ced6",
    title: "#1a2029",
    muted: "#5a636e",
    body: "#232a33",
  },
  blueprint: {
    background: "#f2f6fb",
    panel: "#e3ecf7",
    border: "#b9cbe0",
    title: "#10263d",
    muted: "#4a6480",
    body: "#17324f",
  },
};

export interface ComposeCardInput {
  title: string;
  subtitle?: string;
  presetLabel: string;
  diagramSvg: string;
  legend: LegendEntry[];
  steps: CardStep[];
  theme: CardTheme;
  accent: string;
  width: number;
}

// OPERATOR DECISION — card type scale. An embedded SVG is scaled by Obsidian to
// fit the note's content width (~700px with readable-line-length on), so every
// size here is effectively multiplied by ~0.6 on screen. These are deliberately
// large so the card stays legible after that shrink; scale the whole set
// together if you want it tighter or roomier.
const PAD = 34;
const BANNER_H = 110;
const LEGEND_ROW_H = 32;
const LEGEND_TEXT_SIZE = 14;
const TITLE_TEXT_SIZE = 27;
const SUBTITLE_SIZE = 16;
const BADGE_SIZE = 13;
const STEP_TITLE_SIZE = 17;
const STEP_DETAIL_SIZE = 15;
const STEP_LINE_H = 21;
const SECTION_LABEL_SIZE = 13;
/** Text metrics are estimated, not measured — reserve slack so nothing clips. */
const SLACK = 1.15;

interface NestedDiagram {
  inner: string;
  viewBox: string;
  aspect: number;
  /**
   * Mermaid's own root id. Load-bearing: its stylesheet is id-scoped
   * (`#vz-mermaid-export .cluster rect { fill: … }`), so the nested <svg> must
   * carry the same id or every cluster/subgraph loses its fill and paints black.
   */
  id: string;
  className: string;
}

/**
 * Strip mermaid's outer wrapper (it emits width/height plus a max-width style)
 * and keep its children + viewBox for nesting at our own scale.
 */
function prepareDiagram(diagramSvg: string): NestedDiagram {
  const doc = new DOMParser().parseFromString(diagramSvg, "image/svg+xml");
  if (doc.querySelector("parsererror") || doc.documentElement.tagName.toLowerCase() !== "svg") {
    throw new Error("guided card: mermaid did not return a parseable SVG");
  }
  const root = doc.documentElement;
  let viewBox = root.getAttribute("viewBox") ?? "";
  if (!viewBox) {
    const w = parseFloat(root.getAttribute("width") ?? "800") || 800;
    const h = parseFloat(root.getAttribute("height") ?? "600") || 600;
    viewBox = `0 0 ${w} ${h}`;
  }
  const parts = viewBox.trim().split(/[\s,]+/).map(Number);
  const vbW = parts[2] > 0 ? parts[2] : 800;
  const vbH = parts[3] > 0 ? parts[3] : 600;

  const serializer = new XMLSerializer();
  const inner = Array.from(root.childNodes)
    .map((n) => serializer.serializeToString(n))
    .join("");

  return {
    inner,
    viewBox,
    aspect: vbH / vbW,
    id: root.getAttribute("id") ?? "",
    className: root.getAttribute("class") ?? "",
  };
}

function legendRows(entries: LegendEntry[], width: number): LegendEntry[][] {
  const rows: LegendEntry[][] = [];
  let row: LegendEntry[] = [];
  let x = 0;
  for (const e of entries) {
    const w = 40 + estimateTextWidth(e.label, LEGEND_TEXT_SIZE) + 26;
    if (x + w > width && row.length > 0) {
      rows.push(row);
      row = [];
      x = 0;
    }
    row.push(e);
    x += w;
  }
  if (row.length > 0) rows.push(row);
  return rows;
}

export function composeCard(input: ComposeCardInput): string {
  const { theme, accent, width } = input;
  const contentW = width - PAD * 2;
  const diagram = prepareDiagram(input.diagramSvg);

  // Fit the diagram to the content width, clamped so a tall graph cannot dwarf
  // the step key (the teaching half of the card).
  const diagramW = contentW;
  // Reserve the diagram's NATURAL height at full content width. Clamping it made
  // `preserveAspectRatio="meet"` letterbox tall diagrams — a 1.52-aspect graph
  // rendered at 922px inside a 1136px slot, ~19% smaller than the card allowed,
  // with dead space either side. A taller card is the right trade for a legible
  // diagram; the ceiling is only a runaway guard.
  const diagramH = Math.min(Math.round(diagramW * diagram.aspect), 6000);

  const rows = legendRows(input.legend, contentW);
  const legendH = input.legend.length > 0 ? 22 + rows.length * LEGEND_ROW_H : 0;

  // Measure the step key up front so the card height is exact.
  const stepTextW = contentW - 56;
  const measured = input.steps.map((s) => {
    const detailLines = s.detail ? wrapText(s.detail, stepTextW, STEP_DETAIL_SIZE) : [];
    return {
      step: s,
      detailLines,
      height: 26 + detailLines.length * STEP_LINE_H + 12,
    };
  });
  const stepsH =
    measured.length > 0
      ? 26 + Math.ceil(measured.reduce((sum, m) => sum + m.height, 0) * SLACK)
      : 0;

  const bodyTop = BANNER_H + 18;
  const legendTop = bodyTop + diagramH + 20;
  const stepsTop = legendTop + legendH + (legendH > 0 ? 10 : 0);
  const height = Math.round(stepsTop + stepsH + PAD);

  const p: string[] = [];
  p.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(input.title)}">`
  );
  p.push(`<rect width="100%" height="100%" fill="${escapeXml(theme.background)}"/>`);

  // ── Banner ──
  p.push(`<rect x="0" y="0" width="${width}" height="${BANNER_H}" fill="${escapeXml(theme.panel)}"/>`);
  p.push(`<rect x="0" y="0" width="6" height="${BANNER_H}" fill="${escapeXml(accent)}"/>`);
  p.push(
    `<text x="${PAD}" y="48" font-family="${CHART_FONT}" font-size="${TITLE_TEXT_SIZE}" font-weight="700" fill="${escapeXml(theme.title)}">${escapeXml(input.title)}</text>`
  );
  if (input.subtitle) {
    p.push(
      `<text x="${PAD}" y="78" font-family="${CHART_FONT}" font-size="${SUBTITLE_SIZE}" fill="${escapeXml(theme.muted)}">${escapeXml(input.subtitle)}</text>`
    );
  }
  const badge = input.presetLabel;
  const badgeW = Math.round(estimateTextWidth(badge, BADGE_SIZE) + 26);
  p.push(
    `<rect x="${width - PAD - badgeW}" y="26" width="${badgeW}" height="26" rx="13" fill="${escapeXml(accent)}"/>`,
    `<text x="${width - PAD - badgeW / 2}" y="44" text-anchor="middle" font-family="${CHART_FONT}" font-size="${BADGE_SIZE}" font-weight="600" fill="#ffffff">${escapeXml(badge)}</text>`
  );
  p.push(
    `<line x1="0" y1="${BANNER_H}" x2="${width}" y2="${BANNER_H}" stroke="${escapeXml(theme.border)}" stroke-width="1"/>`
  );

  // ── Diagram (nested; mermaid's own id-scoped styles stay inside) ──
  // The id/class are carried onto the nested <svg> so mermaid's id-scoped CSS
  // keeps matching — without it, clusters lose their fill and paint black.
  const idAttr = diagram.id ? ` id="${escapeXml(diagram.id)}"` : "";
  const classAttr = diagram.className ? ` class="${escapeXml(diagram.className)}"` : "";
  p.push(
    `<svg${idAttr}${classAttr} x="${PAD}" y="${bodyTop}" width="${diagramW}" height="${diagramH}" viewBox="${escapeXml(diagram.viewBox)}" preserveAspectRatio="xMidYMid meet">${diagram.inner}</svg>`
  );

  // ── Legend ──
  if (legendH > 0) {
    p.push(
      `<text x="${PAD}" y="${legendTop + 12}" font-family="${CHART_FONT}" font-size="${SECTION_LABEL_SIZE}" font-weight="700" letter-spacing="0.6" fill="${escapeXml(theme.muted)}">LEGEND</text>`
    );
    rows.forEach((row, ri) => {
      let x = PAD;
      const y = legendTop + 30 + ri * LEGEND_ROW_H;
      for (const e of row) {
        if (e.line) {
          const dash = e.line.dashed ? ` stroke-dasharray="7 5"` : "";
          p.push(
            `<line x1="${x}" y1="${y - 5}" x2="${x + 32}" y2="${y - 5}" stroke="${escapeXml(e.line.color)}" stroke-width="${e.line.width + 0.7}"${dash}/>`
          );
        } else {
          p.push(
            `<rect x="${x}" y="${y - 15}" width="20" height="20" rx="4" fill="${escapeXml(e.swatch ?? accent)}"/>`
          );
        }
        p.push(
          `<text x="${x + 40}" y="${y}" font-family="${CHART_FONT}" font-size="${LEGEND_TEXT_SIZE}" fill="${escapeXml(theme.body)}">${escapeXml(e.label)}</text>`
        );
        x += 40 + estimateTextWidth(e.label, LEGEND_TEXT_SIZE) + 26;
      }
    });
  }

  // ── Step key ──
  if (stepsH > 0) {
    p.push(
      `<line x1="${PAD}" y1="${stepsTop}" x2="${width - PAD}" y2="${stepsTop}" stroke="${escapeXml(theme.border)}" stroke-width="1"/>`
    );
    p.push(
      `<text x="${PAD}" y="${stepsTop + 18}" font-family="${CHART_FONT}" font-size="${SECTION_LABEL_SIZE}" font-weight="700" letter-spacing="0.6" fill="${escapeXml(theme.muted)}">STEP-BY-STEP BREAKDOWN</text>`
    );
    let y = stepsTop + 52;
    measured.forEach((m, i) => {
      p.push(
        `<circle cx="${PAD + 14}" cy="${y - 6}" r="14" fill="${escapeXml(accent)}"/>`,
        `<text x="${PAD + 14}" y="${y - 1}" text-anchor="middle" font-family="${CHART_FONT}" font-size="13" font-weight="700" fill="#ffffff">${i + 1}</text>`,
        `<text x="${PAD + 40}" y="${y}" font-family="${CHART_FONT}" font-size="${STEP_TITLE_SIZE}" font-weight="600" fill="${escapeXml(theme.title)}">${escapeXml(m.step.title)}</text>`
      );
      let ly = y + STEP_LINE_H;
      for (const line of m.detailLines) {
        p.push(
          `<text x="${PAD + 40}" y="${ly}" font-family="${CHART_FONT}" font-size="${STEP_DETAIL_SIZE}" fill="${escapeXml(theme.body)}">${escapeXml(line)}</text>`
        );
        ly += STEP_LINE_H;
      }
      y += m.height;
    });
  }

  p.push("</svg>");
  return p.join("\n");
}

/** Legend derived from the node/edge kinds the diagram actually uses. */
export function autoLegend(
  preset: GuidedPreset,
  usedKinds: string[],
  usedEdgeKinds: EdgeKind[]
): LegendEntry[] {
  const entries: LegendEntry[] = [];
  for (const kind of usedKinds) {
    const style = nodeKindStyle(preset, kind);
    entries.push({ label: style.label, swatch: style.swatch });
  }
  for (const kind of usedEdgeKinds) {
    const style = preset.edgeKinds[kind];
    if (!style) continue;
    entries.push({
      label: style.label,
      line: { color: style.color, dashed: style.dashed, width: style.width },
    });
  }
  return entries;
}
