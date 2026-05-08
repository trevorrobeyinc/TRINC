"use strict";

/**
 * MCP tool definitions for the Medical Zettelkasten MCP server.
 * 10 tools exposing graph analysis and Zettelkasten commands.
 *
 * @module tools
 */

const INPUT_TYPE_ENUM = ["text", "tooluniverse_json", "pubmed_abstracts", "openclaw_report"];

const COMMON_INPUT = {
  text: { type: "string", description: "Input text or JSON-stringified structured data" },
  input_type: {
    type: "string",
    enum: INPUT_TYPE_ENUM,
    description: "Format of the input: plain text, ToolUniverse JSON, PubMed abstracts, or OpenClaw report",
    default: "text",
  },
};

const TOOLS = [
  {
    name: "analyze_network",
    description: "Convert text or structured biomedical data into a knowledge graph and return full network analysis: communities, centrality rankings, structural gaps, and diversity score.",
    inputSchema: {
      type: "object",
      properties: {
        ...COMMON_INPUT,
        options: {
          type: "object",
          properties: {
            min_edge_weight: { type: "number", description: "Minimum edge weight to include", default: 0 },
            stopword_mode: { type: "string", enum: ["general", "biomedical", "none"], default: "biomedical" },
          },
        },
      },
      required: ["text"],
    },
  },
  {
    name: "find_gaps",
    description: "Identify structural gaps in biomedical knowledge — connections that SHOULD exist but DON'T. These are research opportunities, blind spots, and unexplored hypotheses.",
    inputSchema: {
      type: "object",
      properties: {
        ...COMMON_INPUT,
        max_gaps: { type: "number", description: "Maximum gaps to return", default: 10 },
      },
      required: ["text"],
    },
  },
  {
    name: "detect_clusters",
    description: "Identify topical communities in biomedical data — the main themes, relationships between them, and key concepts in each cluster.",
    inputSchema: {
      type: "object",
      properties: {
        ...COMMON_INPUT,
        min_cluster_size: { type: "number", description: "Minimum nodes per cluster", default: 2 },
      },
      required: ["text"],
    },
  },
  {
    name: "measure_diversity",
    description: "Assess research coverage bias — is the data dominated by one topic at the expense of others? Identify underrepresented areas.",
    inputSchema: {
      type: "object",
      properties: COMMON_INPUT,
      required: ["text"],
    },
  },
  {
    name: "cross_domain_connect",
    description: "Apply Cross-Domain Connector Zettelkasten analysis. Find structural isomorphisms and bridge concepts across different biomedical knowledge clusters.",
    inputSchema: {
      type: "object",
      properties: COMMON_INPUT,
      required: ["text"],
    },
  },
  {
    name: "break_echo_chamber",
    description: "Apply Echo Chamber Breaker Zettelkasten analysis. Challenge dominant narratives by identifying blind spots, missing counter-evidence, and under-explored alternatives.",
    inputSchema: {
      type: "object",
      properties: COMMON_INPUT,
      required: ["text"],
    },
  },
  {
    name: "link_semantically",
    description: "Apply Semantic Linker Zettelkasten analysis. Classify relationships between biomedical concepts (hierarchical, causal, associative, antagonistic) and discover hidden transitive connections.",
    inputSchema: {
      type: "object",
      properties: COMMON_INPUT,
      required: ["text"],
    },
  },
  {
    name: "rescue_orphans",
    description: "Apply Orphan Rescuer Zettelkasten analysis. Find isolated biomedical concepts or disconnected research clusters and propose reintegration strategies.",
    inputSchema: {
      type: "object",
      properties: COMMON_INPUT,
      required: ["text"],
    },
  },
  {
    name: "generate_serendipity",
    description: "Apply Serendipity Generator Zettelkasten analysis. Surface unexpected connections, 'dark nodes' (implied but absent concepts), and high-surprise bridge hypotheses.",
    inputSchema: {
      type: "object",
      properties: COMMON_INPUT,
      required: ["text"],
    },
  },
  {
    name: "full_zettelkasten_analysis",
    description: "Run ALL five Zettelkasten analyses (cross-domain, echo-chamber, semantic-linker, orphan-rescuer, serendipity) on biomedical data in a single pass.",
    inputSchema: {
      type: "object",
      properties: COMMON_INPUT,
      required: ["text"],
    },
  },
];

module.exports = { TOOLS, INPUT_TYPE_ENUM };
