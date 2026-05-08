"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { createGraph } = require("../lib/graph.js");
const { computeBetweennessCentrality } = require("../lib/centrality.js");

describe("Betweenness centrality", () => {
  it("star graph: center has highest centrality", () => {
    // Center node connected to 4 leaves
    const g = createGraph();
    g.addEdge("center", "a", 1);
    g.addEdge("center", "b", 1);
    g.addEdge("center", "c", 1);
    g.addEdge("center", "d", 1);
    const cb = computeBetweennessCentrality(g);
    assert.equal(cb.get("center"), 1);
    assert.equal(cb.get("a"), 0);
  });

  it("path graph: middle nodes have highest centrality", () => {
    // A - B - C - D - E
    const g = createGraph();
    g.addEdge("a", "b", 1);
    g.addEdge("b", "c", 1);
    g.addEdge("c", "d", 1);
    g.addEdge("d", "e", 1);
    const cb = computeBetweennessCentrality(g);
    // C is the most central (middle of path)
    assert.ok(cb.get("c") >= cb.get("b"));
    assert.ok(cb.get("c") >= cb.get("d"));
    assert.ok(cb.get("c") > cb.get("a"));
  });

  it("single node returns 0", () => {
    const g = createGraph();
    g.addNode("solo", "Solo");
    const cb = computeBetweennessCentrality(g);
    assert.equal(cb.get("solo"), 0);
  });

  it("two nodes return 0", () => {
    const g = createGraph();
    g.addEdge("a", "b", 1);
    const cb = computeBetweennessCentrality(g);
    assert.equal(cb.get("a"), 0);
    assert.equal(cb.get("b"), 0);
  });

  it("stores centrality on node objects", () => {
    const g = createGraph();
    g.addEdge("a", "b", 1);
    g.addEdge("b", "c", 1);
    computeBetweennessCentrality(g);
    assert.ok(g.getNode("b").centrality > 0);
  });

  it("centrality values in [0, 1]", () => {
    const g = createGraph();
    g.addEdge("a", "b", 1);
    g.addEdge("b", "c", 1);
    g.addEdge("c", "d", 1);
    g.addEdge("d", "e", 1);
    g.addEdge("b", "d", 1);
    const cb = computeBetweennessCentrality(g);
    for (const [, val] of cb) {
      assert.ok(val >= 0 && val <= 1, `centrality ${val} outside [0,1]`);
    }
  });

  it("empty graph returns empty map", () => {
    const g = createGraph();
    const cb = computeBetweennessCentrality(g);
    assert.equal(cb.size, 0);
  });

  it("complete graph: all centralities equal", () => {
    const g = createGraph();
    g.addEdge("a", "b", 1);
    g.addEdge("a", "c", 1);
    g.addEdge("b", "c", 1);
    const cb = computeBetweennessCentrality(g);
    // All nodes should have same centrality in a triangle
    assert.equal(cb.get("a"), cb.get("b"));
    assert.equal(cb.get("b"), cb.get("c"));
  });
});
