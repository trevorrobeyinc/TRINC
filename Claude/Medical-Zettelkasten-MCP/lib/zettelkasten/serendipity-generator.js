"use strict";

/**
 * Serendipity Generator — surfaces unexpected connections, "dark nodes"
 * (concepts implied but absent), and high-surprise bridge hypotheses.
 *
 * @module zettelkasten/serendipity-generator
 */

const { findStructuralGaps } = require("../gap-detection.js");

/**
 * Run Serendipity Generator analysis.
 *
 * @param {import("../graph-engine.js").GraphEngine} engine
 * @returns {{structural_gaps: Array, bridge_hypotheses: Array, dark_nodes: Array, serendipitous_connections: Array, lateral_prompts: Array}}
 */
function generateSerendipity(engine) {
  const graph = engine.getGraph();
  const nodes = graph._nodes;
  const adjacency = graph._adjacency;

  // Group nodes by community
  const communityNodes = new Map();
  for (const node of nodes.values()) {
    if (node.community < 0) continue;
    if (!communityNodes.has(node.community)) communityNodes.set(node.community, []);
    communityNodes.get(node.community).push(node);
  }

  // Step 1: Find structural gaps
  const gapResult = findStructuralGaps(graph, { maxGaps: 10 });
  const structuralGaps = gapResult.gaps.map((gap) => ({
    community_a: gap.community_a,
    community_b: gap.community_b,
    gap_size: gap.gap_score,
    gap_topic: `${getTopLabel(communityNodes.get(gap.community_a))} ↔ ${getTopLabel(communityNodes.get(gap.community_b))}`,
  }));

  // Step 2: Bridge hypotheses for each gap
  const bridgeHypotheses = gapResult.gaps.slice(0, 5).map((gap, i) => {
    const topA = getTopLabel(communityNodes.get(gap.community_a));
    const topB = getTopLabel(communityNodes.get(gap.community_b));
    const bridgeConcept = gap.bridge_candidates[0] || "intermediate concept";
    return {
      gap_ref: i,
      hypothesis: `"${topA}" may be connected to "${topB}" via "${bridgeConcept}"`,
      supporting_evidence: gap.bridge_candidates.length > 0
        ? `${gap.bridge_candidates.length} potential bridge nodes found within 2 hops`
        : "No direct bridges found — this is a novel hypothesis",
      novelty_score: Math.round((1 / (gap.inter_edges + 1)) * 100) / 100,
    };
  });

  // Step 3: Dark nodes — concepts expected but absent
  const darkNodes = findDarkNodes(graph, communityNodes);

  // Step 4: Serendipitous connections — unexpected high-surprise links
  const serendipitousConnections = findSerendipitousConnections(graph, communityNodes);

  // Step 5: Lateral thinking prompts
  const lateralPrompts = gapResult.gaps.slice(0, 5).map((gap) => {
    const topA = getTopLabel(communityNodes.get(gap.community_a));
    const topB = getTopLabel(communityNodes.get(gap.community_b));
    return {
      prompt: `What if "${topA}" could be applied to the problem of "${topB}"? The structural gap suggests this connection hasn't been explored.`,
      source_domain: topA,
      target_domain: topB,
      structural_basis: `Gap score: ${gap.gap_score} (${gap.inter_edges} existing connections between ${gap.size_a} and ${gap.size_b} concepts)`,
    };
  });

  return {
    structural_gaps: structuralGaps,
    bridge_hypotheses: bridgeHypotheses,
    dark_nodes: darkNodes,
    serendipitous_connections: serendipitousConnections,
    lateral_prompts: lateralPrompts,
  };
}

/**
 * Find "dark nodes" — concepts expected by community structure but absent.
 * Looks for nodes that many community members connect to via intermediaries
 * but that don't exist in the graph.
 */
function findDarkNodes(graph, communityNodes) {
  const nodes = graph._nodes;
  const adjacency = graph._adjacency;
  const darkNodes = [];

  for (const [commId, commNodeList] of communityNodes) {
    if (commNodeList.length < 3) continue;

    // Find the common neighbors outside this community
    const externalNeighborFreq = new Map();
    const commIds = new Set(commNodeList.map((n) => n.id));

    for (const node of commNodeList) {
      const neighbors = adjacency.get(node.id);
      if (!neighbors) continue;
      for (const nid of neighbors) {
        if (commIds.has(nid)) continue;
        const neighbor = nodes.get(nid);
        if (!neighbor) continue;
        // Check neighbor's neighbors for patterns
        const nn = adjacency.get(nid);
        if (!nn) continue;
        for (const nnid of nn) {
          if (commIds.has(nnid) || nnid === node.id) continue;
          if (!nodes.has(nnid)) continue;
          externalNeighborFreq.set(nnid, (externalNeighborFreq.get(nnid) || 0) + 1);
        }
      }
    }

    // Nodes referenced frequently but not connected directly to this community
    for (const [nodeId, freq] of externalNeighborFreq) {
      if (freq >= 2) {
        const absentNode = nodes.get(nodeId);
        if (absentNode && absentNode.community !== commId) {
          // Check no direct edge to any community member
          const isDirectlyConnected = commNodeList.some((cn) => {
            const neighbors = adjacency.get(cn.id);
            return neighbors && neighbors.has(nodeId);
          });
          if (!isDirectlyConnected) {
            darkNodes.push({
              expected_concept: absentNode.label,
              expected_community: commId,
              current_community: absentNode.community,
              absence_confidence: Math.round((freq / commNodeList.length) * 100) / 100,
            });
          }
        }
      }
    }
  }

  return darkNodes.sort((a, b) => b.absence_confidence - a.absence_confidence).slice(0, 10);
}

/**
 * Find serendipitous connections — cross-community node pairs with
 * unexpectedly high indirect connectivity.
 */
function findSerendipitousConnections(graph, communityNodes) {
  const nodes = graph._nodes;
  const adjacency = graph._adjacency;
  const connections = [];

  const allNodes = Array.from(nodes.values())
    .filter((n) => n.community >= 0 && n.centrality > 0)
    .sort((a, b) => b.centrality - a.centrality)
    .slice(0, 30);

  for (let i = 0; i < allNodes.length; i++) {
    for (let j = i + 1; j < allNodes.length; j++) {
      const a = allNodes[i];
      const b = allNodes[j];
      if (a.community === b.community) continue;

      // Check if directly connected
      const aNeighbors = adjacency.get(a.id);
      if (aNeighbors && aNeighbors.has(b.id)) continue;

      // Count indirect paths (length 2)
      const bNeighbors = adjacency.get(b.id);
      if (!aNeighbors || !bNeighbors) continue;
      let sharedPaths = 0;
      for (const n of aNeighbors) { if (bNeighbors.has(n)) sharedPaths++; }
      if (sharedPaths === 0) continue;

      // Surprise score: inverse of expected probability given community separation
      const surpriseScore = sharedPaths / (1 + Math.abs(a.community - b.community));

      connections.push({
        concept_a: a.label,
        concept_b: b.label,
        surprise_score: Math.round(surpriseScore * 1000) / 1000,
        hypothesis: `"${a.label}" (community ${a.community}) and "${b.label}" (community ${b.community}) share ${sharedPaths} indirect path(s)`,
        rationale: `Both are high-centrality concepts in different clusters connected through intermediaries`,
      });
    }
  }

  return connections.sort((a, b) => b.surprise_score - a.surprise_score).slice(0, 10);
}

function getTopLabel(nodeList) {
  if (!nodeList || nodeList.length === 0) return "unknown";
  return [...nodeList].sort((a, b) => b.centrality - a.centrality)[0].label;
}

module.exports = { generateSerendipity };
