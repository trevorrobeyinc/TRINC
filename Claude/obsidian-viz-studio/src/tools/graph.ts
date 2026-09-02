import { TFile } from "obsidian";
import type { ToolContext, ToolHandler } from "../types";
import { layoutRadial, type LayoutEdge, type LayoutNode, type Point } from "../render/layout";
import { CHART_FONT, CHART_MUTED_TEXT, CHART_TEXT_COLOR } from "../render/palette";
import { escapeXml } from "../render/svgUtils";
import { safePath, slugify, uniquePath, writeText } from "../vaultWriter";
import {
  optionalBoolean,
  optionalNumber,
  optionalString,
  persistSvgOutput,
  requireString,
  resolveFolder,
} from "./shared";

const FOCUS_COLOR = "#4E79A7";
const NODE_COLOR = "#8c959f";
const GHOST_COLOR = "#c0c6cd";
const EDGE_COLOR = "#b3bac2";
const HARD_MAX_NODES = 300;

interface GraphNode {
  id: string; // vault path, or "unresolved:<name>"
  label: string;
  degree: number;
  ghost: boolean;
}

interface GraphEdge {
  from: string;
  to: string;
  ghost: boolean;
}

function basenameOf(path: string): string {
  const name = path.substring(path.lastIndexOf("/") + 1);
  return name.replace(/\.md$/i, "");
}

function truncateLabel(label: string): string {
  return label.length > 24 ? `${label.slice(0, 23)}…` : label;
}

function resolveFocus(ctx: ToolContext, focus: string): TFile {
  const byLink = ctx.app.metadataCache.getFirstLinkpathDest(focus.replace(/\.md$/i, ""), "");
  if (byLink instanceof TFile) return byLink;
  const byPath = ctx.app.vault.getAbstractFileByPath(safePath(focus));
  if (byPath instanceof TFile) return byPath;
  throw new Error(
    `focus note not found: ${JSON.stringify(focus)} — pass a note name (e.g. "My Note") or vault path (e.g. "Folder/My Note.md")`
  );
}

export function createGraphSnapshotTool(ctx: ToolContext): ToolHandler {
  return async (input) => {
    const focus = resolveFocus(ctx, requireString(input, "focus"));
    const depth = Math.min(Math.max(Math.round(optionalNumber(input, "depth") ?? 2), 1), 4);
    const maxNodes = Math.min(
      Math.max(Math.round(optionalNumber(input, "maxNodes") ?? 100), 2),
      HARD_MAX_NODES
    );
    const includeUnresolved = optionalBoolean(input, "includeUnresolved") ?? false;

    const resolved = ctx.app.metadataCache.resolvedLinks as Record<
      string,
      Record<string, number>
    >;
    const unresolved = ctx.app.metadataCache.unresolvedLinks as Record<
      string,
      Record<string, number>
    >;

    // One pass over the (possibly large) link index to invert it.
    const inbound = new Map<string, string[]>();
    for (const [source, targets] of Object.entries(resolved)) {
      for (const target of Object.keys(targets)) {
        inbound.set(target, [...(inbound.get(target) ?? []), source]);
      }
    }

    // Deterministic BFS in both link directions.
    const depthOf = new Map<string, number>([[focus.path, 0]]);
    let truncated = false;
    let frontier = [focus.path];
    for (let d = 1; d <= depth && frontier.length > 0; d++) {
      const next: string[] = [];
      for (const current of frontier) {
        const neighbors = [
          ...Object.keys(resolved[current] ?? {}),
          ...(inbound.get(current) ?? []),
        ].sort();
        for (const neighbor of neighbors) {
          if (depthOf.has(neighbor)) continue;
          if (depthOf.size >= maxNodes) {
            truncated = true;
            break;
          }
          depthOf.set(neighbor, d);
          next.push(neighbor);
        }
        if (truncated) break;
      }
      if (truncated) break;
      frontier = next;
    }

    const nodes: GraphNode[] = [...depthOf.keys()].map((path) => ({
      id: path,
      label: truncateLabel(basenameOf(path)),
      degree: 0,
      ghost: false,
    }));
    const nodeIds = new Set(nodes.map((n) => n.id));

    const edges: GraphEdge[] = [];
    for (const source of nodeIds) {
      for (const target of Object.keys(resolved[source] ?? {}).sort()) {
        if (nodeIds.has(target)) edges.push({ from: source, to: target, ghost: false });
      }
    }

    if (includeUnresolved) {
      for (const source of [...nodeIds].sort()) {
        for (const name of Object.keys(unresolved[source] ?? {}).sort()) {
          if (nodes.length >= maxNodes) {
            truncated = true;
            break;
          }
          const ghostId = `unresolved:${name}`;
          if (!nodeIds.has(ghostId)) {
            nodeIds.add(ghostId);
            nodes.push({ id: ghostId, label: truncateLabel(name), degree: 0, ghost: true });
          }
          edges.push({ from: source, to: ghostId, ghost: true });
        }
        if (truncated) break;
      }
    }

    const degree = new Map<string, number>();
    for (const edge of edges) {
      degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
      degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
    }
    for (const node of nodes) node.degree = degree.get(node.id) ?? 0;

    const layoutNodes: LayoutNode[] = nodes.map((n) => ({ id: n.id, width: 40, height: 40 }));
    const layoutEdges: LayoutEdge[] = edges.map((e) => ({ from: e.from, to: e.to }));
    const positions = layoutRadial(layoutNodes, layoutEdges, focus.path);

    // Bounding box → offset into positive SVG space.
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const pos of positions.values()) {
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x);
      maxY = Math.max(maxY, pos.y);
    }
    const margin = 90;
    const width = Math.max(360, Math.round(maxX - minX + margin * 2));
    const height = Math.max(300, Math.round(maxY - minY + margin * 2));
    const ox = margin - minX;
    const oy = margin - minY;
    const at = (id: string): Point => {
      const pos = positions.get(id) as Point;
      return { x: pos.x + ox, y: pos.y + oy };
    };

    const parts: string[] = [];
    parts.push(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Link graph around ${escapeXml(basenameOf(focus.path))}">`
    );
    if (ctx.settings.chartBackground !== "transparent") {
      parts.push(`<rect width="100%" height="100%" fill="${escapeXml(ctx.settings.chartBackground)}"/>`);
    }
    parts.push(
      `<defs><marker id="vz-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${EDGE_COLOR}"/></marker></defs>`
    );
    parts.push(
      `<text x="16" y="24" font-family="${CHART_FONT}" font-size="13" font-weight="600" fill="${CHART_TEXT_COLOR}">${escapeXml(basenameOf(focus.path))} — link graph (depth ${depth})</text>`
    );

    for (const edge of edges) {
      const a = at(edge.from);
      const b = at(edge.to);
      const dash = edge.ghost ? ` stroke-dasharray="4 4"` : "";
      parts.push(
        `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${EDGE_COLOR}" stroke-width="1"${dash} marker-end="url(#vz-arrow)"/>`
      );
    }

    for (const node of nodes) {
      const pos = at(node.id);
      const isFocus = node.id === focus.path;
      const r = isFocus ? 14 : 6 + Math.min(8, node.degree);
      const fill = isFocus ? FOCUS_COLOR : node.ghost ? "none" : NODE_COLOR;
      const stroke = node.ghost ? ` stroke="${GHOST_COLOR}" stroke-width="2" stroke-dasharray="3 3"` : ` stroke="#ffffff" stroke-width="1.5"`;
      parts.push(`<circle cx="${pos.x}" cy="${pos.y}" r="${r}" fill="${fill}"${stroke}/>`);
      parts.push(
        `<text x="${pos.x}" y="${pos.y + r + 14}" text-anchor="middle" font-family="${CHART_FONT}" font-size="11" fill="${isFocus ? CHART_TEXT_COLOR : CHART_MUTED_TEXT}">${escapeXml(node.label)}</text>`
      );
    }
    parts.push("</svg>");
    const svg = parts.join("\n");

    const warnings: string[] = [];
    if (edges.length > 400) {
      warnings.push(`dense graph: ${edges.length} edges — consider a smaller depth or maxNodes`);
    }

    const extra: Record<string, unknown> = {
      focus: focus.path,
      depth,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      truncated,
    };

    // Optional clickable companion: same coordinates, real file nodes.
    if (optionalBoolean(input, "canvasCompanion")) {
      const canvasNodes = nodes.map((node) => {
        const pos = at(node.id);
        return node.ghost
          ? {
              id: node.id,
              type: "text",
              text: `*${node.label}* (unresolved)`,
              x: Math.round(pos.x * 2),
              y: Math.round(pos.y * 2),
              width: 240,
              height: 60,
            }
          : {
              id: node.id,
              type: "file",
              file: node.id,
              x: Math.round(pos.x * 2),
              y: Math.round(pos.y * 2),
              width: 300,
              height: 200,
            };
      });
      const canvasEdges = edges.map((edge, i) => ({
        id: `e${i + 1}`,
        fromNode: edge.from,
        toNode: edge.to,
      }));
      const folder = resolveFolder(input, ctx.settings.canvasFolder);
      const baseName = slugify(
        `${optionalString(input, "fileName") ?? `graph-${basenameOf(focus.path)}`}`
      );
      const overwrite = optionalBoolean(input, "overwrite") ?? false;
      const canvasPath = uniquePath(ctx.app, folder, baseName, "canvas", overwrite);
      await writeText(
        ctx.app,
        canvasPath,
        `${JSON.stringify({ nodes: canvasNodes, edges: canvasEdges }, null, 2)}\n`
      );
      extra.canvasPath = canvasPath;
      extra.canvasEmbed = `![[${canvasPath}]]`;
    }

    return persistSvgOutput(ctx, input, svg, warnings, {
      defaultBaseName: `graph-${basenameOf(focus.path)}`,
      caption: `Link graph around ${basenameOf(focus.path)}`,
      pngBackground: "transparent",
      extra,
    });
  };
}
