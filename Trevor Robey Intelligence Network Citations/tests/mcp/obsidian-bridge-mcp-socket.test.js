"use strict";

// The vault-bridge lane over a REAL Unix socket (bridges-uds, 2026-11-24).
//
// Each test points HOME at a short temporary directory from fs.mkdtempSync("/tmp/uds-") (macOS
// socket paths must fit 103 bytes, so never os.tmpdir()), builds the run directory chain there, and
// serves a fake vault bridge with plain node:http on <home>/.local/state/trinc/run/vault-bridge.sock.
// HOME is put back and the directory removed after every test, so nothing here can reach the real
// bridge, its token or the real run directory; every adapter gets an injected token and Miyo request.
// net.connect, net.createConnection and http.request are wrapped while a call runs (and restored) to
// prove what the client actually dialled: the socket path (with the request's timeout when one is
// set) and never a host or a port, and nothing at all when the trust check refuses the socket.

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");

const { createObsidianBridgeMcp } = require("../../openclaw-bridge/mcp/obsidian-bridge-mcp/index.js");
const { bridgeSocketPath, bridgeSocketRequest } = require("../../openclaw-bridge/mcp/base-mcp.js");

const TOKEN = "socket-test-token";

/** A short temporary home with the run directory chain (every level 0700); HOME points at it. */
function useTempHome() {
  const prevHome = process.env.HOME;
  const home = fs.mkdtempSync("/tmp/uds-");
  const run = path.join(home, ".local", "state", "trinc", "run");
  fs.mkdirSync(run, { recursive: true, mode: 0o700 });
  for (let p = run; p !== home; p = path.dirname(p)) fs.chmodSync(p, 0o700);
  process.env.HOME = home;
  return {
    home,
    run,
    sock: path.join(run, "vault-bridge.sock"),
    restore() {
      // Put HOME back exactly; never leave it unset mid-file (os.homedir() would fall back to the real home).
      if (prevHome === undefined) delete process.env.HOME;
      else process.env.HOME = prevHome;
      fs.rmSync(home, { recursive: true, force: true });
      assert.equal(fs.existsSync(home), false, "the temporary home is gone");
    },
  };
}

/** A fake vault bridge: plain node:http on the socket path, chmod 0600; handler(record, res) answers. */
async function startFakeBridge(sock, handler) {
  const seen = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const record = {
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: Buffer.concat(chunks).toString("utf8"),
        localPort: req.socket.localPort,
        remoteAddress: req.socket.remoteAddress,
      };
      seen.push(record);
      handler(record, res);
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(sock, resolve);
  });
  fs.chmodSync(sock, 0o600);
  return {
    seen,
    close() {
      server.closeAllConnections();
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

function answerJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) });
  res.end(body);
}

/** Answers like the bridge: health ok, the semantic tool with one hit, anything else empty. */
function vaultBridge(record, res) {
  const tool = record.url === "/mcp/tool" ? JSON.parse(record.body).tool : "";
  if (tool === "miyo_search_context") {
    answerJson(res, 200, { ok: true, data: { results: [{ path: "OpenClaw/x/Analyst.md", chunk_text: "socket hit", score: 0.5 }] } });
    return;
  }
  answerJson(res, 200, { ok: true, data: { status: "healthy" } });
}

/**
 * Leave a socket file with no listener, the way a SIGKILLed bridge does: bind a hidden name, link it
 * to the published name, close (libuv removes only the bound name, so the published one stays).
 */
async function makeStaleSocket(h) {
  const hidden = path.join(h.run, ".vault-bridge.sock.stale.tmp");
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(hidden, resolve);
  });
  fs.linkSync(hidden, h.sock);
  fs.chmodSync(h.sock, 0o600);
  await new Promise((resolve) => server.close(() => resolve()));
  assert.ok(fs.lstatSync(h.sock).isSocket(), "the published name outlives its listener");
}

/** Record every dial made while fn runs, then restore the real dialers. */
async function watchDialers(fn) {
  const seen = { connect: [], createConnection: [], request: [] };
  const real = { connect: net.connect, createConnection: net.createConnection, request: http.request };
  net.connect = function connect(...args) {
    seen.connect.push(args);
    return real.connect.apply(this, args);
  };
  net.createConnection = function createConnection(...args) {
    seen.createConnection.push(args);
    return real.createConnection.apply(this, args);
  };
  http.request = function request(...args) {
    seen.request.push(args);
    return real.request.apply(this, args);
  };
  try {
    await fn();
  } finally {
    net.connect = real.connect;
    net.createConnection = real.createConnection;
    http.request = real.request;
  }
  return seen;
}

function adapter(extra = {}) {
  const warns = [];
  const mcp = createObsidianBridgeMcp({
    authToken: TOKEN,
    logger: { info() {}, warn: (m) => warns.push(String(m)), error() {} },
    miyoRequest: async () => {
      throw new Error("Miyo is not part of these tests");
    },
    ...extra,
  });
  return { mcp, warns };
}

function assertNoTcpOptions(opts) {
  for (const key of ["host", "hostname", "port", "agent"]) {
    assert.equal(Object.prototype.hasOwnProperty.call(opts, key), false, `no ${key} option reaches http.request`);
  }
}

test("a bridge call goes over the vault socket with the same path, body and headers, and no TCP", async () => {
  const h = useTempHome();
  let bridge = null;
  try {
    bridge = await startFakeBridge(h.sock, vaultBridge);
    assert.equal(bridgeSocketPath(), h.sock, "the path comes from os.homedir(), at call time");
    const { mcp } = adapter();
    let result;
    const dialed = await watchDialers(async () => {
      result = await mcp.health();
    });
    assert.deepEqual(result, { ok: true, data: { status: "healthy" } });

    assert.equal(bridge.seen.length, 1);
    const got = bridge.seen[0];
    assert.equal(got.method, "POST");
    assert.equal(got.url, "/mcp/tool");
    const body = JSON.parse(got.body);
    assert.equal(body.tool, "obsidian_health");
    assert.equal(body.input.vault, "My Digital Garden");
    assert.equal(got.headers["content-type"], "application/json");
    assert.equal(got.headers.authorization, `Bearer ${TOKEN}`);
    assert.equal(got.headers["x-mcp-token"], TOKEN);
    assert.match(got.headers["x-mcp-timestamp"], /^\d+$/);
    assert.match(got.headers["x-mcp-nonce"], /^[0-9a-f-]{36}$/i);
    assert.equal(got.headers["x-mcp-body-sha256"], crypto.createHash("sha256").update(got.body, "utf8").digest("hex"));
    assert.equal(got.headers["content-length"], String(Buffer.byteLength(got.body)));
    assert.equal(got.headers["transfer-encoding"], undefined);
    // Node sends Host localhost (localhost:80 with the createConnection pin); the guards skip Host on a socket.
    assert.match(got.headers.host, /^localhost(:80)?$/);
    // A Unix-socket peer has no port and no address: this request did not arrive over TCP.
    assert.equal(got.localPort, undefined);
    assert.equal(got.remoteAddress, undefined);

    assert.equal(dialed.request.length, 1);
    const opts = dialed.request[0][0];
    assert.equal(opts.socketPath, h.sock);
    assert.equal(typeof opts.createConnection, "function");
    assertNoTcpOptions(opts);
    assert.deepEqual(dialed.connect, [[{ path: h.sock }]], "one connect, to the socket path only");
    assert.deepEqual(dialed.createConnection, []);
  } finally {
    if (bridge) await bridge.close();
    h.restore();
  }
});

test("bridgeSocketRequest drops host, hostname, port, agent, socketPath and createConnection", async () => {
  const h = useTempHome();
  let bridge = null;
  try {
    bridge = await startFakeBridge(h.sock, vaultBridge);
    let hostileDials = 0;
    const dialed = await watchDialers(async () => {
      const status = await new Promise((resolve, reject) => {
        const req = bridgeSocketRequest({
          method: "GET",
          path: "/healthz",
          host: "127.0.0.1",
          hostname: "127.0.0.1",
          port: 8798,
          agent: false,
          socketPath: path.join(h.home, "elsewhere.sock"),
          createConnection: () => {
            hostileDials += 1;
            throw new Error("a caller's dialer must never be used");
          },
        });
        req.on("error", reject);
        req.on("response", (res) => {
          res.resume();
          res.on("end", () => resolve(res.statusCode));
        });
        req.end();
      });
      assert.equal(status, 200);
    });
    assert.equal(hostileDials, 0);
    assert.equal(bridge.seen.length, 1);
    assert.equal(bridge.seen[0].url, "/healthz");
    const opts = dialed.request[0][0];
    assert.equal(opts.socketPath, h.sock);
    assertNoTcpOptions(opts);
    assert.deepEqual(dialed.connect, [[{ path: h.sock }]]);
    assert.deepEqual(dialed.createConnection, []);
  } finally {
    if (bridge) await bridge.close();
    h.restore();
  }
});

test("bridgeSocketRequest passes its timeout option to the socket: 'timeout' fires with no req.setTimeout", async () => {
  const h = useTempHome();
  let bridge = null;
  try {
    bridge = await startFakeBridge(h.sock, () => {
      // accepts the request and never answers
    });
    let elapsed = null;
    const dialed = await watchDialers(async () => {
      await new Promise((resolve, reject) => {
        const started = Date.now();
        // Nothing calls req.setTimeout: only the socket's own timer, armed by the connect, can raise 'timeout'.
        const req = bridgeSocketRequest({ method: "GET", path: "/healthz", timeout: 200 });
        const guard = setTimeout(() => {
          reject(new Error("no 'timeout' event within 1500 ms: the timeout option never reached the socket"));
          req.destroy();
        }, 1500);
        req.on("timeout", () => {
          elapsed = Date.now() - started;
          clearTimeout(guard);
          req.destroy();
        });
        req.on("error", (err) => {
          // The destroy reports "socket hang up"; an error before 'timeout' is a failure.
          if (elapsed === null) reject(err);
        });
        req.on("close", () => {
          clearTimeout(guard);
          resolve();
        });
        req.end();
      });
    });
    assert.ok(typeof elapsed === "number" && elapsed < 1500, `'timeout' fired ${elapsed} ms after the request opened`);
    assert.equal(bridge.seen.length, 1, "the request reached the bridge, which never answered");
    const opts = dialed.request[0][0];
    assert.equal(opts.socketPath, h.sock);
    assert.equal(opts.timeout, 200);
    assertNoTcpOptions(opts);
    assert.deepEqual(dialed.connect, [[{ path: h.sock, timeout: 200 }]], "one connect, to the socket path, with the timeout");
    assert.deepEqual(dialed.createConnection, []);
  } finally {
    if (bridge) await bridge.close();
    h.restore();
  }
});

test("priorResearch falls back from Miyo to the vault socket, in order, context only", async () => {
  const h = useTempHome();
  let bridge = null;
  try {
    bridge = await startFakeBridge(h.sock, vaultBridge);
    const { mcp } = adapter();
    const out = await mcp.priorResearch({ topic: "aspirin" });
    assert.deepEqual(out.map((r) => [r.path, r.context_only]), [["OpenClaw/x/Analyst.md", true]]);
    assert.deepEqual(bridge.seen.map((r) => JSON.parse(r.body).tool), ["obsidian_health", "miyo_search_context"]);
  } finally {
    if (bridge) await bridge.close();
    h.restore();
  }
});

// Every refusal happens before any request is built or any connection is dialled, so the bridge
// (when one is listening) never sees the token. `serve` starts a reachable fake bridge first, which
// makes each case meaningful: without the check, the request would have gone through.
const REFUSALS = [
  {
    name: "run directory 0755",
    serve: true,
    error: "bridge socket untrusted",
    arrange: (h) => fs.chmodSync(h.run, 0o755),
  },
  {
    name: "socket 0777",
    serve: true,
    error: "bridge socket untrusted",
    arrange: (h) => fs.chmodSync(h.sock, 0o777),
  },
  {
    name: "group/other-writable ancestor (state 0777)",
    serve: true,
    error: "bridge socket untrusted",
    arrange: (h) => fs.chmodSync(path.join(h.home, ".local", "state"), 0o777),
  },
  {
    name: "symlinked run directory",
    serve: true,
    error: "bridge socket untrusted",
    arrange: (h) => {
      const real = path.join(h.home, "real-run");
      fs.renameSync(h.run, real);
      fs.symlinkSync(real, h.run);
    },
  },
  {
    name: "symlinked ancestor (trinc)",
    serve: true,
    error: "bridge socket untrusted",
    arrange: (h) => {
      const trinc = path.dirname(h.run);
      const real = path.join(h.home, "real-trinc");
      fs.renameSync(trinc, real);
      fs.symlinkSync(real, trinc);
    },
  },
  {
    name: "regular file at the socket path",
    serve: false,
    error: "bridge socket untrusted",
    arrange: (h) => fs.writeFileSync(h.sock, "", { mode: 0o600 }),
    after: (h) => assert.ok(fs.lstatSync(h.sock).isFile(), "the file is left untouched"),
  },
  {
    name: "empty HOME (would otherwise be a relative path)",
    serve: false,
    error: "bridge socket untrusted",
    arrange: () => {
      process.env.HOME = "";
    },
  },
  {
    name: "relative HOME",
    serve: false,
    error: "bridge socket untrusted",
    arrange: () => {
      process.env.HOME = "relative/home";
    },
  },
  {
    name: "socket path over 103 bytes",
    serve: false,
    error: "bridge socket path too long",
    arrange: (h) => {
      process.env.HOME = path.join(h.home, "h".repeat(60));
    },
  },
  {
    name: "no socket (bridge not running)",
    serve: false,
    error: "bridge unavailable (ENOENT)",
    arrange: () => {},
  },
  {
    name: "no run directory",
    serve: false,
    error: "bridge unavailable (ENOENT)",
    arrange: (h) => fs.rmSync(h.run, { recursive: true }),
  },
];

for (const c of REFUSALS) {
  test(`refused before any connection: ${c.name}`, async () => {
    const h = useTempHome();
    let bridge = null;
    try {
      if (c.serve) bridge = await startFakeBridge(h.sock, vaultBridge);
      c.arrange(h);
      const { mcp, warns } = adapter();
      let result;
      let records;
      const dialed = await watchDialers(async () => {
        result = await mcp.health();
        records = await mcp.searchNotes({ query: "aspirin" });
      });
      assert.deepEqual(result, { ok: false, error: c.error });
      assert.deepEqual(records, [], "fail-soft");
      assert.equal(dialed.request.length, 0, "no request was built");
      assert.equal(dialed.connect.length + dialed.createConnection.length, 0, "nothing was dialled");
      if (bridge) assert.equal(bridge.seen.length, 0, "the bridge never saw the token");
      if (c.error === "bridge socket untrusted") {
        assert.ok(warns.some((w) => w.includes("SOCKET_UNTRUSTED")), "the refusal is logged with its reason");
      }
      assert.ok(!warns.some((w) => w.includes(TOKEN)), "no log line carries the token");
      if (c.after) c.after(h);
    } finally {
      if (bridge) await bridge.close();
      h.restore();
    }
  });
}

test("a stale socket left by a dead bridge is ECONNREFUSED: one connect to the path, then 'bridge unavailable'", async () => {
  const h = useTempHome();
  try {
    await makeStaleSocket(h);
    const { mcp } = adapter();
    let result;
    const dialed = await watchDialers(async () => {
      result = await mcp.health();
    });
    assert.deepEqual(result, { ok: false, error: "bridge unavailable (ECONNREFUSED)" });
    assert.deepEqual(dialed.connect, [[{ path: h.sock }]], "the only dial is the socket path");
    assert.deepEqual(dialed.createConnection, []);
  } finally {
    h.restore();
  }
});

test("a bridge that never answers is aborted at the timeout and fails soft", async () => {
  const h = useTempHome();
  let bridge = null;
  try {
    bridge = await startFakeBridge(h.sock, () => {
      // never answers
    });
    const { mcp } = adapter({ timeoutMs: 200 });
    const result = await mcp.health();
    assert.equal(result.ok, false);
    assert.match(result.error, /abort/i);
    assert.equal(bridge.seen.length, 1, "the request reached the bridge before the abort");
  } finally {
    if (bridge) await bridge.close();
    h.restore();
  }
});

test("a non-JSON reply over the socket is a fail-soft HTTP error", async () => {
  const h = useTempHome();
  let bridge = null;
  try {
    bridge = await startFakeBridge(h.sock, (record, res) => {
      res.writeHead(502, { "Content-Type": "text/plain" });
      res.end("bad gateway");
    });
    const { mcp } = adapter();
    assert.deepEqual(await mcp.health(), { ok: false, error: "HTTP 502", status: 502 });
    assert.deepEqual(await mcp.searchNotes({ query: "x" }), []);
  } finally {
    if (bridge) await bridge.close();
    h.restore();
  }
});
