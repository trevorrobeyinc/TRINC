import { App, TFile } from "obsidian";
import { ensureFolder, safePath } from "./vaultWriter";

/**
 * Insert-only writes into JSONCanvas files.
 *
 * Written through the ordinary vault API rather than the Canvas view's internal
 * node methods: verified live 2026-08-16 that a canvas open in a tab picks up an
 * on-disk change (the view reloads), so one stable code path serves open, closed,
 * and brand-new canvases. Pending in-view edits are flushed first so a write can
 * never race ahead of unsaved state.
 */

export interface CanvasNode {
  id: string;
  type: "text" | "file" | "link" | "group";
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  file?: string;
  url?: string;
  color?: string;
  label?: string;
}

export interface CanvasDoc {
  nodes: CanvasNode[];
  edges: Record<string, unknown>[];
}

const NODE_GAP = 60;

export function isCanvasPath(path: string): boolean {
  return /\.canvas$/i.test(path);
}

/** Flush any unsaved edits in an open Canvas view for this path. */
async function flushOpenCanvas(app: App, path: string): Promise<void> {
  const leaves = app.workspace.getLeavesOfType("canvas");
  for (const leaf of leaves) {
    const view = leaf.view as unknown as {
      file?: { path?: string };
      canvas?: { requestSave?: () => void };
    };
    if (view?.file?.path === path && typeof view.canvas?.requestSave === "function") {
      view.canvas.requestSave();
      await new Promise((r) => setTimeout(r, 250));
    }
  }
}

function parseCanvas(raw: string, path: string): CanvasDoc {
  const trimmed = raw.trim();
  if (!trimmed) return { nodes: [], edges: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    throw new Error(
      `${path} is not valid JSON and would be destroyed by an insert (${err instanceof Error ? err.message : String(err)})`
    );
  }
  const doc = parsed as Partial<CanvasDoc>;
  return {
    nodes: Array.isArray(doc.nodes) ? (doc.nodes as CanvasNode[]) : [],
    edges: Array.isArray(doc.edges) ? (doc.edges as Record<string, unknown>[]) : [],
  };
}

/**
 * Free space to the right of everything already on the canvas, top-aligned with
 * existing content. Keeps insertions from landing on top of the user's work.
 */
export function nextFreePosition(nodes: readonly CanvasNode[]): { x: number; y: number } {
  if (nodes.length === 0) return { x: 0, y: 0 };
  let maxX = -Infinity;
  let minY = Infinity;
  for (const n of nodes) {
    const x = Number(n.x) || 0;
    const y = Number(n.y) || 0;
    maxX = Math.max(maxX, x + (Number(n.width) || 0));
    minY = Math.min(minY, y);
  }
  if (!Number.isFinite(maxX) || !Number.isFinite(minY)) return { x: 0, y: 0 };
  return { x: Math.round(maxX + NODE_GAP), y: Math.round(minY) };
}

/** Deterministic 16-hex id derived from the node's own content. */
function canvasNodeId(seed: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < seed.length; i++) {
    h1 = Math.imul(h1 ^ seed.charCodeAt(i), 0x01000193) >>> 0;
    h2 = Math.imul(h2 + seed.charCodeAt(i) + i, 0x85ebca6b) >>> 0;
  }
  return (h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0")).slice(0, 16);
}

export interface InsertResult {
  canvasPath: string;
  canvasCreated: boolean;
  nodeId: string;
  x: number;
  y: number;
  nodeCount: number;
}

export interface InsertOptions {
  /** Vault path of the note or asset the node points at (file nodes). */
  file?: string;
  /** Markdown body for a text node. */
  text?: string;
  width?: number;
  height?: number;
  color?: string;
}

/**
 * Append one node to a canvas, creating the canvas when missing. Every existing
 * node and edge is preserved — this never rewrites prior content.
 */
export async function insertCanvasNode(
  app: App,
  rawPath: string,
  opts: InsertOptions
): Promise<InsertResult> {
  let path = safePath(rawPath);
  if (!isCanvasPath(path)) path = `${path}.canvas`;

  let existing = app.vault.getAbstractFileByPath(path);
  let canvasCreated = false;
  if (!existing) {
    const parent = path.substring(0, path.lastIndexOf("/"));
    if (parent) await ensureFolder(app, parent);
    await app.vault.create(path, `${JSON.stringify({ nodes: [], edges: [] }, null, 2)}\n`);
    existing = app.vault.getAbstractFileByPath(path);
    canvasCreated = true;
  }
  if (!(existing instanceof TFile)) {
    throw new Error(`Canvas target is not a file: ${path}`);
  }

  await flushOpenCanvas(app, path);
  const doc = parseCanvas(await app.vault.read(existing), path);
  const pos = nextFreePosition(doc.nodes);

  const node: CanvasNode = opts.file
    ? {
        id: canvasNodeId(`file:${opts.file}:${doc.nodes.length}`),
        type: "file",
        file: opts.file,
        x: pos.x,
        y: pos.y,
        width: opts.width ?? 480,
        height: opts.height ?? 560,
      }
    : {
        id: canvasNodeId(`text:${opts.text ?? ""}:${doc.nodes.length}`),
        type: "text",
        text: opts.text ?? "",
        x: pos.x,
        y: pos.y,
        width: opts.width ?? 400,
        height: opts.height ?? 200,
      };
  if (opts.color) node.color = opts.color;

  doc.nodes.push(node);
  await app.vault.modify(existing, `${JSON.stringify(doc, null, 2)}\n`);

  return {
    canvasPath: path,
    canvasCreated,
    nodeId: node.id,
    x: node.x,
    y: node.y,
    nodeCount: doc.nodes.length,
  };
}

export interface InsertNodesResult {
  canvasPath: string;
  canvasCreated: boolean;
  insertedCount: number;
  nodeCount: number;
}

/**
 * Append a pre-positioned node SET to a canvas (creating it when missing) —
 * for composites like a perceptual map whose internal geometry must survive
 * intact. On a non-empty canvas the whole set is translated as one block into
 * free space to the right; on an empty/new canvas it keeps its own coordinates
 * (composites are authored origin-centered). Colliding ids get a suffix.
 * Existing nodes and edges are never rewritten.
 */
export async function insertCanvasNodes(
  app: App,
  rawPath: string,
  newNodes: readonly CanvasNode[]
): Promise<InsertNodesResult> {
  if (newNodes.length === 0) throw new Error("insertCanvasNodes needs at least one node");
  let path = safePath(rawPath);
  if (!isCanvasPath(path)) path = `${path}.canvas`;

  let existing = app.vault.getAbstractFileByPath(path);
  let canvasCreated = false;
  if (!existing) {
    const parent = path.substring(0, path.lastIndexOf("/"));
    if (parent) await ensureFolder(app, parent);
    await app.vault.create(path, `${JSON.stringify({ nodes: [], edges: [] }, null, 2)}\n`);
    existing = app.vault.getAbstractFileByPath(path);
    canvasCreated = true;
  }
  if (!(existing instanceof TFile)) {
    throw new Error(`Canvas target is not a file: ${path}`);
  }

  await flushOpenCanvas(app, path);
  const doc = parseCanvas(await app.vault.read(existing), path);

  let dx = 0;
  let dy = 0;
  if (doc.nodes.length > 0) {
    const pos = nextFreePosition(doc.nodes);
    let minX = Infinity;
    let minY = Infinity;
    for (const n of newNodes) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
    }
    dx = pos.x - minX;
    dy = pos.y - minY;
  }

  const takenIds = new Set(doc.nodes.map((n) => String(n.id)));
  for (const source of newNodes) {
    let id = source.id;
    for (let n = 2; takenIds.has(id); n++) id = `${source.id}-${n}`;
    takenIds.add(id);
    doc.nodes.push({ ...source, id, x: source.x + dx, y: source.y + dy });
  }
  await app.vault.modify(existing, `${JSON.stringify(doc, null, 2)}\n`);

  return {
    canvasPath: path,
    canvasCreated,
    insertedCount: newNodes.length,
    nodeCount: doc.nodes.length,
  };
}
