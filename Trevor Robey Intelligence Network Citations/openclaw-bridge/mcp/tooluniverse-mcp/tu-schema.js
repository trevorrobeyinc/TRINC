"use strict";

const { z } = require("zod");

const ToolUniverseInputSchema = z
  .object({
    action: z.enum(["findTool", "getToolInfo", "executeTool", "listTools", "grepTools"]),
    query: z.string().min(2).max(512).optional(),
    tool_name: z.string().min(1).max(256).optional(),
    arguments: z.record(z.string(), z.unknown()).optional(),
    limit: z.number().int().min(1).max(100).default(20),
    category: z.string().min(1).max(128).optional()
  })
  .strict()
  .superRefine((value, ctx) => {
    if ((value.action === "findTool" || value.action === "grepTools") && !value.query) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "query is required for findTool/grepTools" });
    }
    if (value.action === "getToolInfo" && !value.tool_name) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "tool_name is required for getToolInfo" });
    }
    if (value.action === "executeTool" && !value.tool_name) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "tool_name is required for executeTool" });
    }
  });

const ToolUniverseToolRecordSchema = z.object({
  tool_name: z.string().min(1).max(256),
  description: z.string().max(10000).optional(),
  category: z.string().max(128).optional(),
  parameters: z.record(z.string(), z.unknown()).optional(),
  result: z.unknown().optional()
}).passthrough();

const ToolUniverseJsonRpcRequestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number()]),
  method: z.string().min(1),
  params: z.record(z.string(), z.unknown()).optional()
}).strict();

const ToolUniverseJsonRpcResponseSchema = z.object({
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

module.exports = {
  ToolUniverseInputSchema,
  ToolUniverseToolRecordSchema,
  ToolUniverseJsonRpcRequestSchema,
  ToolUniverseJsonRpcResponseSchema,
  McpToolCallContentSchema,
  McpToolCallResultSchema,
  McpInitializeResultSchema
};
