"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { createGraph } = require("../lib/graph.js");

describe("Graph data structure", () => {
  it("starts empty", () => {
    const g = createGraph();
    assert.equal(g.nodeCount(), 0);
    assert.equal(g.edgeCount(), 0);
  });

  it("adds nodes", () => {
    const g = createGraph();
    g.addNode("a", "Alpha");
    g.addNode("b", "Beta");
    assert.equal(g.nodeCount(), 2);
    assert.equal(g.getNode("a").label, "Alpha");
  });

  it("updates existing node metadata", () => {
    const g = createGraph();
    g.addNode("a", "Alpha");
    g.addNode("a", "Alpha", { weight: 5 });
    assert.equal(g.nodeCount(), 1);
    assert.equal(g.getNode("a").weight, 5);
  });

  it("adds edges and creates adjacency", () => {
    const g = createGraph();
    g.addNode("a", "A");
    g.addNode("b", "B");
    g.addEdge("a", "b", 3);
    assert.equal(g.edgeCount(), 1);
    assert.deepEqual(g.getNeighbors("a"), ["b"]);
    assert.deepEqual(g.getNeighbors("b"), ["a"]);
  });

  it("increments edge weight on duplicate", () => {
    const g = createGraph();
    g.addNode("a", "A");
    g.addNode("b", "B");
    g.addEdge("a", "b", 2);
    g.addEdge("a", "b", 3);
    assert.equal(g.getEdge("a", "b").weight, 5);
  });

  it("normalizes edge IDs (undirected)", () => {
    const g = createGraph();
    g.addNode("a", "A");
    g.addNode("b", "B");
    g.addEdge("a", "b", 1);
    assert.ok(g.getEdge("b", "a"));
    assert.equal(g.edgeCount(), 1);
  });

  it("ignores self-loops", () => {
    const g = createGraph();
    g.addNode("a", "A");
    assert.equal(g.addEdge("a", "a", 1), null);
    assert.equal(g.edgeCount(), 0);
  });

  it("auto-creates nodes for edges", () => {
    const g = createGraph();
    g.addEdge("x", "y", 1);
    assert.equal(g.nodeCount(), 2);
    assert.ok(g.getNode("x"));
  });

  it("returns null for missing nodes/edges", () => {
    const g = createGraph();
    assert.equal(g.getNode("missing"), null);
    assert.equal(g.getEdge("a", "b"), null);
    assert.deepEqual(g.getNeighbors("missing"), []);
  });

  it("updateNodeWeights sums incident edge weights", () => {
    const g = createGraph();
    g.addEdge("a", "b", 3);
    g.addEdge("a", "c", 2);
    g.updateNodeWeights();
    assert.equal(g.getNode("a").weight, 5);
    assert.equal(g.getNode("b").weight, 3);
  });

  it("toJSON produces serializable output", () => {
    const g = createGraph();
    g.addEdge("a", "b", 1);
    const json = g.toJSON();
    assert.equal(json.metadata.nodeCount, 2);
    assert.equal(json.metadata.edgeCount, 1);
    assert.ok(Array.isArray(json.nodes));
    assert.ok(Array.isArray(json.edges));
  });
});
