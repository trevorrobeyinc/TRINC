"use strict";

/**
 * Echo Chamber Breaker — detects bias, blind spots, and generates
 * challenge questions based on structural gaps.
 *
 * @module zettelkasten/echo-chamber-breaker
 */

const { measureDiversity } = require("../diversity.js");
const { findStructuralGaps } = require("../gap-detection.js");

/**
 * Run Echo Chamber Breaker analysis.
 *
 * @param {import("../graph-engine.js").GraphEngine} engine
 * @returns {{diversity_score: number, bias_assessment: object, blind_spots: Array, challenge_questions: Array, counter_perspectives: Array}}
 */
function breakEchoChamber(engine) {
  const graph = engine.getGraph();
  const nodes = graph._nodes;
  const adjacency = graph._adjacency;

  const diversity = measureDiversity(graph);
  const gapResult = findStructuralGaps(graph, { maxGaps: 10 });

  // Group nodes by community
  const communityNodes = new Map();
  for (const node of nodes.values()) {
    if (node.community < 0) continue;
    if (!communityNodes.has(node.community)) communityNodes.set(node.community, []);
    communityNodes.get(node.community).push(node);
  }

  // Identify dominant and underrepresented clusters
  const commSizes = Array.from(communityNodes.entries())
    .map(([id, nodeList]) => ({ id, size: nodeList.length }))
    .sort((a, b) => b.size - a.size);

  const totalNodes = Array.from(nodes.values()).filter((n) => n.community >= 0).length;
  const dominant = commSizes[0] || { id: -1, size: 0 };
  const underrepresented = commSizes
    .filter((c) => c.size < totalNodes * 0.15)
    .map((c) => ({
      community: c.id,
      size: c.size,
      top_concept: getTopConcept(communityNodes.get(c.id)),
    }));

  // Blind spots from structural gaps
  const blindSpots = gapResult.gaps.slice(0, 5).map((gap) => {
    const topA = getTopConcept(communityNodes.get(gap.community_a));
    const topB = getTopConcept(communityNodes.get(gap.community_b));
    return {
      gap_between: [gap.community_a, gap.community_b],
      missing_connection_type: "unexplored",
      potential_bridge_concepts: gap.bridge_candidates,
      topic_a: topA,
      topic_b: topB,
    };
  });

  // Challenge questions from gaps
  const challengeQuestions = gapResult.gaps.slice(0, 5).map((gap) => {
    const topA = getTopConcept(communityNodes.get(gap.community_a));
    const topB = getTopConcept(communityNodes.get(gap.community_b));
    return {
      question: `The data covers "${topA}" and "${topB}" separately — what connections might exist between them?`,
      evidence_for: `${(communityNodes.get(gap.community_a) || []).length} concepts in cluster A, ${(communityNodes.get(gap.community_b) || []).length} in cluster B`,
      evidence_against: `Only ${gap.inter_edges} connections found between them`,
      gap_reference: { community_a: gap.community_a, community_b: gap.community_b },
    };
  });

  // Counter-perspectives: find peripheral low-centrality nodes
  const counterPerspectives = [];
  const dominantNodes = communityNodes.get(dominant.id) || [];
  const dominantIds = new Set(dominantNodes.map((n) => n.id));

  for (const node of nodes.values()) {
    if (dominantIds.has(node.id)) continue;
    if (node.centrality > 0 && node.centrality < 0.2 && node.community !== dominant.id) {
      // Check if this node has any connection to the dominant cluster
      const neighbors = adjacency.get(node.id);
      let hasDominantNeighbor = false;
      if (neighbors) {
        for (const nid of neighbors) {
          if (dominantIds.has(nid)) { hasDominantNeighbor = true; break; }
        }
      }
      if (hasDominantNeighbor) {
        counterPerspectives.push({
          mainstream_path: getTopConcept(dominantNodes),
          alternative_path: node.label,
          divergence_point: node.id,
          community: node.community,
        });
      }
      if (counterPerspectives.length >= 5) break;
    }
  }

  return {
    diversity_score: diversity.score,
    bias_assessment: {
      dominant_cluster: dominant.id,
      dominance_ratio: diversity.dominanceRatio,
      underrepresented_clusters: underrepresented,
    },
    blind_spots: blindSpots,
    challenge_questions: challengeQuestions,
    counter_perspectives: counterPerspectives,
  };
}

function getTopConcept(nodeList) {
  if (!nodeList || nodeList.length === 0) return "unknown";
  const sorted = [...nodeList].sort((a, b) => b.centrality - a.centrality);
  return sorted[0].label;
}

module.exports = { breakEchoChamber };
