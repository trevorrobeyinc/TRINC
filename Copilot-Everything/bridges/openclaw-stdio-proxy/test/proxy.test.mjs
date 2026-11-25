// Tests for openclaw-stdio-proxy over the bridges' Unix sockets (bridges-uds, 2026-11-24).
// Run from the proxy folder: node --test test/
//
// Every test makes its own short home with fs.mkdtempSync("/tmp/uds-"): a socket path and the hidden
// name a real bridge binds first must fit macOS's 103 bytes, so never os.tmpdir() or the scratchpad.
// It spawns the proxy with HOME set to that home, serves a fake bridge (plain node:http, made 0600
// before it gets its name, as the real helper publishes) on <home>/.local/state/trinc/run/<name>,
// and removes the home afterwards. Nothing here listens on TCP or touches the real run directory.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as http from "node:http";
import * as net from "node:net";
import * as path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const PROXY = fileURLToPath(new URL("../index.mjs", import.meta.url));
const SHEBANG = "#!/Users/myhome/.nvm/versions/node/v22.13.1/bin/node";
const TOKEN = "proxy-test-token";
const TOOL = { name: "obsidian_health", description: "Bridge health", inputSchema: { type: "object", properties: {} } };
const TIMEOUT = { timeout: 30_000 };

/** Per-test cleanup, last in first out: a proxy dies before its bridge closes, and both before the home goes. */
function cleanup(t) {
  const steps = [];
  t.after(async () => {
    while (steps.length > 0) await steps.pop()();
  });
  return (step) => steps.push(step);
}

function makeHome(defer) {
  const home = fs.mkdtempSync("/tmp/uds-");
  defer(() => fs.rmSync(home, { recursive: true, force: true }));
  return home;
}

function runDirOf(home) {
  return path.join(home, ".local", "state", "trinc", "run");
}

/** <home>/.local/state/trinc/run with every level created 0700, then the run directory set to runMode. */
function makeRunDir(home, runMode = 0o700) {
  let dir = home;
  for (const part of [".local", "state", "trinc", "run"]) {
    dir = path.join(dir, part);
    fs.mkdirSync(dir, { mode: 0o700 });
  }
  fs.chmodSync(dir, runMode);
  return dir;
}

let hiddenSeq = 0;

/** Listen on a hidden name in dir and make it 0600, so the socket is private before it is published. */
async function listenHidden(server, dir, name) {
  hiddenSeq += 1;
  const hidden = path.join(dir, `.${name}.${process.pid}.${hiddenSeq}.tmp`);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(hidden, () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  fs.chmodSync(hidden, 0o600);
  return hidden;
}

/** The default fake-bridge answer: JSON-RPC, pretty-printed as the real bridges send it. */
function answerJsonRpc(record, res) {
  const frame = JSON.parse(record.body);
  let reply;
  if (frame.method === "tools/list") {
    reply = { jsonrpc: "2.0", id: frame.id, result: { tools: [TOOL] } };
  } else if (frame.method === "tools/call") {
    reply = { jsonrpc: "2.0", id: frame.id, result: { content: [{ type: "text", text: "ok" }] } };
  } else {
    reply = { jsonrpc: "2.0", id: frame.id ?? null, error: { code: -32603, message: `Unknown method: ${frame.method}` } };
  }
  const text = JSON.stringify(reply, null, 2);
  res.writeHead(200, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(text) });
  res.end(text);
}

/**
 * A fake bridge on <run>/<name>. It records every request (request line, raw headers in order, body)
 * and hands it to respond(record, res, count). The 0600 socket is moved onto its name in one rename.
 */
async function startBridge(defer, home, name, respond = answerJsonRpc) {
  const dir = runDirOf(home);
  const requests = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const record = {
        requestLine: `${req.method} ${req.url} HTTP/${req.httpVersion}`,
        rawHeaders: req.rawHeaders,
        body: Buffer.concat(chunks).toString("utf8"),
      };
      requests.push(record);
      respond(record, res, requests.length);
    });
  });
  const hidden = await listenHidden(server, dir, name);
  fs.renameSync(hidden, path.join(dir, name));
  defer(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      })
  );
  return { requests };
}

/** Leave a socket file with nothing behind it, as a SIGKILLed bridge does: connecting gives ECONNREFUSED. */
async function leaveStaleSocket(home, name) {
  const dir = runDirOf(home);
  const server = net.createServer();
  const hidden = await listenHidden(server, dir, name);
  fs.linkSync(hidden, path.join(dir, name));
  await new Promise((resolve) => server.close(() => resolve())); // removes only the hidden name
}

function proxyEnv(home, overrides = {}) {
  return {
    HOME: home,
    OPENCLAW_BRIDGE_SOCKET: path.join(runDirOf(home), "command-center.sock"),
    OPENCLAW_BRIDGE_TOKEN: TOKEN,
    ...overrides,
  };
}

/** Spawn the proxy as opencode does (JSON-RPC lines on stdin and stdout, notices on stderr), with exactly env. */
function startProxy(defer, env) {
  const child = spawn(process.execPath, [PROXY], { env, stdio: ["pipe", "pipe", "pipe"] });
  child.stdin.on("error", () => {}); // the proxy may exit before it reads stdin
  let stderr = "";
  let closed = false;
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const exited = new Promise((resolve) => {
    child.on("close", (code, signal) => {
      closed = true;
      resolve({ code, signal });
    });
  });
  const lines = [];
  const waiters = [];
  let stdoutClosed = false;
  createInterface({ input: child.stdout })
    .on("line", (line) => {
      const waiter = waiters.shift();
      if (waiter) waiter.resolve(line);
      else lines.push(line);
    })
    .on("close", () => {
      stdoutClosed = true;
      for (const waiter of waiters.splice(0)) waiter.reject(new Error(`proxy stdout closed; stderr:\n${stderr}`));
    });
  defer(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    await exited;
  });
  return {
    exited,
    stderr: () => stderr,
    unread: () => lines.slice(),
    send(frame) {
      child.stdin.write(`${typeof frame === "string" ? frame : JSON.stringify(frame)}\n`);
    },
    nextLine() {
      if (lines.length > 0) return Promise.resolve(lines.shift());
      if (stdoutClosed) return Promise.reject(new Error(`proxy stdout closed; stderr:\n${stderr}`));
      return new Promise((resolve, reject) => waiters.push({ resolve, reject }));
    },
    async next() {
      return JSON.parse(await this.nextLine());
    },
    waitForStderr(re) {
      return new Promise((resolve, reject) => {
        const stop = () => {
          child.stderr.off("data", check);
          child.off("close", onClose);
        };
        const check = () => {
          if (re.test(stderr)) {
            stop();
            resolve(stderr);
          } else if (closed) {
            onClose();
          }
        };
        const onClose = () => {
          stop();
          reject(new Error(`proxy exited before stderr matched ${re}; stderr:\n${stderr}`));
        };
        child.stderr.on("data", check);
        child.on("close", onClose);
        check();
      });
    },
    end() {
      child.stdin.end();
      return exited;
    },
  };
}

test("stays one executable file: absolute shebang, Node built-ins only, one way to reach a bridge", () => {
  const source = fs.readFileSync(PROXY, "utf8");
  assert.equal(source.slice(0, source.indexOf("\n")), SHEBANG);
  assert.notEqual(fs.statSync(PROXY).mode & 0o111, 0, "opencode execs index.mjs directly, so it must stay executable");
  const specifiers = [...source.matchAll(/^import .+ from "([^"]+)";$/gm)].map((m) => m[1]);
  assert.ok(specifiers.length > 0);
  for (const specifier of specifiers) assert.match(specifier, /^node:/);
  for (const banned of ["node:https", "node:tls", "node:http2"]) assert.ok(!specifiers.includes(banned), banned);
  assert.doesNotMatch(source, /\brequire\(|\bimport\(/);
  assert.doesNotMatch(source, /OPENCLAW_BRIDGE_URL|NODE_EXTRA_CA_CERTS|mkcert/);
  // The pasted bridges-uds client block holds the file's only request and its only connect.
  assert.equal(source.split("http.request(").length - 1, 1);
  assert.equal(source.split("net.connect(").length - 1, 1);
  assert.match(source, /^\/\/ BEGIN bridges-uds client v1$[\s\S]+^\/\/ END bridges-uds client v1$/m);
});

test("answers initialize locally, with no bridge running and nothing created", TIMEOUT, async (t) => {
  const defer = cleanup(t);
  const home = makeHome(defer);
  const proxy = startProxy(defer, proxyEnv(home));
  proxy.send({ jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: "2025-06-18" } });
  assert.deepEqual(await proxy.next(), {
    jsonrpc: "2.0",
    id: 0,
    result: {
      protocolVersion: "2025-06-18",
      capabilities: { tools: {} },
      serverInfo: { name: "openclaw-stdio-proxy", version: "1.0.0" },
    },
  });
  proxy.send({ jsonrpc: "2.0", id: 1, method: "initialize" });
  assert.equal((await proxy.next()).result.protocolVersion, "2024-11-05");
  assert.deepEqual(await proxy.end(), { code: 0, signal: null });
  assert.equal(fs.existsSync(path.join(home, ".local")), false, "a client never creates the run directory");
});

test("carries tools/list to each bridge socket and back on one compact line", TIMEOUT, async (t) => {
  for (const name of ["command-center.sock", "viz-studio.sock"]) {
    await t.test(name, async (st) => {
      const defer = cleanup(st);
      const home = makeHome(defer);
      makeRunDir(home);
      const bridge = await startBridge(defer, home, name);
      const socketPath = path.join(runDirOf(home), name);
      const proxy = startProxy(defer, proxyEnv(home, { OPENCLAW_BRIDGE_SOCKET: socketPath }));
      proxy.send({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });
      const line = await proxy.nextLine();
      assert.deepEqual(JSON.parse(line), { jsonrpc: "2.0", id: 1, result: { tools: [TOOL] } });
      assert.equal(line, JSON.stringify(JSON.parse(line)), "the pretty-printed reply comes back compact");
      assert.equal(bridge.requests.length, 1);
      assert.deepEqual(await proxy.end(), { code: 0, signal: null });
      assert.equal(proxy.stderr(), `openclaw-stdio-proxy: forwarding to unix:${socketPath}\n`);
    });
  }
});

test("sends exactly this request head and a compact body", TIMEOUT, async (t) => {
  const defer = cleanup(t);
  const home = makeHome(defer);
  makeRunDir(home);
  const bridge = await startBridge(defer, home, "command-center.sock");
  const proxy = startProxy(defer, proxyEnv(home));
  proxy.send('{ "jsonrpc": "2.0", "id": 7, "method": "tools/call", "params": { "name": "obsidian_health", "arguments": {} } }');
  assert.equal((await proxy.next()).id, 7);
  const body = '{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"obsidian_health","arguments":{}}}';
  assert.equal(bridge.requests.length, 1);
  const [request] = bridge.requests;
  assert.equal(request.requestLine, "POST / HTTP/1.1");
  // Over the pinned socket Node writes Host localhost:80; the bridges' guard skips Host on a socket.
  assert.deepEqual(request.rawHeaders, [
    "Content-Type",
    "application/json",
    "Accept",
    "application/json",
    "Authorization",
    `Bearer ${TOKEN}`,
    "Content-Length",
    String(Buffer.byteLength(body)),
    "Host",
    "localhost:80",
    "Connection",
    "close",
  ]);
  assert.equal(request.body, body);
  assert.deepEqual(await proxy.end(), { code: 0, signal: null });
});

test("retries tools/list while the bridge is not up (ENOENT), then succeeds", TIMEOUT, async (t) => {
  const defer = cleanup(t);
  const home = makeHome(defer);
  const proxy = startProxy(defer, proxyEnv(home));
  proxy.send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  await proxy.waitForStderr(/tools\/list failed \([^\n]*does not exist \(bridge not running\)\); retrying in 250ms\n/);
  makeRunDir(home);
  const bridge = await startBridge(defer, home, "command-center.sock");
  assert.deepEqual(await proxy.next(), { jsonrpc: "2.0", id: 2, result: { tools: [TOOL] } });
  assert.equal(bridge.requests.length, 1);
  assert.deepEqual(await proxy.end(), { code: 0, signal: null });
});

test("retries tools/list on a stale socket (ECONNREFUSED), then succeeds", TIMEOUT, async (t) => {
  const defer = cleanup(t);
  const home = makeHome(defer);
  makeRunDir(home);
  await leaveStaleSocket(home, "command-center.sock");
  const proxy = startProxy(defer, proxyEnv(home));
  proxy.send({ jsonrpc: "2.0", id: 3, method: "tools/list" });
  await proxy.waitForStderr(/tools\/list failed \(connect ECONNREFUSED [^\n]*\); retrying in 250ms\n/);
  const bridge = await startBridge(defer, home, "command-center.sock"); // renamed over the stale name
  assert.deepEqual(await proxy.next(), { jsonrpc: "2.0", id: 3, result: { tools: [TOOL] } });
  assert.equal(bridge.requests.length, 1);
  assert.deepEqual(await proxy.end(), { code: 0, signal: null });
});

test("never retries tools/call", TIMEOUT, async (t) => {
  const defer = cleanup(t);
  const home = makeHome(defer);
  const proxy = startProxy(defer, proxyEnv(home));
  proxy.send({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "video_pipeline_run", arguments: {} } });
  const reply = await proxy.next();
  assert.equal(reply.id, 4);
  assert.equal(reply.error.code, -32603);
  assert.match(reply.error.message, /^proxy: [^\n]*does not exist \(bridge not running\)$/);
  assert.doesNotMatch(proxy.stderr(), /retrying/);
  assert.deepEqual(await proxy.end(), { code: 0, signal: null });
});

test("refuses an untrusted socket without connecting or retrying (run directory 0755)", TIMEOUT, async (t) => {
  const defer = cleanup(t);
  const home = makeHome(defer);
  const run = makeRunDir(home, 0o755);
  const bridge = await startBridge(defer, home, "command-center.sock");
  const proxy = startProxy(defer, proxyEnv(home));
  proxy.send({ jsonrpc: "2.0", id: 5, method: "tools/list" });
  assert.deepEqual(await proxy.next(), {
    jsonrpc: "2.0",
    id: 5,
    error: { code: -32603, message: `proxy: ${run} has mode 755` },
  });
  assert.equal(bridge.requests.length, 0, "the token never reached the socket");
  assert.doesNotMatch(proxy.stderr(), /retrying/);
  assert.deepEqual(await proxy.end(), { code: 0, signal: null });
});

test("exits 1 with one stderr line on a missing or wrong socket env or an empty token", TIMEOUT, async (t) => {
  const defer = cleanup(t);
  const home = makeHome(defer);
  const run = makeRunDir(home);
  const allowed = `${path.join(run, "command-center.sock")} or ${path.join(run, "viz-studio.sock")}`;
  const socketError = `openclaw-stdio-proxy: OPENCLAW_BRIDGE_SOCKET must be ${allowed} (got `;
  const tokenError = "openclaw-stdio-proxy: OPENCLAW_BRIDGE_TOKEN is required\n";
  const cases = [
    ["socket env missing", { OPENCLAW_BRIDGE_SOCKET: undefined }, socketError],
    ["socket env empty", { OPENCLAW_BRIDGE_SOCKET: "" }, socketError],
    ["the vault bridge's socket", { OPENCLAW_BRIDGE_SOCKET: path.join(run, "vault-bridge.sock") }, socketError],
    ["another name in the run directory", { OPENCLAW_BRIDGE_SOCKET: path.join(run, "other.sock") }, socketError],
    ["the right name outside the run directory", { OPENCLAW_BRIDGE_SOCKET: path.join(home, "command-center.sock") }, socketError],
    ["a relative path", { OPENCLAW_BRIDGE_SOCKET: "command-center.sock" }, socketError],
    ["a path that is not normalized", { OPENCLAW_BRIDGE_SOCKET: `${run}/../run/command-center.sock` }, socketError],
    ["token missing", { OPENCLAW_BRIDGE_TOKEN: undefined }, tokenError],
    ["token empty", { OPENCLAW_BRIDGE_TOKEN: "" }, tokenError],
  ];
  for (const [label, overrides, expected] of cases) {
    const proxy = startProxy(defer, proxyEnv(home, overrides));
    const { code } = await proxy.end();
    const stderr = proxy.stderr();
    assert.equal(code, 1, label);
    assert.match(stderr, /^[^\n]+\n$/, `${label}: exactly one stderr line`);
    assert.ok(stderr.startsWith(expected), `${label}: ${stderr}`);
    assert.ok(!stderr.includes(TOKEN), `${label}: the token is never printed`);
    assert.deepEqual(proxy.unread(), [], `${label}: nothing on stdout`);
  }
});

test("answers a JSON null line with -32600 Invalid Request and keeps running", TIMEOUT, async (t) => {
  const defer = cleanup(t);
  const home = makeHome(defer);
  makeRunDir(home);
  const bridge = await startBridge(defer, home, "command-center.sock");
  const proxy = startProxy(defer, proxyEnv(home));
  proxy.send("null");
  assert.deepEqual(await proxy.next(), { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request" } });
  proxy.send({ jsonrpc: "2.0", id: 6, method: "tools/list" });
  assert.deepEqual(await proxy.next(), { jsonrpc: "2.0", id: 6, result: { tools: [TOOL] } });
  assert.equal(bridge.requests.length, 1, "null is answered locally, never forwarded");
  assert.deepEqual(await proxy.end(), { code: 0, signal: null });
});

test("times out a silent bridge after 8 s and retries tools/list", TIMEOUT, async (t) => {
  const defer = cleanup(t);
  const home = makeHome(defer);
  makeRunDir(home);
  // The first request is never answered; the retry is.
  const bridge = await startBridge(defer, home, "command-center.sock", (record, res, count) => {
    if (count > 1) answerJsonRpc(record, res);
  });
  const proxy = startProxy(defer, proxyEnv(home));
  const started = Date.now();
  proxy.send({ jsonrpc: "2.0", id: 8, method: "tools/list" });
  assert.deepEqual(await proxy.next(), { jsonrpc: "2.0", id: 8, result: { tools: [TOOL] } });
  const elapsed = Date.now() - started;
  assert.ok(elapsed >= 8_000 && elapsed < 15_000, `answered after ${elapsed} ms`);
  assert.match(proxy.stderr(), /tools\/list failed \(bridge request timed out\); retrying in 250ms\n/);
  assert.equal(bridge.requests.length, 2);
  assert.deepEqual(await proxy.end(), { code: 0, signal: null });
});
