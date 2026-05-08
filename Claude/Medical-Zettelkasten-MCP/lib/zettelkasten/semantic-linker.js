"use strict";

/**
 * Semantic Linker — classifies relationships between concepts and
 * discovers hidden transitive connections.
 *
 * @module zettelkasten/semantic-linker
 */

/**
 * Run Semantic Linker analysis.
 *
 * @param {import("../graph-engine.js").GraphEngine} engine
 * @param {object} [options]
 * @param {number} [options.minEdgeWeight=1] - Minimum edge weight to classify
 * @returns {{direct_links: Array, transitive_links: Array, hidden_links: Array, relationship_summary: object}}
 */
function linkSemantically(engine, options) {
  const opts = options || {};
  const minWeight = opts.minEdgeWeight || 1;
  const graph = engine.getGraph();
  const nodes = graph._nodes;
  const edges = graph._edges;
  const adjacency = graph._adjacency;

  const directLinks = [];
  const transitiveLinks = [];
  const hiddenLinks = [];

  const typeCounts = { hierarchical: 0, causal: 0, associative: 0, antagonistic: 0 };

  // Classify direct edges
  for (const edge of edges.values()) {
    if (edge.weight < minWeight) continue;
    const sourceNode = nodes.get(edge.source);
    const targetNode = nodes.get(edge.target);
    if (!sourceNode || !targetNode) continue;

    const type = classifyEdge(edge, sourceNode, targetNode, adjacency, nodes);
    typeCounts[type]++;

    directLinks.push({
      source: edge.source,
      target: edge.target,
      type,
      weight: edge.weight,
      confidence: Math.min(1, edge.weight / 5),
    });
  }

  // Find transitive relationships (A→B→C implies A→C)
  const directPairs = new Set();
  for (const edge of edges.values()) {
    directPairs.add(`${edge.source}::${edge.target}`);
    directPairs.add(`${edge.target}::${edge.source}`);
  }

  const seen = new Set();
  for (const edge of edges.values()) {
    if (edge.weight < minWeight) continue;
    const midNeighbors = adjacency.get(edge.target);
    if (!midNeighbors) continue;

    for (const c of midNeighbors) {
      if (c === edge.source) continue;
      const pairKey = edge.source < c ? `${edge.source}::${c}` : `${c}::${edge.source}`;
      if (directPairs.has(pairKey) || seen.has(pairKey)) continue;
      seen.add(pairKey);

      const edgeAB = graph.getEdge(edge.source, edge.target);
      const edgeBC = graph.getEdge(edge.target, c);
      if (!edgeAB || !edgeBC) continue;

      const typeAB = classifyEdge(edgeAB, nodes.get(edge.source), nodes.get(edge.target), adjacency, nodes);
      const typeBC = classifyEdge(edgeBC, nodes.get(edge.target), nodes.get(c), adjacency, nodes);

      transitiveLinks.push({
        source: edge.source,
        target: c,
        via: edge.target,
        relationship_chain: `${typeAB} → ${typeBC}`,
        confidence: Math.min(edgeAB.weight, edgeBC.weight) / 5,
      });

      if (transitiveLinks.length >= 20) break;
    }
    if (transitiveLinks.length >= 20) break;
  }

  // Find hidden links: node pairs with NO direct edge but high indirect connectivity
  const nodeIds = Array.from(nodes.keys());
  for (let i = 0; i < Math.min(nodeIds.length, 50); i++) {
    const a = nodeIds[i];
    const aNeighbors = adjacency.get(a);
    if (!aNeighbors || aNeighbors.size < 2) continue;

    for (let j = i + 1; j < Math.min(nodeIds.length, 50); j++) {
      const b = nodeIds[j];
      // Skip if directly connected
      if (aNeighbors.has(b)) continue;

      // Count shared neighbors (paths of length 2)
      const bNeighbors = adjacency.get(b);
      if (!bNeighbors || bNeighbors.size < 2) continue;

      const shared = [];
      for (const n of aNeighbors) {
        if (bNeighbors.has(n)) shared.push(n);
      }

      if (shared.length >= 2) {
        hiddenLinks.push({
          source: a,
          target: b,
          intermediaries: shared.slice(0, 5),
          path_count: shared.length,
          avg_path_length: 2,
        });
      }

      if (hiddenLinks.length >= 15) break;
    }
    if (hiddenLinks.length >= 15) break;
  }

  hiddenLinks.sort((a, b) => b.path_count - a.path_count);

  return {
    direct_links: directLinks,
    transitive_links: transitiveLinks,
    hidden_links: hiddenLinks.slice(0, 10),
    relationship_summary: typeCounts,
  };
}

/**
 * Classify edge type based on graph topology.
 */
function classifyEdge(edge, sourceNode, targetNode, adjacency, allNodes) {
  const sNeighbors = adjacency.get(edge.source);
  const tNeighbors = adjacency.get(edge.target);
  if (!sNeighbors || !tNeighbors) return "associative";

  // Hierarchical: one node's neighbors are a subset of the other's
  const sSet = new Set(sNeighbors);
  const tSet = new Set(tNeighbors);
  let sInT = 0;
  for (const n of sNeighbors) { if (tSet.has(n)) sInT++; }
  const overlapRatio = sInT / Math.min(sNeighbors.size, tNeighbors.size);

  if (sNeighbors.size > tNeighbors.size * 2 && overlapRatio > 0.5) return "hierarchical";
  if (tNeighbors.size > sNeighbors.size * 2 && overlapRatio > 0.5) return "hierarchical";

  // Antagonistic: nodes in different communities with low cross-community edge weight
  if (sourceNode.community !== targetNode.community && sourceNode.community >= 0 && edge.weight <= 1) {
    return "antagonistic";
  }

  // Causal: one node has much higher centrality (influence flows from high to low)
  if (Math.abs(sourceNode.centrality - targetNode.centrality) > 0.3) {
    return "causal";
  }

  return "associative";
}

module.exports = { linkSemantically };
