"use strict";

/**
 * Copilot MCP bridge — accepts Zettelkasten analysis output and
 * formats it for consumption by the Copilot MCP backend emulator.
 *
 * @module copilot-bridge
 */

const { formatForObsidian, extractWikilinks } = require("./obsidian-formatter.js");

/**
 * Create a Copilot bridge adapter.
 * @param {object} [options]
 * @param {string} [options.vaultName] - Default Obsidian vault name
 * @returns {CopilotBridgeAdapter}
 */
function createCopilotBridge(options) {
  const opts = options || {};
  const vaultName = opts.vaultName || "My Digital Garden";

  /**
   * Convert Zettelkasten analysis to Copilot-compatible response format.
   * Matches the ZettelkastenCommandResponse schema from the backend emulator.
   *
   * @param {object} analysisResult - Output from any Zettelkasten tool
   * @param {string} command - Original command name
   * @returns {object} Copilot ZettelkastenCommandResponse format
   */
  function toCopilotResponse(analysisResult, command) {
    const markdown = formatForObsidian(analysisResult, {
      noteTitle: `${command} Analysis`,
    });

    const wikilinks = extractWikilinks(analysisResult);
    const suggestions = wikilinks.slice(0, 10).map((link) => ({
      targetNote: link,
      wikilink: `[[${link}]]`,
      rationale: `Identified via graph analysis`,
      confidence: 0.7,
    }));

    return {
      ok: true,
      command,
      content: markdown,
      suggestions,
      metadata: {
        durationMs: 0,
        notesAnalyzed: 0,
        miyoQueries: 0,
        llmCalls: 0,
        graphNodes: analysisResult.graph ? analysisResult.graph.metadata.nodeCount : 0,
        graphEdges: analysisResult.graph ? analysisResult.graph.metadata.edgeCount : 0,
        vault: vaultName,
      },
    };
  }

  /**
   * Format analysis as an Obsidian note ready to append.
   * @param {object} analysisResult
   * @param {string} noteTitle
   * @returns {string}
   */
  function toObsidianNote(analysisResult, noteTitle) {
    return formatForObsidian(analysisResult, { noteTitle });
  }

  return {
    toCopilotResponse,
    toObsidianNote,
  };
}

module.exports = { createCopilotBridge };
