import * as childProcess from "node:child_process";
import { createHash, webcrypto } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { ToolRegistry } from "@/tools/ToolRegistry";
import { ConfirmModal } from "@/components/modals/ConfirmModal";
import { logWarn } from "@/logger";
import { requestUrl } from "obsidian";
import * as obsidianModule from "obsidian";
import { McpToolProvider } from "./McpToolProvider";
import type { McpServerConfig, McpSettings } from "./types";
import { setUdsClientDepsForTests, UdsClientError, udsRequest } from "./udsClient";

jest.mock("@/components/modals/ConfirmModal", () => ({
  ConfirmModal: jest
    .fn()
    .mockImplementation(
      (
        _app: unknown,
        onConfirm: () => void,
        _content: string,
        _title: string,
        _confirmButtonText: string,
        _cancelButtonText: string,
        onCancel?: () => void
      ) => ({
        open: () => {
          if ((globalThis as any).__mcpConfirmAction === "confirm") {
            onConfirm();
            return;
          }
          onCancel?.();
        },
      })
    ),
}));

jest.mock("@/logger", () => ({
  logInfo: jest.fn(),
  logWarn: jest.fn(),
}));

// The socket transport is stubbed at its one entry point; resolveBridgeSocket and the test seam
// stay real.
jest.mock("./udsClient", () => {
  const actual = jest.requireActual<typeof import("./udsClient")>("./udsClient");
  return { ...actual, udsRequest: jest.fn() };
});

// Upstream 4.0.0's obsidian mock exports `requestUrl` as a passthrough wrapper
// (`requestUrl: (...args) => requestUrlImpl(...args)`) and installs per-test
// overrides via `__setRequestUrlImpl`. The provider no longer calls it at all
// (bridges-uds, 2026-11-24); the spy stays to prove that. Namespace import
// guarantees this is the SAME module instance McpToolProvider would import;
// jest.requireMock() can hand back a different one.
const requestUrlMock = jest.fn() as unknown as jest.MockedFunction<typeof requestUrl>;
const obsidianMock = obsidianModule as unknown as {
  __setRequestUrlImpl: (impl: unknown) => void;
};
const confirmModalMock = ConfirmModal as unknown as jest.Mock;
const udsRequestMock = udsRequest as jest.MockedFunction<typeof udsRequest>;
const httpRequestSpy = jest.fn();
const netConnectSpy = jest.fn();

const HOME = "/tmp/uds-tool-provider";
const VAULT_SOCKET = `${HOME}/.local/state/trinc/run/vault-bridge.sock`;
const TOOL_ID = "mcp_shared-obsidian-mcp_obsidian_create_note";

function buildSettings(
  confirmationPolicy: McpSettings["confirmationPolicy"],
  overrides: Partial<McpServerConfig> = {}
): McpSettings {
  return {
    enabled: true,
    confirmationPolicy,
    redactLogs: true,
    allowlist: ["obsidian_create_note"],
    denylist: [],
    servers: [
      {
        id: "shared-obsidian-mcp",
        displayName: "Shared Obsidian MCP",
        enabled: true,
        transport: "uds",
        socketPath: "~/.local/state/trinc/run/vault-bridge.sock",
        httpEndpoint: "http://127.0.0.1:8798",
        authToken: "test-token",
        timeoutMs: 20_000,
        vaultName: "My Digital Garden",
        vaultRoot: "/Users/myhome/My Digital Garden",
        enabledToolNames: ["obsidian_create_note"],
        ...overrides,
      },
    ],
  };
}

async function invokeRegisteredTool(args: Record<string, unknown>): Promise<unknown> {
  const definition = ToolRegistry.getInstance().getToolDefinition(TOOL_ID);
  expect(definition).toBeDefined();
  const tool = definition!.tool as unknown as {
    invoke: (input: Record<string, unknown>) => Promise<string>;
  };
  return JSON.parse(await tool.invoke(args)) as unknown;
}

describe("McpToolProvider", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ToolRegistry.getInstance().clear();
    (globalThis as any).__mcpConfirmAction = "confirm";
    // jsdom's crypto has neither subtle nor randomUUID; Node's subtle hashes for real here.
    const holder = globalThis as unknown as { crypto?: Record<string, unknown> };
    const cryptoObject = holder.crypto ?? {};
    cryptoObject.subtle = webcrypto.subtle;
    cryptoObject.randomUUID =
      cryptoObject.randomUUID || (() => "00000000-0000-4000-8000-000000000000");
    holder.crypto = cryptoObject;
    // Re-install after clearAllMocks() so the wrapper still routes here.
    obsidianMock.__setRequestUrlImpl(requestUrlMock);
    setUdsClientDepsForTests({
      fs,
      path,
      os: { ...os, homedir: () => HOME },
      http: { request: httpRequestSpy },
      net: { connect: netConnectSpy },
      childProcess,
    });
    udsRequestMock.mockResolvedValue({
      status: 200,
      text: '{"ok":true,"data":{"path":"Phase 2/test-note.md"}}',
    });
  });

  afterEach(() => {
    setUdsClientDepsForTests(null);
  });

  describe("McpToolProvider", () => {
    describe("syncFromSettings()", () => {
      it("keeps mutating tools hidden when confirmation policy is read_only_only", () => {
        McpToolProvider.syncFromSettings(buildSettings("read_only_only"));

        expect(ToolRegistry.getInstance().getToolDefinition(TOOL_ID)).toBeUndefined();
      });

      it("registers mutating tools when confirmation policy is prompt_on_writes", () => {
        McpToolProvider.syncFromSettings(buildSettings("prompt_on_writes"));

        expect(ToolRegistry.getInstance().getToolDefinition(TOOL_ID)).toBeDefined();
      });

      it("confirms prompt_on_writes tools before executing the bridge call", async () => {
        McpToolProvider.syncFromSettings(buildSettings("prompt_on_writes"));

        const result = await invokeRegisteredTool({
          path: "Phase 2/test-note.md",
          content: "hello from test",
        });

        expect(confirmModalMock).toHaveBeenCalled();
        expect(udsRequestMock).toHaveBeenCalledTimes(1);
        expect(result).toMatchObject({
          type: "mcp_result",
          serverId: "shared-obsidian-mcp",
          tool: "obsidian_create_note",
          data: {
            path: "Phase 2/test-note.md",
          },
        });
      });

      it("returns a canceled result when the user declines a mutating tool", async () => {
        (globalThis as any).__mcpConfirmAction = "cancel";
        McpToolProvider.syncFromSettings(buildSettings("prompt_on_writes"));

        const result = await invokeRegisteredTool({
          path: "Phase 2/test-note.md",
          content: "hello from test",
        });

        expect(confirmModalMock).toHaveBeenCalled();
        expect(udsRequestMock).not.toHaveBeenCalled();
        expect(result).toMatchObject({
          type: "mcp_result",
          serverId: "shared-obsidian-mcp",
          tool: "obsidian_create_note",
          canceled: true,
          meta: {
            canceledByUser: true,
          },
          error: {
            code: "user_declined",
          },
        });
      });

      it("posts the call to /mcp/tool over the bound socket with the replay headers and exact bytes", async () => {
        McpToolProvider.syncFromSettings(buildSettings("allow_without_prompt"));

        await invokeRegisteredTool({ path: "Phase 2/test-note.md", content: "café" });

        expect(udsRequestMock).toHaveBeenCalledTimes(1);
        const [target, request] = udsRequestMock.mock.calls[0];
        expect(target).toEqual({ socketPath: VAULT_SOCKET, expectedName: "vault-bridge.sock" });
        expect(request).toMatchObject({ method: "POST", path: "/mcp/tool", timeoutMs: 20_000 });
        const body = request.body ?? new Uint8Array();
        expect(JSON.parse(new TextDecoder().decode(body))).toMatchObject({
          tool: "obsidian_create_note",
        });
        const headers = request.headers ?? {};
        expect(Object.keys(headers)).toEqual([
          "Content-Type",
          "Content-Length",
          "X-MCP-Token",
          "X-MCP-Nonce",
          "X-MCP-Timestamp",
          "X-MCP-Body-Sha256",
        ]);
        expect(headers).toMatchObject({
          "Content-Type": "application/json",
          "Content-Length": String(body.byteLength),
          "X-MCP-Token": "test-token",
          "X-MCP-Nonce": "00000000-0000-4000-8000-000000000000",
          "X-MCP-Body-Sha256": createHash("sha256").update(body).digest("hex"),
        });
        expect(headers["X-MCP-Timestamp"]).toMatch(/^\d+$/);
        expect(requestUrlMock).not.toHaveBeenCalled();
      });

      it("registers nothing for an unconverted http entry and never dials it", async () => {
        const settings = buildSettings("allow_without_prompt", {
          transport: "http",
          socketPath: undefined,
        });

        McpToolProvider.syncFromSettings(settings);
        const health = await McpToolProvider.probeServer(settings.servers[0]);

        expect(ToolRegistry.getInstance().getToolDefinition(TOOL_ID)).toBeUndefined();
        expect(health).toMatchObject({ ok: false });
        expect(health.message).toContain("Not dialled");
        expect(requestUrlMock).not.toHaveBeenCalled();
        expect(udsRequestMock).not.toHaveBeenCalled();
        expect(httpRequestSpy).not.toHaveBeenCalled();
        expect(netConnectSpy).not.toHaveBeenCalled();
      });

      it("skips a server whose configured socket belongs to another bridge", () => {
        McpToolProvider.syncFromSettings(
          buildSettings("allow_without_prompt", {
            socketPath: "~/.local/state/trinc/run/viz-studio.sock",
          })
        );

        expect(ToolRegistry.getInstance().getToolDefinition(TOOL_ID)).toBeUndefined();
        expect(logWarn).toHaveBeenCalledWith(
          expect.stringContaining("Skipping server 'shared-obsidian-mcp'")
        );
      });
    });

    describe("probeServer()", () => {
      it("GETs /healthz over the bound socket without a token", async () => {
        udsRequestMock.mockResolvedValue({ status: 200, text: '{"ok":true}' });

        const health = await McpToolProvider.probeServer(
          buildSettings("allow_without_prompt").servers[0]
        );

        expect(health).toEqual({
          serverId: "shared-obsidian-mcp",
          displayName: "Shared Obsidian MCP",
          ok: true,
          message: `Server responded to /healthz on unix:${VAULT_SOCKET}.`,
        });
        expect(udsRequestMock).toHaveBeenCalledWith(
          { socketPath: VAULT_SOCKET, expectedName: "vault-bridge.sock" },
          { method: "GET", path: "/healthz", timeoutMs: 20_000 }
        );
      });

      it("reports a missing socket, a refused config and an HTTP error without throwing", async () => {
        const server = buildSettings("allow_without_prompt").servers[0];
        udsRequestMock.mockRejectedValueOnce(
          new UdsClientError("ENOENT", `${VAULT_SOCKET} does not exist (bridge not running)`)
        );
        expect((await McpToolProvider.probeServer(server)).message).toContain("bridge not running");

        udsRequestMock.mockResolvedValueOnce({ status: 503, text: "" });
        expect((await McpToolProvider.probeServer(server)).message).toBe(
          "Health probe failed with HTTP 503."
        );

        const refused = await McpToolProvider.probeServer({
          ...server,
          socketPath: "/tmp/elsewhere/vault-bridge.sock",
        });
        expect(refused.ok).toBe(false);
        expect(refused.message).toContain("Socket refused");
      });
    });
  });
});
