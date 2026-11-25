import { logInfo, logWarn } from "@/logger";
import { getSettings, setSettings, type CopilotSettings } from "@/settings/model";
import {
  describeUnconvertedServer,
  getMcpSocketMigrationReport,
  migrateMcpServersToSockets,
  planMcpSocketMigration,
} from "./socketMigration";
import type { McpServerConfig, McpSettings } from "./types";

jest.mock("@/logger", () => ({ logInfo: jest.fn(), logWarn: jest.fn() }));
jest.mock("@/settings/model", () => ({ getSettings: jest.fn(), setSettings: jest.fn() }));

const mockGetSettings = getSettings as jest.MockedFunction<typeof getSettings>;
const mockSetSettings = setSettings as jest.MockedFunction<typeof setSettings>;
const TOKEN = "secret-token-value-123";

function server(overrides: Partial<McpServerConfig>): McpServerConfig {
  return {
    id: "local-obsidian-mcp",
    displayName: "Vault bridge",
    enabled: true,
    transport: "http",
    httpEndpoint: "https://127.0.0.1:8798",
    authToken: TOKEN,
    timeoutMs: 20000,
    vaultName: "Vault",
    vaultRoot: "/vault",
    enabledToolNames: ["obsidian_health"],
    ...overrides,
  };
}

function mcp(servers: McpServerConfig[]): McpSettings {
  return {
    enabled: true,
    confirmationPolicy: "allow_without_prompt",
    redactLogs: true,
    allowlist: [],
    denylist: [],
    servers,
  };
}

function useSettings(servers: McpServerConfig[]): void {
  mockGetSettings.mockReturnValue({ mcp: mcp(servers) } as unknown as CopilotSettings);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("socketMigration", () => {
  describe("planMcpSocketMigration()", () => {
    it("moves each known id on its own port to its socket and keeps every other field", () => {
      const vault = server({});
      const cc = server({ id: "command-center", httpEndpoint: "https://127.0.0.1:8799" });
      const viz = server({ id: "viz-studio", httpEndpoint: "https://localhost:8800/" });

      const plan = planMcpSocketMigration([vault, cc, viz]);

      expect(plan.servers).toEqual([
        { ...vault, transport: "uds", socketPath: "" },
        { ...cc, transport: "uds", socketPath: "" },
        { ...viz, transport: "uds", socketPath: "" },
      ]);
      expect(plan.migrated.map((entry) => entry.socketName)).toEqual([
        "vault-bridge.sock",
        "command-center.sock",
        "viz-studio.sock",
      ]);
      expect(plan.unconverted).toEqual([]);
    });

    it("maps other ids by the port of any loopback endpoint shape to an explicit socket path", () => {
      const shapes: Array<[string, string]> = [
        ["http://127.0.0.1:8798", "vault-bridge.sock"],
        ["https://[::1]:8799", "command-center.sock"],
        ["https://LOCALHOST:8800/", "viz-studio.sock"],
        ["http://localhost:8798/mcp/tool", "vault-bridge.sock"],
        ["custom://[::1]:8800", "viz-studio.sock"],
      ];
      const servers = shapes.map(([httpEndpoint], index) =>
        server({ id: `other-${index}`, httpEndpoint })
      );

      const plan = planMcpSocketMigration(servers);

      expect(plan.servers?.map((entry) => entry.socketPath)).toEqual(
        shapes.map(([, name]) => `~/.local/state/trinc/run/${name}`)
      );
      expect(plan.servers?.every((entry) => entry.transport === "uds")).toBe(true);
      expect(plan.servers?.map((entry) => entry.httpEndpoint)).toEqual(
        shapes.map(([endpoint]) => endpoint)
      );
    });

    it("moves a known id without an endpoint record by its id", () => {
      const plan = planMcpSocketMigration([
        server({ id: "command-center", httpEndpoint: undefined }),
        server({ id: "viz-studio", httpEndpoint: "  " }),
      ]);
      expect(plan.migrated.map((entry) => entry.socketName)).toEqual([
        "command-center.sock",
        "viz-studio.sock",
      ]);
    });

    it("leaves a known id whose endpoint disagrees unconverted and reports it", () => {
      const disagreeing = [
        server({ id: "command-center", httpEndpoint: "https://127.0.0.1:8800" }),
        server({ id: "local-obsidian-mcp", httpEndpoint: "https://127.0.0.1:9999" }),
        server({ id: "viz-studio", httpEndpoint: "https://example.com:8800" }),
      ];

      const plan = planMcpSocketMigration(disagreeing);

      expect(plan.servers).toBeNull();
      expect(plan.unconverted.map((entry) => entry.serverId)).toEqual([
        "command-center",
        "local-obsidian-mcp",
        "viz-studio",
      ]);
      expect(plan.unconverted[0].reason).toContain(
        "bound to command-center.sock, but its endpoint record names viz-studio.sock"
      );
    });

    it("reports non-bridge http and unimplemented entries, and leaves socket entries alone", () => {
      const socketEntry = server({ transport: "uds", socketPath: "" });
      const plan = planMcpSocketMigration([
        server({ id: "elsewhere", httpEndpoint: "https://127.0.0.1:3000" }),
        server({ id: "piped", transport: "pipe" }),
        socketEntry,
      ]);

      expect(plan.servers).toBeNull();
      expect(plan.unconverted.map((entry) => entry.serverId)).toEqual(["elsewhere", "piped"]);
    });

    it("converts nothing the second time and skips malformed entries", () => {
      const first = planMcpSocketMigration([
        server({}),
        server({ id: "x", httpEndpoint: "http://[::1]:8799" }),
      ]);
      const second = planMcpSocketMigration(first.servers ?? []);
      expect(second).toEqual({ servers: null, migrated: [], unconverted: [] });

      expect(() => planMcpSocketMigration([null, "text", 7])).not.toThrow();
      expect(planMcpSocketMigration([null, "text", 7]).servers).toBeNull();
    });
  });

  describe("migrateMcpServersToSockets()", () => {
    it("saves the converted list through setSettings and reports it", () => {
      useSettings([
        server({}),
        server({ id: "elsewhere", httpEndpoint: "https://127.0.0.1:3000" }),
      ]);

      migrateMcpServersToSockets();

      expect(mockSetSettings).toHaveBeenCalledTimes(1);
      const patch = mockSetSettings.mock.calls[0][0] as Partial<CopilotSettings>;
      expect(patch.mcp?.servers[0]).toMatchObject({
        id: "local-obsidian-mcp",
        transport: "uds",
        socketPath: "",
        authToken: TOKEN,
        httpEndpoint: "https://127.0.0.1:8798",
      });
      expect(patch.mcp?.servers[1].transport).toBe("http");
      expect(getMcpSocketMigrationReport().migrated).toEqual([
        {
          serverId: "local-obsidian-mcp",
          displayName: "Vault bridge",
          socketName: "vault-bridge.sock",
        },
      ]);
      expect(getMcpSocketMigrationReport().unconverted.map((entry) => entry.serverId)).toEqual([
        "elsewhere",
      ]);
    });

    it("writes nothing when every entry is already on a socket", () => {
      useSettings([server({ transport: "uds", socketPath: "" })]);
      migrateMcpServersToSockets();
      expect(mockSetSettings).not.toHaveBeenCalled();
      expect(getMcpSocketMigrationReport()).toEqual({ migrated: [], unconverted: [] });
    });

    it("never logs a token or an endpoint", () => {
      useSettings([
        server({ httpEndpoint: "https://user:pw@127.0.0.1:8798" }),
        server({ id: "elsewhere", httpEndpoint: "https://127.0.0.1:3000" }),
      ]);

      migrateMcpServersToSockets();

      const logged = JSON.stringify([
        (logInfo as jest.Mock).mock.calls,
        (logWarn as jest.Mock).mock.calls,
      ]);
      expect(logged).toContain("local-obsidian-mcp");
      expect(logged).not.toContain(TOKEN);
      expect(logged).not.toContain("127.0.0.1");
      expect(logged).not.toContain("pw@");
    });
  });

  describe("getMcpSocketMigrationReport()", () => {
    it("returns the same empty report object while nothing was migrated or left", () => {
      useSettings([]);
      migrateMcpServersToSockets();
      expect(getMcpSocketMigrationReport()).toBe(getMcpSocketMigrationReport());
      expect(getMcpSocketMigrationReport().migrated).toHaveLength(0);
    });
  });

  describe("describeUnconvertedServer()", () => {
    it("explains why an entry that is not on a socket is never dialled", () => {
      expect(describeUnconvertedServer(server({ transport: "uds" }))).toBeNull();
      expect(describeUnconvertedServer(server({}))).toContain(
        "moves to vault-bridge.sock on the next plugin load"
      );
      expect(
        describeUnconvertedServer(
          server({ id: "elsewhere", httpEndpoint: "https://127.0.0.1:3000" })
        )
      ).toContain("HTTP transport was removed");
      expect(describeUnconvertedServer(server({ transport: "pipe" }))).toContain(
        "transport 'pipe' is not implemented"
      );
    });
  });
});
