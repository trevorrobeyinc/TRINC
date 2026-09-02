/**
 * Deterministic, input-order-stable node layouts shared by the Canvas and
 * graph-snapshot tools. No randomness, no timestamps — identical input yields
 * identical coordinates, so reruns diff cleanly.
 */

// OPERATOR DECISION — canvas/graph density. These constants shape every
// generated board: gaps between sibling nodes (grid/tree), and the distance
// between depth rings (radial/graph). Larger values breathe more but need
// more panning. Nothing else keys on them.
export const SPACING_X = 120;
export const SPACING_Y = 100;
export const RING_GAP = 220;
export const GROUP_PADDING = 40;

export interface LayoutNode {
  id: string;
  width: number;
  height: number;
}

export interface LayoutEdge {
  from: string;
  to: string;
}

export interface Point {
  x: number;
  y: number;
}

function byId(nodes: readonly LayoutNode[]): Map<string, LayoutNode> {
  return new Map(nodes.map((n) => [n.id, n]));
}

/** Row-major grid, ⌈√n⌉ columns, cells sized to the largest node. */
export function layoutGrid(nodes: readonly LayoutNode[]): Map<string, Point> {
  const positions = new Map<string, Point>();
  if (nodes.length === 0) return positions;
  const cols = Math.ceil(Math.sqrt(nodes.length));
  const cellW = Math.max(...nodes.map((n) => n.width)) + SPACING_X;
  const cellH = Math.max(...nodes.map((n) => n.height)) + SPACING_Y;
  nodes.forEach((node, i) => {
    positions.set(node.id, {
      x: (i % cols) * cellW,
      y: Math.floor(i / cols) * cellH,
    });
  });
  return positions;
}

/**
 * BFS layers from the zero-in-degree roots (fallback: first node when every
 * node sits on a cycle); each layer is horizontally centered. Nodes the BFS
 * never reaches land on one extra bottom layer.
 */
export function layoutTree(
  nodes: readonly LayoutNode[],
  edges: readonly LayoutEdge[]
): Map<string, Point> {
  const positions = new Map<string, Point>();
  if (nodes.length === 0) return positions;

  const lookup = byId(nodes);
  const out = new Map<string, string[]>();
  const inDegree = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  for (const edge of edges) {
    if (!lookup.has(edge.from) || !lookup.has(edge.to)) continue;
    out.set(edge.from, [...(out.get(edge.from) ?? []), edge.to]);
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
  }

  const roots = nodes.filter((n) => (inDegree.get(n.id) ?? 0) === 0).map((n) => n.id);
  if (roots.length === 0) roots.push(nodes[0].id);

  const depthOf = new Map<string, number>();
  const queue: string[] = [...roots];
  roots.forEach((r) => depthOf.set(r, 0));
  while (queue.length > 0) {
    const id = queue.shift() as string;
    const depth = depthOf.get(id) ?? 0;
    for (const next of out.get(id) ?? []) {
      if (depthOf.has(next)) continue;
      depthOf.set(next, depth + 1);
      queue.push(next);
    }
  }
  const maxDepth = Math.max(0, ...depthOf.values());
  for (const node of nodes) {
    if (!depthOf.has(node.id)) depthOf.set(node.id, maxDepth + 1);
  }

  const layers = new Map<number, LayoutNode[]>();
  for (const node of nodes) {
    const depth = depthOf.get(node.id) as number;
    layers.set(depth, [...(layers.get(depth) ?? []), node]);
  }

  const rowH = Math.max(...nodes.map((n) => n.height)) + SPACING_Y;
  for (const [depth, layerNodes] of layers) {
    const totalW =
      layerNodes.reduce((sum, n) => sum + n.width, 0) + SPACING_X * (layerNodes.length - 1);
    let x = -totalW / 2;
    for (const node of layerNodes) {
      positions.set(node.id, { x: Math.round(x), y: depth * rowH });
      x += node.width + SPACING_X;
    }
  }
  return positions;
}

/**
 * Concentric rings by undirected BFS depth from a center node; nodes on each
 * ring are spread evenly starting at 12 o'clock. Unreached nodes take an
 * outermost ring.
 */
export function layoutRadial(
  nodes: readonly LayoutNode[],
  edges: readonly LayoutEdge[],
  centerId?: string
): Map<string, Point> {
  const positions = new Map<string, Point>();
  if (nodes.length === 0) return positions;

  const lookup = byId(nodes);
  const neighbors = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (!lookup.has(edge.from) || !lookup.has(edge.to)) continue;
    if (!neighbors.has(edge.from)) neighbors.set(edge.from, new Set());
    if (!neighbors.has(edge.to)) neighbors.set(edge.to, new Set());
    (neighbors.get(edge.from) as Set<string>).add(edge.to);
    (neighbors.get(edge.to) as Set<string>).add(edge.from);
  }

  const center = centerId && lookup.has(centerId) ? centerId : nodes[0].id;
  const depthOf = new Map<string, number>([[center, 0]]);
  const queue = [center];
  while (queue.length > 0) {
    const id = queue.shift() as string;
    const depth = depthOf.get(id) ?? 0;
    const next = [...(neighbors.get(id) ?? [])].sort();
    for (const n of next) {
      if (depthOf.has(n)) continue;
      depthOf.set(n, depth + 1);
      queue.push(n);
    }
  }
  const maxDepth = Math.max(0, ...depthOf.values());
  for (const node of nodes) {
    if (!depthOf.has(node.id)) depthOf.set(node.id, maxDepth + 1);
  }

  const rings = new Map<number, string[]>();
  for (const node of nodes) {
    const depth = depthOf.get(node.id) as number;
    rings.set(depth, [...(rings.get(depth) ?? []), node.id]);
  }

  for (const [depth, ids] of rings) {
    if (depth === 0) {
      ids.forEach((id) => positions.set(id, { x: 0, y: 0 }));
      continue;
    }
    const radius = depth * RING_GAP;
    ids.forEach((id, i) => {
      const angle = -Math.PI / 2 + (2 * Math.PI * i) / ids.length;
      positions.set(id, {
        x: Math.round(radius * Math.cos(angle)),
        y: Math.round(radius * Math.sin(angle)),
      });
    });
  }
  return positions;
}
