"use strict";

/**
 * Structural gap detection — identifies connections that SHOULD exist but DON'T.
 * Core innovation from Paranyushkin (2019): gaps between weakly-connected or
 * disconnected communities represent research opportunities and blind spots.
 *
 * @module gap-detection
 */

/**
 * Find structural gaps between communities in a graph.
 * A gap exists between two communities that have few or no inter-community edges
 * relative to their sizes.
 *
 * @param {import("./graph.js").Graph} graph - Graph with communities already assigned
 * @param {object} [options]
 * @param {number} [options.maxGaps=10] - Maximum gaps to return
 * @returns {{gaps: Array<{community_a: number, community_b: number, gap_score: number, inter_edges: number, bridge_candidates: string[]}>, totalGaps: number}}
 */
function findStructuralGaps(graph, options) {
  const opts = options || {};
  const maxGaps = opts.maxGaps || 10;
  const nodes = graph._nodes;
  const edges = graph._edges;

  // Group nodes by community
  const communityNodes = new Map();
  for (const node of nodes.values()) {
    const c = node.community;
    if (c < 0) continue;
    if (!communityNodes.has(c)) communityNodes.set(c, []);
    communityNodes.get(c).push(node.id);
  }

  const communityIds = Array.from(communityNodes.keys()).sort((a, b) => a - b);
  if (communityIds.length < 2) {
    return { gaps: [], totalGaps: 0 };
  }

  // Count inter-community edges for each pair
  const interEdges = new Map();
  for (const edge of edges.values()) {
    const ca = nodes.get(edge.source)?.community;
    const cb = nodes.get(edge.target)?.community;
    if (ca === undefined || cb === undefined || ca === cb) continue;
    const key = ca < cb ? `${ca}::${cb}` : `${cb}::${ca}`;
    interEdges.set(key, (interEdges.get(key) || 0) + edge.weight);
  }

  // Score each community pair
  const gaps = [];
  for (let i = 0; i < communityIds.length; i++) {
    for (let j = i + 1; j < communityIds.length; j++) {
      const ca = communityIds[i];
      const cb = communityIds[j];
      const key = `${ca}::${cb}`;
      const inter = interEdges.get(key) || 0;
      const sizeA = communityNodes.get(ca).length;
      const sizeB = communityNodes.get(cb).length;

      // Gap score: larger communities with fewer connections = bigger gap
      const gapScore = (sizeA * sizeB) / (inter + 1);

      // Find bridge candidates: nodes in A with 2nd-degree connections to B
      const bridgeCandidates = findBridgeCandidates(graph, communityNodes.get(ca), communityNodes.get(cb));

      gaps.push({
        community_a: ca,
        community_b: cb,
        gap_score: Math.round(gapScore * 100) / 100,
        inter_edges: inter,
        size_a: sizeA,
        size_b: sizeB,
        bridge_candidates: bridgeCandidates,
      });
    }
  }

  gaps.sort((a, b) => b.gap_score - a.gap_score);

  return {
    gaps: gaps.slice(0, maxGaps),
    totalGaps: gaps.length,
  };
}

/**
 * Find potential bridge nodes: nodes in community A whose neighbors
 * have neighbors in community B.
 */
function findBridgeCandidates(graph, nodesA, nodesB) {
  const bSet = new Set(nodesB);
  const candidates = [];

  for (const nodeId of nodesA) {
    const neighbors = graph.getNeighbors(nodeId);
    for (const neighbor of neighbors) {
      const neighborNeighbors = graph.getNeighbors(neighbor);
      for (const nn of neighborNeighbors) {
        if (bSet.has(nn)) {
          candidates.push(nodeId);
          break;
        }
      }
      if (candidates[candidates.length - 1] === nodeId) break;
    }
  }

  return candidates.slice(0, 5);
}

module.exports = { findStructuralGaps };
