"use strict";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");

// ---------------------------------------------------------------------------
// cc-process-manager unit tests (no child process — tests internal logic)
// ---------------------------------------------------------------------------

const {
  ClaudeCodeJsonRpcResponseSchema,
  McpToolCallResultSchema,
  McpInitializeResultSchema,
  unwrapMcpToolResult,
  MAX_RESTARTS,
  HEALTH_INTERVAL_MS,
  SPAWN_TIMEOUT_MS,
  DEFAULT_EXECUTION_TIMEOUT_MS,
  MCP_PROTOCOL_VERSION
} = require("../../openclaw-bridge/mcp/claude-code-mcp/cc-schema.js");

const {
  createLLMAdapter,
  resolveProviderConfig
} = require("../../openclaw-bridge/core/llm-adapter.js");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe("Phase 33 — Claude Code MCP Provider", () => {

  // ------------------------------------------------------------------
  // Constants and configuration
  // ------------------------------------------------------------------

  describe("cc-process-manager constants", () => {
    it("MAX_RESTARTS is 3", () => {
      assert.equal(MAX_RESTARTS, 3);
    });

    it("HEALTH_INTERVAL_MS is 60 seconds", () => {
      assert.equal(HEALTH_INTERVAL_MS, 60_000);
    });

    it("SPAWN_TIMEOUT_MS is 30 seconds", () => {
      assert.equal(SPAWN_TIMEOUT_MS, 30_000);
    });

    it("DEFAULT_EXECUTION_TIMEOUT_MS is 3 minutes", () => {
      assert.equal(DEFAULT_EXECUTION_TIMEOUT_MS, 180_000);
    });

    it("MCP_PROTOCOL_VERSION is 2025-06-18", () => {
      assert.equal(MCP_PROTOCOL_VERSION, "2025-06-18");
    });
  });

  // ------------------------------------------------------------------
  // unwrapMcpToolResult
  // ------------------------------------------------------------------

  describe("unwrapMcpToolResult", () => {
    it("returns null/undefined as-is", () => {
      assert.equal(unwrapMcpToolResult(null), null);
      assert.equal(unwrapMcpToolResult(undefined), undefined);
    });

    it("returns primitives as-is", () => {
      assert.equal(unwrapMcpToolResult("hello"), "hello");
      assert.equal(unwrapMcpToolResult(42), 42);
    });

    it("returns object without content array as-is", () => {
      const obj = { foo: "bar" };
      assert.deepEqual(unwrapMcpToolResult(obj), obj);
    });

    it("unwraps MCP text content to joined string", () => {
      const wrapped = {
        content: [
          { type: "text", text: "hello " },
          { type: "text", text: "world" }
        ]
      };
      assert.equal(unwrapMcpToolResult(wrapped), "hello world");
    });

    it("unwraps MCP content with JSON text to parsed object", () => {
      const wrapped = {
        content: [
          { type: "text", text: '{"result": "success", "count": 42}' }
        ]
      };
      const result = unwrapMcpToolResult(wrapped);
      assert.deepEqual(result, { result: "success", count: 42 });
    });

    it("returns original if content array has no text parts", () => {
      const wrapped = {
        content: [
          { type: "image", data: "base64..." }
        ]
      };
      assert.deepEqual(unwrapMcpToolResult(wrapped), wrapped);
    });

    it("skips non-text content entries", () => {
      const wrapped = {
        content: [
          { type: "image", data: "..." },
          { type: "text", text: "only text" }
        ]
      };
      assert.equal(unwrapMcpToolResult(wrapped), "only text");
    });
  });

  // ------------------------------------------------------------------
  // Zod schemas
  // ------------------------------------------------------------------

  describe("cc-schema validation", () => {
    it("validates a success JSON-RPC response", () => {
      const response = {
        jsonrpc: "2.0",
        id: "1",
        result: { content: [{ type: "text", text: "hello" }] }
      };
      const parsed = ClaudeCodeJsonRpcResponseSchema.safeParse(response);
      assert.ok(parsed.success);
      assert.equal(parsed.data.id, "1");
    });

    it("validates an error JSON-RPC response", () => {
      const response = {
        jsonrpc: "2.0",
        id: 42,
        error: { code: -32600, message: "Invalid request" }
      };
      const parsed = ClaudeCodeJsonRpcResponseSchema.safeParse(response);
      assert.ok(parsed.success);
      assert.equal(parsed.data.error.code, -32600);
    });

    it("rejects response with wrong jsonrpc version", () => {
      const response = { jsonrpc: "1.0", id: "1", result: {} };
      const parsed = ClaudeCodeJsonRpcResponseSchema.safeParse(response);
      assert.ok(!parsed.success);
    });

    it("validates MCP tool call result", () => {
      const result = {
        content: [{ type: "text", text: "research output" }]
      };
      const parsed = McpToolCallResultSchema.safeParse(result);
      assert.ok(parsed.success);
    });

    it("validates MCP initialize result", () => {
      const result = {
        protocolVersion: "2025-06-18",
        capabilities: {},
        serverInfo: { name: "claude-code", version: "1.0.0" }
      };
      const parsed = McpInitializeResultSchema.safeParse(result);
      assert.ok(parsed.success);
    });
  });

  // ------------------------------------------------------------------
  // LLM adapter — claude-code provider config resolution
  // ------------------------------------------------------------------

  describe("llm-adapter claude-code provider", () => {
    it("resolveProviderConfig reads claude-code from llm-providers.json", () => {
      const config = resolveProviderConfig({}, "claude-code");
      assert.equal(config.enabled, true);
      assert.equal(config.model, "claude-sonnet-4-6");
      assert.equal(config.executionTimeoutMs, 600000);
      assert.equal(config.fallbackProvider, "", "Option B: claude-code has no local fallback");
    });

    it("createLLMAdapter accepts claude-code provider", () => {
      const adapter = createLLMAdapter({ provider: "claude-code" });
      assert.equal(typeof adapter.complete, "function");
      assert.equal(typeof adapter.getProviderInfo, "function");
    });

    it("getProviderInfo returns claude-code metadata", () => {
      const adapter = createLLMAdapter({ provider: "claude-code" });
      const info = adapter.getProviderInfo();
      assert.equal(info.provider, "claude-code");
      assert.equal(info.model, "claude-sonnet-4-6");
      assert.equal(info.configured, true);
    });
  });

  // ------------------------------------------------------------------
  // Workflow template provider_preference
  // ------------------------------------------------------------------

  describe("workflow template provider_preference", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const templateDir = path.resolve("config/workflow-templates");

    const templates = [
      "drug-discovery-full",
      "pharmacovigilance-report",
      "clinical-trial-landscape",
      "target-validation-pack",
      "rare-disease-brief",
      "general-research-pack",
      "trial-design-benchmark"
    ];

    for (const templateId of templates) {
      it(`${templateId} has provider_preference with primary=claude-code`, () => {
        const raw = fs.readFileSync(path.join(templateDir, `${templateId}.json`), "utf8");
        const template = JSON.parse(raw);
        assert.ok(template.provider_preference, `${templateId} missing provider_preference`);
        assert.equal(template.provider_preference.primary, "claude-code");
        // Option B (2026-07-16): templates carry NO local fallback — the engine is 100% Claude
        // and LM Studio (the former fallback) was decommissioned.
        assert.equal(template.provider_preference.fallback, undefined, `${templateId} should have no fallback under Option B`);
      });
    }
  });

  // ------------------------------------------------------------------
  // Agent config
  // ------------------------------------------------------------------

  describe("agent-config.json", () => {
    it("defaultProvider is claude-code", () => {
      const fs = require("node:fs");
      const config = JSON.parse(fs.readFileSync("config/agent-config.json", "utf8"));
      assert.equal(config.defaultProvider, "claude-code");
      assert.equal(config.defaultModel, "claude-sonnet-4-6");
    });
  });
});
