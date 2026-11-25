#!/usr/bin/env node
// uds-health.mjs — the health check of the three TRINC bridges since they moved to Unix sockets (bridges-uds,
// 2026-11-24). For each bridge: GET /healthz over its socket in <home>/.local/state/trinc/run (home = os.homedir()),
// then one status line. Read-only: /healthz needs no token, and none is read or sent.
//
//   node /Users/myhome/TRINC/ops/tr-suite/uds-health.mjs                  # all three bridges
//   node /Users/myhome/TRINC/ops/tr-suite/uds-health.mjs vault-bridge     # only the bridges named
//
// Names: vault-bridge, command-center, viz-studio (a ".sock" suffix is accepted). A socket that a bridge client
// would refuse is reported as UNTRUSTED and not connected to: the clients' rules are that every level from home
// down is a real directory owned by this uid that group and others cannot write, the run directory and the socket
// grant them nothing, and no level carries an ACL allow entry. Every request is pinned to the socket: socketPath
// plus createConnection, never an agent (Node turns an empty socketPath into TCP to localhost:80, and agent: false
// ignores a createConnection pin).
// Exit 0 = every bridge asked about answered 200; 1 = at least one did not; 2 = an unknown name.
// Docs give this script as the health check; they never put a socket path or a one-liner on a command line.
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as http from "node:http";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";

const BRIDGES = [
  { name: "vault-bridge", label: "vault bridge (obsidian-copilot-bridge)" },
  { name: "command-center", label: "Command Center" },
  { name: "viz-studio", label: "Viz Studio" },
];
const TIMEOUT_MS = 3000;
const MAX_BODY_BYTES = 65536;

function octal(mode) {
  return (mode & 0o7777).toString(8).padStart(4, "0");
}

function homeDir() {
  const home = os.homedir();
  if (typeof home !== "string" || home === "" || !path.isAbsolute(home)) {
    throw new Error(`the home directory is not an absolute path: ${String(home)}`);
  }
  return home;
}

function lstatOrNull(p) {
  try {
    return fs.lstatSync(p);
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

/**
 * macOS ACLs are invisible to fs.Stats: ask /bin/ls, as the bridge clients do. Memoized per path. Returns why the
 * path's ACL makes a client refuse, or null. An ls that fails or times out is a refusal, as in the clients.
 */
const aclChecked = new Map();
function aclProblem(p) {
  if (process.platform !== "darwin") return null;
  if (!aclChecked.has(p)) {
    let problem = null;
    try {
      const out = execFileSync("/bin/ls", ["-lde", p], { encoding: "utf8", timeout: 2000 });
      if (out.split("\n").slice(1).some((line) => / allow /.test(line))) problem = `${p} carries an ACL entry that grants access`;
    } catch (err) {
      problem = `could not read the ACL of ${p} (${err.code || `ls exit ${err.status}`})`;
    }
    aclChecked.set(p, problem);
  }
  return aclChecked.get(p);
}

/** Why a client would not connect ({down} or {untrusted}), or null when the chain and the socket pass its rules. */
function posture(home, socketPath) {
  const uid = process.getuid();
  const levels = [home];
  for (const part of [".local", "state", "trinc", "run"]) levels.push(path.join(levels[levels.length - 1], part));
  for (let i = 0; i < levels.length; i++) {
    const p = levels[i];
    const isRunDir = i === levels.length - 1;
    const st = lstatOrNull(p);
    if (st === null) return { down: isRunDir ? "not running (no run directory)" : `not running (${p} does not exist)` };
    if (st.isSymbolicLink() || !st.isDirectory() || st.uid !== uid) {
      return { untrusted: `${p} is not a real directory owned by uid ${uid}` };
    }
    if ((st.mode & (isRunDir ? 0o077 : 0o022)) !== 0) {
      return { untrusted: `${p} has mode ${octal(st.mode)}${isRunDir ? "; want 0700" : " (group or others can write it)"}` };
    }
    const acl = aclProblem(p);
    if (acl !== null) return { untrusted: acl };
  }
  const s = lstatOrNull(socketPath);
  if (s === null) return { down: "not running (no socket)" };
  if (!s.isSocket() || s.uid !== uid) return { untrusted: `${path.basename(socketPath)} is not a socket owned by uid ${uid}` };
  if ((s.mode & 0o077) !== 0) return { untrusted: `the socket has mode ${octal(s.mode)}; want 0600` };
  const sockAcl = aclProblem(socketPath);
  if (sockAcl !== null) return { untrusted: sockAcl };
  return null;
}

function healthz(socketPath) {
  return new Promise((resolve) => {
    const started = Date.now();
    let settled = false;
    const done = (result) => {
      if (settled) return;
      settled = true;
      resolve({ ...result, ms: Date.now() - started });
    };
    const req = http.request(
      {
        socketPath,
        // The pin ignores the options Node hands createConnection, so it passes the timeout on, or it never arms.
        createConnection: () => net.connect({ path: socketPath, timeout: TIMEOUT_MS }),
        method: "GET",
        path: "/healthz",
        timeout: TIMEOUT_MS,
      },
      (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          if (raw.length < MAX_BODY_BYTES) raw += chunk;
        });
        res.on("end", () => done({ status: res.statusCode, body: raw }));
        res.on("error", (err) => done({ error: err.code || err.message }));
      }
    );
    req.on("timeout", () => req.destroy(Object.assign(new Error("no answer"), { code: "ETIMEDOUT" })));
    req.on("error", (err) => done({ error: err.code || err.message }));
    req.end();
  });
}

/** A few fields of the health payload; never the payload itself. */
function summary(body) {
  let j;
  try {
    j = JSON.parse(body);
  } catch {
    return "(the answer is not JSON)";
  }
  const clip = (v) => String(v).slice(0, 40);
  const parts = [];
  if (typeof j.status === "string") parts.push(`status=${clip(j.status)}`);
  if (typeof j.service === "string") parts.push(`service=${clip(j.service)}`);
  if (Array.isArray(j.tools)) parts.push(`tools=${j.tools.length}`);
  if (typeof j.uptime === "number") parts.push(`uptime=${Math.round(j.uptime)}s`);
  return parts.join(" ");
}

const ERRORS = {
  ENOENT: "not running (no socket)",
  ECONNREFUSED: "not running (stale socket: nothing accepts on it; the bridge's next start replaces it)",
  EACCES: "permission denied on the socket or its directory",
  ETIMEDOUT: `no answer within ${TIMEOUT_MS} ms`,
};

async function check(bridge, home) {
  const socketName = `${bridge.name}.sock`;
  const socketPath = path.join(home, ".local", "state", "trinc", "run", socketName);
  const line = (verdict, detail) => `${verdict.padEnd(9)} ${socketName.padEnd(20)} ${bridge.label}: ${detail}`;
  let p;
  try {
    p = posture(home, socketPath);
  } catch (err) {
    return { ok: false, text: line("ERROR", `could not check the socket's directory chain (${err.code || err.message}); not connected`) };
  }
  if (p !== null && p.down) return { ok: false, text: line("DOWN", p.down) };
  if (p !== null) return { ok: false, text: line("UNTRUSTED", `${p.untrusted}; not connected`) };
  const r = await healthz(socketPath);
  if (r.error) {
    const known = ERRORS[r.error];
    return { ok: false, text: line(known && r.error !== "EACCES" ? "DOWN" : "ERROR", known ?? r.error) };
  }
  if (r.status !== 200) return { ok: false, text: line("ERROR", `/healthz answered HTTP ${r.status}`) };
  return { ok: true, text: line("UP", `HTTP 200 ${summary(r.body)} (${r.ms} ms)`.replace(/\s+/g, " ")) };
}

const args = process.argv.slice(2);
if (args.includes("-h") || args.includes("--help")) {
  console.log(`usage: node uds-health.mjs [${BRIDGES.map((b) => b.name).join("|")} ...]`);
  process.exit(0);
}
const wanted = [];
for (const arg of args) {
  const bridge = BRIDGES.find((b) => b.name === arg.replace(/\.sock$/, ""));
  if (bridge === undefined) {
    console.error(`unknown bridge: ${arg} (known: ${BRIDGES.map((b) => b.name).join(", ")})`);
    process.exit(2);
  }
  if (!wanted.includes(bridge)) wanted.push(bridge);
}

const home = homeDir();
let bad = 0;
for (const bridge of wanted.length > 0 ? wanted : BRIDGES) {
  const result = await check(bridge, home);
  if (!result.ok) bad += 1;
  console.log(result.text);
}
process.exitCode = bad > 0 ? 1 : 0;
