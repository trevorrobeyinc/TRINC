"use strict";

const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const { ToolUniverseInputSchema } = require("../../openclaw-bridge/mcp/tooluniverse-mcp/tu-schema.js");
const {
  normalizeToolRecord,
  normalizeToolList,
  extractToolId,
  extractTitle,
  extractAbstract,
  extractAuthors
} = require("../../openclaw-bridge/mcp/tooluniverse-mcp/tu-record-normalizer.js");

describe("Phase 29: ToolUniverse MCP - Input Schema", () => {
  it("accepts valid findTool input", () => {
    const result = ToolUniverseInputSchema.safeParse({
      action: "findTool",
      query: "protein structure prediction",
      limit: 10
    });
    assert.equal(result.success, true);
    assert.equal(result.data.action, "findTool");
    assert.equal(result.data.query, "protein structure prediction");
  });

  it("accepts valid getToolInfo input", () => {
    const result = ToolUniverseInputSchema.safeParse({
      action: "getToolInfo",
      tool_name: "pubchem_compound_search"
    });
    assert.equal(result.success, true);
  });

  it("accepts valid executeTool input", () => {
    const result = ToolUniverseInputSchema.safeParse({
      action: "executeTool",
      tool_name: "pubchem_compound_search",
      arguments: { query: "aspirin" }
    });
    assert.equal(result.success, true);
  });

  it("accepts valid listTools input", () => {
    const result = ToolUniverseInputSchema.safeParse({
      action: "listTools",
      limit: 50
    });
    assert.equal(result.success, true);
  });

  it("accepts valid grepTools input", () => {
    const result = ToolUniverseInputSchema.safeParse({
      action: "grepTools",
      query: "drug interaction"
    });
    assert.equal(result.success, true);
  });

  it("rejects findTool without query", () => {
    const result = ToolUniverseInputSchema.safeParse({
      action: "findTool"
    });
    assert.equal(result.success, false);
  });

  it("rejects getToolInfo without tool_name", () => {
    const result = ToolUniverseInputSchema.safeParse({
      action: "getToolInfo"
    });
    assert.equal(result.success, false);
  });

  it("rejects executeTool without tool_name", () => {
    const result = ToolUniverseInputSchema.safeParse({
      action: "executeTool",
      arguments: { query: "test" }
    });
    assert.equal(result.success, false);
  });

  it("rejects unknown action", () => {
    const result = ToolUniverseInputSchema.safeParse({
      action: "deleteAllTools"
    });
    assert.equal(result.success, false);
  });

  it("rejects query shorter than 2 chars", () => {
    const result = ToolUniverseInputSchema.safeParse({
      action: "findTool",
      query: "x"
    });
    assert.equal(result.success, false);
  });

  it("rejects limit above 100", () => {
    const result = ToolUniverseInputSchema.safeParse({
      action: "listTools",
      limit: 200
    });
    assert.equal(result.success, false);
  });

  it("rejects forbidden override fields", () => {
    const result = ToolUniverseInputSchema.safeParse({
      action: "findTool",
      query: "test",
      credential: "secret"
    });
    assert.equal(result.success, false);
  });
});

describe("Phase 29: ToolUniverse MCP - Record Normalizer", () => {
  it("normalizes a tool record with all fields", () => {
    const record = normalizeToolRecord({
      tool_name: "pubchem_search",
      description: "Search PubChem compound database",
      category: "chemistry",
      result: { compound_id: "CID123", name: "Aspirin" }
    }, { retrievedAt: "2026-03-25T00:00:00.000Z" });

    assert.equal(record.source, "tooluniverse");
    assert.equal(record.paper_id, "pubchem_search");
    assert.equal(record.title, "Search PubChem compound database");
    assert.equal(record.citation_velocity, 0);
    assert.ok(record.abstract.includes("CID123"));
    assert.deepEqual(record.authors, ["chemistry"]);
  });

  it("normalizes a tool record with execution ID", () => {
    const record = normalizeToolRecord({
      tool_name: "blast_search",
      description: "NCBI BLAST search"
    }, { executionId: "abc123" });

    assert.equal(record.paper_id, "blast_search/abc123");
  });

  it("handles missing fields gracefully", () => {
    const record = normalizeToolRecord({});
    assert.equal(record.source, "tooluniverse");
    assert.equal(record.paper_id, "unknown_tool");
    assert.equal(record.citation_velocity, 0);
    assert.deepEqual(record.authors, ["tooluniverse"]);
  });

  it("normalizes a list of tools", () => {
    const records = normalizeToolList([
      { tool_name: "tool_a", description: "Tool A" },
      { tool_name: "tool_b", description: "Tool B" }
    ]);
    assert.equal(records.length, 2);
    assert.equal(records[0].paper_id, "tool_a");
    assert.equal(records[1].paper_id, "tool_b");
  });

  it("returns empty array for non-array input", () => {
    assert.deepEqual(normalizeToolList(null), []);
    assert.deepEqual(normalizeToolList("not an array"), []);
  });

  it("extractToolId prefers tool_name over name over id", () => {
    assert.equal(extractToolId({ tool_name: "a", name: "b", id: "c" }), "a");
    assert.equal(extractToolId({ name: "b", id: "c" }), "b");
    assert.equal(extractToolId({ id: "c" }), "c");
  });

  it("extractTitle prefers description", () => {
    assert.equal(extractTitle({ description: "A description", title: "A title" }), "A description");
    assert.equal(extractTitle({ title: "A title" }), "A title");
  });

  it("extractAbstract uses result when present", () => {
    const abstract = extractAbstract({ result: { data: [1, 2, 3] } });
    assert.ok(abstract.includes("1"));
  });

  it("extractAbstract truncates long results", () => {
    const longResult = "x".repeat(25000);
    const abstract = extractAbstract({ result: longResult }, 20000);
    assert.ok(abstract.length <= 20000);
  });

  it("extractAuthors uses category as fallback", () => {
    assert.deepEqual(extractAuthors({ category: "genomics" }), ["genomics"]);
    assert.deepEqual(extractAuthors({}), ["tooluniverse"]);
  });
});

describe("Phase 29: ToolUniverse MCP - Method Registry Integration", () => {
  it("method registry contains all ToolUniverse methods", () => {
    const { MCP_METHODS, MCP_METHOD_ALLOWLIST, MCP_OPERATOR_METHOD_ALLOWLIST } =
      require("../../openclaw-bridge/bridge/mcp-method-registry.js");

    assert.equal(MCP_METHODS.RESEARCH_FIND_TOOL, "research_findTool");
    assert.equal(MCP_METHODS.RESEARCH_GET_TOOL_INFO, "research_getToolInfo");
    assert.equal(MCP_METHODS.RESEARCH_EXECUTE_TOOL, "research_executeTool");
    assert.equal(MCP_METHODS.RESEARCH_LIST_TOOLS, "research_listTools");
    assert.equal(MCP_METHODS.RESEARCH_GREP_TOOLS, "research_grepTools");

    assert.ok(MCP_METHOD_ALLOWLIST.includes("research_findTool"));
    assert.ok(MCP_METHOD_ALLOWLIST.includes("research_getToolInfo"));
    assert.ok(MCP_METHOD_ALLOWLIST.includes("research_listTools"));
    assert.ok(MCP_METHOD_ALLOWLIST.includes("research_grepTools"));
    assert.ok(!MCP_METHOD_ALLOWLIST.includes("research_executeTool"));

    assert.ok(MCP_OPERATOR_METHOD_ALLOWLIST.includes("research_executeTool"));
  });

  it("method aliases resolve correctly", () => {
    const { normalizeMcpMethodName } = require("../../openclaw-bridge/bridge/mcp-method-registry.js");

    assert.equal(normalizeMcpMethodName("research.findTool"), "research_findTool");
    assert.equal(normalizeMcpMethodName("research.executeTool"), "research_executeTool");
    assert.equal(normalizeMcpMethodName("research.grepTools"), "research_grepTools");
  });
});

describe("Phase 29: ToolUniverse MCP - Egress Policy", () => {
  it("tooluniverse-mcp egress policy exists with deny-all", () => {
    const { TOOL_EGRESS_POLICIES } = require("../../openclaw-bridge/execution/egress-policy.js");

    assert.ok(TOOL_EGRESS_POLICIES["tooluniverse-mcp"]);
    assert.equal(TOOL_EGRESS_POLICIES["tooluniverse-mcp"].defaultAction, "deny");
    assert.deepEqual(TOOL_EGRESS_POLICIES["tooluniverse-mcp"].allowedHosts, []);
    assert.deepEqual(TOOL_EGRESS_POLICIES["tooluniverse-mcp"].allowedCIDR, []);
    assert.equal(TOOL_EGRESS_POLICIES["tooluniverse-mcp"].rateLimitPerSecond, 2);
  });
});

describe("Phase 29: ToolUniverse MCP - MCP Protocol Helpers", () => {
  const { unwrapMcpToolResult, MCP_PROTOCOL_VERSION } =
    require("../../openclaw-bridge/mcp/tooluniverse-mcp/tu-process-manager.js");
  const {
    McpToolCallResultSchema,
    McpInitializeResultSchema
  } = require("../../openclaw-bridge/mcp/tooluniverse-mcp/tu-schema.js");

  it("exports MCP_PROTOCOL_VERSION", () => {
    assert.equal(typeof MCP_PROTOCOL_VERSION, "string");
    assert.ok(MCP_PROTOCOL_VERSION.length > 0);
  });

  it("unwrapMcpToolResult extracts JSON from MCP content", () => {
    const mcpResult = {
      content: [{ type: "text", text: '{"tools": [{"name": "blast"}]}' }]
    };
    const unwrapped = unwrapMcpToolResult(mcpResult);
    assert.deepEqual(unwrapped, { tools: [{ name: "blast" }] });
  });

  it("unwrapMcpToolResult returns non-JSON text as string", () => {
    const mcpResult = {
      content: [{ type: "text", text: "plain text result" }]
    };
    const unwrapped = unwrapMcpToolResult(mcpResult);
    assert.equal(unwrapped, "plain text result");
  });

  it("unwrapMcpToolResult passes through non-MCP results", () => {
    const directResult = { tools: [{ name: "test" }] };
    const unwrapped = unwrapMcpToolResult(directResult);
    assert.deepEqual(unwrapped, directResult);
  });

  it("unwrapMcpToolResult handles null/undefined", () => {
    assert.equal(unwrapMcpToolResult(null), null);
    assert.equal(unwrapMcpToolResult(undefined), undefined);
  });

  it("unwrapMcpToolResult handles empty content array", () => {
    const mcpResult = { content: [] };
    assert.deepEqual(unwrapMcpToolResult(mcpResult), mcpResult);
  });

  it("McpToolCallResultSchema validates MCP tool result", () => {
    const result = McpToolCallResultSchema.safeParse({
      content: [{ type: "text", text: '{"data": 1}' }]
    });
    assert.equal(result.success, true);
  });

  it("McpInitializeResultSchema validates initialize response", () => {
    const result = McpInitializeResultSchema.safeParse({
      protocolVersion: "2025-06-18",
      capabilities: { tools: {} },
      serverInfo: { name: "tooluniverse-smcp", version: "1.1.10" }
    });
    assert.equal(result.success, true);
  });
});

describe("Phase 29: ToolUniverse MCP - Startup Integrity", () => {
  it("verifyPhase29StartupIntegrity exports correctly", () => {
    const { verifyPhase29StartupIntegrity } = require("../../security/phase29-startup-integrity.js");
    assert.equal(typeof verifyPhase29StartupIntegrity, "function");
  });

  it("verifies healthy when all files present", async () => {
    const { verifyPhase29StartupIntegrity } = require("../../security/phase29-startup-integrity.js");
    const path = require("node:path");
    const rootDir = path.resolve(__dirname, "../..");
    const result = await verifyPhase29StartupIntegrity({ rootDir });
    assert.equal(result.healthy, true, `Expected healthy but got failures: ${JSON.stringify(result.failures)}`);
  });
});
