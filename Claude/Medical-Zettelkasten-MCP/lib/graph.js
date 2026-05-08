"use strict";

/**
 * In-memory graph data structure for text network analysis.
 * Undirected, weighted graph with node metadata (centrality, community).
 *
 * @module graph
 */

/**
 * Create a new empty graph.
 * @returns {Graph}
 */
function createGraph() {
  /** @type {Map<string, {id: string, label: string, weight: number, centrality: number, community: number}>} */
  const nodes = new Map();
  /** @type {Map<string, {source: string, target: string, weight: number, contexts: string[]}>} */
  const edges = new Map();
  /** @type {Map<string, Set<string>>} */
  const adjacency = new Map();

  function edgeId(a, b) {
    return a < b ? `${a}::${b}` : `${b}::${a}`;
  }

  function addNode(id, label, metadata) {
    const existing = nodes.get(id);
    if (existing) {
      if (metadata) Object.assign(existing, metadata);
      return existing;
    }
    const node = { id, label: label || id, weight: 0, centrality: 0, community: -1, ...(metadata || {}) };
    nodes.set(id, node);
    if (!adjacency.has(id)) adjacency.set(id, new Set());
    return node;
  }

  function addEdge(source, target, weight, context) {
    if (source === target) return null;
    const eid = edgeId(source, target);
    const existing = edges.get(eid);
    if (existing) {
      existing.weight += (weight || 1);
      if (context) existing.contexts.push(context);
      return existing;
    }
    // Ensure both nodes exist
    if (!nodes.has(source)) addNode(source, source);
    if (!nodes.has(target)) addNode(target, target);
    const edge = { source, target, weight: weight || 1, contexts: context ? [context] : [] };
    edges.set(eid, edge);
    adjacency.get(source).add(target);
    adjacency.get(target).add(source);
    return edge;
  }

  function getNode(id) {
    return nodes.get(id) || null;
  }

  function getEdge(source, target) {
    return edges.get(edgeId(source, target)) || null;
  }

  function getNeighbors(nodeId) {
    const neighbors = adjacency.get(nodeId);
    return neighbors ? Array.from(neighbors) : [];
  }

  function getAllNodes() {
    return Array.from(nodes.values());
  }

  function getAllEdges() {
    return Array.from(edges.values());
  }

  function nodeCount() {
    return nodes.size;
  }

  function edgeCount() {
    return edges.size;
  }

  /** Update node weights based on sum of incident edge weights. */
  function updateNodeWeights() {
    for (const node of nodes.values()) node.weight = 0;
    for (const edge of edges.values()) {
      const s = nodes.get(edge.source);
      const t = nodes.get(edge.target);
      if (s) s.weight += edge.weight;
      if (t) t.weight += edge.weight;
    }
  }

  function toJSON() {
    return {
      nodes: getAllNodes(),
      edges: getAllEdges(),
      metadata: {
        nodeCount: nodes.size,
        edgeCount: edges.size,
      },
    };
  }

  return {
    addNode,
    addEdge,
    getNode,
    getEdge,
    getNeighbors,
    getAllNodes,
    getAllEdges,
    nodeCount,
    edgeCount,
    updateNodeWeights,
    toJSON,
    /** @internal — exposed for algorithms */
    _nodes: nodes,
    _edges: edges,
    _adjacency: adjacency,
    _edgeId: edgeId,
  };
}

module.exports = { createGraph };
