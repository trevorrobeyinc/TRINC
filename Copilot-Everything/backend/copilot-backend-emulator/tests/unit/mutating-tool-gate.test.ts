import { describe, expect, it } from "vitest";
import { buildServer } from "../../src/server.js";
import type { BridgeMcpClient } from "../../src/adapters/BridgeMcpClient.js";
import type { ModelGateway } from "../../src/services/ModelGateway.js";

const baseEnv = {
  HOST: "127.0.0.1",
  PORT: 8789,
  SELF_HOST_API_KEY: "fixture-secret",
  SELF_HOST_DEFAULT_MODEL_KEY: "test-model|openai",
  SELF_HOST_DEFAULT_MODEL_NAME: "test-model",
  SELF_HOST_DEFAULT_MODEL_PROVIDER: "openai",
  SELF_HOST_DEFAULT_MODEL_BASE_URL: "http://127.0.0.1:11434",
  SELF_HOST_DEFAULT_MODEL_API_KEY: "",
  SELF_HOST_DEFAULT_MODEL_TEMPERATURE: 0.2,
  SELF_HOST_DEFAULT_MODEL_MAX_TOKENS: 6000,
  SELF_HOST_DEFAULT_MODEL_TOP_P: 0.9,
  SELF_HOST_DEFAULT_MODEL_REASONING_EFFORT: "low",
  SELF_HOST_DEFAULT_MODEL_VERBOSITY: "medium",
  SELF_HOST_DEFAULT_MODEL_STREAM: false,
  SELF_HOST_DEFAULT_MODEL_STREAM_USAGE: false,
  SELF_HOST_DEFAULT_MODEL_NUM_CTX: 32768,
  MCP_BRIDGE_BASE_URL: "http://127.0.0.1:8798",
  MCP_BRIDGE_AUTH_TOKEN: "fixture-bridge-secret",
  MIYO_BASE_URL: "http://127.0.0.1:8742",
  MIYO_AUTH: "",
  MIYO_DEFAULT_VAULT: "dev-vault",
  DEFAULT_VAULT_NAME: "dev-vault",
  DEFAULT_VAULT_ROOT: "/tmp/dev-vault",
  REQUEST_TIMEOUT_MS: 30000,
  ENABLE_VERBOSE_LOGS: false,
} as const;

const searchTool = {
  runtimeName: "mcp_test_obsidian_search_notes",
  displayName: "Search Notes",
  description: "Search notes in the vault.",
  category: "mcp" as const,
  bridge: {
    toolName: "obsidian_search_notes",
    operation: "search_notes" as const,
    serverId: "test-server",
    backendHint: "cli" as const,
    vaultName: "dev-vault",
  },
};

const createNoteTool = {
  runtimeName: "mcp_test_obsidian_create_note",
  displayName: "Create Note",
  description: "Create a new note in the vault.",
  category: "mcp" as const,
  isMutating: true,
  requiresConfirmation: true,
  bridge: {
    toolName: "obsidian_create_note",
    operation: "create_note" as const,
    serverId: "test-server",
    backendHint: "cli" as const,
    vaultName: "dev-vault",
  },
};

const createNoteToolNoConfirmation = {
  ...createNoteTool,
  requiresConfirmation: false,
};

class FakeBridgeClient {
  public readonly calls: Array<Record<string, unknown>> = [];

  async healthCheck() {
    return { ok: true, status: "ready" };
  }

  async listTools() {
    return ["obsidian_search_notes", "obsidian_create_note"];
  }

  async callTool(request: Record<string, unknown>) {
    this.calls.push(request);
    if (request.tool === "obsidian_search_notes") {
      return {
        ok: true,
        data: { matches: [{ path: "notes/leadership.md", score: 0.9 }] },
        meta: { requestId: "bridge-search", durationMs: 50, backendUsed: "cli" as const },
      };
    }
    if (request.tool === "obsidian_create_note") {
      return {
        ok: true,
        data: { created: true, path: "notes/test-note.md" },
        meta: { requestId: "bridge-create", durationMs: 80, backendUsed: "cli" as const },
      };
    }
    return {
      ok: true,
      data: {},
      meta: { requestId: "bridge-default", durationMs: 10, backendUsed: "cli" as const },
    };
  }
}

function makeRequest(tools: unknown[]) {
  return {
    requestId: "gate-test-001",
    executionMode: "exact_backend_emulator",
    chainType: "llm_chain",
    rawUserMessage: "Search for leadership notes and create a summary note.",
    messages: [
      { role: "system", content: "You are Copilot." },
      { role: "user", content: "Search for leadership notes and create a summary note." },
    ],
    model: {
      key: "test-model|openai",
      name: "test-model",
      provider: "openai",
      apiKey: "test-key",
      stream: false,
    },
    tools,
    responseStyle: { stream: false, includeReasoning: true },
  };
}

describe("mutating tool confirmation gate", () => {
  it("appends disclaimer when write intent detected but no mutating tools available", async () => {
    const fakeBridge = new FakeBridgeClient();
    // Planner plans only search — no mutating tools in the binding set at all
    const fakeModelGateway = {
      async generateText() {
        return {
          text: '{"reasoning":"Search only","toolCalls":[{"toolName":"mcp_test_obsidian_search_notes","arguments":{"query":"leadership"}}]}',
          usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        };
      },
      async streamText(_request: unknown, callbacks: { onToken: (delta: string) => void }) {
        const text = "Here are leadership notes I found.";
        callbacks.onToken(text);
        return { text, usage: { inputTokens: 20, outputTokens: 15, totalTokens: 35 } };
      },
    };

    const app = await buildServer({
      env: { ...baseEnv },
      bridgeClient: fakeBridge as unknown as BridgeMcpClient,
      modelGateway: fakeModelGateway as unknown as ModelGateway,
    });

    // Write intent in user message, but NO mutating tools in the tool list
    const response = await app.inject({
      method: "POST",
      url: "/v1/self-host/agent-turn",
      headers: { authorization: "Bearer fixture-secret" },
      payload: makeRequest([searchTool]), // no create_note tool at all
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.ok).toBe(true);
    // Disclaimer about missing write tools
    expect(body.assistant.content).toContain("No note was created or modified");
    expect(body.assistant.content).toContain("Write tools were not available");
    expect(body.assistant.content).toContain("Copilot Settings");
  });

  it("does not append disclaimer on read-only turn when mutating tools are available", async () => {
    const fakeBridge = new FakeBridgeClient();
    // Planner plans only search_notes — no write planned, no augmentation injected
    const fakeModelGateway = {
      async generateText() {
        return {
          text: '{"reasoning":"Search only","toolCalls":[{"toolName":"mcp_test_obsidian_search_notes","arguments":{"query":"leadership"}}]}',
          usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        };
      },
      async streamText(_request: unknown, callbacks: { onToken: (delta: string) => void }) {
        const text = "Here are leadership notes I found in your vault.";
        callbacks.onToken(text);
        return { text, usage: { inputTokens: 20, outputTokens: 15, totalTokens: 35 } };
      },
    };

    const app = await buildServer({
      env: { ...baseEnv },
      bridgeClient: fakeBridge as unknown as BridgeMcpClient,
      modelGateway: fakeModelGateway as unknown as ModelGateway,
    });

    // Use a read-only user message that does NOT trigger augmentation
    const payload = {
      ...makeRequest([searchTool, createNoteTool]),
      rawUserMessage: "Search my vault for notes about leadership and summarize what you find.",
      messages: [
        { role: "system", content: "You are Copilot." },
        { role: "user", content: "Search my vault for notes about leadership and summarize what you find." },
      ],
    };

    const response = await app.inject({
      method: "POST",
      url: "/v1/self-host/agent-turn",
      headers: { authorization: "Bearer fixture-secret" },
      payload,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.ok).toBe(true);
    // NO disclaimer on a pure read-only turn
    expect(body.assistant.content).not.toContain("No note was created");
  });

  it("does not append disclaimer when mutating tool succeeds (allow_without_prompt)", async () => {
    const fakeBridge = new FakeBridgeClient();
    // Planner plans both search and create
    const fakeModelGateway = {
      async generateText() {
        return {
          text: '{"reasoning":"Search and create","toolCalls":[{"toolName":"mcp_test_obsidian_search_notes","arguments":{"query":"leadership"}},{"toolName":"mcp_test_obsidian_create_note","arguments":{"path":"notes/test.md","content":"summary"}}]}',
          usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        };
      },
      async streamText(_request: unknown, callbacks: { onToken: (delta: string) => void }) {
        const text = "I found leadership notes and created the summary.";
        callbacks.onToken(text);
        return { text, usage: { inputTokens: 20, outputTokens: 15, totalTokens: 35 } };
      },
    };

    const app = await buildServer({
      env: { ...baseEnv },
      bridgeClient: fakeBridge as unknown as BridgeMcpClient,
      modelGateway: fakeModelGateway as unknown as ModelGateway,
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/self-host/agent-turn",
      headers: { authorization: "Bearer fixture-secret" },
      payload: makeRequest([searchTool, createNoteToolNoConfirmation]),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.ok).toBe(true);
    // No disclaimer — the tool executed successfully
    expect(body.assistant.content).not.toContain("No note was created or modified");
    // Bridge must have received a create_note call
    expect(fakeBridge.calls.some((c) => c.tool === "obsidian_create_note")).toBe(true);
  });

  it("skips execution of requiresConfirmation tools and records as failed", async () => {
    const fakeBridge = new FakeBridgeClient();
    // Planner plans create_note (which should be gated)
    const fakeModelGateway = {
      async generateText() {
        return {
          text: '{"reasoning":"Create note","toolCalls":[{"toolName":"mcp_test_obsidian_create_note","arguments":{"path":"notes/test.md","content":"summary"}}]}',
          usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        };
      },
      async streamText(_request: unknown, callbacks: { onToken: (delta: string) => void }) {
        const text = "I attempted to create a note.";
        callbacks.onToken(text);
        return { text, usage: { inputTokens: 20, outputTokens: 15, totalTokens: 35 } };
      },
    };

    const app = await buildServer({
      env: { ...baseEnv },
      bridgeClient: fakeBridge as unknown as BridgeMcpClient,
      modelGateway: fakeModelGateway as unknown as ModelGateway,
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/self-host/agent-turn",
      headers: { authorization: "Bearer fixture-secret" },
      payload: makeRequest([createNoteTool]),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    // Tool call should be in trace as failed
    const traceToolCalls = body.assistant.trace.toolCalls;
    const createCall = traceToolCalls.find(
      (tc: { bridgeToolName: string }) => tc.bridgeToolName === "obsidian_create_note"
    );
    expect(createCall).toBeDefined();
    expect(createCall.success).toBe(false);
    expect(createCall.rawResult).toContain("requires user confirmation");
    // Bridge must NOT have received a create_note call (may have preflight miyo call)
    expect(fakeBridge.calls.every((c) => c.tool !== "obsidian_create_note")).toBe(true);
  });

  it("passes through isMutating and requiresConfirmation in Zod validation", async () => {
    const fakeBridge = new FakeBridgeClient();
    const fakeModelGateway = {
      async generateText() {
        return {
          text: '{"reasoning":"No tools needed","toolCalls":[]}',
          usage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 },
        };
      },
      async streamText(_request: unknown, callbacks: { onToken: (delta: string) => void }) {
        callbacks.onToken("Done.");
        return { text: "Done.", usage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 } };
      },
    };

    const app = await buildServer({
      env: { ...baseEnv },
      bridgeClient: fakeBridge as unknown as BridgeMcpClient,
      modelGateway: fakeModelGateway as unknown as ModelGateway,
    });

    // Send tools with isMutating and requiresConfirmation — should not fail validation
    const response = await app.inject({
      method: "POST",
      url: "/v1/self-host/agent-turn",
      headers: { authorization: "Bearer fixture-secret" },
      payload: makeRequest([searchTool, createNoteTool]),
    });

    expect(response.statusCode).toBe(200);
  });
});
