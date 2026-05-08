"use strict";

/**
 * Louvain community detection algorithm.
 * Reference: Blondel et al. (2008) "Fast unfolding of communities in large networks".
 * Applied per Paranyushkin (2019) for topical cluster identification.
 *
 * @module community-detection
 */

/**
 * Compute modularity Q for the current community assignment.
 * Q = (1/2m) * Σ [A_ij - (k_i * k_j) / (2m)] * δ(c_i, c_j)
 *
 * @param {import("./graph.js").Graph} graph
 * @param {Map<string, number>} communities - nodeId → communityId
 * @returns {number} modularity score [-0.5, 1.0]
 */
function computeModularity(graph, communities) {
  const edges = graph._edges;
  const nodes = graph._nodes;
  let m2 = 0; // 2 * total edge weight
  const degrees = new Map();

  for (const node of nodes.values()) degrees.set(node.id, 0);
  for (const edge of edges.values()) {
    const w = edge.weight;
    m2 += 2 * w;
    degrees.set(edge.source, (degrees.get(edge.source) || 0) + w);
    degrees.set(edge.target, (degrees.get(edge.target) || 0) + w);
  }

  if (m2 === 0) return 0;

  let Q = 0;
  for (const edge of edges.values()) {
    const ci = communities.get(edge.source);
    const cj = communities.get(edge.target);
    if (ci === cj) {
      const ki = degrees.get(edge.source) || 0;
      const kj = degrees.get(edge.target) || 0;
      Q += 2 * (edge.weight - (ki * kj) / m2);
    }
  }

  return Q / m2;
}

/**
 * Detect communities using the Louvain algorithm.
 * Modifies node.community in place. Returns community assignments and modularity.
 *
 * @param {import("./graph.js").Graph} graph
 * @param {object} [options]
 * @param {number} [options.maxIterations=20] - Max Louvain passes
 * @param {number} [options.minModularityGain=0.0001] - Convergence threshold
 * @returns {{communities: Map<string, number>, modularity: number, communityCount: number}}
 */
function detectCommunities(graph, options) {
  const opts = options || {};
  const maxIter = opts.maxIterations || 20;
  const minGain = opts.minModularityGain || 0.0001;

  const nodes = graph._nodes;
  const edges = graph._edges;
  const adjacency = graph._adjacency;
  const nodeIds = Array.from(nodes.keys());

  if (nodeIds.length === 0) {
    return { communities: new Map(), modularity: 0, communityCount: 0 };
  }

  if (nodeIds.length <= 2) {
    const communities = new Map();
    nodeIds.forEach((id, i) => communities.set(id, i));
    for (const [id, c] of communities) {
      const node = nodes.get(id);
      if (node) node.community = c;
    }
    return { communities, modularity: 0, communityCount: nodeIds.length };
  }

  // Initialize: each node in its own community
  const communities = new Map();
  nodeIds.forEach((id, i) => communities.set(id, i));

  // Compute total edge weight (2m) and degree per node
  let m2 = 0;
  const degree = new Map();
  for (const id of nodeIds) degree.set(id, 0);
  for (const edge of edges.values()) {
    m2 += 2 * edge.weight;
    degree.set(edge.source, degree.get(edge.source) + edge.weight);
    degree.set(edge.target, degree.get(edge.target) + edge.weight);
  }

  if (m2 === 0) {
    for (const [id, c] of communities) {
      const node = nodes.get(id);
      if (node) node.community = c;
    }
    return { communities, modularity: 0, communityCount: nodeIds.length };
  }

  // Sum of weights inside each community and total degree of each community
  const sigmaIn = new Map();
  const sigmaTot = new Map();
  for (const id of nodeIds) {
    sigmaIn.set(communities.get(id), 0);
    sigmaTot.set(communities.get(id), degree.get(id));
  }

  // Phase 1: Local moving
  for (let iter = 0; iter < maxIter; iter++) {
    let improved = false;

    for (const nodeId of nodeIds) {
      const currentComm = communities.get(nodeId);
      const ki = degree.get(nodeId);
      const neighbors = adjacency.get(nodeId);
      if (!neighbors || neighbors.size === 0) continue;

      // Weight to each neighboring community
      const commWeights = new Map();
      let kiIn = 0;
      for (const neighbor of neighbors) {
        const edge = graph.getEdge(nodeId, neighbor);
        if (!edge) continue;
        const nc = communities.get(neighbor);
        commWeights.set(nc, (commWeights.get(nc) || 0) + edge.weight);
        if (nc === currentComm) kiIn += edge.weight;
      }

      // Remove node from its community
      sigmaTot.set(currentComm, (sigmaTot.get(currentComm) || 0) - ki);
      sigmaIn.set(currentComm, (sigmaIn.get(currentComm) || 0) - 2 * kiIn);

      // Find best community
      let bestComm = currentComm;
      let bestGain = 0;

      for (const [comm, wc] of commWeights) {
        const stot = sigmaTot.get(comm) || 0;
        const gain = wc - (stot * ki) / m2;
        if (gain > bestGain) {
          bestGain = gain;
          bestComm = comm;
        }
      }

      // Also check staying in current community
      const stotCurrent = sigmaTot.get(currentComm) || 0;
      const gainCurrent = kiIn - (stotCurrent * ki) / m2;
      if (gainCurrent >= bestGain) {
        bestComm = currentComm;
        bestGain = gainCurrent;
      }

      // Move node to best community
      communities.set(nodeId, bestComm);
      const newKiIn = commWeights.get(bestComm) || 0;
      sigmaTot.set(bestComm, (sigmaTot.get(bestComm) || 0) + ki);
      sigmaIn.set(bestComm, (sigmaIn.get(bestComm) || 0) + 2 * newKiIn);

      if (bestComm !== currentComm) improved = true;
    }

    if (!improved) break;
  }

  // Renumber communities to be contiguous 0, 1, 2, ...
  const uniqueComms = new Set(communities.values());
  const remap = new Map();
  let idx = 0;
  for (const c of uniqueComms) remap.set(c, idx++);

  for (const [id, c] of communities) {
    const newC = remap.get(c);
    communities.set(id, newC);
    const node = nodes.get(id);
    if (node) node.community = newC;
  }

  const modularity = computeModularity(graph, communities);

  return { communities, modularity, communityCount: remap.size };
}

module.exports = { detectCommunities, computeModularity };
