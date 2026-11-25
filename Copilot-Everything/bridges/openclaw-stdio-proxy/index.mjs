#!/Users/myhome/.nvm/versions/node/v22.13.1/bin/node
// ^ ABSOLUTE interpreter on purpose (2026-09-01). `#!/usr/bin/env node` resolved through the
// ACP-provided PATH to /opt/homebrew/bin/node, which a Homebrew upgrade left dyld-broken
// (merve 1.2.2_1 wants libsimdutf.34, simdutf 9.1.0 ships .35) — the proxy then died at
// spawn and opencode marked command-center/viz-studio "failed", silently stripping every
// agent-chat MCP tool. This nvm path is the stack's canonical node (same literal path as
// the sudo-gate/phone-gate/searxng servers in ~/.config/opencode/opencode.jsonc); if that
// node version is ever removed, update all of them together.
// openclaw-stdio-proxy
//
// Transparent stdio<->HTTP JSON-RPC proxy for the Command Center and Viz Studio bridges, over
// their Unix sockets (bridges-uds, 2026-11-24).
//
// WHY THIS EXISTS: the bridge implements MCP JSON-RPC over HTTP and answers with
// `application/json`. opencode's remote-MCP client speaks the HTTP+SSE transport and rejects
// that with `Invalid content type, expected "text/event-stream"`. Rather than add an SSE
// surface to the bridge (or downgrade transport), this proxy exposes the bridge over stdio —
// the baseline MCP transport every client supports — and forwards frames verbatim.
//
// It is deliberately dumb: no tool catalog, no schema knowledge. Whatever tools the bridge
// serves (the OpenClaw pipeline tools plus the obsidian_* vault tools) pass straight through,
// so the proxy never drifts out of sync with the bridge.
//
// Config via env, both required:
//   OPENCLAW_BRIDGE_SOCKET  exactly <home>/.local/state/trinc/run/command-center.sock or
//                           .../viz-studio.sock (home = os.homedir()); nothing else is accepted.
//   OPENCLAW_BRIDGE_TOKEN   the bridge's bearer token.
// The bridges serve plain HTTP/1.1 on those sockets inside a private 0700 run directory, so
// there is no TCP, TLS or CA here and no code path that can dial TCP: every request goes through
// bridgesUdsRequest (the bridges-uds client block below), which checks the exact path it then
// connects to and pins the connection to that socket. Keep this ONE file with Node built-ins
// only: every deploy path copies just this file into the copilot plugin folder.

import { Buffer } from "node:buffer";
import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as http from "node:http";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { createInterface } from "node:readline";

// BEGIN bridges-uds client v1
// Byte-identical in four files; ops/tr-suite/verify.sh compares the text between the BEGIN and END lines:
//   Copilot-Everything/bridges/openclaw-stdio-proxy/index.mjs
//   Copilot-Everything/bridges/obsidian-stdio-adapter/index.mjs
//   Trevor Robey Intelligence Network Citations/openclaw-bridge/mcp/base-mcp.js
//   Copilot-Everything/scripts/mcp-health-check.js
// Same rules as assertSocketTrust/requestOverSocket in the bridges' uds-listener.ts. The socket must be exactly
// <home>/.local/state/trinc/run/<expectedName>. Every level from home down is a real directory owned by this uid that
// group and others cannot write, the run directory and the socket grant them nothing, and no level carries an ACL
// allow entry (an ls that fails is a refusal too). A missing home, directory or socket is refused with code ENOENT,
// without connecting. Requests are pinned to the socket with createConnection and never use an agent: Node turns an
// empty socketPath into TCP to localhost:80, and agent:false ignores a createConnection pin. Node calls the pin with
// the request's options, timeout included, but the pin connects to the checked path on its own, so it passes the
// timeout on itself (a pin that dropped it left the timeout option unarmed; with no timeout set, the connect options
// are exactly { path }); the 'timeout' event only reports, and the caller destroys. No globals besides JavaScript
// built-ins: every Node module comes in through deps = { fs, path, os, http, net, childProcess, Buffer }.
const BRIDGES_UDS_MAX_PATH_BYTES = 103;
const BRIDGES_UDS_HIDDEN_NAME_EXTRA_BYTES = 22;
const BRIDGES_UDS_ACL_SEEN = new Set();

function bridgesUdsError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function bridgesUdsRunDir(deps) {
  return deps.path.join(deps.os.homedir(), ".local", "state", "trinc", "run");
}

function bridgesUdsSocketPath(deps, name) {
  return deps.path.join(bridgesUdsRunDir(deps), name);
}

function bridgesUdsAssertNoAllowAcl(deps, p, key) {
  if (deps.os.platform() !== "darwin" || BRIDGES_UDS_ACL_SEEN.has(key)) return;
  let out;
  try {
    out = deps.childProcess.execFileSync("/bin/ls", ["-lde", p], { encoding: "utf8", timeout: 2000 });
  } catch (err) {
    const why = err && err.code ? err.code : `ls exit ${String(err && err.status)}`;
    throw bridgesUdsError("SOCKET_UNTRUSTED", `could not read the ACL of ${p} (${why}); refusing`);
  }
  if (out.split("\n").slice(1).some((line) => / allow /.test(line))) {
    throw bridgesUdsError("SOCKET_UNTRUSTED", `${p} carries an ACL entry that grants access`);
  }
  BRIDGES_UDS_ACL_SEEN.add(key);
}

function bridgesUdsAssertTrust(deps, socketPath, expectedName) {
  const { fs, path, os } = deps;
  const uid = os.userInfo().uid;
  const home = os.homedir();
  const dir = bridgesUdsRunDir(deps);
  if (typeof socketPath !== "string" || socketPath === "" || !path.isAbsolute(socketPath) || path.resolve(socketPath) !== socketPath) {
    throw bridgesUdsError("SOCKET_UNTRUSTED", `socket path must be absolute and normalized: ${String(socketPath)}`);
  }
  if (path.dirname(socketPath) !== dir || path.basename(socketPath) !== expectedName) {
    throw bridgesUdsError("SOCKET_UNTRUSTED", `socket must be ${path.join(dir, String(expectedName))}: ${socketPath}`);
  }
  const hiddenBytes = deps.Buffer.byteLength(dir) + 1 + deps.Buffer.byteLength(expectedName) + BRIDGES_UDS_HIDDEN_NAME_EXTRA_BYTES;
  if (Math.max(deps.Buffer.byteLength(socketPath), hiddenBytes) > BRIDGES_UDS_MAX_PATH_BYTES) {
    throw bridgesUdsError("SOCKET_PATH_TOO_LONG", `socket path is too long for macOS: ${socketPath}`);
  }
  const levels = [home];
  for (const part of [".local", "state", "trinc", "run"]) levels.push(path.join(levels[levels.length - 1], part));
  for (let i = 0; i < levels.length; i++) {
    const p = levels[i];
    let st;
    try {
      st = fs.lstatSync(p);
    } catch (err) {
      if (err && err.code === "ENOENT") throw bridgesUdsError("ENOENT", `${p} does not exist (bridge not running)`);
      throw err;
    }
    if (st.isSymbolicLink() || !st.isDirectory() || st.uid !== uid) {
      throw bridgesUdsError("SOCKET_UNTRUSTED", `${p} is not a real directory owned by uid ${uid}`);
    }
    const forbidden = i === levels.length - 1 ? 0o077 : 0o022;
    if ((st.mode & forbidden) !== 0) {
      throw bridgesUdsError("SOCKET_UNTRUSTED", `${p} has mode ${(st.mode & 0o7777).toString(8)}`);
    }
    bridgesUdsAssertNoAllowAcl(deps, p, `${st.dev}:${st.ino}`);
  }
  let sock;
  try {
    sock = fs.lstatSync(socketPath);
  } catch (err) {
    if (err && err.code === "ENOENT") throw bridgesUdsError("ENOENT", `${socketPath} does not exist (bridge not running)`);
    throw err;
  }
  if (!sock.isSocket() || sock.uid !== uid || (sock.mode & 0o077) !== 0) {
    throw bridgesUdsError("SOCKET_UNTRUSTED", `${socketPath} is not a private socket owned by uid ${uid}`);
  }
  bridgesUdsAssertNoAllowAcl(deps, socketPath, `${sock.dev}:${sock.ino}`);
}

function bridgesUdsRequest(deps, socketPath, expectedName, options) {
  bridgesUdsAssertTrust(deps, socketPath, expectedName);
  const opts = Object.assign({}, options);
  delete opts.agent;
  delete opts.host;
  delete opts.hostname;
  delete opts.port;
  delete opts.createConnection;
  delete opts.socketPath;
  const timeout = opts.timeout;
  const connectOptions = () => (timeout === undefined ? { path: socketPath } : { path: socketPath, timeout });
  return deps.http.request(Object.assign(opts, { socketPath, createConnection: () => deps.net.connect(connectOptions()) }));
}
// END bridges-uds client v1

const deps = { fs, path, os, http, net, childProcess, Buffer };

/** The only sockets this proxy carries a token to; the file name is the name the trust check expects. */
const BRIDGE_SOCKET_NAMES = ["command-center.sock", "viz-studio.sock"];
const BRIDGE_SOCKET = process.env.OPENCLAW_BRIDGE_SOCKET || "";
const BRIDGE_SOCKET_NAME = path.basename(BRIDGE_SOCKET);
const BRIDGE_TOKEN = process.env.OPENCLAW_BRIDGE_TOKEN || "";
const REQUEST_TIMEOUT_MS = 8_000;
/** Error code of a request the bridge left silent for REQUEST_TIMEOUT_MS. */
const REQUEST_TIMEOUT_CODE = "BRIDGE_TIMEOUT";

if (!BRIDGE_TOKEN) {
  process.stderr.write("openclaw-stdio-proxy: OPENCLAW_BRIDGE_TOKEN is required\n");
  process.exit(1);
}

// A wrong socket env fails here, at spawn, rather than on every frame. bridgesUdsRequest checks
// the same path again before each request, together with the directory chain and the socket.
if (
  !BRIDGE_SOCKET_NAMES.includes(BRIDGE_SOCKET_NAME) ||
  BRIDGE_SOCKET !== bridgesUdsSocketPath(deps, BRIDGE_SOCKET_NAME)
) {
  const expected = BRIDGE_SOCKET_NAMES.map((name) => bridgesUdsSocketPath(deps, name)).join(" or ");
  process.stderr.write(
    `openclaw-stdio-proxy: OPENCLAW_BRIDGE_SOCKET must be ${expected} (got ${JSON.stringify(BRIDGE_SOCKET)})\n`
  );
  process.exit(1);
}

/** POST one JSON-RPC frame to the bridge socket and resolve its parsed response. */
function forward(frame) {
  const body = JSON.stringify(frame);
  return new Promise((resolvePromise, rejectPromise) => {
    // bridgesUdsRequest throws before any connection (rejecting this promise) when the path, the
    // directory chain or the socket is not exactly what it must be (SOCKET_UNTRUSTED,
    // SOCKET_PATH_TOO_LONG), and with code ENOENT when the run directory or the socket is missing.
    const req = bridgesUdsRequest(deps, BRIDGE_SOCKET, BRIDGE_SOCKET_NAME, {
      method: "POST",
      path: "/",
      timeout: REQUEST_TIMEOUT_MS,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${BRIDGE_TOKEN}`,
        "Content-Length": Buffer.byteLength(body),
      },
    });
    // The block passes the `timeout` option to the socket it connects, which arms the 8 s timer;
    // this req.setTimeout re-arms the same socket timer, belt and braces. It is a socket-inactivity
    // timer, not a deadline.
    req.setTimeout(REQUEST_TIMEOUT_MS);
    req.on("response", (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        if (res.statusCode !== 200) {
          // The bridge answered and said no: a real answer, never retried.
          rejectPromise(new Error(`bridge HTTP ${res.statusCode}: ${text.slice(0, 200)}`));
          return;
        }
        try {
          resolvePromise(JSON.parse(text));
        } catch {
          rejectPromise(new Error(`bridge non-JSON response: ${text.slice(0, 200)}`));
        }
      });
    });
    req.on("error", rejectPromise);
    req.on("timeout", () => {
      const timeoutError = new Error("bridge request timed out");
      timeoutError.code = REQUEST_TIMEOUT_CODE;
      req.destroy(timeoutError);
    });
    req.write(body);
    req.end();
  });
}

const out = (obj) => process.stdout.write(`${JSON.stringify(obj)}\n`);

/**
 * Methods safe to retry: read-only and idempotent. `tools/call` is deliberately EXCLUDED — a
 * retried dispatch tool (e.g. video_pipeline_run) would fire its side effect twice.
 */
const RETRYABLE_METHODS = new Set(["tools/list"]);
const RETRY_DELAYS_MS = [250, 500, 1000, 2000, 4000];
/**
 * The failures that mean "the bridge is not up yet": no run directory or socket (ENOENT, from the
 * trust check or the connect), a socket file with no server behind it (ECONNREFUSED, left by a
 * crash), or no answer within the timeout.
 */
const RETRYABLE_ERROR_CODES = new Set(["ENOENT", "ECONNREFUSED", REQUEST_TIMEOUT_CODE]);

/**
 * Forward a frame, retrying "bridge not up yet" failures for idempotent methods only.
 *
 * Every bridge here is owned by an Obsidian plugin, so an agent chat opened while Obsidian is
 * still loading can reach this proxy before the plugin has published its socket. `initialize` is
 * answered locally for exactly that reason, but `tools/list` used to fail on the first
 * ECONNREFUSED — and because the client caches the tool list for the session's lifetime, the
 * server's tools then stayed missing for the WHOLE chat even though the bridge came up moments
 * later. Riding out the bind window here is what makes the tools reliably present.
 *
 * Anything else is a real answer and is surfaced at once, because waiting would not change it: an
 * HTTP status (401, 500, …), a non-JSON reply, or a refusal of the socket itself
 * (SOCKET_UNTRUSTED, SOCKET_PATH_TOO_LONG, EACCES, ENOTSOCK).
 */
async function forwardWithRetry(frame) {
  if (!RETRYABLE_METHODS.has(frame.method)) {
    return forward(frame);
  }
  let lastError;
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await forward(frame);
    } catch (err) {
      if (!RETRYABLE_ERROR_CODES.has(err.code)) throw err;
      lastError = err;
      const delay = RETRY_DELAYS_MS[attempt];
      if (delay === undefined) throw lastError;
      process.stderr.write(
        `openclaw-stdio-proxy: ${frame.method} failed (${err.message}); retrying in ${delay}ms\n`
      );
      await new Promise((resolveDelay) => setTimeout(resolveDelay, delay));
    }
  }
}

/**
 * Answer `initialize` locally instead of forwarding it.
 *
 * The bridge lives inside the Obsidian plugin, so during agent preload it is often not listening
 * yet. Forwarding the handshake made the client block on a connect timeout, which stalled ACP
 * session creation and left the agent UI stuck on "Loading agent models...". The handshake carries
 * no bridge-specific data, so answering it here makes spawn instant and decouples MCP readiness
 * from bridge readiness; tools are fetched later by `tools/list`, once the bridge is up.
 */
function localInitializeResult(frame) {
  const requested = frame?.params?.protocolVersion;
  return {
    jsonrpc: "2.0",
    id: frame.id,
    result: {
      protocolVersion: typeof requested === "string" ? requested : "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "openclaw-stdio-proxy", version: "1.0.0" },
    },
  };
}

createInterface({ input: process.stdin }).on("line", async (line) => {
  const text = line.trim();
  if (!text) return;

  let frame;
  try {
    frame = JSON.parse(text);
  } catch {
    out({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    return;
  }

  // A bare JSON null parses but is no request. Answer it and keep running: reading frame.method
  // on it used to crash the proxy, and the agent then lost this server for the whole session.
  if (frame === null) {
    out({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request" } });
    return;
  }

  if (frame.method === "initialize") {
    out(localInitializeResult(frame));
    return;
  }

  try {
    const response = await forwardWithRetry(frame);
    // Notifications carry no id and expect no reply; the bridge may still answer, so drop it.
    if (frame.id !== undefined && frame.id !== null) out(response);
  } catch (err) {
    if (frame.id !== undefined && frame.id !== null) {
      out({
        jsonrpc: "2.0",
        id: frame.id,
        error: { code: -32603, message: `proxy: ${err.message}` },
      });
    } else {
      process.stderr.write(`openclaw-stdio-proxy: ${err.message}\n`);
    }
  }
});

process.stderr.write(`openclaw-stdio-proxy: forwarding to unix:${BRIDGE_SOCKET}\n`);
