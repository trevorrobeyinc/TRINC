import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as http from "node:http";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { acpMcpServersFromSettings } from "./acpMcpServers";
import type { McpServerConfig, McpSettings } from "@/mcp/types";
import { setUdsClientDepsForTests } from "@/mcp/udsClient";

const HOME = "/tmp/uds-acp";
const RUN = `${HOME}/.local/state/trinc/run`;

function server(overrides: Partial<McpServerConfig> = {}): McpServerConfig {
  return {
    id: "command-center",
    displayName: "Command Center",
    enabled: true,
    transport: "uds",
    socketPath: "",
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

function envOf(entry: unknown): Array<{ name: string; value: string }> {
  return (entry as { env: Array<{ name: string; value: string }> }).env;
}

describe("acpMcpServers", () => {
  beforeEach(() => {
    setUdsClientDepsForTests({
      fs,
      path,
      os: { ...os, homedir: () => HOME },
      http,
      net,
      childProcess,
    });
  });

  afterEach(() => {
    setUdsClientDepsForTests(null);
  });

  describe("acpMcpServersFromSettings()", () => {
    it("returns a stdio proxy entry carrying the resolved socket path and token in env", () => {
      const [entry] = acpMcpServersFromSettings(settings([server()]), "/plugins/copilot");
      expect(entry).toMatchObject({
        name: "command-center",
        command: "/plugins/copilot/openclaw-stdio-proxy.mjs",
        args: [],
      });
      expect(envOf(entry)).toEqual(
        expect.arrayContaining([
          { name: "OPENCLAW_BRIDGE_SOCKET", value: `${RUN}/command-center.sock` },
          { name: "OPENCLAW_BRIDGE_TOKEN", value: "token-abc" },
        ])
      );
    });

    it("passes only the socket, the token and PATH: no URL and no CA bundle", () => {
      const saved = process.env.NODE_EXTRA_CA_CERTS;
      process.env.NODE_EXTRA_CA_CERTS = "/tmp/ca.pem";
      try {
        const [entry] = acpMcpServersFromSettings(
          settings([server({ httpEndpoint: "https://127.0.0.1:8799" })]),
          "/plugins/copilot"
        );
        expect(envOf(entry).map((variable) => variable.name)).toEqual([
          "OPENCLAW_BRIDGE_SOCKET",
          "OPENCLAW_BRIDGE_TOKEN",
          "PATH",
        ]);
      } finally {
        if (saved === undefined) delete process.env.NODE_EXTRA_CA_CERTS;
        else process.env.NODE_EXTRA_CA_CERTS = saved;
      }
    });

    it("excludes the canonical bridge, which serves REST rather than MCP JSON-RPC", () => {
      const canonical = server({ id: "local-obsidian-mcp" });
      expect(acpMcpServersFromSettings(settings([canonical]), "/plugins/copilot")).toEqual([]);
    });

    it("routes the Viz Studio bridge with its own socket and token", () => {
      const viz = server({
        id: "viz-studio",
        displayName: "Viz Studio",
        socketPath: "~/.local/state/trinc/run/viz-studio.sock",
        authToken: "token-viz",
      });
      const [entry] = acpMcpServersFromSettings(settings([viz]), "/plugins/copilot");
      expect(entry).toMatchObject({
        name: "viz-studio",
        command: "/plugins/copilot/openclaw-stdio-proxy.mjs",
      });
      expect(envOf(entry)).toEqual(
        expect.arrayContaining([
          { name: "OPENCLAW_BRIDGE_SOCKET", value: `${RUN}/viz-studio.sock` },
          { name: "OPENCLAW_BRIDGE_TOKEN", value: "token-viz" },
        ])
      );
    });

    it("returns one proxy entry per routable bridge, each with its own env", () => {
      const viz = server({ id: "viz-studio", authToken: "token-viz" });
      const entries = acpMcpServersFromSettings(settings([server(), viz]), "/plugins/copilot");
      expect(entries.map((e) => e.name)).toEqual(["command-center", "viz-studio"]);
      const sockets = entries.map(
        (e) => envOf(e).find((v) => v.name === "OPENCLAW_BRIDGE_SOCKET")?.value
      );
      expect(sockets).toEqual([`${RUN}/command-center.sock`, `${RUN}/viz-studio.sock`]);
    });

    it("returns nothing when MCP is disabled globally", () => {
      expect(acpMcpServersFromSettings(settings([server()], false), "/plugins/copilot")).toEqual(
        []
      );
    });

    it("skips a disabled server, an http entry and one whose socket is refused", () => {
      const disabled = server({ enabled: false });
      const httpEntry = server({ transport: "http", httpEndpoint: "https://127.0.0.1:8799" });
      const foreign = server({ socketPath: "~/.local/state/trinc/run/viz-studio.sock" });
      expect(
        acpMcpServersFromSettings(settings([disabled, httpEntry, foreign]), "/plugins/copilot")
      ).toEqual([]);
    });

    it("passes an empty token through when none is configured", () => {
      const [entry] = acpMcpServersFromSettings(
        settings([server({ authToken: "" })]),
        "/plugins/copilot"
      );
      expect(envOf(entry)).toEqual(
        expect.arrayContaining([{ name: "OPENCLAW_BRIDGE_TOKEN", value: "" }])
      );
    });

    it("returns nothing when settings are absent", () => {
      expect(acpMcpServersFromSettings(undefined, "/plugins/copilot")).toEqual([]);
    });
  });
});
