"use strict";

/**
 * SearXNG Search MCP Server — stdio entry point.
 * Exposes Tavily-style web-search tools (search / extract / map) backed by a
 * local, Docker-free SearXNG instance, plus docs_search (vendor documentation without
 * a search engine) and search_health (relevance canary). Consumed by Claude Desktop and Claude Code.
 *
 * @module server
 */

const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require("@modelcontextprotocol/sdk/types.js");

const { TOOLS, dispatch } = require("./tools.js");

/**
 * Create and configure the MCP server.
 * @returns {Server}
 */
function createMcpServer() {
  const server = new Server(
    { name: "searxng-search", version: "1.1.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return await dispatch(name, args || {});
  });

  return server;
}

/** Start the MCP server on stdio transport. */
async function main() {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`Fatal: ${err.message}\n`);
    process.exit(1);
  });
}

module.exports = { createMcpServer };
