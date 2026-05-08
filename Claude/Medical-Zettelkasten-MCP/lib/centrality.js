"use strict";

/**
 * Betweenness centrality using Brandes' algorithm.
 * Reference: Brandes (2001) "A Faster Algorithm for Betweenness Centrality".
 * Applied per Paranyushkin (2019) for identifying influential concepts.
 *
 * @module centrality
 */

/**
 * Compute betweenness centrality for all nodes in the graph.
 * Modifies node.centrality in place. Returns the centrality map.
 *
 * @param {import("./graph.js").Graph} graph
 * @returns {Map<string, number>} nodeId → centrality score [0, 1]
 */
function computeBetweennessCentrality(graph) {
  const nodes = graph._nodes;
  const adjacency = graph._adjacency;
  const nodeIds = Array.from(nodes.keys());
  const n = nodeIds.length;

  if (n <= 2) {
    for (const node of nodes.values()) node.centrality = 0;
    return new Map(nodeIds.map((id) => [id, 0]));
  }

  const CB = new Map();
  for (const id of nodeIds) CB.set(id, 0);

  // Brandes' algorithm: BFS from each source
  for (const s of nodeIds) {
    const stack = [];
    const pred = new Map();
    for (const id of nodeIds) pred.set(id, []);

    const sigma = new Map();
    for (const id of nodeIds) sigma.set(id, 0);
    sigma.set(s, 1);

    const dist = new Map();
    for (const id of nodeIds) dist.set(id, -1);
    dist.set(s, 0);

    const queue = [s];
    let qi = 0;

    // BFS
    while (qi < queue.length) {
      const v = queue[qi++];
      stack.push(v);
      const neighbors = adjacency.get(v);
      if (!neighbors) continue;
      for (const w of neighbors) {
        // First visit
        if (dist.get(w) < 0) {
          dist.set(w, dist.get(v) + 1);
          queue.push(w);
        }
        // Shortest path via v
        if (dist.get(w) === dist.get(v) + 1) {
          sigma.set(w, sigma.get(w) + sigma.get(v));
          pred.get(w).push(v);
        }
      }
    }

    // Back-propagation
    const delta = new Map();
    for (const id of nodeIds) delta.set(id, 0);

    while (stack.length > 0) {
      const w = stack.pop();
      for (const v of pred.get(w)) {
        const d = (sigma.get(v) / sigma.get(w)) * (1 + delta.get(w));
        delta.set(v, delta.get(v) + d);
      }
      if (w !== s) {
        CB.set(w, CB.get(w) + delta.get(w));
      }
    }
  }

  // Normalize: undirected graph factor = 2 / ((n-1)(n-2))
  const normFactor = n > 2 ? 2 / ((n - 1) * (n - 2)) : 1;
  let maxCB = 0;
  for (const [id, val] of CB) {
    const normalized = val * normFactor;
    CB.set(id, normalized);
    if (normalized > maxCB) maxCB = normalized;
  }

  // Scale to [0, 1]
  if (maxCB > 0) {
    for (const [id, val] of CB) {
      const scaled = val / maxCB;
      CB.set(id, scaled);
      const node = nodes.get(id);
      if (node) node.centrality = scaled;
    }
  } else {
    for (const node of nodes.values()) node.centrality = 0;
  }

  return CB;
}

module.exports = { computeBetweennessCentrality };
