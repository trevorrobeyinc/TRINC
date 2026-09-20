"use strict";

/**
 * trinc-content MCP server — stdio entry point.
 *
 * Content creation for the Trevor Robey, INC. channels (YouTube, TikTok, Instagram, Facebook
 * Page, AWS Data Exchange), grounded in the research engine's own output and gated against the
 * brand and compliance rules the business already wrote down.
 *
 * stdio only — no TCP listener, so the monorepo's HTTPS-only invariant does not apply and
 * nothing here can bind a port.
 *
 * @module server
 */

const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const {
  CallToolRequestSchema,
  ListToolsRequestSchema
} = require("@modelcontextprotocol/sdk/types.js");

const { TOOLS, dispatch } = require("./tools.js");

function createMcpServer() {
  const server = new Server(
    { name: "trinc-content", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return await dispatch(name, args || {});
  });

  return server;
}

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
