"use strict";

/**
 * Cross-Domain Connector — finds bridges and structural isomorphisms
 * between communities in the knowledge graph.
 *
 * @module zettelkasten/cross-domain-connector
 */

/**
 * Run Cross-Domain Connector analysis on an analyzed graph engine.
 *
 * @param {import("../graph-engine.js").GraphEngine} engine - Must have analyze() called first
 * @returns {{bridges: Array, isomorphisms: Array, connection_proposals: Array, universal_principles: Array}}
 */
function crossDomainConnect(engine) {
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

  const communityIds = Array.from(communityNodes.keys()).sort((a, b) => a - b);
  const bridges = [];
  const isomorphisms = [];
  const connectionProposals = [];
  const principleMap = new Map();

  // Find bridge nodes: high centrality nodes with connections spanning multiple communities
  for (const node of nodes.values()) {
    if (node.centrality < 0.1) continue;
    const neighborComms = new Set();
    const neighbors = adjacency.get(node.id);
    if (!neighbors) continue;
    for (const nid of neighbors) {
      const neighbor = nodes.get(nid);
      if (neighbor && neighbor.community >= 0) neighborComms.add(neighbor.community);
    }
    if (neighborComms.size >= 2) {
      const comms = Array.from(neighborComms).sort((a, b) => a - b);
      for (let i = 0; i < comms.length; i++) {
        for (let j = i + 1; j < comms.length; j++) {
          bridges.push({
            source_community: comms[i],
            target_community: comms[j],
            bridge_nodes: [node.id],
            bridge_strength: Math.round(node.centrality * 1000) / 1000,
          });
        }
      }
    }
  }

  // Merge bridges between the same community pairs
  const bridgeMap = new Map();
  for (const b of bridges) {
    const key = `${b.source_community}::${b.target_community}`;
    if (bridgeMap.has(key)) {
      const existing = bridgeMap.get(key);
      existing.bridge_nodes.push(...b.bridge_nodes);
      existing.bridge_strength = Math.max(existing.bridge_strength, b.bridge_strength);
    } else {
      bridgeMap.set(key, { ...b });
    }
  }

  // Find structural isomorphisms: subgraph patterns that repeat across communities
  for (let i = 0; i < communityIds.length; i++) {
    const nodesA = communityNodes.get(communityIds[i]) || [];
    const patternA = classifyPattern(nodesA, adjacency, nodes);

    for (let j = i + 1; j < communityIds.length; j++) {
      const nodesB = communityNodes.get(communityIds[j]) || [];
      const patternB = classifyPattern(nodesB, adjacency, nodes);

      if (patternA.type === patternB.type && patternA.type !== "undefined") {
        isomorphisms.push({
          pattern: patternA.type,
          community_a_instance: { community: communityIds[i], hub: patternA.hub },
          community_b_instance: { community: communityIds[j], hub: patternB.hub },
          similarity_score: Math.round(Math.min(patternA.score, patternB.score) * 100) / 100,
        });
      }
    }
  }

  // Generate connection proposals from bridges
  for (const [, bridge] of bridgeMap) {
    const commANodes = communityNodes.get(bridge.source_community) || [];
    const commBNodes = communityNodes.get(bridge.target_community) || [];
    const topA = commANodes.sort((a, b) => b.centrality - a.centrality)[0];
    const topB = commBNodes.sort((a, b) => b.centrality - a.centrality)[0];
    if (topA && topB) {
      const tag = classifyRelationshipTag(bridge, adjacency, nodes);
      connectionProposals.push({
        concept_a: topA.label,
        concept_b: topB.label,
        relationship_type: tag,
        rationale: `Bridge via ${bridge.bridge_nodes.join(", ")} (centrality: ${bridge.bridge_strength})`,
        confidence: bridge.bridge_strength,
      });
      // Track universal principles
      if (!principleMap.has(tag)) principleMap.set(tag, []);
      principleMap.get(tag).push({
        community: bridge.source_community,
        nodes: bridge.bridge_nodes,
      });
    }
  }

  const universalPrinciples = Array.from(principleMap.entries()).map(([tag, instances]) => ({
    tag: `#${tag}`,
    instances,
  }));

  return {
    bridges: Array.from(bridgeMap.values()).sort((a, b) => b.bridge_strength - a.bridge_strength),
    isomorphisms,
    connection_proposals: connectionProposals,
    universal_principles: universalPrinciples,
  };
}

/** Classify the topological pattern of a community. */
function classifyPattern(communityNodes, adjacency, allNodes) {
  if (communityNodes.length < 2) return { type: "undefined", hub: null, score: 0 };

  // Find the node with highest degree within community
  let maxDeg = 0;
  let hubNode = null;
  const commIds = new Set(communityNodes.map((n) => n.id));

  for (const node of communityNodes) {
    const neighbors = adjacency.get(node.id);
    if (!neighbors) continue;
    let internalDeg = 0;
    for (const nid of neighbors) {
      if (commIds.has(nid)) internalDeg++;
    }
    if (internalDeg > maxDeg) {
      maxDeg = internalDeg;
      hubNode = node.id;
    }
  }

  const avgDeg = communityNodes.reduce((sum, n) => {
    const neighbors = adjacency.get(n.id);
    let d = 0;
    if (neighbors) for (const nid of neighbors) { if (commIds.has(nid)) d++; }
    return sum + d;
  }, 0) / communityNodes.length;

  // Hub-spoke: one node has much higher degree than average
  if (maxDeg > avgDeg * 2 && communityNodes.length >= 3) {
    return { type: "hub-spoke", hub: hubNode, score: maxDeg / (avgDeg || 1) };
  }
  // Chain: low avg degree, linear connectivity
  if (avgDeg <= 2.5 && communityNodes.length >= 3) {
    return { type: "cascade", hub: hubNode, score: 1 / (avgDeg || 1) };
  }
  // Dense: high connectivity
  if (avgDeg > communityNodes.length * 0.5) {
    return { type: "feedback-loop", hub: hubNode, score: avgDeg / communityNodes.length };
  }

  return { type: "bottleneck", hub: hubNode, score: maxDeg / (communityNodes.length || 1) };
}

/** Classify the relationship tag for a bridge. */
function classifyRelationshipTag(bridge, adjacency, nodes) {
  const bridgeNode = nodes.get(bridge.bridge_nodes[0]);
  if (!bridgeNode) return "bridge";
  if (bridgeNode.centrality > 0.5) return "hub-spoke";
  const neighbors = adjacency.get(bridgeNode.id);
  if (neighbors && neighbors.size > 5) return "amplification";
  return "bridge";
}

module.exports = { crossDomainConnect };
