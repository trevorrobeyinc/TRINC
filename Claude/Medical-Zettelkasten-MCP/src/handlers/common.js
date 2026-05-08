"use strict";

/**
 * Shared handler utilities — builds an analyzed graph engine from tool input.
 *
 * @module handlers/common
 */

const { createGraphEngine } = require("../../lib/graph-engine.js");
const { normalizeInput, buildStopwords, getPreserveEntities } = require("../../lib/biomedical-adapter.js");

/**
 * Build an analyzed graph engine from MCP tool input arguments.
 * @param {object} args - Tool input arguments (text, input_type, options)
 * @returns {{engine: import("../../lib/graph-engine.js").GraphEngine, analysis: object}}
 */
function buildAnalyzedEngine(args) {
  const text = normalizeInput(args.text, args.input_type || "text");
  if (!text || text.trim().length === 0) {
    throw new Error("Input produced no analyzable text after normalization");
  }

  const stopwordMode = (args.options && args.options.stopword_mode) || "biomedical";
  const stopwords = buildStopwords(stopwordMode);
  const preserveEntities = getPreserveEntities();

  const engine = createGraphEngine({ stopwords, preserveEntities });
  engine.fromText(text);
  const analysis = engine.analyze();

  return { engine, analysis };
}

/**
 * Wrap handler result as MCP tool response.
 * @param {object} result
 * @returns {{content: Array<{type: string, text: string}>}}
 */
function mcpResponse(result) {
  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
}

/**
 * Wrap error as MCP tool error response.
 * @param {string} message
 * @returns {{content: Array<{type: string, text: string}>, isError: boolean}}
 */
function mcpError(message) {
  return {
    content: [{ type: "text", text: JSON.stringify({ error: message }) }],
    isError: true,
  };
}

module.exports = { buildAnalyzedEngine, mcpResponse, mcpError };
