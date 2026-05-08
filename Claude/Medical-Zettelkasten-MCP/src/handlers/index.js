"use strict";

/**
 * Tool handler dispatch — routes MCP tool calls to implementations.
 *
 * @module handlers
 */

const { buildAnalyzedEngine, mcpResponse, mcpError } = require("./common.js");
const { crossDomainConnect } = require("../../lib/zettelkasten/cross-domain-connector.js");
const { breakEchoChamber } = require("../../lib/zettelkasten/echo-chamber-breaker.js");
const { linkSemantically } = require("../../lib/zettelkasten/semantic-linker.js");
const { rescueOrphans } = require("../../lib/zettelkasten/orphan-rescuer.js");
const { generateSerendipity } = require("../../lib/zettelkasten/serendipity-generator.js");
const { findStructuralGaps } = require("../../lib/gap-detection.js");
const { measureDiversity } = require("../../lib/diversity.js");

const HANDLERS = {
  analyze_network(args) {
    const { engine, analysis } = buildAnalyzedEngine(args);
    const graph = engine.getGraph();
    return mcpResponse({
      graph: graph.toJSON(),
      communities: {
        assignments: Object.fromEntries(analysis.communities.communities),
        modularity: analysis.communities.modularity,
        count: analysis.communities.communityCount,
      },
      centrality: Object.fromEntries(analysis.centrality),
      gaps: analysis.gaps,
      diversity: analysis.diversity,
    });
  },

  find_gaps(args) {
    const { engine } = buildAnalyzedEngine(args);
    const maxGaps = args.max_gaps || 10;
    const result = findStructuralGaps(engine.getGraph(), { maxGaps });
    return mcpResponse(result);
  },

  detect_clusters(args) {
    const { analysis } = buildAnalyzedEngine(args);
    const minSize = args.min_cluster_size || 2;

    // Group nodes by community and filter by min size
    const communities = analysis.communities;
    const groups = new Map();
    for (const [nodeId, commId] of communities.communities) {
      if (!groups.has(commId)) groups.set(commId, []);
      groups.get(commId).push(nodeId);
    }

    const clusters = [];
    for (const [commId, nodeList] of groups) {
      if (nodeList.length < minSize) continue;
      clusters.push({
        community_id: commId,
        size: nodeList.length,
        nodes: nodeList,
      });
    }
    clusters.sort((a, b) => b.size - a.size);

    return mcpResponse({
      clusters,
      modularity: communities.modularity,
      total_communities: communities.communityCount,
    });
  },

  measure_diversity(args) {
    const { engine } = buildAnalyzedEngine(args);
    const result = measureDiversity(engine.getGraph());
    return mcpResponse(result);
  },

  cross_domain_connect(args) {
    const { engine } = buildAnalyzedEngine(args);
    const result = crossDomainConnect(engine);
    return mcpResponse(result);
  },

  break_echo_chamber(args) {
    const { engine } = buildAnalyzedEngine(args);
    const result = breakEchoChamber(engine);
    return mcpResponse(result);
  },

  link_semantically(args) {
    const { engine } = buildAnalyzedEngine(args);
    const result = linkSemantically(engine);
    return mcpResponse(result);
  },

  rescue_orphans(args) {
    const { engine } = buildAnalyzedEngine(args);
    const result = rescueOrphans(engine);
    return mcpResponse(result);
  },

  generate_serendipity(args) {
    const { engine } = buildAnalyzedEngine(args);
    const result = generateSerendipity(engine);
    return mcpResponse(result);
  },

  full_zettelkasten_analysis(args) {
    const { engine } = buildAnalyzedEngine(args);
    return mcpResponse({
      cross_domain: crossDomainConnect(engine),
      echo_chamber: breakEchoChamber(engine),
      semantic_links: linkSemantically(engine),
      orphan_rescue: rescueOrphans(engine),
      serendipity: generateSerendipity(engine),
      graph: engine.getGraph().toJSON(),
    });
  },

};

/**
 * Dispatch an MCP tool call to the appropriate handler.
 * @param {string} toolName
 * @param {object} args
 * @returns {{content: Array, isError?: boolean}}
 */
async function dispatch(toolName, args) {
  const handler = HANDLERS[toolName];
  if (!handler) return mcpError(`Unknown tool: ${toolName}`);
  try {
    return await handler(args);
  } catch (err) {
    return mcpError(err.message || "Unknown error");
  }
}

module.exports = { dispatch, HANDLERS };
