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

  describe("claude -p argv isolation (2026-09-22, first gated smoke run through Copilot chat)", () => {
    const fs = require("node:fs");
    const { buildClaudeCodeArgs, buildClaudeCodeEnv, CLAUDE_CODE_EMPTY_MCP_CONFIG } = require("../../openclaw-bridge/core/llm-adapter.js");

    it("loads NO instruction files and writes NO transcript: memory kill switch, empty setting sources, no persistence", () => {
      // Probed 2026-09-22 from this folder under the operator's OAuth session: the control call
      // saw ~/.claude/CLAUDE.md, the monorepo CLAUDE.md and this folder's CLAUDE.md (YES YES YES);
      // with exactly this env + argv it saw none of them (NO NO NO). --bare is not an option (API key only).
      const args = buildClaudeCodeArgs("claude-sonnet-4-6");
      const i = args.indexOf("--setting-sources");
      assert.ok(i > -1 && args[i + 1] === "", "--setting-sources must be present with an EMPTY value");
      assert.ok(args.includes("--no-session-persistence"));
      const env = buildClaudeCodeEnv({ PATH: "/usr/bin", GOOGLE_DRIVE_REFRESH_TOKEN: "x", GOOGLE_CLIENT_SECRET: "y", HOME: "/h" });
      assert.equal(env.CLAUDE_CODE_DISABLE_CLAUDE_MDS, "1");
      assert.equal(env.PATH, "/usr/bin");
      assert.equal(env.HOME, "/h");
      assert.equal(env.GOOGLE_DRIVE_REFRESH_TOKEN, undefined, "Drive secrets never reach the subprocess");
      assert.equal(env.GOOGLE_CLIENT_SECRET, undefined);
    });

    it("starts NO MCP servers: strict mode with an empty, existing config file", () => {
      const args = buildClaudeCodeArgs("claude-sonnet-4-6");
      assert.ok(args.includes("--strict-mcp-config"), "without --strict-mcp-config every user/project/plugin MCP server boots per role call");
      const i = args.indexOf("--mcp-config");
      assert.ok(i > -1 && args[i + 1] === CLAUDE_CODE_EMPTY_MCP_CONFIG);
      assert.ok(fs.existsSync(CLAUDE_CODE_EMPTY_MCP_CONFIG), "config/claude-code-print-mcp.json must ship with the engine");
      assert.deepEqual(JSON.parse(fs.readFileSync(CLAUDE_CODE_EMPTY_MCP_CONFIG, "utf8")), { mcpServers: {} });
    });

    it("keeps tools off and print mode on (the shape the rest of the adapter parses)", () => {
      const args = buildClaudeCodeArgs("claude-opus-4-8");
      assert.equal(args[0], "-p");
      assert.deepEqual(args.slice(args.indexOf("--output-format"), args.indexOf("--output-format") + 2), ["--output-format", "json"]);
      assert.deepEqual(args.slice(args.indexOf("--model"), args.indexOf("--model") + 2), ["--model", "claude-opus-4-8"]);
      assert.deepEqual(args.slice(args.indexOf("--allowedTools"), args.indexOf("--allowedTools") + 2), ["--allowedTools", ""]);
    });
  });

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

  // ------------------------------------------------------------------
  // cc error envelope — REGRESSION (2026-08-12)
  //
  // An expired CLI OAuth session made `claude -p --output-format json` return
  //   { type:"result", is_error:true, result:"Failed to authenticate: OAuth session
  //     expired and could not be refreshed" }
  // and the adapter recorded that 72-char string as a COMPLETED response for all
  // three roles; only the citation gate (NO_CITATIONS) stopped the junk shipping.
  // A provider error envelope must reject the call loudly, never masquerade as text.
  // The fixture drives the REAL spawn path by pointing providerConfig.claudeCommand
  // at a script that emits the captured envelope.
  // ------------------------------------------------------------------

  describe("cc error envelope — regression 2026-08-12", () => {
    const fs = require("node:fs");
    const os = require("node:os");
    const path = require("node:path");

    let fixtureDir;
    beforeEach(() => {
      fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "cc-envelope-"));
    });
    afterEach(() => {
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    });

    function fakeClaude(name, body) {
      const p = path.join(fixtureDir, name);
      fs.writeFileSync(p, `#!/usr/bin/env node\n${body}\n`, { mode: 0o755 });
      return p;
    }

    const AUTH_MSG = "Failed to authenticate: OAuth session expired and could not be refreshed";

    it("rejects PROVIDER_CC_ERROR_ENVELOPE on is_error:true instead of recording it as output", async () => {
      const cmd = fakeClaude("fake-claude-err", `
        process.stdin.resume(); process.stdin.on("end", () => {
          process.stdout.write(JSON.stringify({ type: "result", subtype: "error_during_execution", is_error: true, result: ${JSON.stringify(AUTH_MSG)} }));
          process.exit(0);
        });`);
      const adapter = createLLMAdapter({ provider: "claude-code", config: { claudeCommand: cmd, executionTimeoutMs: 15_000 } });
      // complete() wraps every provider failure as PHASE33_CC_PROVIDER_ERROR and carries the
      // inner code in details.originalCode — assert the house contract, not the inner throw.
      await assert.rejects(
        () => adapter.complete("ping"),
        (err) =>
          err.code === "PHASE33_CC_PROVIDER_ERROR" &&
          err.details && err.details.originalCode === "PROVIDER_CC_ERROR_ENVELOPE" &&
          /oauth session expired/i.test(err.message)
      );
    });

    it("rejects the same failure in bare non-JSON form", async () => {
      const cmd = fakeClaude("fake-claude-bare", `
        process.stdin.resume(); process.stdin.on("end", () => {
          process.stdout.write(${JSON.stringify(AUTH_MSG)});
          process.exit(0);
        });`);
      const adapter = createLLMAdapter({ provider: "claude-code", config: { claudeCommand: cmd, executionTimeoutMs: 15_000 } });
      await assert.rejects(
        () => adapter.complete("ping"),
        (err) =>
          err.code === "PHASE33_CC_PROVIDER_ERROR" &&
          err.details && err.details.originalCode === "PROVIDER_CC_ERROR_ENVELOPE"
      );
    });

    it("still returns text for a healthy envelope (no false positives)", async () => {
      const cmd = fakeClaude("fake-claude-ok", `
        process.stdin.resume(); process.stdin.on("end", () => {
          process.stdout.write(JSON.stringify({ type: "result", is_error: false, result: "BRCA1 findings with PMID: 12345678", usage: { input_tokens: 10, output_tokens: 8 } }));
          process.exit(0);
        });`);
      const adapter = createLLMAdapter({ provider: "claude-code", config: { claudeCommand: cmd, executionTimeoutMs: 15_000 } });
      const res = await adapter.complete("ping");
      assert.match(res.text, /BRCA1 findings/);
      assert.equal(res.tokenCount, 18);
    });
  });
});
