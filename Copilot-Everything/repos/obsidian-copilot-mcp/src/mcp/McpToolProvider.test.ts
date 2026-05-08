import { ToolRegistry } from "@/tools/ToolRegistry";
import { ConfirmModal } from "@/components/modals/ConfirmModal";
import { requestUrl } from "obsidian";
import { McpToolProvider } from "./McpToolProvider";
import type { McpSettings } from "./types";

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

const requestUrlMock = requestUrl as jest.MockedFunction<typeof requestUrl>;
const confirmModalMock = ConfirmModal as unknown as jest.Mock;

function buildSettings(confirmationPolicy: McpSettings["confirmationPolicy"]): McpSettings {
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
        transport: "http",
        httpEndpoint: "http://127.0.0.1:8798",
        authToken: "test-token",
        timeoutMs: 20_000,
        vaultName: "My Digital Garden",
        vaultRoot: "/Volumes/ExtraCurricular/My Digital Garden",
        enabledToolNames: ["obsidian_create_note"],
      },
    ],
  };
}

describe("McpToolProvider", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ToolRegistry.getInstance().clear();
    (globalThis as any).__mcpConfirmAction = "confirm";
    const cryptoObject = ((globalThis as any).crypto || {}) as Record<string, unknown>;
    cryptoObject.subtle =
      cryptoObject.subtle ||
      ({
        digest: jest.fn().mockResolvedValue(new Uint8Array(32).buffer),
      } as unknown as SubtleCrypto);
    cryptoObject.randomUUID =
      cryptoObject.randomUUID || (() => "00000000-0000-4000-8000-000000000000");
    (globalThis as any).crypto = cryptoObject;
    requestUrlMock.mockResolvedValue({
      status: 200,
      json: { ok: true, data: { path: "Phase 2/test-note.md" } },
      text: '{"ok":true,"data":{"path":"Phase 2/test-note.md"}}',
    } as never);
  });

  it("keeps mutating tools hidden when confirmation policy is read_only_only", () => {
    McpToolProvider.syncFromSettings(buildSettings("read_only_only"));

    expect(
      ToolRegistry.getInstance().getToolDefinition("mcp_shared-obsidian-mcp_obsidian_create_note")
    ).toBeUndefined();
  });

  it("registers mutating tools when confirmation policy is prompt_on_writes", () => {
    McpToolProvider.syncFromSettings(buildSettings("prompt_on_writes"));

    expect(
      ToolRegistry.getInstance().getToolDefinition("mcp_shared-obsidian-mcp_obsidian_create_note")
    ).toBeDefined();
  });

  it("confirms prompt_on_writes tools before executing the bridge call", async () => {
    McpToolProvider.syncFromSettings(buildSettings("prompt_on_writes"));

    const definition = ToolRegistry.getInstance().getToolDefinition(
      "mcp_shared-obsidian-mcp_obsidian_create_note"
    );
    expect(definition).toBeDefined();

    const result = await (definition!.tool as any).invoke({
      path: "Phase 2/test-note.md",
      content: "hello from test",
    });

    expect(confirmModalMock).toHaveBeenCalled();
    expect(requestUrlMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(result)).toMatchObject({
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

    const definition = ToolRegistry.getInstance().getToolDefinition(
      "mcp_shared-obsidian-mcp_obsidian_create_note"
    );
    expect(definition).toBeDefined();

    const result = await (definition!.tool as any).invoke({
      path: "Phase 2/test-note.md",
      content: "hello from test",
    });

    expect(confirmModalMock).toHaveBeenCalled();
    expect(requestUrlMock).not.toHaveBeenCalled();
    expect(JSON.parse(result)).toMatchObject({
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
});
