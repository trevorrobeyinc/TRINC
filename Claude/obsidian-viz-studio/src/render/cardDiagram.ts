/**
 * Card diagram — system/architecture diagrams in the "visualize" design
 * language: rounded cards with a 500-weight title line and a muted subtitle
 * line, semantic color roles per card, faint section headers over clusters,
 * thin grey chevron-head arrows (dashed for pending/inactive links).
 *
 * The palette and component rules are captured from the visualize MCP's
 * diagram module (read_me, 2026-08-27) and baked in as literals — a vault
 * SVG cannot reach host CSS, so theme classes become explicit hex. Pure
 * functions like chartRender: identical spec in, byte-identical SVG out
 * (no ids, no defs/markers — arrowheads are explicit chevron paths).
 *
 * Layout is deterministic: nodes are layered left→right by longest-path
 * edge depth, grouped nodes share one labeled column, same-column nodes
 * stack vertically, and disconnected components stack as separate bands —
 * which reproduces the reference composition (two upper clusters feeding a
 * sink, an unrelated chain as its own bottom band).
 */
import { CHART_FONT } from "./palette";
import { escapeXml } from "./svgUtils";

import { INK, RAMPS } from "./vizTokens";

const ARROW_COLOR = "#8C959F";
const SECTION_LABEL_COLOR = "#C9CDD3";
const TITLE_COLOR = "#0b0b0b";

export const CARD_KINDS = ["ink", ...Object.keys(RAMPS)] as const;

export interface DiagramNodeInput {
  id: string;
  title?: string;
  subtitle?: string;
  /** Color role: ink (near-black) or a ramp name; defaults to gray. */
  kind?: string;
  /** Cluster name; members share one column under a faint section header. */
  group?: string;
}

export interface DiagramEdgeInput {
  from: string;
  to: string;
  label?: string;
  /** Dashed connector for pending/inactive/optional links. */
  dashed?: boolean;
}

interface ResolvedNode {
  id: string;
  title: string;
  subtitle?: string;
  kind: string;
  group?: string;
  fill: string;
  stroke: string;
  titleColor: string;
  subtitleColor: string;
  // Filled in by layout:
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ResolvedCardDiagram {
  title?: string;
  nodes: ResolvedNode[];
  edges: DiagramEdgeInput[];
  style: "solid" | "soft";
  background: string;
  warnings: string[];
}

const MAX_NODES = 40;
const TITLE_SIZE = 16;
const NODE_TITLE_SIZE = 14;
const NODE_SUB_SIZE = 12;
const SECTION_SIZE = 14;
const CARD_RX = 10;
const PAD = 40;
const COL_GAP = 100;
const ROW_GAP = 28;
const GROUP_HEADER_H = 30;
const BAND_GAP = 70;

/** 14px medium ≈ 8.2px/char, 12px regular ≈ 6.6px/char (calibration table). */
function titleWidth(text: string): number {
  return text.length * 8.2;
}
function subWidth(text: string): number {
  return text.length * 6.6;
}

function cardSize(node: { title: string; subtitle?: string }): { w: number; h: number } {
  const w = Math.ceil(
    Math.min(320, Math.max(150, Math.max(titleWidth(node.title), node.subtitle ? subWidth(node.subtitle) : 0) + 48))
  );
  return { w, h: node.subtitle ? 64 : 46 };
}

export function resolveCardDiagram(input: Record<string, unknown>): ResolvedCardDiagram {
  const warnings: string[] = [];
  const title =
    typeof input.title === "string" && input.title.trim() ? input.title.trim() : undefined;

  const rawNodes = input.nodes;
  if (!Array.isArray(rawNodes) || rawNodes.length === 0) {
    throw new Error("nodes must be a non-empty array of { id, title?, subtitle?, kind?, group? }");
  }
  if (rawNodes.length > MAX_NODES) {
    throw new Error(`nodes is capped at ${MAX_NODES} for legibility (got ${rawNodes.length})`);
  }

  const opts = (input.options ?? {}) as Record<string, unknown>;
  const style = opts.style === "soft" ? "soft" : "solid";
  const background =
    typeof opts.background === "string" && opts.background.trim() ? opts.background.trim() : "#FBFBFA";

  const seen = new Set<string>();
  const nodes: ResolvedNode[] = rawNodes.map((raw, i) => {
    if (!raw || typeof raw !== "object") throw new Error(`nodes[${i}] must be an object`);
    const n = raw as Record<string, unknown>;
    if (typeof n.id !== "string" || !n.id.trim()) {
      throw new Error(`nodes[${i}].id must be a non-empty string`);
    }
    const id = n.id.trim();
    if (seen.has(id)) throw new Error(`nodes[${i}].id "${id}" is duplicated`);
    seen.add(id);
    for (const key of ["title", "subtitle", "kind", "group"] as const) {
      if (n[key] !== undefined && typeof n[key] !== "string") {
        throw new Error(`nodes[${i}].${key} must be a string`);
      }
    }
    const kind = ((n.kind as string | undefined)?.trim() || "gray").toLowerCase();
    if (kind !== "ink" && !RAMPS[kind]) {
      throw new Error(
        `nodes[${i}].kind must be one of ${CARD_KINDS.join(", ")} (got ${JSON.stringify(n.kind)})`
      );
    }
    const ramp = RAMPS[kind];
    const colors =
      kind === "ink"
        ? INK
        : style === "solid"
          ? { fill: ramp.s800, stroke: ramp.s600, title: ramp.s100, subtitle: ramp.s200 }
          : { fill: ramp.s50, stroke: ramp.s600, title: ramp.s800, subtitle: ramp.s600 };
    return {
      id,
      title: (n.title as string | undefined)?.trim() || id,
      subtitle: (n.subtitle as string | undefined)?.trim() || undefined,
      kind,
      group: (n.group as string | undefined)?.trim() || undefined,
      fill: colors.fill,
      stroke: colors.stroke,
      titleColor: colors.title,
      subtitleColor: colors.subtitle,
      x: 0,
      y: 0,
      w: 0,
      h: 0,
    };
  });

  const ids = new Set(nodes.map((n) => n.id));
  const rawEdges = input.edges;
  const edges: DiagramEdgeInput[] = [];
  if (rawEdges !== undefined && rawEdges !== null) {
    if (!Array.isArray(rawEdges)) throw new Error("edges must be an array of { from, to, label?, dashed? }");
    rawEdges.forEach((raw, i) => {
      if (!raw || typeof raw !== "object") throw new Error(`edges[${i}] must be an object`);
      const e = raw as Record<string, unknown>;
      for (const key of ["from", "to"] as const) {
        if (typeof e[key] !== "string" || !ids.has(e[key] as string)) {
          throw new Error(`edges[${i}].${key} must reference an existing node id (got ${JSON.stringify(e[key])})`);
        }
      }
      if (e.label !== undefined && typeof e.label !== "string") throw new Error(`edges[${i}].label must be a string`);
      if (e.dashed !== undefined && typeof e.dashed !== "boolean") throw new Error(`edges[${i}].dashed must be a boolean`);
      if (e.from === e.to) {
        warnings.push(`edges[${i}] is a self-loop (${JSON.stringify(e.from)}) and was dropped`);
        return;
      }
      edges.push({ from: e.from as string, to: e.to as string, label: e.label as string | undefined, dashed: e.dashed === true });
    });
  }

  return { title, nodes, edges, style, background, warnings };
}

// ─── Layout ───

/**
 * Longest-path layering with two twists that match the reference layout:
 * grouped nodes are pulled into one shared column (the group's max member
 * depth), and connectivity for banding treats group-mates as connected so a
 * cluster never splits across bands.
 */
function layout(diagram: ResolvedCardDiagram): { width: number; height: number; headerY: number } {
  const { nodes, edges } = diagram;
  const byId = new Map(nodes.map((n) => [n.id, n]));

  for (const n of nodes) {
    const size = cardSize(n);
    n.w = size.w;
    n.h = size.h;
  }
  // Uniform card height per diagram reads calmer (spec: same content type,
  // same height) — when any card has a subtitle, all cards take that height.
  const uniformH = nodes.some((n) => n.subtitle) ? 64 : 46;
  for (const n of nodes) n.h = uniformH;

  // Undirected adjacency (edges + group-mates) → connected components/bands.
  const adj = new Map<string, Set<string>>(nodes.map((n) => [n.id, new Set<string>()]));
  for (const e of edges) {
    (adj.get(e.from) as Set<string>).add(e.to);
    (adj.get(e.to) as Set<string>).add(e.from);
  }
  const groupMembers = new Map<string, ResolvedNode[]>();
  for (const n of nodes) {
    if (!n.group) continue;
    groupMembers.set(n.group, [...(groupMembers.get(n.group) ?? []), n]);
  }
  for (const members of groupMembers.values()) {
    for (let i = 1; i < members.length; i++) {
      (adj.get(members[0].id) as Set<string>).add(members[i].id);
      (adj.get(members[i].id) as Set<string>).add(members[0].id);
    }
  }
  const componentOf = new Map<string, number>();
  let componentCount = 0;
  for (const n of nodes) {
    if (componentOf.has(n.id)) continue;
    const queue = [n.id];
    componentOf.set(n.id, componentCount);
    while (queue.length > 0) {
      const cur = queue.shift() as string;
      for (const next of adj.get(cur) as Set<string>) {
        if (!componentOf.has(next)) {
          componentOf.set(next, componentCount);
          queue.push(next);
        }
      }
    }
    componentCount++;
  }

  // Longest-path depth over directed edges (cycles broken by visit guard).
  const depth = new Map<string, number>();
  const outgoing = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  const indeg = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  for (const e of edges) {
    (outgoing.get(e.from) as string[]).push(e.to);
    indeg.set(e.to, (indeg.get(e.to) as number) + 1);
  }
  const visit = (id: string, d: number, seen: Set<string>) => {
    if (seen.has(id)) return;
    seen.add(id);
    if ((depth.get(id) ?? 0) < d) depth.set(id, d);
    for (const next of outgoing.get(id) as string[]) visit(next, d + 1, seen);
    seen.delete(id);
  };
  for (const n of nodes) {
    if ((indeg.get(n.id) as number) === 0) visit(n.id, 0, new Set());
  }
  for (const n of nodes) if (!depth.has(n.id)) depth.set(n.id, 0);

  // A group's members share one column (the deepest member's depth) — that is
  // what makes a cluster read as a labeled stack. EXCEPT when a band is
  // exactly one group and nothing else: then the group IS the flow (e.g. a
  // credential → rule → readers chain), and flattening it to one column would
  // hide its arrows — lay it out by depth like ungrouped nodes.
  const columnOf = new Map<string, number>();
  for (const n of nodes) columnOf.set(n.id, depth.get(n.id) as number);
  for (const members of groupMembers.values()) {
    const bandId = componentOf.get(members[0].id) as number;
    const band = nodes.filter((n) => componentOf.get(n.id) === bandId);
    if (band.length === members.length) continue;
    const col = Math.max(...members.map((m) => depth.get(m.id) as number));
    for (const m of members) columnOf.set(m.id, col);
  }

  // Stack bands vertically; inside a band, columns left→right in input order.
  const titleOffset = diagram.title ? 34 : 0;
  const headerY = PAD + titleOffset;
  let bandY = headerY;
  let maxRight = 0;
  for (let band = 0; band < componentCount; band++) {
    const bandNodes = nodes.filter((n) => componentOf.get(n.id) === band);
    if (bandNodes.length === 0) continue;
    const bandHasGroups = bandNodes.some((n) => n.group);
    const topPad = bandHasGroups ? GROUP_HEADER_H : 0;

    const columns = new Map<number, ResolvedNode[]>();
    for (const n of bandNodes) {
      const col = columnOf.get(n.id) as number;
      columns.set(col, [...(columns.get(col) ?? []), n]);
    }
    let x = PAD;
    let bandBottom = bandY;
    for (const col of [...columns.keys()].sort((a, b) => a - b)) {
      const colNodes = columns.get(col) as ResolvedNode[];
      const colWidth = Math.max(...colNodes.map((n) => n.w));
      let y = bandY + topPad;
      for (const n of colNodes) {
        n.x = x;
        n.y = y;
        n.w = colWidth;
        y += n.h + ROW_GAP;
      }
      bandBottom = Math.max(bandBottom, y - ROW_GAP);
      maxRight = Math.max(maxRight, x + colWidth);
      x += colWidth + COL_GAP;
    }
    // Sink columns read better vertically centered against tall columns.
    const bandHeight = bandBottom - (bandY + topPad);
    for (const col of columns.keys()) {
      const colNodes = columns.get(col) as ResolvedNode[];
      const colHeight =
        colNodes.reduce((sum, n) => sum + n.h, 0) + ROW_GAP * (colNodes.length - 1);
      const shift = Math.floor((bandHeight - colHeight) / 2);
      if (shift > 0) for (const n of colNodes) n.y += shift;
    }
    bandY = bandBottom + BAND_GAP;
  }
  const width = Math.ceil(maxRight + PAD);
  const height = Math.ceil(bandY - BAND_GAP + PAD);
  void byId;
  return { width, height, headerY };
}

// ─── Rendering ───

export interface RenderedCardDiagram {
  svg: string;
  width: number;
  height: number;
}

function chevronHead(x: number, y: number, angle: number): string {
  const size = 6;
  const spread = 0.5;
  const x1 = x - size * Math.cos(angle - spread);
  const y1 = y - size * Math.sin(angle - spread);
  const x2 = x - size * Math.cos(angle + spread);
  const y2 = y - size * Math.sin(angle + spread);
  const f = (v: number) => Math.round(v * 10) / 10;
  return `<path d="M${f(x1)} ${f(y1)}L${f(x)} ${f(y)}L${f(x2)} ${f(y2)}" fill="none" stroke="${ARROW_COLOR}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`;
}

/** Point on the rect border toward an outside target, with a small gap. */
function anchor(node: ResolvedNode, tx: number, ty: number): { x: number; y: number } {
  const cx = node.x + node.w / 2;
  const cy = node.y + node.h / 2;
  const dx = tx - cx;
  const dy = ty - cy;
  const gap = 8;
  if (Math.abs(dx) * node.h >= Math.abs(dy) * node.w) {
    const side = dx >= 0 ? 1 : -1;
    const x = cx + side * (node.w / 2 + gap);
    const t = dx === 0 ? 0 : (x - cx) / dx;
    return { x, y: cy + dy * t };
  }
  const side = dy >= 0 ? 1 : -1;
  const y = cy + side * (node.h / 2 + gap);
  const t = dy === 0 ? 0 : (y - cy) / dy;
  return { x: cx + dx * t, y };
}

export function renderCardDiagram(diagram: ResolvedCardDiagram): RenderedCardDiagram {
  const { width, height, headerY } = layout(diagram);
  const byId = new Map(diagram.nodes.map((n) => [n.id, n]));
  const f = (v: number) => Math.round(v * 10) / 10;
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img"${
      diagram.title ? ` aria-label="${escapeXml(diagram.title)}"` : ""
    }>`
  );
  if (diagram.background !== "transparent") {
    parts.push(`<rect width="100%" height="100%" fill="${escapeXml(diagram.background)}"/>`);
  }
  if (diagram.title) {
    parts.push(
      `<text x="${width / 2}" y="${PAD - 8}" text-anchor="middle" font-family="${CHART_FONT}" font-size="${TITLE_SIZE}" font-weight="600" fill="${TITLE_COLOR}">${escapeXml(diagram.title)}</text>`
    );
  }
  void headerY;

  // Section headers: faint, above the topmost card of each group.
  const groupTop = new Map<string, { x: number; y: number }>();
  for (const n of diagram.nodes) {
    if (!n.group) continue;
    const cur = groupTop.get(n.group);
    if (!cur || n.y < cur.y) groupTop.set(n.group, { x: n.x, y: n.y });
  }
  for (const [group, pos] of groupTop) {
    parts.push(
      `<text x="${pos.x + 4}" y="${pos.y - 12}" font-family="${CHART_FONT}" font-size="${SECTION_SIZE}" font-weight="600" fill="${SECTION_LABEL_COLOR}">${escapeXml(group)}</text>`
    );
  }

  // Edges under cards' shadows but over background; straight, edge-to-edge.
  for (const e of diagram.edges) {
    const from = byId.get(e.from) as ResolvedNode;
    const to = byId.get(e.to) as ResolvedNode;
    const start = anchor(from, to.x + to.w / 2, to.y + to.h / 2);
    const end = anchor(to, from.x + from.w / 2, from.y + from.h / 2);
    const dash = e.dashed ? ` stroke-dasharray="4 5"` : "";
    parts.push(
      `<line x1="${f(start.x)}" y1="${f(start.y)}" x2="${f(end.x)}" y2="${f(end.y)}" stroke="${ARROW_COLOR}" stroke-width="1.5"${dash}/>`,
      chevronHead(end.x, end.y, Math.atan2(end.y - start.y, end.x - start.x))
    );
    if (e.label) {
      const mx = (start.x + end.x) / 2;
      const my = (start.y + end.y) / 2 - 6;
      parts.push(
        `<text x="${f(mx)}" y="${f(my)}" text-anchor="middle" font-family="${CHART_FONT}" font-size="${NODE_SUB_SIZE}" fill="${ARROW_COLOR}">${escapeXml(e.label)}</text>`
      );
    }
  }

  // Cards: rounded rect + centered title/subtitle (dominant-baseline central).
  for (const n of diagram.nodes) {
    const cx = n.x + n.w / 2;
    parts.push(
      `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="${CARD_RX}" fill="${n.fill}" stroke="${n.stroke}" stroke-width="0.5"/>`
    );
    if (n.subtitle) {
      parts.push(
        `<text x="${cx}" y="${n.y + n.h / 2 - 10}" text-anchor="middle" dominant-baseline="central" font-family="${CHART_FONT}" font-size="${NODE_TITLE_SIZE}" font-weight="600" fill="${n.titleColor}">${escapeXml(n.title)}</text>`,
        `<text x="${cx}" y="${n.y + n.h / 2 + 12}" text-anchor="middle" dominant-baseline="central" font-family="${CHART_FONT}" font-size="${NODE_SUB_SIZE}" fill="${n.subtitleColor}">${escapeXml(n.subtitle)}</text>`
      );
    } else {
      parts.push(
        `<text x="${cx}" y="${n.y + n.h / 2}" text-anchor="middle" dominant-baseline="central" font-family="${CHART_FONT}" font-size="${NODE_TITLE_SIZE}" font-weight="600" fill="${n.titleColor}">${escapeXml(n.title)}</text>`
      );
    }
  }

  parts.push("</svg>");
  return { svg: parts.join(""), width, height };
}
