"use strict";

/**
 * Medical Zettelkasten MCP Server — stdio entry point.
 * Exposes 10 graph analysis and Zettelkasten tools via MCP protocol.
 *
 * @module server
 */

const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require("@modelcontextprotocol/sdk/types.js");

const { TOOLS } = require("./tools.js");
const { dispatch } = require("./handlers/index.js");

/**
 * Create and configure the MCP server.
 * @returns {Server}
 */
function createMcpServer() {
  const server = new Server(
    { name: "medical-zettelkasten-mcp", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return await dispatch(name, args || {});
  });

  return server;
}

/**
 * Start the MCP server on stdio transport.
 */
async function main() {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Run if invoked directly
if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`Fatal: ${err.message}\n`);
    process.exit(1);
  });
}

module.exports = { createMcpServer };
