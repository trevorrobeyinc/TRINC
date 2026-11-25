import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig, parseTransportArg, TCP_TRANSPORT_REMOVED } from "../config/loader";
import { socketPathFor } from "../server/udsListener";

// Pins the loader's defaults. Under zod 4 a section written as `.default({})` returns the bare
// `{}` and drops its inner defaults (port, timeouts, queue sizes, log level, ...); the loader uses
// `.prefault({})` so a minimal config still comes back fully populated, as it did under zod 3.

const TOKEN = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4";
const savedEnv = process.env.OBSIDIAN_MCP_CONFIG;
const CANONICAL_SOCKET = socketPathFor("vault-bridge.sock", os.homedir());

function writeConfig(body: unknown): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cpbh-config-"));
  const file = path.join(dir, "obsidian-cli-mcp.local.json");
  fs.writeFileSync(file, JSON.stringify(body));
  process.env.OBSIDIAN_MCP_CONFIG = file;
  return file;
}

function withTransport(transport: Record<string, unknown>): unknown {
  return { transport, allowedVaultRoots: ["/vault"], security: { authToken: TOKEN } };
}

function messageOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    return (error as Error).message;
  }
  return "(no error)";
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
    expect(config.transport.udsPath).toBe(CANONICAL_SOCKET);
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
      transport: { mode: "uds" },
      logging: { level: "debug" },
      allowedVaultRoots: ["/vault"],
      security: { authToken: TOKEN },
    });
    const { config } = loadConfig();

    expect(config.transport).toEqual({
      mode: "uds",
      host: "127.0.0.1",
      port: 8798,
      udsPath: CANONICAL_SOCKET,
      pipeName: "obsidian-mcp-bridge",
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

// bridges-uds D4 (2026-11-24): TCP is gone. The socket path is fixed, the removed keys are ignored
// with one stderr note each, and "http"/"https" as the effective mode stops the bridge at startup.
describe.skipIf(process.platform === "win32")("config loader transport rules (bridges-uds)", () => {
  it("maps --transport= values: https and http both mean the removed TCP transport", () => {
    expect(parseTransportArg(["node", "dist/index.js", "--transport=uds"])).toBe("uds");
    expect(parseTransportArg(["node", "dist/index.js", "--transport=pipe"])).toBe("pipe");
    expect(parseTransportArg(["node", "dist/index.js", "--transport=https"])).toBe("http");
    expect(parseTransportArg(["node", "dist/index.js", "--transport=http"])).toBe("http");
    expect(parseTransportArg(["node", "dist/index.js", "--transport=bogus"])).toBeNull();
    expect(parseTransportArg(["node", "dist/index.js"])).toBeNull();
  });

  it("refuses a config transport.mode of http as the effective mode, with the bridges-uds message", () => {
    writeConfig(withTransport({ mode: "http" }));
    expect(messageOf(() => loadConfig({ note: () => undefined }))).toBe(TCP_TRANSPORT_REMOVED);
    expect(TCP_TRANSPORT_REMOVED).toBe("TCP transport was removed on 2026-11-24 (bridges-uds); start with --transport=uds");
  });

  it("refuses --transport=https and --transport=http even when the config says uds", () => {
    writeConfig(withTransport({ mode: "uds" }));
    for (const arg of ["--transport=https", "--transport=http"]) {
      expect(messageOf(() => loadConfig({ argv: ["node", "dist/index.js", arg] }))).toBe(TCP_TRANSPORT_REMOVED);
    }
  });

  it("lets --transport=uds win over a config that still says http (the live config's shape)", () => {
    writeConfig(withTransport({ mode: "http", host: "127.0.0.1", port: 8798, tls: { certPath: "/c.pem", keyPath: "/k.pem" } }));
    const notes: string[] = [];
    const { config } = loadConfig({ argv: ["node", "dist/index.js", "--transport=uds"], note: (line) => notes.push(line) });
    expect(config.transport.mode).toBe("uds");
    expect(config.transport.udsPath).toBe(CANONICAL_SOCKET);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatch(/transport\.tls is ignored/);
  });

  it("ignores a non-canonical transport.udsPath with one note and serves on the canonical path", () => {
    writeConfig(withTransport({ mode: "uds", udsPath: "/tmp/obsidian-mcp-bridge.sock" }));
    const notes: string[] = [];
    const { config } = loadConfig({ note: (line) => notes.push(line) });
    expect(config.transport.udsPath).toBe(CANONICAL_SOCKET);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatch(/transport\.udsPath \("\/tmp\/obsidian-mcp-bridge\.sock"\) is ignored/);
    expect(notes[0]).toContain(CANONICAL_SOCKET);
  });

  it("accepts the canonical transport.udsPath without a note", () => {
    writeConfig(withTransport({ mode: "uds", udsPath: CANONICAL_SOCKET }));
    const notes: string[] = [];
    const { config } = loadConfig({ note: (line) => notes.push(line) });
    expect(config.transport.udsPath).toBe(CANONICAL_SOCKET);
    expect(notes).toEqual([]);
  });

  it("ignores a transport.tls block with one note, even a malformed one, and keeps no TLS setting", () => {
    writeConfig(withTransport({ tls: { certPath: 42 } }));
    const notes: string[] = [];
    const { config } = loadConfig({ note: (line) => notes.push(line) });
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatch(/transport\.tls is ignored/);
    expect("tls" in config.transport).toBe(false);
    expect(config.transport.mode).toBe("uds");
  });

  it("writes each note to stderr by default", () => {
    writeConfig(withTransport({ mode: "uds", udsPath: "/tmp/elsewhere.sock", tls: { certPath: "/c.pem", keyPath: "/k.pem" } }));
    const written: string[] = [];
    const original = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string | Uint8Array) => {
      written.push(String(chunk));
      return true;
    }) as typeof process.stderr.write;
    try {
      loadConfig();
    } finally {
      process.stderr.write = original;
    }
    expect(written).toHaveLength(2);
    expect(written.every((line) => line.endsWith("\n"))).toBe(true);
  });

  it("refuses the Windows pipe transport on macOS and Linux", () => {
    writeConfig(withTransport({ mode: "pipe" }));
    expect(messageOf(() => loadConfig())).toMatch(/"pipe" is Windows-only/);
    writeConfig(withTransport({ mode: "uds" }));
    expect(messageOf(() => loadConfig({ argv: ["node", "dist/index.js", "--transport=pipe"] }))).toMatch(/Windows-only/);
  });

  it("ignores an unknown --transport= value, as before", () => {
    writeConfig(withTransport({ mode: "uds" }));
    expect(loadConfig({ argv: ["node", "dist/index.js", "--transport=bogus"] }).config.transport.mode).toBe("uds");
  });
});
