#!/usr/bin/env node
// Fake Command Center and Viz Studio bridges for scripts/test-profiles.mjs (bridges-uds, 2026-11-24).
//
// It lives under test/, which the monorepo transport lint skips, because it serves HTTP: on Unix
// sockets only, never TCP. It refuses to start unless HOME is a temporary /tmp/uds-* directory, so it
// can never touch the real run directory; test-profiles.mjs starts it, and the adapter, with that HOME.
//
// It makes <HOME>/.local/state/trinc/run the way the bridges do (every new level 0700, sockets 0600),
// serves plain HTTP/1.1 on command-center.sock and viz-studio.sock there, and prints one JSON line per
// event on stdout: {"event":"ready"} once both sockets are served, then {"event":"request", ...} for
// each request, with the socket name, method, url, headers, body length and the parsed JSON-RPC body.
//
//   GET /healthz   200 {"status":"ok"}, no token needed (as on the bridges)
//   POST /mcp      tools/list: fixtures/viz-tools.json on the Viz socket, an empty list on Command Center
//                  tools/call: text content {"fake":true,"socket":<socket name>,"tool":<tool name>}
//
// FAKE_BRIDGE_MODE=hang-viz-list never answers tools/list on the Viz socket (a hung bridge). SIGTERM
// closes both servers, which removes the sockets; a SIGKILL leaves them behind as stale sockets.

import { Buffer } from "node:buffer";
import * as fs from "node:fs";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";

const home = os.homedir();
if (!/^\/tmp\/uds-[A-Za-z0-9]+$/.test(home)) {
  process.stderr.write(`fake-bridge: HOME must be a temporary /tmp/uds-* directory, got ${home}\n`);
  process.exit(2);
}
const MODE = process.env.FAKE_BRIDGE_MODE || "serve";
const VIZ_TOOLS = JSON.parse(fs.readFileSync(new URL("./fixtures/viz-tools.json", import.meta.url), "utf8"));
const RUN_DIR = path.join(home, ".local", "state", "trinc", "run");
const SOCKET_NAMES = ["command-center.sock", "viz-studio.sock"];

const emit = (event) => process.stdout.write(`${JSON.stringify(event)}\n`);

function reply(res, status, payload) {
  const text = JSON.stringify(payload);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(text) });
  res.end(text);
}

function handlerFor(socketName) {
  return (req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      let rpc = null;
      try {
        rpc = raw ? JSON.parse(raw) : null;
      } catch {
        rpc = null;
      }
      emit({
        event: "request",
        socket: socketName,
        method: req.method,
        url: req.url,
        headers: req.headers,
        bodyBytes: Buffer.byteLength(raw),
        rpc,
      });
      if (req.method === "GET" && req.url === "/healthz") return reply(res, 200, { status: "ok" });
      if (req.method !== "POST" || req.url !== "/mcp" || rpc === null) return reply(res, 404, { error: "not found" });
      if (rpc.method === "tools/list") {
        if (MODE === "hang-viz-list" && socketName === "viz-studio.sock") return undefined; // never answer
        const tools = socketName === "viz-studio.sock" ? VIZ_TOOLS : [];
        return reply(res, 200, { jsonrpc: "2.0", id: rpc.id, result: { tools } });
      }
      if (rpc.method === "tools/call") {
        const text = JSON.stringify({ fake: true, socket: socketName, tool: rpc.params?.name });
        return reply(res, 200, { jsonrpc: "2.0", id: rpc.id, result: { content: [{ type: "text", text }] } });
      }
      return reply(res, 200, { jsonrpc: "2.0", id: rpc.id, error: { code: -32601, message: `fake bridge: no ${rpc.method}` } });
    });
  };
}

fs.mkdirSync(RUN_DIR, { recursive: true, mode: 0o700 });
const servers = [];
for (const name of SOCKET_NAMES) {
  const socketPath = path.join(RUN_DIR, name);
  const server = http.createServer(handlerFor(name));
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(socketPath, resolveListen);
  });
  fs.chmodSync(socketPath, 0o600); // bind made it 0777 & ~umask; the bridges' sockets are 0600
  servers.push(server);
}

let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  for (const server of servers) {
    server.closeAllConnections();
    server.close();
  }
  // stdout is an asynchronous pipe on macOS: exit only once every request line has been flushed.
  process.stdout.write(`${JSON.stringify({ event: "stopped" })}\n`, () => process.exit(0));
}
process.on("SIGTERM", shutdown);
// The test holds our stdin open; when it ends (the test finished or died), stop as well.
process.stdin.on("end", shutdown);
process.stdin.resume();

emit({ event: "ready", mode: MODE });
