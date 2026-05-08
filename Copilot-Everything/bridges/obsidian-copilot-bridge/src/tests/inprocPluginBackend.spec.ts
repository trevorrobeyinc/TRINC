import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InprocPluginBackend } from "../backends/inprocPluginBackend";

interface TestServer {
  close: () => Promise<void>;
  socketPath: string;
  requests: Array<{ pathname: string; method: string; headers: http.IncomingHttpHeaders; body: string }>;
}

function startUdsServer(
  socketPath: string,
  handler: (req: { pathname: string; method: string; headers: http.IncomingHttpHeaders; body: string }) => {
    status: number;
    body: string;
  }
): Promise<TestServer> {
  return new Promise((resolve, reject) => {
    const requests: TestServer["requests"] = [];
    const server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf-8");
        const entry = { pathname: req.url || "", method: req.method || "GET", headers: req.headers, body };
        requests.push(entry);
        const result = handler(entry);
        res.writeHead(result.status, { "Content-Type": "application/json" });
        res.end(result.body);
      });
    });
    server.on("error", reject);
    try {
      if (fs.existsSync(socketPath)) fs.unlinkSync(socketPath);
    } catch {
      // ignore
    }
    server.listen(socketPath, () => {
      resolve({
        socketPath,
        requests,
        close: () =>
          new Promise<void>((r) => {
            server.close(() => {
              try {
                if (fs.existsSync(socketPath)) fs.unlinkSync(socketPath);
              } catch {
                // ignore
              }
              r();
            });
          }),
      });
    });
  });
}

describe("InprocPluginBackend", () => {
  let tempDir: string;
  let configPath: string;
  let socketPath: string;
  let server: TestServer | null;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cpbh-inproc-plugin-"));
    configPath = path.join(tempDir, "obsidian-mcp-inproc.local.json");
    socketPath = path.join(tempDir, "test-plugin.sock");
    server = null;
  });

  afterEach(async () => {
    if (server) {
      await server.close();
      server = null;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function writeConfig(authToken = "a".repeat(43)): void {
    fs.writeFileSync(
      configPath,
      JSON.stringify({ authToken, socketPath }),
      { mode: 0o600 }
    );
  }

  it("probe returns unavailable when config file is missing", async () => {
    const backend = new InprocPluginBackend({ configPath, socketPath });
    const caps = await backend.probe();
    expect(caps.available).toBe(false);
    expect(caps.constraints[0]).toContain("config not readable");
  });

  it("probe returns unavailable when authToken is too short", async () => {
    fs.writeFileSync(configPath, JSON.stringify({ authToken: "too-short" }), { mode: 0o600 });
    const backend = new InprocPluginBackend({ configPath, socketPath });
    const caps = await backend.probe();
    expect(caps.available).toBe(false);
    expect(caps.constraints[0]).toContain("config not readable");
  });

  it("probe returns unavailable when socket is missing", async () => {
    writeConfig();
    const backend = new InprocPluginBackend({ configPath, socketPath });
    const caps = await backend.probe();
    expect(caps.available).toBe(false);
    expect(caps.constraints[0]).toContain("socket missing");
  });

  it("probe returns available when /healthz returns 200", async () => {
    writeConfig();
    server = await startUdsServer(socketPath, (req) => {
      if (req.pathname === "/healthz" && req.method === "GET") {
        return { status: 200, body: JSON.stringify({ ok: true }) };
      }
      return { status: 404, body: "{}" };
    });
    const backend = new InprocPluginBackend({ configPath, socketPath });
    const caps = await backend.probe();
    expect(caps.available).toBe(true);
    expect(caps.supportedOps).toEqual([
      "open_vault",
      "create_note",
      "append_note",
      "read_note",
      "search_notes",
      "execute_command",
    ]);
    expect(caps.reliabilityScore).toBe(1);
    expect((caps.diagnostics as Record<string, unknown>)?.socketPath).toBe(socketPath);
  });

  it("probe returns unavailable when /healthz returns non-200", async () => {
    writeConfig();
    server = await startUdsServer(socketPath, () => ({ status: 503, body: "{}" }));
    const backend = new InprocPluginBackend({ configPath, socketPath });
    const caps = await backend.probe();
    expect(caps.available).toBe(false);
    expect(caps.constraints[0]).toContain("status 503");
  });

  it("execute(read_note) returns content as stdout string", async () => {
    writeConfig();
    server = await startUdsServer(socketPath, (req) => {
      if (req.pathname === "/mcp/tool" && req.method === "POST") {
        const parsed = JSON.parse(req.body) as { tool: string; operation: string; input: Record<string, unknown> };
        expect(parsed.tool).toBe("obsidian_read_note");
        expect(parsed.operation).toBe("read_note");
        // Verify HMAC headers are present
        expect(typeof req.headers["x-mcp-token"]).toBe("string");
        expect(typeof req.headers["x-mcp-timestamp"]).toBe("string");
        expect(typeof req.headers["x-mcp-nonce"]).toBe("string");
        expect(typeof req.headers["x-mcp-body-sha256"]).toBe("string");
        return {
          status: 200,
          body: JSON.stringify({
            ok: true,
            data: { content: "# My Note\n\nHello." },
          }),
        };
      }
      return { status: 404, body: "{}" };
    });
    const backend = new InprocPluginBackend({ configPath, socketPath });
    const result = await backend.execute(
      "read_note",
      { vault: "My Digital Garden", path: "Notes/Test.md" },
      { requestId: "req-1", now: Date.now(), epochId: 1, timeoutMs: 5_000 }
    );
    expect(result.stdout).toBe("# My Note\n\nHello.");
    expect(result.stderr).toBe("");
    expect(result.statusCode).toBe(200);
  });

  it("execute(search_notes) returns matches array as JSON stdout", async () => {
    writeConfig();
    server = await startUdsServer(socketPath, () => ({
      status: 200,
      body: JSON.stringify({
        ok: true,
        data: { matches: [{ path: "a.md", score: 0.9 }, { path: "b.md", score: 0.7 }] },
      }),
    }));
    const backend = new InprocPluginBackend({ configPath, socketPath });
    const result = await backend.execute(
      "search_notes",
      { vault: "My Digital Garden", query: "test" },
      { requestId: "req-2", now: Date.now(), epochId: 1, timeoutMs: 5_000 }
    );
    const parsed = JSON.parse(result.stdout) as Array<{ path: string }>;
    expect(parsed).toHaveLength(2);
    expect(parsed[0].path).toBe("a.md");
  });

  it("execute(create_note) returns full data as JSON stdout", async () => {
    writeConfig();
    server = await startUdsServer(socketPath, () => ({
      status: 200,
      body: JSON.stringify({ ok: true, data: { path: "Notes/Created.md", created: true } }),
    }));
    const backend = new InprocPluginBackend({ configPath, socketPath });
    const result = await backend.execute(
      "create_note",
      { vault: "My Digital Garden", name: "Created", content: "hi" },
      { requestId: "req-3", now: Date.now(), epochId: 1, timeoutMs: 5_000 }
    );
    expect(JSON.parse(result.stdout)).toEqual({ path: "Notes/Created.md", created: true });
  });

  it("execute throws when plugin returns ok=false", async () => {
    writeConfig();
    server = await startUdsServer(socketPath, () => ({
      status: 200,
      body: JSON.stringify({ ok: false, error: { code: "VAULT_LOCKED", message: "vault is read-only" } }),
    }));
    const backend = new InprocPluginBackend({ configPath, socketPath });
    await expect(
      backend.execute(
        "create_note",
        { vault: "My Digital Garden", name: "X", content: "y" },
        { requestId: "req-4", now: Date.now(), epochId: 1, timeoutMs: 5_000 }
      )
    ).rejects.toThrow(/VAULT_LOCKED/);
  });

  it("execute throws when plugin returns malformed JSON", async () => {
    writeConfig();
    server = await startUdsServer(socketPath, () => ({ status: 200, body: "not-json" }));
    const backend = new InprocPluginBackend({ configPath, socketPath });
    await expect(
      backend.execute(
        "read_note",
        { vault: "My Digital Garden", path: "x" },
        { requestId: "req-5", now: Date.now(), epochId: 1, timeoutMs: 5_000 }
      )
    ).rejects.toThrow(/malformed response/);
  });

  it("execute throws when config is missing", async () => {
    const backend = new InprocPluginBackend({ configPath, socketPath });
    await expect(
      backend.execute(
        "read_note",
        {},
        { requestId: "req-6", now: Date.now(), epochId: 1, timeoutMs: 5_000 }
      )
    ).rejects.toThrow(/config not readable/);
  });
});
