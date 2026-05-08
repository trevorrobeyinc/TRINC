import { describe, expect, it } from "vitest";
import { buildServer } from "../../src/server.js";
import type { BridgeMcpClient } from "../../src/adapters/BridgeMcpClient.js";
import type { ModelGateway } from "../../src/services/ModelGateway.js";
import type {
  MiyoForwardRequest,
  MiyoForwardResponse,
} from "../../src/adapters/MiyoCompatibilityClient.js";
import type { MiyoCompatibilityClient } from "../../src/adapters/MiyoCompatibilityClient.js";

class FakeBridgeClient {
  async healthCheck() {
    return { ok: true, status: "ready" };
  }

  async listTools() {
    return ["obsidian_health"];
  }

  async callTool() {
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
      text: '{"reasoning":"No-op","toolCalls":[]}',
      usage: {
        inputTokens: 1,
        outputTokens: 1,
        totalTokens: 2,
      },
    };
  }

  async streamText(_request: unknown, callbacks: { onToken: (delta: string) => void }) {
    callbacks.onToken("ok");
    return {
      text: "ok",
      usage: {
        inputTokens: 1,
        outputTokens: 1,
        totalTokens: 2,
      },
    };
  }
}

class FakeMiyoClient {
  requests: MiyoForwardRequest[] = [];

  async forward(request: MiyoForwardRequest): Promise<MiyoForwardResponse> {
    this.requests.push(request);

    switch (request.routePath) {
      case "/v0/health":
        return {
          status: 200,
          contentType: "application/json",
          body: {
            status: "ok",
            service: "running",
          },
          text: JSON.stringify({ status: "ok", service: "running" }),
        };
      case "/v0/search":
        return {
          status: 200,
          contentType: "application/json",
          body: {
            results: [],
            query: (request.body as { query?: string }).query,
            count: 0,
            execution_time_ms: 8,
          },
          text: JSON.stringify({
            results: [],
            query: (request.body as { query?: string }).query,
            count: 0,
            execution_time_ms: 8,
          }),
        };
      case "/v0/search/related":
        return {
          status: 404,
          contentType: "application/json",
          body: {
            detail: "No indexed chunks found for file_path",
          },
          text: JSON.stringify({ detail: "No indexed chunks found for file_path" }),
        };
      case "/v0/parse-doc":
        return {
          status: 200,
          contentType: "application/json",
          body: {
            text: "parsed text",
            format: "pdf",
            source_path: (request.body as { path?: string }).path,
            page_count: 1,
          },
          text: JSON.stringify({
            text: "parsed text",
            format: "pdf",
            source_path: (request.body as { path?: string }).path,
            page_count: 1,
          }),
        };
      default:
        return {
          status: 501,
          contentType: "application/json",
          body: {
            ok: false,
            error: {
              code: "unhandled_test_route",
              message: request.routePath,
            },
          },
          text: JSON.stringify({
            ok: false,
            error: {
              code: "unhandled_test_route",
              message: request.routePath,
            },
          }),
        };
    }
  }
}

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

describe("official Miyo compatibility aliases", () => {
  it("accepts official plugin x-api-key auth on /v0/health", async () => {
    const fakeMiyoClient = new FakeMiyoClient();
    const app = await buildServer({
      env: { ...baseEnv },
      bridgeClient: new FakeBridgeClient() as unknown as BridgeMcpClient,
      modelGateway: new FakeModelGateway() as unknown as ModelGateway,
      miyoClient: fakeMiyoClient as unknown as MiyoCompatibilityClient,
    });

    const response = await app.inject({
      method: "GET",
      url: "/v0/health",
      headers: {
        "x-api-key": "fixture-secret",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "ok",
      service: "running",
    });
    expect(fakeMiyoClient.requests[0]?.routePath).toBe("/v0/health");
  });

  it("accepts the stable official plugin license bearer auth on /v0/health", async () => {
    const fakeMiyoClient = new FakeMiyoClient();
    const app = await buildServer({
      env: { ...baseEnv },
      bridgeClient: new FakeBridgeClient() as unknown as BridgeMcpClient,
      modelGateway: new FakeModelGateway() as unknown as ModelGateway,
      miyoClient: fakeMiyoClient as unknown as MiyoCompatibilityClient,
    });

    const response = await app.inject({
      method: "GET",
      url: "/v0/health",
      headers: {
        authorization: "Bearer official-license-token",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "ok",
      service: "running",
    });
    expect(fakeMiyoClient.requests[0]?.incomingAuthorization).toBe(
      "Bearer official-license-token"
    );
  });

  it("forwards the exact /v0/search body and preserves downstream JSON", async () => {
    const fakeMiyoClient = new FakeMiyoClient();
    const app = await buildServer({
      env: { ...baseEnv },
      bridgeClient: new FakeBridgeClient() as unknown as BridgeMcpClient,
      modelGateway: new FakeModelGateway() as unknown as ModelGateway,
      miyoClient: fakeMiyoClient as unknown as MiyoCompatibilityClient,
    });

    const payload = {
      query: "test",
      vault: "/tmp/vault",
      limit: 3,
    };
    const response = await app.inject({
      method: "POST",
      url: "/v0/search",
      headers: {
        authorization: "Bearer fixture-secret",
      },
      payload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      results: [],
      query: "test",
      count: 0,
      execution_time_ms: 8,
    });
    expect(fakeMiyoClient.requests[0]?.body).toEqual(payload);
  });

  it("preserves downstream Miyo 404 responses for related-note lookups", async () => {
    const fakeMiyoClient = new FakeMiyoClient();
    const app = await buildServer({
      env: { ...baseEnv },
      bridgeClient: new FakeBridgeClient() as unknown as BridgeMcpClient,
      modelGateway: new FakeModelGateway() as unknown as ModelGateway,
      miyoClient: fakeMiyoClient as unknown as MiyoCompatibilityClient,
    });

    const response = await app.inject({
      method: "POST",
      url: "/v0/search/related",
      headers: {
        authorization: "Bearer fixture-secret",
      },
      payload: {
        file_path: "README.md",
        vault: "/tmp/vault",
        limit: 3,
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      detail: "No indexed chunks found for file_path",
    });
  });

  it("returns a typed 400 envelope for invalid parse-doc payloads", async () => {
    const fakeMiyoClient = new FakeMiyoClient();
    const app = await buildServer({
      env: { ...baseEnv },
      bridgeClient: new FakeBridgeClient() as unknown as BridgeMcpClient,
      modelGateway: new FakeModelGateway() as unknown as ModelGateway,
      miyoClient: fakeMiyoClient as unknown as MiyoCompatibilityClient,
    });

    const response = await app.inject({
      method: "POST",
      url: "/v0/parse-doc",
      headers: {
        authorization: "Bearer fixture-secret",
      },
      payload: {
        wrong: "shape",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      ok: false,
      error: {
        code: "invalid_request",
        retryable: false,
      },
    });
  });
});
