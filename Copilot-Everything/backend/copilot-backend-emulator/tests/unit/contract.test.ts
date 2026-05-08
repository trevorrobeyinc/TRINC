import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { buildServer } from "../../src/server.js";
import type { BridgeMcpClient } from "../../src/adapters/BridgeMcpClient.js";
import type { ModelGateway } from "../../src/services/ModelGateway.js";

const fixturesDir = path.resolve(process.cwd(), "tests/fixtures");
const fixtureRequest = JSON.parse(
  fs.readFileSync(path.join(fixturesDir, "non-stream-request.json"), "utf8")
);
const fixtureResponse = JSON.parse(
  fs.readFileSync(path.join(fixturesDir, "non-stream-response.json"), "utf8")
);
const fixtureStream = fs.readFileSync(path.join(fixturesDir, "stream-events.txt"), "utf8");

const baseEnv = {
  HOST: "127.0.0.1",
  PORT: 8789,
  SELF_HOST_API_KEY: "fixture-secret",
  SELF_HOST_DEFAULT_MODEL_KEY: "raycast-default|ollama",
  SELF_HOST_DEFAULT_MODEL_NAME: "llama3-groq-tool-use:latest",
  SELF_HOST_DEFAULT_MODEL_PROVIDER: "ollama",
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

class FakeBridgeClient {
  public readonly calls: Array<Record<string, unknown>> = [];

  async healthCheck() {
    return { ok: true, status: "ready" };
  }

  async listTools() {
    return ["obsidian_health"];
  }

  async callTool(request: Record<string, unknown>) {
    this.calls.push(request);

    if (request.tool === "miyo_search_context") {
      return {
        ok: true,
        data: {
          results: [
            {
              path: "notes/example.md",
              score: 0.98,
              chunk_text: "Example context from Miyo.",
            },
          ],
        },
        meta: {
          requestId: "bridge-req-miyo",
          durationMs: 15,
          backendUsed: "cli" as const,
        },
      };
    }

    return {
      ok: true,
      data: { status: "ready" },
      meta: {
        requestId: "bridge-req-001",
        durationMs: 12,
        backendUsed: "cli" as const,
      },
    };
  }
}

class FakeModelGateway {
  async generateText() {
    return {
      text: '{"reasoning":"Use MCP bridge health","toolCalls":[{"toolName":"mcp_local-obsidian-mcp_obsidian_health","arguments":{}}]}',
      usage: {
        inputTokens: 4,
        outputTokens: 3,
        totalTokens: 7,
      },
    };
  }

  async streamText(_request: unknown, callbacks: { onToken: (delta: string) => void }) {
    const delta = "Bridge looks healthy and the MCP path is responding.";
    callbacks.onToken(delta);
    return {
      text: delta,
      usage: {
        inputTokens: 8,
        outputTokens: 5,
        totalTokens: 13,
      },
    };
  }
}

describe("canonical self-host contract", () => {
  it("matches the golden non-streaming response", async () => {
    const app = await buildServer({
      env: { ...baseEnv },
      bridgeClient: new FakeBridgeClient() as unknown as BridgeMcpClient,
      modelGateway: new FakeModelGateway() as unknown as ModelGateway,
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/self-host/agent-turn",
      headers: {
        authorization: "Bearer fixture-secret",
      },
      payload: fixtureRequest,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(fixtureResponse);
  });

  it("locks the SSE event sequence", async () => {
    const app = await buildServer({
      env: { ...baseEnv },
      bridgeClient: new FakeBridgeClient() as unknown as BridgeMcpClient,
      modelGateway: new FakeModelGateway() as unknown as ModelGateway,
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/self-host/agent-turn/stream",
      headers: {
        authorization: "Bearer fixture-secret",
      },
      payload: {
        ...fixtureRequest,
        responseStyle: {
          stream: true,
          includeReasoning: true,
        },
      },
    });

    expect(response.statusCode).toBe(200);
    const text = response.body;
    expect(text).toContain(fixtureStream.trim());
    expect(text).toContain("event: final");
  });

  it("enforces buffered mode for production lane stream requests", async () => {
    const app = await buildServer({
      env: { ...baseEnv },
      bridgeClient: new FakeBridgeClient() as unknown as BridgeMcpClient,
      modelGateway: new FakeModelGateway() as unknown as ModelGateway,
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/self-host/agent-turn/stream",
      headers: {
        authorization: "Bearer fixture-secret",
      },
      payload: {
        ...fixtureRequest,
        runtimeLane: "production_official",
        responseStyle: {
          stream: true,
          includeReasoning: true,
        },
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      ok: false,
      error: {
        code: "streaming_not_allowed_for_lane",
      },
    });
  });

  it("supports deterministic backend tool dispatch endpoint", async () => {
    const fakeBridge = new FakeBridgeClient();
    const app = await buildServer({
      env: { ...baseEnv },
      bridgeClient: fakeBridge as unknown as BridgeMcpClient,
      modelGateway: new FakeModelGateway() as unknown as ModelGateway,
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/self-host/tool-call",
      headers: {
        authorization: "Bearer fixture-secret",
      },
      payload: {
        tool: "obsidian_execute_command",
        operation: "execute_command",
        input: {
          id: "copilot:refresh-prompts",
          vault: "dev-vault",
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
    });
    expect(fakeBridge.calls).toHaveLength(1);
    expect(fakeBridge.calls[0]).toMatchObject({
      tool: "obsidian_execute_command",
      operation: "execute_command",
    });
  });
});
