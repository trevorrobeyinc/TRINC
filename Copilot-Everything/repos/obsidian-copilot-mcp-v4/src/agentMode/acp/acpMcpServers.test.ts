import { acpMcpServersFromSettings } from "./acpMcpServers";
import type { McpServerConfig, McpSettings } from "@/mcp/types";

function server(overrides: Partial<McpServerConfig> = {}): McpServerConfig {
  return {
    id: "command-center",
    displayName: "Command Center",
    enabled: true,
    transport: "http",
    httpEndpoint: "https://127.0.0.1:8799",
    authToken: "token-abc",
    timeoutMs: 20000,
    vaultName: "My Digital Garden",
    vaultRoot: "/vault",
    enabledToolNames: [],
    ...overrides,
  };
}

function settings(servers: McpServerConfig[], enabled = true): McpSettings {
  return {
    enabled,
    confirmationPolicy: "allow_without_prompt",
    redactLogs: false,
    allowlist: [],
    denylist: [],
    servers,
  };
}

describe("acpMcpServers", () => {
  describe("acpMcpServersFromSettings()", () => {
    it("returns a stdio proxy entry carrying the endpoint and token in env", () => {
      const [entry] = acpMcpServersFromSettings(settings([server()]), "/plugins/copilot");
      expect(entry).toMatchObject({
        name: "command-center",
        command: "/plugins/copilot/openclaw-stdio-proxy.mjs",
        args: [],
      });
      expect((entry as { env: Array<{ name: string; value: string }> }).env).toEqual(
        expect.arrayContaining([
          { name: "OPENCLAW_BRIDGE_URL", value: "https://127.0.0.1:8799" },
          { name: "OPENCLAW_BRIDGE_TOKEN", value: "token-abc" },
        ])
      );
    });

    it("excludes the canonical bridge, which serves REST rather than MCP JSON-RPC", () => {
      const canonical = server({
        id: "local-obsidian-mcp",
        httpEndpoint: "https://127.0.0.1:8798",
      });
      expect(acpMcpServersFromSettings(settings([canonical]), "/plugins/copilot")).toEqual([]);
    });

    it("routes the Viz Studio bridge with its own endpoint and token", () => {
      const viz = server({
        id: "viz-studio",
        displayName: "Viz Studio",
        httpEndpoint: "https://127.0.0.1:8800",
        authToken: "token-viz",
      });
      const [entry] = acpMcpServersFromSettings(settings([viz]), "/plugins/copilot");
      expect(entry).toMatchObject({
        name: "viz-studio",
        command: "/plugins/copilot/openclaw-stdio-proxy.mjs",
      });
      expect((entry as { env: Array<{ name: string; value: string }> }).env).toEqual(
        expect.arrayContaining([
          { name: "OPENCLAW_BRIDGE_URL", value: "https://127.0.0.1:8800" },
          { name: "OPENCLAW_BRIDGE_TOKEN", value: "token-viz" },
        ])
      );
    });

    it("returns one proxy entry per routable bridge, each with its own env", () => {
      const viz = server({
        id: "viz-studio",
        httpEndpoint: "https://127.0.0.1:8800",
        authToken: "token-viz",
      });
      const entries = acpMcpServersFromSettings(settings([server(), viz]), "/plugins/copilot");
      expect(entries.map((e) => e.name)).toEqual(["command-center", "viz-studio"]);
      const urls = entries.map(
        (e) =>
          (e as unknown as { env: Array<{ name: string; value: string }> }).env.find(
            (v) => v.name === "OPENCLAW_BRIDGE_URL"
          )?.value
      );
      expect(urls).toEqual(["https://127.0.0.1:8799", "https://127.0.0.1:8800"]);
    });

    it("returns nothing when MCP is disabled globally", () => {
      expect(acpMcpServersFromSettings(settings([server()], false), "/plugins/copilot")).toEqual(
        []
      );
    });

    it("skips a disabled server and one with a blank endpoint", () => {
      const disabled = server({ enabled: false });
      const blank = server({ httpEndpoint: "   " });
      expect(acpMcpServersFromSettings(settings([disabled, blank]), "/plugins/copilot")).toEqual(
        []
      );
    });

    it("omits the auth header when no token is configured", () => {
      const [entry] = acpMcpServersFromSettings(
        settings([server({ authToken: "" })]),
        "/plugins/copilot"
      );
      expect((entry as { env: Array<{ name: string; value: string }> }).env).toEqual(
        expect.arrayContaining([{ name: "OPENCLAW_BRIDGE_TOKEN", value: "" }])
      );
    });

    it("returns nothing when settings are absent", () => {
      expect(acpMcpServersFromSettings(undefined, "/plugins/copilot")).toEqual([]);
    });
  });
});
