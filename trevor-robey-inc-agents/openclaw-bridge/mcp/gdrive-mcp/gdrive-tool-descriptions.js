"use strict";

/**
 * Tool descriptions for the Google Drive MCP, formatted for injection
 * into the agentic loop LLM prompt via buildToolInstructionBlock().
 *
 * @module gdrive-tool-descriptions
 */

const GDRIVE_TOOL_DESCRIPTIONS = Object.freeze([
  {
    name: "gdrive_search",
    description: "Search Google Drive files by query (Drive API query syntax: fullText contains, name contains, mimeType, etc.)",
    parameters: '{ "query": "fullText contains \'aspirin\'" [, "page_size": 10] [, "order_by": "relevance desc"] [, "page_token": "..."] }'
  },
  {
    name: "gdrive_fetch",
    description: "Fetch Google Doc content as plain text by document ID(s). Non-Doc files are fetched as raw content (truncated to 50k chars).",
    parameters: '{ "document_ids": ["1aBcDeFgHiJkLmNoPqRsTuVwXyZ"] }'
  }
]);

module.exports = { GDRIVE_TOOL_DESCRIPTIONS };
