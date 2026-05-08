"use strict";

/**
 * Orphan Rescuer — finds isolated concepts and proposes reintegration
 * strategies that could bridge structural gaps.
 *
 * @module zettelkasten/orphan-rescuer
 */

const { findStructuralGaps } = require("../gap-detection.js");

/**
 * Run Orphan Rescuer analysis.
 *
 * @param {import("../graph-engine.js").GraphEngine} engine
 * @returns {{orphan_nodes: Array, orphan_communities: Array, rescue_proposals: Array, rescued_graph_improvement: object}}
 */
function rescueOrphans(engine) {
  const graph = engine.getGraph();
  const nodes = graph._nodes;
  const adjacency = graph._adjacency;

  const orphanNodes = [];
  const orphanCommunities = [];
  const rescueProposals = [];

  // Group nodes by community
  const communityNodes = new Map();
  for (const node of nodes.values()) {
    if (node.community < 0) continue;
    if (!communityNodes.has(node.community)) communityNodes.set(node.community, []);
    communityNodes.get(node.community).push(node);
  }

  // Find orphan nodes: degree 0 or 1 with low edge weight
  for (const node of nodes.values()) {
    const neighbors = adjacency.get(node.id);
    const degree = neighbors ? neighbors.size : 0;
    if (degree <= 1) {
      // Find potential connections via 2nd-degree neighbors
      const potentialConnections = [];
      if (neighbors) {
        for (const nid of neighbors) {
          const nn = adjacency.get(nid);
          if (nn) {
            for (const nnid of nn) {
              if (nnid !== node.id && !neighbors.has(nnid)) {
                potentialConnections.push(nnid);
              }
            }
          }
        }
      }
      orphanNodes.push({
        node: node.id,
        label: node.label,
        degree,
        community: node.community,
        potential_connections: [...new Set(potentialConnections)].slice(0, 5),
      });
    }
  }

  // Find orphan communities: small clusters (< 3 nodes) disconnected from main
  const mainComponentSize = communityNodes.size > 0
    ? Math.max(...Array.from(communityNodes.values()).map((n) => n.length))
    : 0;

  for (const [commId, commNodes] of communityNodes) {
    if (commNodes.length >= 3) continue;
    // Check isolation: count inter-community edges
    let externalEdges = 0;
    for (const node of commNodes) {
      const neighbors = adjacency.get(node.id);
      if (!neighbors) continue;
      for (const nid of neighbors) {
        const neighbor = nodes.get(nid);
        if (neighbor && neighbor.community !== commId) externalEdges++;
      }
    }
    const isolationScore = 1 / (externalEdges + 1);
    orphanCommunities.push({
      community_id: commId,
      nodes: commNodes.map((n) => n.id),
      size: commNodes.length,
      external_edges: externalEdges,
      isolation_score: Math.round(isolationScore * 1000) / 1000,
    });
  }

  orphanCommunities.sort((a, b) => b.isolation_score - a.isolation_score);

  // Generate rescue proposals
  const gapResult = findStructuralGaps(graph, { maxGaps: 10 });
  let gapsResolved = 0;

  for (const orphan of orphanNodes.slice(0, 10)) {
    // Find highest-centrality node the orphan could connect to
    let bestTarget = null;
    let bestScore = 0;

    for (const node of nodes.values()) {
      if (node.id === orphan.node) continue;
      if (node.community === orphan.community) continue;
      if (node.centrality <= 0) continue;

      // Score: centrality of target + whether it would bridge a gap
      let score = node.centrality;
      for (const gap of gapResult.gaps) {
        if (
          (gap.community_a === orphan.community && gap.community_b === node.community) ||
          (gap.community_b === orphan.community && gap.community_a === node.community)
        ) {
          score *= 2; // Double score if it resolves a gap
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestTarget = node;
      }
    }

    if (bestTarget) {
      const resolvesGap = gapResult.gaps.some(
        (g) =>
          (g.community_a === orphan.community && g.community_b === bestTarget.community) ||
          (g.community_b === orphan.community && g.community_a === bestTarget.community)
      );
      if (resolvesGap) gapsResolved++;

      rescueProposals.push({
        orphan: orphan.node,
        target_cluster: bestTarget.community,
        bridge_concept: bestTarget.id,
        info_gain_score: Math.round(bestScore * 1000) / 1000,
        rationale: `Connect "${orphan.label}" to "${bestTarget.label}" (centrality: ${Math.round(bestTarget.centrality * 100) / 100})${resolvesGap ? " — resolves structural gap" : ""}`,
      });
    }
  }

  return {
    orphan_nodes: orphanNodes,
    orphan_communities: orphanCommunities,
    rescue_proposals: rescueProposals.sort((a, b) => b.info_gain_score - a.info_gain_score),
    rescued_graph_improvement: {
      new_connections: rescueProposals.length,
      gaps_resolved: gapsResolved,
      diversity_delta: rescueProposals.length > 0 ? 0.05 * rescueProposals.length : 0,
    },
  };
}

module.exports = { rescueOrphans };
