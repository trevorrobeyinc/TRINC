import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as http from "node:http";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { pickActiveServer } from "./McpEventBridge";
import type { McpServerConfig, McpSettings } from "./types";
import { setUdsClientDepsForTests } from "./udsClient";

jest.mock("@/logger", () => ({ logInfo: jest.fn(), logWarn: jest.fn() }));

const HOME = "/tmp/uds-event-bridge";
const RUN = `${HOME}/.local/state/trinc/run`;

function server(overrides: Partial<McpServerConfig>): McpServerConfig {
  return {
    id: "local-obsidian-mcp",
    displayName: "Vault bridge",
    enabled: true,
    transport: "uds",
    socketPath: "",
    authToken: "token",
    timeoutMs: 20000,
    vaultName: "Vault",
    vaultRoot: "/vault",
    enabledToolNames: [],
    ...overrides,
  };
}

function mcp(servers: McpServerConfig[], enabled = true): McpSettings {
  return {
    enabled,
    confirmationPolicy: "allow_without_prompt",
    redactLogs: true,
    allowlist: [],
    denylist: [],
    servers,
  };
}

const commandCenter = server({ id: "command-center", displayName: "Command Center" });
const viz = server({ id: "viz-studio", displayName: "Viz Studio" });

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

describe("McpEventBridge", () => {
  describe("pickActiveServer()", () => {
    it("follows local-obsidian-mcp's vault-bridge socket wherever it sits in the list", () => {
      const vault = server({});
      const picked = pickActiveServer(mcp([commandCenter, viz, vault]));
      expect(picked?.server).toBe(vault);
      expect(picked?.socket).toEqual({
        socketPath: `${RUN}/vault-bridge.sock`,
        expectedName: "vault-bridge.sock",
      });
    });

    it("never follows Command Center's keepalive-only stub or Viz Studio", () => {
      expect(pickActiveServer(mcp([commandCenter, viz]))).toBeUndefined();
    });

    it("falls back to another socket entry that resolves to vault-bridge.sock", () => {
      const shared = server({
        id: "shared-obsidian-mcp",
        httpEndpoint: "http://127.0.0.1:8798",
        socketPath: "~/.local/state/trinc/run/vault-bridge.sock",
      });
      const brokenVault = server({ socketPath: "~/.local/state/trinc/run/viz-studio.sock" });
      expect(pickActiveServer(mcp([commandCenter, brokenVault, shared]))?.server).toBe(shared);
    });

    it("skips disabled, tokenless and http entries, and everything when MCP is off", () => {
      expect(
        pickActiveServer(
          mcp([
            server({ enabled: false }),
            server({ authToken: "" }),
            server({ transport: "http", httpEndpoint: "https://127.0.0.1:8798" }),
          ])
        )
      ).toBeUndefined();
      expect(pickActiveServer(mcp([server({})], false))).toBeUndefined();
    });
  });
});
