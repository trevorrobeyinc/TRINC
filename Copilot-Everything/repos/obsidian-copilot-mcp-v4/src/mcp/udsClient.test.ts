/**
 * @jest-environment node
 */
// Real Unix sockets: Node's environment, with short /tmp/uds-* homes (never os.tmpdir(), whose
// paths are too long for macOS's 103-byte socket limit) that are removed after each test.
import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as http from "node:http";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { Platform } from "obsidian";
import {
  assertSocketTrust,
  boundSocketName,
  BRIDGE_SOCKET_NAMES,
  legacyEndpointSocketName,
  resolveBridgeSocket,
  setUdsClientDepsForTests,
  UdsClientError,
  udsOpenStream,
  udsRequest,
  type UdsClientDeps,
} from "./udsClient";

// The shared obsidian mock touches `window`, which this environment lacks.
jest.mock("obsidian", () => ({ Platform: { isDesktopApp: true, isMobile: false } }));

const RUN_SEGMENTS = [".local", "state", "trinc", "run"];
const VAULT = BRIDGE_SOCKET_NAMES.vaultBridge;

interface Harness {
  home: string;
  runDir: string;
  connect: jest.Mock;
  request: jest.Mock;
  execFileSync: jest.Mock;
}

const homes: string[] = [];
const servers: http.Server[] = [];

/** Install deps whose home is `home`, with spies around connect, request and /bin/ls. */
function install(home: string, overrides: Partial<UdsClientDeps> = {}): Harness {
  const connect = jest.fn((options: net.IpcNetConnectOpts) => net.connect(options));
  const request = jest.fn((options: http.RequestOptions) => http.request(options));
  const execFileSync = jest.fn((file: string, args: string[], options: { encoding: "utf8" }) =>
    childProcess.execFileSync(file, args, options)
  );
  setUdsClientDepsForTests({
    fs,
    path,
    os: { ...os, homedir: () => home },
    http: { request: request as unknown as typeof http.request },
    net: { connect: connect as unknown as typeof net.connect },
    childProcess: { execFileSync: execFileSync as unknown as typeof childProcess.execFileSync },
    ...overrides,
  });
  return { home, runDir: path.join(home, ...RUN_SEGMENTS), connect, request, execFileSync };
}

/** A fresh home with the run directory chain created 0700 (or only `levels` of it). */
function makeHome(levels = RUN_SEGMENTS.length): Harness {
  const home = fs.mkdtempSync("/tmp/uds-");
  homes.push(home);
  let dir = home;
  for (const part of RUN_SEGMENTS.slice(0, levels)) {
    dir = path.join(dir, part);
    fs.mkdirSync(dir, { mode: 0o700 });
  }
  return install(home);
}

/** A plain node:http server on `socketPath`, chmod 0600 like the bridges' helper leaves it. */
async function serve(socketPath: string, handler: http.RequestListener): Promise<http.Server> {
  const server = http.createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, () => resolve());
  });
  fs.chmodSync(socketPath, 0o600);
  return server;
}

async function expectRefusal(action: () => unknown, code: string): Promise<void> {
  let caught: unknown;
  try {
    await action();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(UdsClientError);
  expect((caught as UdsClientError).code).toBe(code);
}

function nothingDialled(harness: Harness): void {
  expect(harness.connect).not.toHaveBeenCalled();
  expect(harness.request).not.toHaveBeenCalled();
}

afterEach(async () => {
  setUdsClientDepsForTests(null);
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          (server as unknown as { closeAllConnections?: () => void }).closeAllConnections?.();
          server.close(() => resolve());
        })
    )
  );
  for (const home of homes.splice(0)) fs.rmSync(home, { recursive: true, force: true });
});

describe("udsClient", () => {
  describe("legacyEndpointSocketName()", () => {
    it("maps a loopback endpoint on a retired bridge port by port, whatever the scheme, case or path", () => {
      expect(legacyEndpointSocketName("https://127.0.0.1:8798")).toBe("vault-bridge.sock");
      expect(legacyEndpointSocketName("http://127.0.0.1:8798/")).toBe("vault-bridge.sock");
      expect(legacyEndpointSocketName("https://localhost:8799/mcp")).toBe("command-center.sock");
      expect(legacyEndpointSocketName("https://LOCALHOST:8799/")).toBe("command-center.sock");
      expect(legacyEndpointSocketName("https://[::1]:8800")).toBe("viz-studio.sock");
      expect(legacyEndpointSocketName("custom://LocalHost:8800")).toBe("viz-studio.sock");
      expect(legacyEndpointSocketName("  https://127.0.0.1:8799  ")).toBe("command-center.sock");
    });

    it("returns null for other hosts, other ports, no port and values that are not URLs", () => {
      for (const value of [
        "https://example.com:8798",
        "https://127.0.0.2:8798",
        "https://127.0.0.1:9999",
        "https://127.0.0.1",
        "127.0.0.1:8798",
        "not a url",
        "",
        undefined,
        42,
      ]) {
        expect(legacyEndpointSocketName(value)).toBeNull();
      }
    });
  });

  describe("boundSocketName()", () => {
    it("binds the three known ids to their own sockets and nothing else", () => {
      expect(boundSocketName("local-obsidian-mcp")).toBe("vault-bridge.sock");
      expect(boundSocketName("command-center")).toBe("command-center.sock");
      expect(boundSocketName("viz-studio")).toBe("viz-studio.sock");
      expect(boundSocketName("shared-obsidian-mcp")).toBeNull();
      expect(boundSocketName("constructor")).toBeNull();
      expect(boundSocketName("__proto__")).toBeNull();
    });
  });

  describe("resolveBridgeSocket()", () => {
    const home = "/tmp/uds-resolve";
    const run = `${home}/.local/state/trinc/run`;

    beforeEach(() => {
      install(home);
    });

    it("binds each known id to its socket under the home's run directory", () => {
      expect(resolveBridgeSocket({ id: "local-obsidian-mcp", socketPath: "" })).toEqual({
        socketPath: `${run}/vault-bridge.sock`,
        expectedName: "vault-bridge.sock",
      });
      expect(resolveBridgeSocket({ id: "command-center" })).toEqual({
        socketPath: `${run}/command-center.sock`,
        expectedName: "command-center.sock",
      });
      expect(
        resolveBridgeSocket({ id: "viz-studio", httpEndpoint: "https://127.0.0.1:8798" })
      ).toEqual({ socketPath: `${run}/viz-studio.sock`, expectedName: "viz-studio.sock" });
    });

    it("accepts the bound socket spelled with ~ or absolutely", () => {
      for (const socketPath of [
        "~/.local/state/trinc/run/command-center.sock",
        `${run}/command-center.sock`,
      ]) {
        expect(resolveBridgeSocket({ id: "command-center", socketPath }).socketPath).toBe(
          `${run}/command-center.sock`
        );
      }
    });

    it("refuses a socketPath that names another bridge, another directory or another spelling", async () => {
      for (const socketPath of [
        "~/.local/state/trinc/run/vault-bridge.sock",
        `${run}/vault-bridge.sock`,
        "/tmp/elsewhere/command-center.sock",
        ".local/state/trinc/run/command-center.sock",
        `${home}/.local/state/trinc//run/command-center.sock`,
        "~/.local/state/trinc/run/../run/command-center.sock",
        "~other/.local/state/trinc/run/command-center.sock",
      ]) {
        await expectRefusal(
          () => resolveBridgeSocket({ id: "command-center", socketPath }),
          "BAD_SOCKET_PATH"
        );
      }
    });

    it("binds any other id to the socket its legacy endpoint record names by port", async () => {
      const shared = {
        id: "shared-obsidian-mcp",
        httpEndpoint: "http://127.0.0.1:8798",
        socketPath: "~/.local/state/trinc/run/vault-bridge.sock",
      };
      expect(resolveBridgeSocket(shared)).toEqual({
        socketPath: `${run}/vault-bridge.sock`,
        expectedName: "vault-bridge.sock",
      });
      await expectRefusal(
        () =>
          resolveBridgeSocket({
            ...shared,
            socketPath: "~/.local/state/trinc/run/command-center.sock",
          }),
        "BAD_SOCKET_PATH"
      );
      await expectRefusal(
        () => resolveBridgeSocket({ ...shared, httpEndpoint: "https://example.com:8798" }),
        "BAD_SOCKET_PATH"
      );
      await expectRefusal(
        () => resolveBridgeSocket({ id: "constructor", socketPath: "" }),
        "BAD_SOCKET_PATH"
      );
    });

    it("reports Unix-socket bridges as unavailable on mobile", async () => {
      const platform = Platform as { isMobile: boolean };
      platform.isMobile = true;
      try {
        await expectRefusal(
          () => resolveBridgeSocket({ id: "local-obsidian-mcp" }),
          "UNSUPPORTED_PLATFORM"
        );
        expect(() => resolveBridgeSocket({ id: "local-obsidian-mcp" })).toThrow(
          "unavailable on mobile"
        );
      } finally {
        platform.isMobile = false;
      }
    });

    it("refuses to run without Node when no deps are injected and globalThis.require is absent", async () => {
      setUdsClientDepsForTests(null);
      await expectRefusal(
        () => resolveBridgeSocket({ id: "local-obsidian-mcp" }),
        "UNSUPPORTED_PLATFORM"
      );
    });
  });

  describe("assertSocketTrust()", () => {
    it("accepts a 0600 socket owned by this uid in a 0700 run directory chain", async () => {
      const harness = makeHome();
      const socketPath = path.join(harness.runDir, VAULT);
      await serve(socketPath, (_req, res) => res.end());
      expect(() => assertSocketTrust(socketPath, VAULT)).not.toThrow();
      nothingDialled(harness);
    });

    it("refuses empty, undefined, relative and non-normalized paths before touching the disk", async () => {
      const { home, runDir } = makeHome();
      const lstat = jest.fn((p: string) => fs.lstatSync(p));
      const harness = install(home, {
        fs: { lstatSync: lstat as unknown as typeof fs.lstatSync },
      });
      for (const value of [
        "",
        undefined,
        "vault-bridge.sock",
        `${runDir}/../run/${VAULT}`,
        `${runDir}//${VAULT}`,
      ]) {
        await expectRefusal(() => assertSocketTrust(value, VAULT), "SOCKET_UNTRUSTED");
      }
      expect(lstat).not.toHaveBeenCalled();
      nothingDialled(harness);
    });

    it("refuses a socket outside the run directory or under another name", async () => {
      const harness = makeHome();
      await expectRefusal(
        () => assertSocketTrust(path.join(harness.home, VAULT), VAULT),
        "SOCKET_UNTRUSTED"
      );
      await expectRefusal(
        () => assertSocketTrust(path.join(harness.runDir, "command-center.sock"), VAULT),
        "SOCKET_UNTRUSTED"
      );
      nothingDialled(harness);
    });

    it("refuses a path whose hidden bind name would not fit macOS's 103 bytes", async () => {
      const home = `/tmp/uds-${"x".repeat(60)}`;
      const harness = install(home);
      await expectRefusal(
        () => assertSocketTrust(path.join(home, ...RUN_SEGMENTS, VAULT), VAULT),
        "SOCKET_PATH_TOO_LONG"
      );
      nothingDialled(harness);
    });

    it("refuses a missing run directory or socket with ENOENT", async () => {
      const partial = makeHome(2);
      await expectRefusal(
        () => assertSocketTrust(path.join(partial.runDir, VAULT), VAULT),
        "ENOENT"
      );
      const empty = makeHome();
      await expectRefusal(() => assertSocketTrust(path.join(empty.runDir, VAULT), VAULT), "ENOENT");
      nothingDialled(empty);
    });

    it("refuses a regular file, a 0777 socket and a 0755 run directory", async () => {
      const harness = makeHome();
      const socketPath = path.join(harness.runDir, VAULT);
      fs.writeFileSync(socketPath, "", { mode: 0o600 });
      await expectRefusal(() => assertSocketTrust(socketPath, VAULT), "SOCKET_UNTRUSTED");
      fs.unlinkSync(socketPath);

      await serve(socketPath, (_req, res) => res.end());
      fs.chmodSync(socketPath, 0o777);
      await expectRefusal(() => assertSocketTrust(socketPath, VAULT), "SOCKET_UNTRUSTED");
      fs.chmodSync(socketPath, 0o600);

      fs.chmodSync(harness.runDir, 0o755);
      await expectRefusal(() => assertSocketTrust(socketPath, VAULT), "SOCKET_UNTRUSTED");
      nothingDialled(harness);
    });

    it("refuses a symlinked or group-writable ancestor", async () => {
      const harness = makeHome();
      const state = path.join(harness.home, ".local", "state");
      const socketPath = path.join(harness.runDir, VAULT);
      fs.chmodSync(state, 0o775);
      await expectRefusal(() => assertSocketTrust(socketPath, VAULT), "SOCKET_UNTRUSTED");
      fs.chmodSync(state, 0o700);

      const trinc = path.join(state, "trinc");
      const moved = path.join(harness.home, "trinc-real");
      fs.renameSync(trinc, moved);
      fs.symlinkSync(moved, trinc);
      await expectRefusal(() => assertSocketTrust(socketPath, VAULT), "SOCKET_UNTRUSTED");
      nothingDialled(harness);
    });

    it("refuses an ACL allow entry and asks /bin/ls once per directory and socket per process", async () => {
      const harness = makeHome();
      const socketPath = path.join(harness.runDir, VAULT);
      await serve(socketPath, (_req, res) => res.end());
      const ls = jest.fn(() => "drwx------  2 me  staff  64 Nov 24 12:00 dir\n");
      install(harness.home, {
        os: { ...os, homedir: () => harness.home, platform: () => "darwin" },
        childProcess: { execFileSync: ls as unknown as typeof childProcess.execFileSync },
      });
      assertSocketTrust(socketPath, VAULT);
      assertSocketTrust(socketPath, VAULT);
      // Home, each run-directory level and the socket once; the second check asks nothing new.
      expect(ls).toHaveBeenCalledTimes(RUN_SEGMENTS.length + 2);

      const allow = jest.fn(
        () => "drwx------+ 2 me  staff  64 Nov 24 12:00 dir\n 0: user:guest allow search\n"
      );
      install(harness.home, {
        os: { ...os, homedir: () => harness.home, platform: () => "darwin" },
        childProcess: { execFileSync: allow as unknown as typeof childProcess.execFileSync },
      });
      await expectRefusal(() => assertSocketTrust(socketPath, VAULT), "SOCKET_UNTRUSTED");
    });

    it("refuses when /bin/ls times out, never counts the timeout as a pass and never dials", async () => {
      const harness = makeHome();
      const socketPath = path.join(harness.runDir, VAULT);
      await serve(socketPath, (_req, res) => res.end());
      // What execFileSync throws once its timeout has killed ls: code ETIMEDOUT, no exit status.
      const timedOut = Object.assign(new Error("spawnSync /bin/ls ETIMEDOUT"), {
        code: "ETIMEDOUT",
        status: null,
        signal: "SIGTERM",
      });
      const ls = jest.fn((file: string, args: string[], options: { timeout?: number }): string => {
        throw timedOut;
      });
      const darwin = install(harness.home, {
        os: { ...os, homedir: () => harness.home, platform: () => "darwin" },
        childProcess: { execFileSync: ls as unknown as typeof childProcess.execFileSync },
      });

      await expectRefusal(() => assertSocketTrust(socketPath, VAULT), "SOCKET_UNTRUSTED");
      // The next check asks about home again: the failed level was not remembered as checked.
      expect(() => assertSocketTrust(socketPath, VAULT)).toThrow(
        `could not read the ACL of ${harness.home} (ETIMEDOUT); refusing`
      );
      await expectRefusal(
        () =>
          udsRequest(
            { socketPath, expectedName: VAULT },
            {
              method: "GET",
              path: "/healthz",
              headers: { "X-MCP-Token": "test-token" },
              timeoutMs: 2000,
            }
          ),
        "SOCKET_UNTRUSTED"
      );
      expect(ls).toHaveBeenCalledTimes(3);
      for (const [file, args, options] of ls.mock.calls) {
        expect(file).toBe("/bin/ls");
        expect(args).toEqual(["-lde", harness.home]);
        expect(typeof options.timeout).toBe("number");
      }
      nothingDialled(darwin);
    });

    it("refuses an ACL allow entry that only the socket carries, after every directory passes", async () => {
      const harness = makeHome();
      const socketPath = path.join(harness.runDir, VAULT);
      await serve(socketPath, (_req, res) => res.end());
      const ls = jest.fn((file: string, args: string[]): string =>
        args[1] === socketPath
          ? `srw-------+ 1 me  staff  0 Nov 24 12:00 ${socketPath}\n 0: user:guest allow read,write\n`
          : `drwx------  2 me  staff  64 Nov 24 12:00 ${args[1]}\n`
      );
      const darwin = install(harness.home, {
        os: { ...os, homedir: () => harness.home, platform: () => "darwin" },
        childProcess: { execFileSync: ls as unknown as typeof childProcess.execFileSync },
      });

      expect(() => assertSocketTrust(socketPath, VAULT)).toThrow(
        `${socketPath} carries an ACL entry that grants access`
      );
      const levels = [harness.home];
      for (const part of RUN_SEGMENTS) levels.push(path.join(levels[levels.length - 1], part));
      expect(ls.mock.calls.map(([, args]) => args[1])).toEqual([...levels, socketPath]);
      await expectRefusal(() => assertSocketTrust(socketPath, VAULT), "SOCKET_UNTRUSTED");
      await expectRefusal(
        () =>
          udsRequest(
            { socketPath, expectedName: VAULT },
            {
              method: "GET",
              path: "/healthz",
              headers: { "X-MCP-Token": "test-token" },
              timeoutMs: 2000,
            }
          ),
        "SOCKET_UNTRUSTED"
      );
      nothingDialled(darwin);
    });
  });

  describe("udsRequest()", () => {
    it("serves GET /healthz over the socket, pinned with createConnection and no agent, host or port", async () => {
      const harness = makeHome();
      const socketPath = path.join(harness.runDir, VAULT);
      const seen: Array<{ host?: string; localPort?: number }> = [];
      await serve(socketPath, (req, res) => {
        seen.push({ host: req.headers.host, localPort: req.socket.localPort });
        res.setHeader("Content-Type", "application/json");
        res.end('{"ok":true}');
      });

      const response = await udsRequest(
        { socketPath, expectedName: VAULT },
        { method: "GET", path: "/healthz", timeoutMs: 2000 }
      );

      expect(response).toEqual({ status: 200, text: '{"ok":true}' });
      expect(seen).toHaveLength(1);
      expect(["localhost", "localhost:80"]).toContain(seen[0].host);
      expect(seen[0].localPort).toBeUndefined();
      expect(harness.request).toHaveBeenCalledTimes(1);
      const options = harness.request.mock.calls[0][0] as http.RequestOptions;
      expect(options).toMatchObject({ method: "GET", path: "/healthz", socketPath });
      expect(typeof options.createConnection).toBe("function");
      for (const key of ["agent", "host", "hostname", "port"]) {
        expect(options).not.toHaveProperty(key);
      }
      expect(harness.connect).toHaveBeenCalledWith({ path: socketPath });
    });

    it("sends the exact body bytes and headers, and resolves a non-2xx status", async () => {
      const harness = makeHome();
      const socketPath = path.join(harness.runDir, VAULT);
      let received: { body: string; headers: http.IncomingHttpHeaders } | undefined;
      await serve(socketPath, (req, res) => {
        let text = "";
        req.setEncoding("utf8");
        req.on("data", (chunk: string) => (text += chunk));
        req.on("end", () => {
          received = { body: text, headers: req.headers };
          res.statusCode = 401;
          res.end('{"ok":false}');
        });
      });
      const body = new TextEncoder().encode('{"tool":"obsidian_health","input":{"q":"café"}}');

      const response = await udsRequest(
        { socketPath, expectedName: VAULT },
        {
          method: "POST",
          path: "/mcp/tool",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": String(body.byteLength),
            "X-MCP-Token": "test-token",
          },
          body,
          timeoutMs: 2000,
        }
      );

      expect(response.status).toBe(401);
      expect(received?.body).toBe(new TextDecoder().decode(body));
      expect(received?.headers).toMatchObject({
        "content-type": "application/json",
        "content-length": String(body.byteLength),
        "x-mcp-token": "test-token",
      });
    });

    it("refuses empty, undefined, foreign and missing sockets without dialling", async () => {
      const harness = makeHome();
      const request = { method: "GET" as const, path: "/healthz", timeoutMs: 2000 };
      await expectRefusal(
        () => udsRequest({ socketPath: "", expectedName: VAULT }, request),
        "SOCKET_UNTRUSTED"
      );
      await expectRefusal(
        () =>
          udsRequest({ socketPath: undefined as unknown as string, expectedName: VAULT }, request),
        "SOCKET_UNTRUSTED"
      );
      await expectRefusal(
        () => udsRequest({ socketPath: `/tmp/elsewhere/${VAULT}`, expectedName: VAULT }, request),
        "SOCKET_UNTRUSTED"
      );
      await expectRefusal(
        () =>
          udsRequest(
            { socketPath: path.join(harness.runDir, "viz-studio.sock"), expectedName: VAULT },
            request
          ),
        "SOCKET_UNTRUSTED"
      );
      await expectRefusal(
        () =>
          udsRequest(
            { socketPath: path.join(harness.runDir, VAULT), expectedName: VAULT },
            request
          ),
        "ENOENT"
      );
      nothingDialled(harness);
    });

    it("destroys a request that outlives its deadline", async () => {
      const harness = makeHome();
      const socketPath = path.join(harness.runDir, VAULT);
      let markClosed: () => void = () => undefined;
      const closed = new Promise<void>((resolve) => {
        markClosed = resolve;
      });
      await serve(socketPath, (req) => {
        req.socket.on("close", () => markClosed());
      });

      await expectRefusal(
        () =>
          udsRequest(
            { socketPath, expectedName: VAULT },
            { method: "GET", path: "/slow", timeoutMs: 100 }
          ),
        "ETIMEDOUT"
      );
      await closed;
    });
  });

  describe("udsOpenStream()", () => {
    it("hands the response over and destroys the stream once it has been idle too long", async () => {
      const harness = makeHome();
      const socketPath = path.join(harness.runDir, VAULT);
      await serve(socketPath, (_req, res) => {
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        res.write(": subscribed\n\n");
      });

      const statuses: number[] = [];
      const failure = await new Promise<Error>((resolve) => {
        const req = udsOpenStream(
          { socketPath, expectedName: VAULT },
          {
            path: "/mcp/events?stream=research",
            headers: { Accept: "text/event-stream" },
            idleTimeoutMs: 150,
          },
          (res) => {
            statuses.push(res.statusCode ?? 0);
            res.on("error", () => undefined);
            res.resume();
          }
        );
        req.on("error", resolve);
      });

      expect(statuses).toEqual([200]);
      expect(failure).toBeInstanceOf(UdsClientError);
      expect((failure as UdsClientError).code).toBe("ETIMEDOUT");
    });

    it("throws ENOENT for a missing socket without dialling", async () => {
      const harness = makeHome();
      await expectRefusal(
        () =>
          udsOpenStream(
            { socketPath: path.join(harness.runDir, VAULT), expectedName: VAULT },
            { path: "/mcp/events?stream=research", idleTimeoutMs: 1000 },
            () => undefined
          ),
        "ENOENT"
      );
      nothingDialled(harness);
    });
  });
});
