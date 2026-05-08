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
    try { if (fs.existsSync(socketPath)) fs.unlinkSync(socketPath); } catch { /* ignore */ }
    server.listen(socketPath, () => {
      resolve({
        socketPath, requests,
        close: () => new Promise<void>((r) => {
          server.close(() => {
            try { if (fs.existsSync(socketPath)) fs.unlinkSync(socketPath); } catch { /* ignore */ }
            r();
          });
        }),
      });
    });
  });
}

describe("InprocPluginBackend — Advanced URI parity tools", () => {
  let tempDir: string;
  let configPath: string;
  let socketPath: string;
  let server: TestServer | null;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cpbh-aduri-"));
    configPath = path.join(tempDir, "obsidian-mcp-inproc.local.json");
    socketPath = path.join(tempDir, "test-aduri.sock");
    server = null;
  });
  afterEach(async () => {
    if (server) await server.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function writeConfig(): void {
    fs.writeFileSync(configPath, JSON.stringify({ authToken: "a".repeat(43), socketPath }), { mode: 0o600 });
  }

  it("input.__pluginTool overrides the operation→tool mapping", async () => {
    writeConfig();
    let seenTool = "";
    let seenInput: Record<string, unknown> = {};
    server = await startUdsServer(socketPath, (req) => {
      const parsed = JSON.parse(req.body) as { tool: string; input: Record<string, unknown> };
      seenTool = parsed.tool;
      seenInput = parsed.input;
      return { status: 200, body: JSON.stringify({ ok: true, data: { ack: true } }) };
    });
    const backend = new InprocPluginBackend({ configPath, socketPath });
    await backend.execute(
      "execute_command",
      { __pluginTool: "obsidian_aduri_open", filepath: "Notes/X.md", heading: "h1" },
      { requestId: "r-1", now: Date.now(), epochId: 1, timeoutMs: 5_000 }
    );
    expect(seenTool).toBe("obsidian_aduri_open");
    // __pluginTool must be stripped before forwarding to plugin
    expect(seenInput.__pluginTool).toBeUndefined();
    expect(seenInput.filepath).toBe("Notes/X.md");
    expect(seenInput.heading).toBe("h1");
  });

  it("falls back to OPERATION_TO_TOOL when __pluginTool is absent", async () => {
    writeConfig();
    let seenTool = "";
    server = await startUdsServer(socketPath, (req) => {
      seenTool = (JSON.parse(req.body) as { tool: string }).tool;
      return { status: 200, body: JSON.stringify({ ok: true, data: { executed: true, id: "test" } }) };
    });
    const backend = new InprocPluginBackend({ configPath, socketPath });
    await backend.execute(
      "execute_command",
      { id: "app:reload" },
      { requestId: "r-2", now: Date.now(), epochId: 1, timeoutMs: 5_000 }
    );
    expect(seenTool).toBe("obsidian_execute_command");
  });

  it("aduri_open: forwards heading/block/line params", async () => {
    writeConfig();
    let seenInput: Record<string, unknown> = {};
    server = await startUdsServer(socketPath, (req) => {
      seenInput = (JSON.parse(req.body) as { input: Record<string, unknown> }).input;
      return { status: 200, body: JSON.stringify({ ok: true, data: { opened: true, filepath: "Notes/X.md", positioned: true } }) };
    });
    const backend = new InprocPluginBackend({ configPath, socketPath });
    const r = await backend.execute(
      "execute_command",
      { __pluginTool: "obsidian_aduri_open", filepath: "Notes/X.md", heading: "Section 2", line: 42 },
      { requestId: "r-3", now: Date.now(), epochId: 1, timeoutMs: 5_000 }
    );
    expect(seenInput.heading).toBe("Section 2");
    expect(seenInput.line).toBe(42);
    expect(JSON.parse(r.stdout)).toMatchObject({ opened: true, filepath: "Notes/X.md" });
  });

  it("aduri_frontmatter_get: returns key value when present", async () => {
    writeConfig();
    server = await startUdsServer(socketPath, () => ({
      status: 200,
      body: JSON.stringify({ ok: true, data: { filepath: "x.md", key: "tags", value: ["a", "b"], present: true } }),
    }));
    const backend = new InprocPluginBackend({ configPath, socketPath });
    const r = await backend.execute(
      "execute_command",
      { __pluginTool: "obsidian_aduri_frontmatter_get", filepath: "x.md", key: "tags" },
      { requestId: "r-4", now: Date.now(), epochId: 1, timeoutMs: 5_000 }
    );
    const data = JSON.parse(r.stdout);
    expect(data.key).toBe("tags");
    expect(data.value).toEqual(["a", "b"]);
  });

  it("aduri_write: forwards mode parameter", async () => {
    writeConfig();
    let seenInput: Record<string, unknown> = {};
    server = await startUdsServer(socketPath, (req) => {
      seenInput = (JSON.parse(req.body) as { input: Record<string, unknown> }).input;
      return { status: 200, body: JSON.stringify({ ok: true, data: { written: true, filepath: "x.md", mode: "prepend" } }) };
    });
    const backend = new InprocPluginBackend({ configPath, socketPath });
    await backend.execute(
      "execute_command",
      { __pluginTool: "obsidian_aduri_write", filepath: "x.md", data: "hi", mode: "prepend" },
      { requestId: "r-5", now: Date.now(), epochId: 1, timeoutMs: 5_000 }
    );
    expect(seenInput.mode).toBe("prepend");
  });

  it("aduri_file_exists: returns boolean", async () => {
    writeConfig();
    server = await startUdsServer(socketPath, () => ({
      status: 200,
      body: JSON.stringify({ ok: true, data: { filepath: "x.md", exists: false, isFile: false, isFolder: false } }),
    }));
    const backend = new InprocPluginBackend({ configPath, socketPath });
    const r = await backend.execute(
      "execute_command",
      { __pluginTool: "obsidian_aduri_file_exists", filepath: "x.md" },
      { requestId: "r-6", now: Date.now(), epochId: 1, timeoutMs: 5_000 }
    );
    expect(JSON.parse(r.stdout).exists).toBe(false);
  });

  it("aduri_search_replace: returns replacement count", async () => {
    writeConfig();
    server = await startUdsServer(socketPath, () => ({
      status: 200,
      body: JSON.stringify({ ok: true, data: { filepath: "x.md", replacements: 3, regex: false } }),
    }));
    const backend = new InprocPluginBackend({ configPath, socketPath });
    const r = await backend.execute(
      "execute_command",
      { __pluginTool: "obsidian_aduri_search_replace", filepath: "x.md", search: "foo", replace: "bar" },
      { requestId: "r-7", now: Date.now(), epochId: 1, timeoutMs: 5_000 }
    );
    expect(JSON.parse(r.stdout).replacements).toBe(3);
  });

  it("plugin error propagates with code", async () => {
    writeConfig();
    server = await startUdsServer(socketPath, () => ({
      status: 200,
      body: JSON.stringify({ ok: false, error: { code: "NOT_FOUND", message: "not found: x.md" } }),
    }));
    const backend = new InprocPluginBackend({ configPath, socketPath });
    await expect(
      backend.execute(
        "execute_command",
        { __pluginTool: "obsidian_aduri_frontmatter_get", filepath: "x.md", key: "tags" },
        { requestId: "r-8", now: Date.now(), epochId: 1, timeoutMs: 5_000 }
      )
    ).rejects.toThrow(/NOT_FOUND/);
  });
});
