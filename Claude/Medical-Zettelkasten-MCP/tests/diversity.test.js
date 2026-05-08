"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { createGraph } = require("../lib/graph.js");
const { measureDiversity } = require("../lib/diversity.js");

describe("Diversity scoring", () => {
  it("perfectly balanced → score near 1.0", () => {
    const g = createGraph();
    g.addNode("a", "A", { community: 0 });
    g.addNode("b", "B", { community: 0 });
    g.addNode("c", "C", { community: 1 });
    g.addNode("d", "D", { community: 1 });
    const result = measureDiversity(g);
    assert.equal(result.score, 1);
    assert.equal(result.communityCount, 2);
  });

  it("single community → score 0", () => {
    const g = createGraph();
    g.addNode("a", "A", { community: 0 });
    g.addNode("b", "B", { community: 0 });
    g.addNode("c", "C", { community: 0 });
    const result = measureDiversity(g);
    assert.equal(result.score, 0);
    assert.equal(result.dominanceRatio, 1);
  });

  it("highly imbalanced → low score", () => {
    const g = createGraph();
    for (let i = 0; i < 10; i++) g.addNode(`a${i}`, `A${i}`, { community: 0 });
    g.addNode("b0", "B0", { community: 1 });
    const result = measureDiversity(g);
    assert.ok(result.score < 0.5, `Score ${result.score} should be < 0.5`);
    assert.equal(result.dominantCommunity, 0);
  });

  it("empty graph → zeroes", () => {
    const g = createGraph();
    const result = measureDiversity(g);
    assert.equal(result.score, 0);
    assert.equal(result.communityCount, 0);
  });

  it("reports community sizes", () => {
    const g = createGraph();
    g.addNode("a", "A", { community: 0 });
    g.addNode("b", "B", { community: 1 });
    g.addNode("c", "C", { community: 1 });
    const result = measureDiversity(g);
    assert.equal(result.communitySizes[0], 1);
    assert.equal(result.communitySizes[1], 2);
  });
});
