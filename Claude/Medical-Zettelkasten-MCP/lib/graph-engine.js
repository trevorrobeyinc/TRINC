"use strict";

/**
 * Unified graph analysis engine. Orchestrates text-to-graph conversion,
 * centrality, community detection, gap detection, and diversity scoring.
 *
 * @module graph-engine
 */

const { createGraph } = require("./graph.js");
const { textToGraph } = require("./text-to-graph.js");
const { computeBetweennessCentrality } = require("./centrality.js");
const { detectCommunities } = require("./community-detection.js");
const { findStructuralGaps } = require("./gap-detection.js");
const { measureDiversity } = require("./diversity.js");

/**
 * Create a graph engine instance.
 *
 * @param {object} [options]
 * @param {number} [options.windowSize=4] - Co-occurrence window size
 * @param {Set<string>} [options.stopwords] - Custom stopwords
 * @param {string[]} [options.preserveEntities] - Multi-word entities to keep
 * @param {number} [options.maxGaps=10] - Max gaps to find
 * @returns {GraphEngine}
 */
function createGraphEngine(options) {
  const opts = options || {};
  let graph = createGraph();
  let analyzed = false;

  /**
   * Load text into the graph using the 4-gram co-occurrence window.
   * @param {string} text
   * @returns {GraphEngine}
   */
  function fromText(text) {
    if (!text || typeof text !== "string" || text.trim().length === 0) {
      throw new Error("Input text must be a non-empty string");
    }
    graph = textToGraph(text, {
      windowSize: opts.windowSize || 4,
      stopwords: opts.stopwords,
      preserveEntities: opts.preserveEntities,
      synonyms: opts.synonyms,
      lemmatizeHashtags: opts.lemmatizeHashtags,
    });
    analyzed = false;
    return engine;
  }

  /**
   * Run all graph analyses: centrality, communities, gaps, diversity.
   * @returns {{centrality: Map<string, number>, communities: object, gaps: object, diversity: object}}
   */
  function analyze() {
    if (graph.nodeCount() === 0) {
      return {
        centrality: new Map(),
        communities: { communities: new Map(), modularity: 0, communityCount: 0 },
        gaps: { gaps: [], totalGaps: 0 },
        diversity: { score: 0, entropy: 0, maxEntropy: 0, communityCount: 0, communitySizes: {}, dominantCommunity: -1, dominanceRatio: 0 },
      };
    }

    const centrality = computeBetweennessCentrality(graph);
    const communities = detectCommunities(graph);
    const gaps = findStructuralGaps(graph, { maxGaps: opts.maxGaps || 10 });
    const diversity = measureDiversity(graph);

    analyzed = true;
    return { centrality, communities, gaps, diversity };
  }

  /**
   * Convenience: load text and run full analysis in one call.
   * @param {string} text
   * @returns {object} Full analysis results
   */
  function analyzeText(text) {
    fromText(text);
    const results = analyze();
    const graphJson = graph.toJSON();
    // Attach firstAppearance index to each node for animation
    if (graph.firstAppearance) {
      for (const node of graphJson.nodes) {
        node.firstAppearance = graph.firstAppearance[node.id] ?? 0;
      }
    }
    return {
      graph: graphJson,
      ...results,
      communities: {
        assignments: Object.fromEntries(results.communities.communities),
        modularity: results.communities.modularity,
        communityCount: results.communities.communityCount,
      },
      centrality: Object.fromEntries(results.centrality),
    };
  }

  /** Get the underlying graph instance. */
  function getGraph() {
    return graph;
  }

  /** Check if analysis has been run. */
  function isAnalyzed() {
    return analyzed;
  }

  /**
   * Get the full analysis result as a serializable object.
   * @returns {object}
   */
  function toJSON() {
    const graphJson = graph.toJSON();
    return {
      graph: graphJson,
      analyzed,
      metadata: {
        nodeCount: graph.nodeCount(),
        edgeCount: graph.edgeCount(),
      },
    };
  }

  const engine = {
    fromText,
    analyze,
    analyzeText,
    getGraph,
    isAnalyzed,
    toJSON,
    computeCentrality: () => computeBetweennessCentrality(graph),
    detectCommunities: (communityOpts) => detectCommunities(graph, communityOpts),
    findGaps: (gapOpts) => findStructuralGaps(graph, gapOpts),
    measureDiversity: () => measureDiversity(graph),
  };

  return engine;
}

module.exports = { createGraphEngine };
