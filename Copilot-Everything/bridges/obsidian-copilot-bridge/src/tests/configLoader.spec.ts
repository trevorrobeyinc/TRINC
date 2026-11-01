import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../config/loader";

// Pins the loader's defaults. Under zod 4 a section written as `.default({})` returns the bare
// `{}` and drops its inner defaults (port, timeouts, queue sizes, log level, ...); the loader uses
// `.prefault({})` so a minimal config still comes back fully populated, as it did under zod 3.

const TOKEN = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4";
const savedEnv = process.env.OBSIDIAN_MCP_CONFIG;

function writeConfig(body: unknown): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cpbh-config-"));
  const file = path.join(dir, "obsidian-cli-mcp.local.json");
  fs.writeFileSync(file, JSON.stringify(body));
  process.env.OBSIDIAN_MCP_CONFIG = file;
  return file;
}

afterEach(() => {
  if (savedEnv === undefined) {
    delete process.env.OBSIDIAN_MCP_CONFIG;
  } else {
    process.env.OBSIDIAN_MCP_CONFIG = savedEnv;
  }
});

describe("config loader defaults", () => {
  it("fills every omitted section from its inner defaults", () => {
    writeConfig({ allowedVaultRoots: ["/vault"], security: { authToken: TOKEN } });
    const { config } = loadConfig();

    expect(config.transport.host).toBe("127.0.0.1");
    expect(config.transport.port).toBe(8798);
    expect(config.transport.udsPath).toBe("/tmp/obsidian-mcp-bridge.sock");
    expect(config.transport.pipeName).toBe("obsidian-mcp-bridge");
    expect(config.transport.mode).toBe(process.platform === "win32" ? "pipe" : "uds");
    expect(config.cliStability.requiredVaultNames).toEqual(["My Digital Garden"]);
    expect(config.timeouts).toEqual({
      openVaultMs: 25000,
      createNoteMs: 20000,
      appendNoteMs: 20000,
      readNoteMs: 15000,
      searchNotesMs: 20000,
    });
    expect(config.queue).toEqual({ capacity: 256, workerConcurrency: 4 });
    expect(config.security).toEqual({
      authToken: TOKEN,
      replayWindowSeconds: 60,
      nonceTtlSeconds: 120,
      rateLimitPerMinute: 600,
      globalRateLimitPerMinute: 2400,
      executeCommandAllowlist: [],
    });
    expect(config.logging.level).toBe("info");
    expect(config.logging.slowThresholdMs).toEqual({
      open_vault: 5000,
      create_note: 3000,
      append_note: 3000,
      read_note: 1500,
      search_notes: 1500,
      execute_command: 3000,
    });
    expect(config.readOnlyMode).toBe(false);
  });

  it("fills the inner defaults of a section that is present but partial", () => {
    writeConfig({
      transport: { mode: "http", tls: { certPath: "/c.pem", keyPath: "/k.pem" } },
      logging: { level: "debug" },
      allowedVaultRoots: ["/vault"],
      security: { authToken: TOKEN },
    });
    const { config } = loadConfig();

    expect(config.transport).toEqual({
      mode: "http",
      host: "127.0.0.1",
      port: 8798,
      udsPath: "/tmp/obsidian-mcp-bridge.sock",
      pipeName: "obsidian-mcp-bridge",
      tls: { certPath: "/c.pem", keyPath: "/k.pem" },
    });
    expect(config.logging.level).toBe("debug");
    expect(config.logging.slowThresholdMs.open_vault).toBe(5000);
  });

  it("still refuses a non-loopback host and a missing token", () => {
    writeConfig({ transport: { host: "0.0.0.0" }, allowedVaultRoots: ["/vault"], security: { authToken: TOKEN } });
    expect(() => loadConfig()).toThrow(/loopback/);

    writeConfig({ allowedVaultRoots: ["/vault"], security: {} });
    expect(() => loadConfig()).toThrow();
  });
});
