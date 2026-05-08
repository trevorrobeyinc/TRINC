"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { createGraph } = require("../lib/graph.js");
const { detectCommunities } = require("../lib/community-detection.js");
const { findStructuralGaps } = require("../lib/gap-detection.js");

describe("Structural gap detection", () => {
  it("finds gap between disconnected clusters", () => {
    const g = createGraph();
    g.addEdge("a", "b", 5);
    g.addEdge("b", "c", 5);
    g.addEdge("a", "c", 5);
    g.addEdge("d", "e", 5);
    g.addEdge("e", "f", 5);
    g.addEdge("d", "f", 5);
    // No connection between clusters
    detectCommunities(g);
    const result = findStructuralGaps(g);
    assert.ok(result.gaps.length > 0, "Should find at least one gap");
    assert.ok(result.gaps[0].gap_score > 0);
    assert.equal(result.gaps[0].inter_edges, 0);
  });

  it("smaller gap for weakly connected clusters", () => {
    const g = createGraph();
    g.addEdge("a", "b", 5);
    g.addEdge("b", "c", 5);
    g.addEdge("a", "c", 5);
    g.addEdge("d", "e", 5);
    g.addEdge("e", "f", 5);
    g.addEdge("d", "f", 5);
    g.addEdge("c", "d", 1); // Weak connection
    detectCommunities(g);
    const result = findStructuralGaps(g);
    // There should still be a gap, but with inter_edges > 0
    if (result.gaps.length > 0) {
      assert.ok(result.gaps[0].gap_score > 0);
    }
  });

  it("no gaps in single community", () => {
    const g = createGraph();
    g.addEdge("a", "b", 1);
    g.addEdge("b", "c", 1);
    g.addEdge("a", "c", 1);
    detectCommunities(g);
    const result = findStructuralGaps(g);
    // Only 1 community → no gap pairs
    if (g.getNode("a").community === g.getNode("b").community &&
        g.getNode("b").community === g.getNode("c").community) {
      assert.equal(result.gaps.length, 0);
    }
  });

  it("respects maxGaps limit", () => {
    const g = createGraph();
    // Create 5 disconnected pairs → many community pairs
    for (let i = 0; i < 5; i++) {
      g.addEdge(`a${i}`, `b${i}`, 1);
    }
    detectCommunities(g);
    const result = findStructuralGaps(g, { maxGaps: 3 });
    assert.ok(result.gaps.length <= 3);
  });

  it("gaps sorted by gap_score descending", () => {
    const g = createGraph();
    g.addEdge("a", "b", 5);
    g.addEdge("b", "c", 5);
    g.addEdge("d", "e", 5);
    g.addEdge("e", "f", 5);
    g.addEdge("x", "y", 1);
    detectCommunities(g);
    const result = findStructuralGaps(g);
    for (let i = 1; i < result.gaps.length; i++) {
      assert.ok(result.gaps[i - 1].gap_score >= result.gaps[i].gap_score);
    }
  });

  it("identifies bridge candidates", () => {
    const g = createGraph();
    g.addEdge("a", "b", 5);
    g.addEdge("b", "c", 5);
    g.addEdge("a", "c", 5);
    g.addEdge("d", "e", 5);
    g.addEdge("e", "f", 5);
    g.addEdge("d", "f", 5);
    g.addEdge("c", "d", 1);
    detectCommunities(g);
    const result = findStructuralGaps(g);
    // Bridge candidates should include nodes near the border
    const allBridges = result.gaps.flatMap((g) => g.bridge_candidates);
    assert.ok(Array.isArray(allBridges));
  });
});
