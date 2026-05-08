"use strict";

/**
 * OpenClaw bridge adapter — wraps Medical Zettelkasten MCP tools as
 * async functions callable from OpenClaw's agent-engine.js.
 *
 * Drop this file into openclaw-bridge/integrations/ for direct integration.
 *
 * @module openclaw-bridge-adapter
 */

const { dispatch } = require("../src/handlers/index.js");

/**
 * Create an OpenClaw bridge adapter.
 * @param {object} [options]
 * @param {object} [options.logger]
 * @returns {OpenClawBridgeAdapter}
 */
function createOpenClawBridgeAdapter(options) {
  const opts = options || {};
  const logger = opts.logger || { info() {}, warn() {}, error() {} };

  /**
   * Call a Medical Zettelkasten tool directly (in-process).
   * @param {string} toolName - One of the 10 MCP tool names
   * @param {object} args - Tool input arguments
   * @returns {Promise<object>} - Parsed tool result
   */
  async function callTool(toolName, args) {
    const start = Date.now();
    const result = await dispatch(toolName, args);
    const duration = Date.now() - start;

    if (result.isError) {
      logger.warn({ event: "zettelkasten_tool_error", tool: toolName, duration });
      const parsed = JSON.parse(result.content[0].text);
      return { ok: false, error: parsed.error, durationMs: duration };
    }

    logger.info({ event: "zettelkasten_tool_success", tool: toolName, duration });
    const parsed = JSON.parse(result.content[0].text);
    return { ok: true, result: parsed, durationMs: duration };
  }

  /**
   * Analyze ToolUniverse JSON results through the graph pipeline.
   * Convenience wrapper for the most common OpenClaw use case.
   * @param {string|object} toolUniverseData - ToolUniverse query results
   * @param {string} [analysisType="full_zettelkasten_analysis"]
   * @returns {Promise<object>}
   */
  async function analyzeToolUniverseData(toolUniverseData, analysisType) {
    const text = typeof toolUniverseData === "string"
      ? toolUniverseData
      : JSON.stringify(toolUniverseData);

    return callTool(analysisType || "full_zettelkasten_analysis", {
      text,
      input_type: "tooluniverse_json",
    });
  }

  return {
    callTool,
    analyzeToolUniverseData,
  };
}

module.exports = { createOpenClawBridgeAdapter };
