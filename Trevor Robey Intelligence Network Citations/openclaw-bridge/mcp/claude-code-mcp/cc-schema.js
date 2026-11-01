"use strict";

const { z } = require("zod");

const ClaudeCodeJsonRpcResponseSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number()]),
  result: z.unknown().optional(),
  error: z
    .object({
      code: z.number(),
      message: z.string(),
      data: z.unknown().optional()
    })
    .optional()
}).passthrough();

const McpToolCallContentSchema = z.object({
  type: z.string(),
  text: z.string().optional()
});

const McpToolCallResultSchema = z.object({
  content: z.array(McpToolCallContentSchema),
  isError: z.boolean().optional()
});

const McpInitializeResultSchema = z.object({
  protocolVersion: z.string(),
  capabilities: z.record(z.string(), z.unknown()).optional(),
  serverInfo: z.object({
    name: z.string(),
    version: z.string().optional()
  }).passthrough().optional()
}).passthrough();

// Constants from the former cc-process-manager.js (removed — replaced by claude -p stdin pipe in llm-adapter.js)
const MAX_RESTARTS = 3;
const HEALTH_INTERVAL_MS = 60_000;
const SPAWN_TIMEOUT_MS = 30_000;
const DEFAULT_EXECUTION_TIMEOUT_MS = 180_000;
const MCP_PROTOCOL_VERSION = "2025-06-18";

/**
 * Extract text from an MCP tools/call result.
 * MCP wraps tool results as {content: [{type: "text", text: "..."}]}.
 */
function unwrapMcpToolResult(result) {
  if (!result || typeof result !== "object") return result;

  if (Array.isArray(result.content)) {
    const textParts = result.content
      .filter((c) => c && c.type === "text" && typeof c.text === "string")
      .map((c) => c.text);

    if (textParts.length === 0) return result;

    const joined = textParts.join("");
    try {
      return JSON.parse(joined);
    } catch {
      return joined;
    }
  }

  return result;
}

module.exports = {
  ClaudeCodeJsonRpcResponseSchema,
  McpToolCallContentSchema,
  McpToolCallResultSchema,
  McpInitializeResultSchema,
  unwrapMcpToolResult,
  MAX_RESTARTS,
  HEALTH_INTERVAL_MS,
  SPAWN_TIMEOUT_MS,
  DEFAULT_EXECUTION_TIMEOUT_MS,
  MCP_PROTOCOL_VERSION
};
