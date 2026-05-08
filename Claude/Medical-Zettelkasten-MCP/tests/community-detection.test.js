"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { createGraph } = require("../lib/graph.js");
const { detectCommunities, computeModularity } = require("../lib/community-detection.js");

describe("Community detection (Louvain)", () => {
  it("two cliques → two communities", () => {
    const g = createGraph();
    // Clique 1: a-b-c
    g.addEdge("a", "b", 5);
    g.addEdge("b", "c", 5);
    g.addEdge("a", "c", 5);
    // Clique 2: d-e-f
    g.addEdge("d", "e", 5);
    g.addEdge("e", "f", 5);
    g.addEdge("d", "f", 5);
    // Weak bridge
    g.addEdge("c", "d", 1);

    const result = detectCommunities(g);
    assert.ok(result.communityCount >= 2, `Expected >=2 communities, got ${result.communityCount}`);
    // a, b, c should be in the same community
    assert.equal(g.getNode("a").community, g.getNode("b").community);
    assert.equal(g.getNode("b").community, g.getNode("c").community);
    // d, e, f should be in the same community
    assert.equal(g.getNode("d").community, g.getNode("e").community);
    assert.equal(g.getNode("e").community, g.getNode("f").community);
  });

  it("single node → one community", () => {
    const g = createGraph();
    g.addNode("solo", "Solo");
    const result = detectCommunities(g);
    assert.equal(result.communityCount, 1);
  });

  it("empty graph → zero communities", () => {
    const g = createGraph();
    const result = detectCommunities(g);
    assert.equal(result.communityCount, 0);
  });

  it("returns contiguous community IDs", () => {
    const g = createGraph();
    g.addEdge("a", "b", 5);
    g.addEdge("c", "d", 5);
    const result = detectCommunities(g);
    const commIds = new Set(result.communities.values());
    const maxId = Math.max(...commIds);
    assert.equal(maxId, commIds.size - 1);
  });

  it("stores community on node objects", () => {
    const g = createGraph();
    g.addEdge("a", "b", 1);
    g.addEdge("b", "c", 1);
    detectCommunities(g);
    for (const node of g.getAllNodes()) {
      assert.ok(node.community >= 0, `Node ${node.id} has community ${node.community}`);
    }
  });

  it("modularity is non-negative for good partitions", () => {
    const g = createGraph();
    g.addEdge("a", "b", 5);
    g.addEdge("b", "c", 5);
    g.addEdge("a", "c", 5);
    g.addEdge("d", "e", 5);
    g.addEdge("e", "f", 5);
    g.addEdge("d", "f", 5);
    g.addEdge("c", "d", 1);
    const result = detectCommunities(g);
    assert.ok(result.modularity >= 0, `Modularity ${result.modularity} should be >= 0`);
  });

  it("two nodes → two communities", () => {
    const g = createGraph();
    g.addEdge("a", "b", 1);
    const result = detectCommunities(g);
    assert.equal(result.communityCount, 2);
  });

  it("disconnected components get different communities", () => {
    const g = createGraph();
    g.addEdge("a", "b", 1);
    g.addNode("c", "C");
    const result = detectCommunities(g);
    const ca = g.getNode("a").community;
    const cc = g.getNode("c").community;
    assert.notEqual(ca, cc);
  });
});
