#!/usr/bin/env node
// mcp-health-check.js — dev probe of the canonical vault bridge: POST /mcp/tool obsidian_health over its Unix
// socket, vault-bridge.sock (bridges-uds, 2026-11-24: the bridge listens on no TCP port any more).
//
//   node /Users/myhome/TRINC/Copilot-Everything/scripts/mcp-health-check.js
//
// The socket path comes from os.homedir() through the bridges-uds client block below, never from the bridge
// config; only the bearer token is read from that config (OBSIDIAN_MCP_CONFIG, else the bridge's local config).
// It prints a JSON summary (statusCode, ok, error, cli, routing) on stdout, which official-plugin-miyo-check.sh
// reads, and never prints the token. Exit 1 on any failure.

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const net = require("node:net");
const childProcess = require("node:child_process");
const { Buffer } = require("node:buffer");
const crypto = require("node:crypto");

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
const SOCKET_NAME = "vault-bridge.sock";
const TIMEOUT_MS = 15000;

const configPath =
  process.env.OBSIDIAN_MCP_CONFIG ||
  "/Users/myhome/TRINC/Copilot-Everything/bridges/obsidian-copilot-bridge/config/obsidian-cli-mcp.local.json";

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const body = JSON.stringify({ tool: "obsidian_health", args: {} });
const bodySha = crypto.createHash("sha256").update(body).digest("hex");

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

let req = null;
try {
  req = bridgesUdsRequest(deps, bridgesUdsSocketPath(deps, SOCKET_NAME), SOCKET_NAME, {
    path: "/mcp/tool",
    method: "POST",
    timeout: TIMEOUT_MS,
    headers: {
      Authorization: `Bearer ${config.security.authToken}`,
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
      "X-MCP-Timestamp": String(Date.now()),
      "X-MCP-Nonce": crypto.randomUUID(),
      "X-MCP-Body-SHA256": bodySha,
    },
  });
} catch (error) {
  // Refused before any connection: ENOENT (the bridge is not running), SOCKET_UNTRUSTED or SOCKET_PATH_TOO_LONG.
  fail(`${error.code || "Error"}: ${error.message}`);
}

if (req !== null) {
  req.on("response", (res) => {
    let raw = "";
    res.setEncoding("utf8");
    res.on("data", (chunk) => {
      raw += chunk;
    });
    res.on("end", () => {
      try {
        const parsed = JSON.parse(raw);
        const output = {
          statusCode: res.statusCode,
          ok: parsed.ok,
          error: parsed.error || null,
          cli: parsed.data?.backends?.cli?.capabilities
            ? {
                available: parsed.data.backends.cli.capabilities.available,
                supportedOps: parsed.data.backends.cli.capabilities.supportedOps,
                constraints: parsed.data.backends.cli.capabilities.constraints,
                diagnostics: parsed.data.backends.cli.capabilities.diagnostics || null,
              }
            : null,
          routing: parsed.data?.routing
            ? {
                operationMap: parsed.data.routing.operationMap,
                reasons: parsed.data.routing.reasons,
              }
            : null,
        };
        process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
      } catch (error) {
        process.stderr.write(`Failed to parse response: ${error}\n${raw}\n`);
        process.exitCode = 1;
      }
    });
  });

  req.on("timeout", () => {
    req.destroy(new Error(`no answer from ${SOCKET_NAME} within ${TIMEOUT_MS} ms`));
  });

  req.on("error", (error) => {
    fail(`${error}`);
  });

  req.write(body);
  req.end();
}
