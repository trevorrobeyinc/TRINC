import type { ToolContext, ToolHandler } from "../types";
import {
  GROUP_PADDING,
  layoutGrid,
  layoutRadial,
  layoutTree,
  type LayoutEdge,
  type LayoutNode,
  type Point,
} from "../render/layout";
import { buildEmbed, slugify, uniquePath, writeText, appendBlock } from "../vaultWriter";
import { optionalBoolean, optionalString, resolveFolder } from "./shared";

interface CanvasNodeInput {
  id: string;
  label?: string;
  text?: string;
  file?: string;
  url?: string;
  group?: string;
  color?: string;
}

interface CanvasEdgeInput {
  from: string;
  to: string;
  label?: string;
  color?: string;
}

const COLOR_RE = /^([1-6]|#[0-9a-fA-F]{6})$/;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parseNodes(input: Record<string, unknown>): CanvasNodeInput[] {
  const raw = input.nodes;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error("nodes must be a non-empty array of { id, label?/text?/file?/url?, group?, color? }");
  }
  const seen = new Set<string>();
  return raw.map((n, i) => {
    if (!n || typeof n !== "object") throw new Error(`nodes[${i}] must be an object`);
    const node = n as Record<string, unknown>;
    const id = node.id;
    if (typeof id !== "string" || id.length === 0) {
      throw new Error(`nodes[${i}].id must be a non-empty string`);
    }
    if (seen.has(id)) throw new Error(`nodes[${i}].id "${id}" is duplicated`);
    seen.add(id);
    const color = node.color;
    if (color !== undefined && (typeof color !== "string" || !COLOR_RE.test(color))) {
      throw new Error(`nodes[${i}].color must be "1"-"6" or "#rrggbb"`);
    }
    for (const key of ["label", "text", "file", "url", "group"] as const) {
      if (node[key] !== undefined && typeof node[key] !== "string") {
        throw new Error(`nodes[${i}].${key} must be a string`);
      }
    }
    return node as unknown as CanvasNodeInput;
  });
}

function parseEdges(input: Record<string, unknown>, ids: Set<string>): CanvasEdgeInput[] {
  const raw = input.edges;
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new Error("edges must be an array of { from, to, label? }");
  return raw.map((e, i) => {
    if (!e || typeof e !== "object") throw new Error(`edges[${i}] must be an object`);
    const edge = e as Record<string, unknown>;
    for (const key of ["from", "to"] as const) {
      const value = edge[key];
      if (typeof value !== "string" || !ids.has(value)) {
        throw new Error(
          `edges[${i}].${key} must reference an existing node id (got ${JSON.stringify(value)})`
        );
      }
    }
    const color = edge.color;
    if (color !== undefined && (typeof color !== "string" || !COLOR_RE.test(color))) {
      throw new Error(`edges[${i}].color must be "1"-"6" or "#rrggbb"`);
    }
    return edge as unknown as CanvasEdgeInput;
  });
}

function nodeContent(node: CanvasNodeInput): string {
  return node.text ?? node.label ?? node.id;
}

function sizeOf(node: CanvasNodeInput): { width: number; height: number } {
  if (node.file) return { width: 300, height: 220 };
  if (node.url) return { width: 300, height: 120 };
  const content = nodeContent(node);
  const lines = content.split("\n");
  const maxLine = Math.max(...lines.map((l) => l.length));
  return {
    width: clamp(40 + maxLine * 8, 220, 400),
    height: clamp(36 + 24 * Math.ceil(content.length / 30), 60, 400),
  };
}

export function createCanvasTool(ctx: ToolContext): ToolHandler {
  return async (input) => {
    const nodesIn = parseNodes(input);
    const edgesIn = parseEdges(input, new Set(nodesIn.map((n) => n.id)));
    const title = optionalString(input, "title")?.trim() || "";
    const warnings: string[] = [];

    const layoutChoice =
      optionalString(input, "layout") ?? (edgesIn.length > 0 ? "tree" : "grid");
    if (!["grid", "tree", "radial"].includes(layoutChoice)) {
      throw new Error(`layout must be grid, tree, or radial (got ${JSON.stringify(layoutChoice)})`);
    }

    // Grid clusters read better when group members sit together.
    const orderedNodes =
      layoutChoice === "grid"
        ? [...nodesIn].sort((a, b) => (a.group ?? "").localeCompare(b.group ?? ""))
        : nodesIn;

    const layoutNodes: LayoutNode[] = orderedNodes.map((n) => ({ id: n.id, ...sizeOf(n) }));
    const layoutEdges: LayoutEdge[] = edgesIn.map((e) => ({ from: e.from, to: e.to }));
    const positions: Map<string, Point> =
      layoutChoice === "grid"
        ? layoutGrid(layoutNodes)
        : layoutChoice === "tree"
          ? layoutTree(layoutNodes, layoutEdges)
          : layoutRadial(layoutNodes, layoutEdges);

    const canvasNodes: Record<string, unknown>[] = [];
    for (const node of orderedNodes) {
      const pos = positions.get(node.id) as Point;
      const size = sizeOf(node);
      const base: Record<string, unknown> = {
        id: node.id,
        x: pos.x,
        y: pos.y,
        width: size.width,
        height: size.height,
      };
      if (node.color) base.color = node.color;
      if (node.file) {
        base.type = "file";
        base.file = node.file;
        if (!ctx.app.vault.getAbstractFileByPath(node.file)) {
          warnings.push(`canvas file node "${node.id}" points at a missing file: ${node.file}`);
        }
      } else if (node.url) {
        base.type = "link";
        base.url = node.url;
      } else {
        base.type = "text";
        base.text = nodeContent(node);
      }
      canvasNodes.push(base);
    }

    // Group frames: bounding box of members, prepended so they z-order underneath.
    const groups = new Map<string, CanvasNodeInput[]>();
    for (const node of orderedNodes) {
      if (!node.group) continue;
      groups.set(node.group, [...(groups.get(node.group) ?? []), node]);
    }
    const groupNodes: Record<string, unknown>[] = [];
    for (const [groupName, members] of groups) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const member of members) {
        const pos = positions.get(member.id) as Point;
        const size = sizeOf(member);
        minX = Math.min(minX, pos.x);
        minY = Math.min(minY, pos.y);
        maxX = Math.max(maxX, pos.x + size.width);
        maxY = Math.max(maxY, pos.y + size.height);
      }
      groupNodes.push({
        id: `group-${slugify(groupName)}`,
        type: "group",
        label: groupName,
        x: minX - GROUP_PADDING,
        y: minY - GROUP_PADDING,
        width: maxX - minX + GROUP_PADDING * 2,
        height: maxY - minY + GROUP_PADDING * 2,
      });
    }

    const canvasEdges = edgesIn.map((edge, i) => {
      const base: Record<string, unknown> = {
        id: `e${i + 1}`,
        fromNode: edge.from,
        toNode: edge.to,
      };
      if (layoutChoice === "tree") {
        base.fromSide = "bottom";
        base.toSide = "top";
      }
      if (edge.label) base.label = edge.label;
      if (edge.color) base.color = edge.color;
      return base;
    });

    const canvas = { nodes: [...groupNodes, ...canvasNodes], edges: canvasEdges };
    const json = `${JSON.stringify(canvas, null, 2)}\n`;

    const folder = resolveFolder(input, ctx.settings.canvasFolder);
    const baseName = slugify(optionalString(input, "fileName") ?? (title || "canvas-board"));
    const overwrite = optionalBoolean(input, "overwrite") ?? false;
    const path = uniquePath(ctx.app, folder, baseName, "canvas", overwrite);
    await writeText(ctx.app, path, json);

    const embed = buildEmbed(path);
    const result: Record<string, unknown> = {
      path,
      embed,
      nodeCount: canvasNodes.length,
      edgeCount: canvasEdges.length,
      layout: layoutChoice,
      summary: `Wrote canvas ${path} (${canvasNodes.length} nodes, ${canvasEdges.length} edges, ${layoutChoice} layout)`,
    };
    const targetNote = optionalString(input, "targetNote");
    if (targetNote) {
      const appended = await appendBlock(ctx.app, targetNote, embed, title || undefined);
      result.targetNote = appended.targetNote;
      result.targetNoteCreated = appended.targetNoteCreated;
    }
    if (warnings.length > 0) result.warnings = warnings;
    if (optionalBoolean(input, "returnContent")) result.canvas = canvas;
    return result;
  };
}
