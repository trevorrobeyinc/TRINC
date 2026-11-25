#!/usr/bin/env node
// bridge-guard-live-check.mjs — live check of the browser guard on the three running bridges, over their Unix sockets
// (ARCHITECTURE.md §5 "Browser guard"; sockets since bridges-uds, 2026-11-24). Run it after any bridge redeploy, with
// Obsidian open:
//
//   node /Users/myhome/TRINC/ops/tr-suite/bridge-guard-live-check.mjs
//
// Each bridge serves plain HTTP/1.1 on <home>/.local/state/trinc/run/<name>.sock (home = os.homedir()): no TLS and no
// CA. Every request is pinned to the socket (socketPath plus createConnection, never an agent: agent: false ignores the
// pin, and an empty socketPath would make Node dial TCP localhost:80). Read-only: no token is read or sent. The GET
// probes ask the unauthenticated /healthz, the one POST is refused at the token gate before any route runs, and the
// browser-style probes are refused by design. Those refusals show up as BROWSER_REJECT events in
// ~/Library/Logs/trevclaw/audit.jsonl (vault bridge) and as console warnings (Command Center, Viz Studio).
// Last, a TCP tripwire: nothing may accept a connection on 8798, 8799 or 8800 at 127.0.0.1 or [::1]. Each probe
// connects and hangs up at once, sending nothing.
//
// Dropped with the move to sockets, on purpose:
// - the DNS-rebinding Host case (421): on a socket the guard skips its Host check, because the connection has no
//   local port and no browser can reach a Unix socket (it still refuses any Origin, Referer or cross-site
//   Sec-Fetch-Site, which the cases below check);
// - the Node global-fetch case: Node's global fetch cannot dial a Unix socket at all, so no client uses it here.
//
// Exit 0 = every bridge answered as expected and no TCP port accepted a connection; 1 = otherwise.
import * as fs from "node:fs";
import * as http from "node:http";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

export const BRIDGES = [
  { socket: "vault-bridge.sock", postPath: "/mcp/tool" },
  { socket: "command-center.sock", postPath: "/mcp" },
  { socket: "viz-studio.sock", postPath: "/mcp" },
];
export const TCP_TRIPWIRE = { hosts: ["127.0.0.1", "::1"], ports: [8798, 8799, 8800] };

const TIMEOUT_MS = 5000;
const TCP_TIMEOUT_MS = 2000;
const EVIL = "https://evil.example";

export function socketPathFor(name, home = os.homedir()) {
  return path.join(home, ".local", "state", "trinc", "run", name);
}

/** One request pinned to the socket. Resolves {status, cors} (the Access-Control-* header names) or {error}. */
export function request(socketPath, { method = "GET", path: urlPath = "/healthz", headers = {}, body } = {}) {
  return new Promise((resolve) => {
    if (typeof socketPath !== "string" || socketPath === "" || !path.isAbsolute(socketPath)) {
      resolve({ error: "BAD_SOCKET_PATH" });
      return;
    }
    const sent = { ...headers };
    if (body !== undefined) sent["content-length"] = Buffer.byteLength(body);
    const req = http.request(
      {
        socketPath,
        // The pin ignores the options Node hands createConnection, so it passes the timeout on, or it never arms.
        createConnection: () => net.connect({ path: socketPath, timeout: TIMEOUT_MS }),
        method,
        path: urlPath,
        headers: sent,
        timeout: TIMEOUT_MS,
      },
      (res) => {
        const cors = Object.keys(res.headers).filter((name) => name.startsWith("access-control-"));
        res.resume();
        res.on("end", () => resolve({ status: res.statusCode, cors }));
        res.on("error", (err) => resolve({ error: err.code || err.message }));
      }
    );
    req.on("timeout", () => req.destroy(Object.assign(new Error("no answer"), { code: "ETIMEDOUT" })));
    req.on("error", (err) => resolve({ error: err.code || err.message }));
    req.end(body);
  });
}

/** What each probe sends and the status the guard and the router must answer. */
export function guardCases(bridge) {
  return [
    ["program, no browser headers (GET /healthz)", {}, 200],
    ["no initiator (Sec-Fetch-Site: none)", { headers: { "sec-fetch-site": "none", "sec-fetch-mode": "no-cors", "sec-fetch-dest": "empty" } }, 200],
    [`unauthenticated POST ${bridge.postPath}`, { method: "POST", path: bridge.postPath, headers: { "content-type": "application/json" }, body: "{}" }, 401],
    ["browser Origin", { headers: { origin: EVIL } }, 403],
    ["browser Referer", { headers: { referer: `${EVIL}/page` } }, 403],
    ["browser Sec-Fetch-Site: cross-site", { headers: { "sec-fetch-site": "cross-site", "sec-fetch-mode": "cors" } }, 403],
    ["browser CORS preflight (OPTIONS + Origin)", { method: "OPTIONS", headers: { origin: EVIL, "access-control-request-method": "POST" } }, 403],
    ["OPTIONS from a program", { method: "OPTIONS" }, 405],
  ];
}

const UNREACHABLE = {
  ENOENT: "no socket; the bridge is not running. Is Obsidian open?",
  ECONNREFUSED: "stale socket; the bridge is not running. Is Obsidian open?",
};

/** Runs every case against one bridge; returns the number of unexpected results. */
export async function checkBridge(bridge, home = os.homedir(), log = console.log) {
  const socketPath = socketPathFor(bridge.socket, home);
  const name = bridge.socket.padEnd(20);
  let bad = 0;
  for (const [label, probe, want] of guardCases(bridge)) {
    const got = await request(socketPath, probe);
    if (got.error && UNREACHABLE[got.error]) {
      log(`FAIL  ${name} not reachable (${got.error}): ${UNREACHABLE[got.error]}`);
      return bad + 1;
    }
    const cors = got.cors ?? [];
    const ok = got.error === undefined && got.status === want && cors.length === 0;
    if (!ok) bad += 1;
    const seen = got.error ? `ERR ${got.error}` : `${got.status}${cors.length ? ` + ${cors.join(", ")}` : ""}`;
    log(`${ok ? "PASS" : "FAIL"}  ${name} ${label.padEnd(44)} got ${seen}, want ${want} and no Access-Control-* header`);
  }
  return bad;
}

/** Connects to host:port and hangs up at once. Resolves {open: true}, {open: false, code} or {open: null, code}. */
export function tcpProbe(host, port, connect = net.connect, timeoutMs = TCP_TIMEOUT_MS) {
  return new Promise((resolve) => {
    let settled = false;
    let timer = null;
    const socket = connect({ host, port });
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer !== null) clearTimeout(timer);
      socket.destroy();
      resolve(result);
    };
    timer = setTimeout(() => finish({ open: null, code: "ETIMEDOUT" }), timeoutMs);
    socket.once("connect", () => finish({ open: true }));
    socket.once("error", (err) => finish({ open: false, code: err.code || err.message }));
  });
}

/** The TCP tripwire: every host:port must refuse. Returns the number of unexpected results. */
export async function checkTripwire(targets = TCP_TRIPWIRE, connect = net.connect, log = console.log) {
  let bad = 0;
  for (const host of targets.hosts) {
    for (const port of targets.ports) {
      const where = (host.includes(":") ? `[${host}]:${port}` : `${host}:${port}`).padEnd(20);
      const r = await tcpProbe(host, port, connect);
      if (r.open === false) {
        log(`PASS  tcp ${where} refused (${r.code}): nothing listens there`);
        continue;
      }
      bad += 1;
      log(
        r.open
          ? `FAIL  tcp ${where} ACCEPTED a connection: something listens on a retired bridge port (find it with lsof -nP -iTCP:${port} -sTCP:LISTEN)`
          : `FAIL  tcp ${where} no answer within ${TCP_TIMEOUT_MS} ms (a listener with a full queue, or a filter): check with lsof`
      );
    }
  }
  return bad;
}

async function main() {
  let bad = 0;
  for (const bridge of BRIDGES) bad += await checkBridge(bridge);
  bad += await checkTripwire();
  console.log(bad ? `\n${bad} unexpected result(s)` : "\nall as expected");
  return bad ? 1 : 0;
}

let invokedPath = "";
try {
  invokedPath = process.argv[1] ? fs.realpathSync(process.argv[1]) : "";
} catch {
  invokedPath = "";
}
if (invokedPath === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
