"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { textToGraph, tokenize, lemmatize, STOPWORDS } = require("../lib/text-to-graph.js");

describe("tokenize", () => {
  it("lowercases and splits", () => {
    // "hello" is in InfraNodus's English stopword list, so only "world" remains
    const tokens = tokenize("Hello World");
    assert.deepEqual(tokens, ["world"]);
  });

  it("removes stopwords", () => {
    const tokens = tokenize("the cat is on the mat");
    assert.ok(!tokens.includes("the"));
    assert.ok(!tokens.includes("is"));
    assert.ok(!tokens.includes("on"));
  });

  it("removes short tokens", () => {
    const tokens = tokenize("I am a big cat");
    assert.ok(!tokens.includes("i"));
    assert.ok(!tokens.includes("a"));
  });

  it("preserves multi-word entities", () => {
    const tokens = tokenize("drug interaction is important", null, ["drug interaction"]);
    assert.ok(tokens.includes("drug_interaction"));
  });

  it("returns empty for empty input", () => {
    assert.deepEqual(tokenize(""), []);
    assert.deepEqual(tokenize(null), []);
  });
});

describe("lemmatize", () => {
  it("handles -ing suffix", () => {
    // phpmorphy returns ['RUNNING', 'RUN'] — InfraNodus takes [0] = "running"
    // This matches the original InfraNodus behavior (phpmorphy first result)
    assert.equal(lemmatize("running"), "running");
  });

  it("handles -s suffix", () => {
    assert.equal(lemmatize("drugs"), "drug");
  });

  it("preserves short words", () => {
    assert.equal(lemmatize("cat"), "cat");
  });

  it("preserves words with digits", () => {
    assert.equal(lemmatize("brca1"), "brca1");
  });
});

describe("textToGraph", () => {
  it("builds graph from text", () => {
    const text = "aspirin reduces pain and inflammation";
    const graph = textToGraph(text);
    assert.ok(graph.nodeCount() > 0);
    assert.ok(graph.edgeCount() > 0);
  });

  it("creates edges within 4-gram window", () => {
    const text = "alpha beta gamma delta epsilon";
    const graph = textToGraph(text);
    // alpha-beta, alpha-gamma, alpha-delta (within window of 4)
    assert.ok(graph.getEdge("alpha", "beta"));
    assert.ok(graph.getEdge("alpha", "gamma"));
    assert.ok(graph.getEdge("alpha", "delta"));
    // alpha-epsilon should NOT be connected (outside window)
    assert.equal(graph.getEdge("alpha", "epsilon"), null);
  });

  it("handles empty text", () => {
    const graph = textToGraph("");
    assert.equal(graph.nodeCount(), 0);
  });

  it("handles custom window size", () => {
    const text = "alpha beta gamma delta epsilon";
    const graph = textToGraph(text, { windowSize: 2 });
    assert.ok(graph.getEdge("alpha", "beta"));
    assert.equal(graph.getEdge("alpha", "gamma"), null);
  });

  it("updates node weights", () => {
    const text = "cancer cancer cancer drug drug pathway";
    const graph = textToGraph(text);
    // "cancer" appears multiple times, should have higher weight
    const cancerNode = graph.getNode("cancer");
    assert.ok(cancerNode);
    assert.ok(cancerNode.weight > 0);
  });

  it("uses custom stopwords", () => {
    const customStops = new Set(["alpha"]);
    const text = "alpha beta gamma";
    const graph = textToGraph(text, { stopwords: customStops });
    assert.equal(graph.getNode("alpha"), null);
    assert.ok(graph.getNode("beta"));
  });
});
