import { describe, expect, it } from "vitest";
import { McpOrchestrator } from "../../src/services/McpOrchestrator.js";
import type { SelfHostTurnRequest } from "../../src/types/selfHost.js";
import type { McpToolBinding } from "../../src/types/mcp.js";

const baseRequest: SelfHostTurnRequest = {
  requestId: "req-preflight-1",
  executionMode: "exact_backend_emulator",
  runtimeLane: "production_official",
  chainType: "copilot_plus",
  rawUserMessage: "Search my vault for notes about backend architecture.",
  messages: [
    {
      role: "system",
      content: "You are Copilot MCP.",
    },
    {
      role: "user",
      content: "Search my vault for notes about backend architecture.",
    },
  ],
  model: {
    key: "fixture-model|ollama",
    name: "fixture-model",
    provider: "ollama",
  },
  tools: [],
  responseStyle: {
    stream: false,
    includeReasoning: true,
  },
};

const baseTools: McpToolBinding[] = [
  {
    runtimeName: "mcp_local-obsidian-mcp_obsidian_health",
    displayName: "Obsidian MCP Health",
    description: "Health check.",
    category: "mcp",
    bridge: {
      toolName: "obsidian_health",
      serverId: "local-obsidian-mcp",
      vaultName: "dev-vault",
    },
  },
];

describe("miyo pre-flight intent checker", () => {
  it("injects compact vault context on vault-intent messages", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const orchestrator = new McpOrchestrator(
      {
        callTool: async (request: Record<string, unknown>) => {
          calls.push(request);
          return {
            ok: true,
            data: {
              results: [
                {
                  path: "notes/architecture.md",
                  score: 0.95,
                  chunk_text: "The backend emulator owns planning and tool orchestration.",
                },
              ],
            },
            meta: {
              requestId: "miyo-req-1",
              durationMs: 8,
              backendUsed: "cli" as const,
            },
          };
        },
      } as any
    );

    const result = await orchestrator.runPreFlightIntentCheck(
      baseRequest,
      baseTools
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      tool: "miyo_search_context",
    });
    expect(result.toolCall?.success).toBe(true);
    expect(result.contextBlock).toContain("<vault_context");
    expect(result.contextBlock).toContain("notes/architecture.md");
  });

  it("degrades gracefully when miyo pre-flight fails", async () => {
    const orchestrator = new McpOrchestrator(
      {
        callTool: async () => ({
          ok: false,
          error: {
            code: "tool_failed",
            message: "Miyo unavailable",
            retryable: false,
          },
          meta: {
            requestId: "miyo-req-2",
            durationMs: 11,
          },
        }),
      } as any
    );

    const result = await orchestrator.runPreFlightIntentCheck(
      baseRequest,
      baseTools
    );

    expect(result.contextBlock).toBeUndefined();
    expect(result.toolCall?.success).toBe(false);
    expect(result.toolCall?.rawResult).toContain("Miyo unavailable");
  });
});
