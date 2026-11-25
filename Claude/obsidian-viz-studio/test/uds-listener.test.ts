// Tests for src/bridge/uds-listener.ts, the Unix-socket helper the Viz Studio bridge serves through
// (bridges-uds, 2026-11-24; the D11 matrix of the bridges-uds design). Run: npm test
//
// The helper is byte-identical in Command Center, Viz Studio and the vault bridge (ops/tr-suite/verify.sh
// compares the copies); these cases run against Viz Studio's copy and its socket name, viz-studio.sock.
// Every test makes its own short home with fs.mkdtempSync("/tmp/uds-") and removes it afterwards: macOS
// sun_path holds 104 bytes, so a home under os.tmpdir() (/var/folders/...) would not fit. Nothing touches
// the real home directory: the helper is given `home`, and child processes are given HOME.
// ACL cases are not covered here (they would need chmod +a); the helper's own verification covers them.
import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import type * as http from "node:http";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  MAX_SOCKET_PATH_BYTES,
  SOCKET_NAMES,
  UdsListenerError,
  assertSocketTrust,
  listenHttpOnSocket,
  probeSocket,
  requestOverSocket,
  runDir,
  socketPathFor,
} from "../src/bridge/uds-listener.ts";
import type { UdsListener, UdsListenOptions } from "../src/bridge/uds-listener.ts";
import { refuseBrowserRequest } from "../src/bridge/browser-guard.ts";
import type { BrowserRefusal } from "../src/bridge/browser-guard.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CHILD = path.join(HERE, "support", "uds-child.ts");
const NAME = SOCKET_NAMES.vizStudio;
const UID = typeof process.getuid === "function" ? process.getuid() : -1;
const LEVELS = [".local", "state", "trinc", "run"];
const GET_HEALTH: http.RequestOptions = { method: "GET", path: "/healthz" };

// ---------------------------------------------------------------------------------------------
// Bookkeeping: everything a test opens is closed, stopped or removed after it.

const homes: string[] = [];
const listeners: UdsListener[] = [];
const netServers: net.Server[] = [];
const children: ChildProcess[] = [];

afterEach(async () => {
  await Promise.allSettled(listeners.splice(0).map((l) => l.close()));
  await Promise.allSettled(netServers.splice(0).map((s) => closeNet(s)));
  await Promise.allSettled(children.splice(0).map((c) => stopChild(c)));
  for (const home of homes.splice(0)) fs.rmSync(home, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------------------------
// Helpers.

function makeHome(): string {
  const home = fs.mkdtempSync("/tmp/uds-");
  homes.push(home);
  return home;
}

/** Make <home>/.local/state/trinc/run by hand, every level 0700, and return the run directory. */
function makeRunDir(home: string): string {
  let dir = home;
  for (const level of LEVELS) {
    dir = path.join(dir, level);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    fs.chmodSync(dir, 0o700);
  }
  return dir;
}

function modeOf(p: string): number {
  return fs.lstatSync(p).mode & 0o7777;
}

function entries(dir: string): string[] {
  return fs.readdirSync(dir).sort();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(cond: () => boolean, timeoutMs: number): Promise<boolean> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (cond()) return true;
    await sleep(10);
  }
  return cond();
}

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} did not happen within ${ms} ms`)), ms);
  });
  return Promise.race([p, late]).finally(() => clearTimeout(timer));
}

interface Seen {
  url: string | undefined;
  host: string | undefined;
  localPort: number | undefined;
  remoteAddress: string | undefined;
  refusal: BrowserRefusal | null;
}

/** A bridge-like handler: {"tag"} JSON on any path, and a response that never ends on /events. */
function handler(tag: string, seen: Seen[] = []): http.RequestListener {
  return (req, res) => {
    seen.push({
      url: req.url,
      host: req.headers.host,
      localPort: req.socket.localPort,
      remoteAddress: req.socket.remoteAddress,
      refusal: refuseBrowserRequest(req.headers, req.socket.localPort),
    });
    if (req.url === "/events") {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
      res.write(": stream open\n\n");
      return; // never ends, like an SSE stream
    }
    const body = JSON.stringify({ tag });
    res.writeHead(200, { "content-type": "application/json", "content-length": String(Buffer.byteLength(body)) });
    res.end(body);
  };
}

async function start(tag: string, opts: UdsListenOptions, seen?: Seen[]): Promise<UdsListener> {
  const listener = await listenHttpOnSocket(handler(tag, seen), opts);
  listeners.push(listener);
  return listener;
}

interface Reply {
  status: number;
  tag: string | undefined;
}

/** GET through requestOverSocket, the one way the bridges' own code makes a bridge request. */
function get(socketPath: string, home: string, reqPath = "/healthz", headers: Record<string, string> = {}): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = requestOverSocket(socketPath, NAME, { method: "GET", path: reqPath, headers, timeout: 2000 }, home);
    req.on("response", (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("error", reject);
      res.on("end", () => {
        let tag: string | undefined;
        try {
          tag = JSON.parse(Buffer.concat(chunks).toString("utf8")).tag;
        } catch {
          tag = undefined;
        }
        resolve({ status: res.statusCode ?? 0, tag });
      });
    });
    req.on("timeout", () => req.destroy(new Error(`GET ${reqPath} timed out`)));
    req.on("error", reject);
    req.end();
  });
}

/** Open a response that never ends; resolves once its first bytes arrived. */
function openStream(socketPath: string, home: string): Promise<{ closed: Promise<void> }> {
  return new Promise((resolve, reject) => {
    const req = requestOverSocket(socketPath, NAME, { method: "GET", path: "/events" }, home);
    req.on("response", (res) => {
      const closed = new Promise<void>((done) => res.on("close", () => done()));
      res.on("error", () => {}); // "aborted" once the server ends the connection
      res.once("data", () => resolve({ closed }));
    });
    req.on("error", reject);
    req.end();
  });
}

function listenNet(p: string): Promise<net.Server> {
  return new Promise((resolve, reject) => {
    const s = net.createServer((c) => c.destroy());
    s.once("error", reject);
    s.listen(p, () => {
      netServers.push(s);
      resolve(s);
    });
  });
}

function closeNet(s: net.Server): Promise<void> {
  return new Promise((resolve) => {
    if (!s.listening) {
      resolve();
      return;
    }
    s.close(() => resolve());
  });
}

/**
 * Leave a stale socket at p: a server listens, its file is renamed aside, the server closes (libuv
 * unlinks the path it bound, which is gone), and the file comes back with nothing listening on it.
 */
async function makeStale(p: string): Promise<void> {
  const aside = path.join(path.dirname(p), "stale-maker.aside");
  const s = net.createServer();
  await new Promise<void>((resolve, reject) => {
    s.once("error", reject);
    s.listen(p, () => resolve());
  });
  fs.renameSync(p, aside);
  await closeNet(s);
  fs.renameSync(aside, p);
}

interface Child {
  proc: ChildProcess;
  /** "ready <pid>" or "refused <code>". */
  outcome: Promise<string>;
}

/** Start test/support/uds-child.ts with HOME set to `home`; with startAt (epoch ms) it starts listening at that instant. */
function spawnChild(home: string, startAt = 0): Child {
  const proc = spawn(process.execPath, ["--experimental-strip-types", "--no-warnings", CHILD, NAME, String(startAt)], {
    env: { ...process.env, HOME: home },
    stdio: ["pipe", "pipe", "pipe"],
  });
  children.push(proc);
  const outcome = new Promise<string>((resolve, reject) => {
    let out = "";
    let err = "";
    const timer = setTimeout(() => reject(new Error(`child gave no outcome within 15 s: ${out} ${err}`)), 15_000);
    proc.stdout?.on("data", (c: Buffer) => {
      out += c.toString("utf8");
      const line = out.split("\n").find((l) => /^(ready|refused) /.test(l));
      if (line !== undefined) {
        clearTimeout(timer);
        resolve(line);
      }
    });
    proc.stderr?.on("data", (c: Buffer) => {
      err += c.toString("utf8");
    });
    proc.once("exit", (code, signal) => {
      clearTimeout(timer);
      reject(new Error(`child exited (${code ?? signal}) before it reported: ${out} ${err}`));
    });
  });
  outcome.catch(() => {}); // a test that failed before awaiting it must not also see an unhandled rejection
  return { proc, outcome };
}

/** Close the child's stdin (it closes its listener and exits); SIGKILL it if it lingers. */
async function stopChild(proc: ChildProcess): Promise<void> {
  if (proc.exitCode !== null || proc.signalCode !== null) return;
  const exited = new Promise<void>((resolve) => proc.once("exit", () => resolve()));
  proc.stdin?.end();
  const timer = setTimeout(() => proc.kill("SIGKILL"), 2000);
  await exited;
  clearTimeout(timer);
}

async function killChild(proc: ChildProcess): Promise<void> {
  const exited = new Promise<void>((resolve) => proc.once("exit", () => resolve()));
  proc.kill("SIGKILL");
  await exited;
}

async function rejectsWith(promise: Promise<unknown>, code: string): Promise<UdsListenerError> {
  let caught: unknown = null;
  try {
    await promise;
  } catch (err) {
    caught = err;
  }
  assert.ok(
    caught instanceof UdsListenerError,
    `expected UdsListenerError ${code}, got ${caught === null ? "success" : String(caught)}`
  );
  assert.equal(caught.code, code, caught.message);
  return caught;
}

function throwsWith(fn: () => unknown, code: string): UdsListenerError {
  let caught: unknown = null;
  try {
    const value = fn();
    // A request that should have been refused must not be left connecting.
    if (value !== null && typeof value === "object" && "destroy" in value) (value as http.ClientRequest).destroy();
  } catch (err) {
    caught = err;
  }
  assert.ok(
    caught instanceof UdsListenerError,
    `expected UdsListenerError ${code}, got ${caught === null ? "no error" : String(caught)}`
  );
  assert.equal(caught.code, code, caught.message);
  return caught;
}

// ---------------------------------------------------------------------------------------------
// Paths and names.

test("socket paths come from the home directory and the three fixed names; other names are refused", () => {
  const home = "/tmp/uds-example";
  assert.equal(runDir(home), "/tmp/uds-example/.local/state/trinc/run");
  assert.equal(socketPathFor(SOCKET_NAMES.vizStudio, home), "/tmp/uds-example/.local/state/trinc/run/viz-studio.sock");
  assert.equal(socketPathFor(SOCKET_NAMES.commandCenter, home), "/tmp/uds-example/.local/state/trinc/run/command-center.sock");
  assert.equal(socketPathFor(SOCKET_NAMES.vaultBridge, home), "/tmp/uds-example/.local/state/trinc/run/vault-bridge.sock");
  // Without a home argument the path comes from os.homedir() (a string check: nothing is created).
  assert.equal(socketPathFor(NAME), path.join(os.homedir(), ".local", "state", "trinc", "run", "viz-studio.sock"));
  assert.ok(Object.isFrozen(SOCKET_NAMES));
  assert.equal(MAX_SOCKET_PATH_BYTES, 103);
  for (const bad of ["", "Bad.sock", "viz-studio.socket", "viz-studio.sock.tmp", ".hidden.sock", "-x.sock", "x y.sock", "../x.sock", "a/b.sock"]) {
    throwsWith(() => socketPathFor(bad, home), "BAD_SOCKET_NAME");
  }
});

// ---------------------------------------------------------------------------------------------
// Serving.

test("creates the run dir chain 0700 and publishes the socket 0600; server.address() is the hidden bind name", async () => {
  const home = makeHome();
  const p = socketPathFor(NAME, home);
  const l = await start("a", { socketPath: p, home });
  assert.equal(l.socketPath, p);
  let dir = home;
  for (const level of LEVELS) {
    dir = path.join(dir, level);
    const st = fs.lstatSync(dir);
    assert.ok(st.isDirectory() && !st.isSymbolicLink(), `${dir} is not a real directory`);
    assert.equal(st.mode & 0o7777, 0o700, `${dir} has mode ${(st.mode & 0o7777).toString(8)}`);
    assert.equal(st.uid, UID);
  }
  const st = fs.lstatSync(p);
  assert.ok(st.isSocket(), "the published name is not a socket");
  assert.equal(st.mode & 0o777, 0o600, `socket mode ${(st.mode & 0o777).toString(8)}`);
  assert.equal(st.uid, UID);
  // The kernel keeps the name the socket was bound to: a hidden name carrying this pid, unlinked once
  // published. Logs and viz_health use listener.socketPath, never this.
  const addr = l.server.address();
  assert.equal(typeof addr, "string", `server.address() must be a path, never a TCP address: ${JSON.stringify(addr)}`);
  const bound = addr as string;
  assert.notEqual(bound, p);
  assert.equal(path.dirname(bound), runDir(home));
  assert.match(path.basename(bound), new RegExp(`^\\.viz-studio\\.sock\\.${process.pid}\\.[0-9a-f]{8}\\.tmp$`));
  assert.equal(fs.existsSync(bound), false, "the hidden bind name must be gone once the socket is published");
  assert.deepEqual(entries(runDir(home)), [NAME]);
  const resources = process.getActiveResourcesInfo();
  assert.ok(!resources.includes("TCPServerWrap") && !resources.includes("TCPWrap"), `a TCP handle is open: ${resources.join(",")}`);
});

test("GET /healthz through requestOverSocket works: Host localhost[:80], no local port, and the browser guard lets it pass", async () => {
  const home = makeHome();
  const p = socketPathFor(NAME, home);
  const seen: Seen[] = [];
  await start("health", { socketPath: p, home }, seen);
  assert.deepEqual(await get(p, home, "/healthz"), { status: 200, tag: "health" });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, "/healthz");
  assert.ok(seen[0].host === "localhost" || seen[0].host === "localhost:80", `Host was ${String(seen[0].host)}`);
  assert.equal(seen[0].localPort, undefined, "the guard skips its Host check only when localPort is undefined");
  assert.equal(seen[0].remoteAddress, undefined, "a Unix socket has no remote address");
  assert.equal(seen[0].refusal, null);
  // A browser header over the same socket is still refused by the guard.
  await get(p, home, "/healthz", { origin: "https://evil.example" });
  assert.equal(seen[1].refusal?.code, "browser_origin");
});

// ---------------------------------------------------------------------------------------------
// Refusals: the directory chain.

test("refuses a run dir that grants group or others anything (RUN_DIR_MODE) and never repairs it", async () => {
  const home = makeHome();
  const dir = makeRunDir(home);
  const p = socketPathFor(NAME, home);
  for (const mode of [0o755, 0o750, 0o701]) {
    fs.chmodSync(dir, mode);
    await rejectsWith(start("x", { socketPath: p, home }), "RUN_DIR_MODE");
    assert.equal(modeOf(dir), mode, "the helper must refuse, never chmod");
    assert.deepEqual(entries(dir), [], "nothing may be bound in a refused run dir");
  }
});

test("refuses a symlinked run dir and a symlinked ancestor (RUN_DIR_UNSAFE) and binds nothing", async () => {
  {
    const home = makeHome();
    const dir = makeRunDir(home);
    fs.rmdirSync(dir);
    const target = path.join(home, "elsewhere");
    fs.mkdirSync(target, { mode: 0o700 });
    fs.symlinkSync(target, dir);
    await rejectsWith(start("x", { socketPath: socketPathFor(NAME, home), home }), "RUN_DIR_UNSAFE");
    assert.ok(fs.lstatSync(dir).isSymbolicLink(), "the symlink must be left alone");
    assert.deepEqual(entries(target), []);
  }
  {
    const home = makeHome();
    makeRunDir(home);
    const state = path.join(home, ".local", "state");
    const real = path.join(home, "real-state");
    fs.renameSync(state, real);
    fs.symlinkSync(real, state);
    await rejectsWith(start("x", { socketPath: socketPathFor(NAME, home), home }), "RUN_DIR_UNSAFE");
    assert.deepEqual(entries(path.join(real, "trinc", "run")), []);
  }
});

test("refuses an ancestor that others can write (0777, RUN_DIR_UNSAFE) and leaves its mode alone", async () => {
  const home = makeHome();
  makeRunDir(home);
  const trinc = path.join(home, ".local", "state", "trinc");
  fs.chmodSync(trinc, 0o777);
  await rejectsWith(start("x", { socketPath: socketPathFor(NAME, home), home }), "RUN_DIR_UNSAFE");
  assert.equal(modeOf(trinc), 0o777);
  assert.deepEqual(entries(runDir(home)), []);
});

// ---------------------------------------------------------------------------------------------
// Refusals: what is already at the path, and the path itself.

test("refuses a regular file at the socket path (NOT_A_SOCKET) and leaves the file untouched", async () => {
  const home = makeHome();
  const dir = makeRunDir(home);
  const p = path.join(dir, NAME);
  fs.writeFileSync(p, "operator data\n", { mode: 0o644 });
  const before = fs.lstatSync(p);
  await rejectsWith(start("x", { socketPath: p, home }), "NOT_A_SOCKET");
  const after = fs.lstatSync(p);
  assert.ok(after.isFile());
  assert.equal(after.ino, before.ino, "the file was replaced");
  assert.equal(after.mode, before.mode, "the file mode changed");
  assert.equal(fs.readFileSync(p, "utf8"), "operator data\n", "the file content changed");
  assert.deepEqual(entries(dir), [NAME], "a refusal must not leave a hidden socket behind");
});

test("refuses a socket another process serves (ALREADY_SERVED), and that process stays reachable", async () => {
  const home = makeHome();
  const child = spawnChild(home);
  assert.match(await child.outcome, /^ready \d+$/);
  const p = socketPathFor(NAME, home);
  const ino = fs.lstatSync(p).ino;
  await rejectsWith(start("in-process", { socketPath: p, home }), "ALREADY_SERVED");
  assert.equal(fs.lstatSync(p).ino, ino, "the other process's socket was replaced");
  assert.equal((await get(p, home)).tag, `child-${child.proc.pid}`);
  assert.deepEqual(entries(runDir(home)), [NAME]);
});

test("refuses a socket path, or the hidden name it binds first, over 103 bytes (SOCKET_PATH_TOO_LONG) before touching the disk", async () => {
  const base = makeHome();
  const homeOfLength = (bytes: number): string => {
    const home = path.join(base, "h".repeat(bytes - Buffer.byteLength(base) - 1));
    fs.mkdirSync(home, { mode: 0o700 });
    return home;
  };
  // A 50-byte home: the published path is 89 bytes, but the hidden bind name ("." + name + "." + pid +
  // "." + 8 hex + ".tmp") would not fit. A 70-byte home: the published path itself is 109 bytes.
  const hiddenTooLong = homeOfLength(50);
  const pathTooLong = homeOfLength(70);
  assert.ok(Buffer.byteLength(socketPathFor(NAME, hiddenTooLong)) <= MAX_SOCKET_PATH_BYTES);
  assert.ok(Buffer.byteLength(socketPathFor(NAME, pathTooLong)) > MAX_SOCKET_PATH_BYTES);
  for (const home of [hiddenTooLong, pathTooLong]) {
    const p = socketPathFor(NAME, home);
    await rejectsWith(start("x", { socketPath: p, home }), "SOCKET_PATH_TOO_LONG");
    assert.equal(fs.existsSync(path.join(home, ".local")), false, "nothing may be created for a refused path");
    throwsWith(() => assertSocketTrust(p, NAME, home), "SOCKET_PATH_TOO_LONG");
    throwsWith(() => requestOverSocket(p, NAME, GET_HEALTH, home), "SOCKET_PATH_TOO_LONG");
  }
});

test("refuses a bad socket name (BAD_SOCKET_NAME) and a socket outside the run dir (BAD_SOCKET_PATH) before touching the disk", async () => {
  const home = makeHome();
  const other = makeHome();
  const dir = runDir(home);
  for (const name of ["Bad.sock", ".hidden.sock", "viz-studio.socket", "viz-studio.sock.tmp", "x y.sock", "-x.sock"]) {
    await rejectsWith(start("x", { socketPath: path.join(dir, name), home }), "BAD_SOCKET_NAME");
  }
  for (const socketPath of [
    path.join(home, NAME), // in the home, not in the run dir
    path.join(dir, "sub", NAME), // below the run dir
    `/tmp/${NAME}`,
    socketPathFor(NAME, other), // another home's run dir
    `${dir}/../run/${NAME}`, // not normalized
    NAME, // relative
    "",
  ]) {
    await rejectsWith(start("x", { socketPath, home }), "BAD_SOCKET_PATH");
  }
  assert.equal(fs.existsSync(path.join(home, ".local")), false);
  assert.equal(fs.existsSync(path.join(other, ".local")), false);
});

// ---------------------------------------------------------------------------------------------
// Stale sockets, restarts and races.

test("replaces a stale socket left by a SIGKILLed child process, and serves", async () => {
  const home = makeHome();
  const child = spawnChild(home);
  assert.match(await child.outcome, /^ready /);
  const p = socketPathFor(NAME, home);
  assert.deepEqual(await probeSocket(p), { state: "live" });
  await killChild(child.proc);
  const before = fs.lstatSync(p);
  assert.ok(before.isSocket(), "a SIGKILLed server leaves its socket file behind");
  assert.deepEqual(await probeSocket(p), { state: "stale" });
  await start("fresh", { socketPath: p, home });
  const after = fs.lstatSync(p);
  assert.notEqual(after.ino, before.ino, "the stale socket is still there");
  assert.equal(after.mode & 0o777, 0o600);
  assert.equal((await get(p, home)).tag, "fresh");
  assert.deepEqual(entries(runDir(home)), [NAME]);
});

test("a newer start in the same process supersedes a listener that was never closed (a plugin reload)", async () => {
  const home = makeHome();
  const p = socketPathFor(NAME, home);
  const older = await start("old", { socketPath: p, home });
  await start("new", { socketPath: p, home });
  assert.equal(older.server.listening, false, "the newer start must close the older listener");
  assert.equal((await get(p, home)).tag, "new");
  const ino = fs.lstatSync(p).ino;
  older.unlinkIfOwnedSync();
  await older.close();
  assert.equal(fs.lstatSync(p).ino, ino, "the older listener must leave the newer socket alone");
  assert.equal((await get(p, home)).tag, "new");
});

test("a start right after a close() that is not awaited (onunload, then the reloaded plugin) takes the path and keeps it", async () => {
  const home = makeHome();
  const p = socketPathFor(NAME, home);
  const older = await start("old", { socketPath: p, home, closeGraceMs: 300 });
  const stream = await openStream(p, home); // an open response keeps the older close() pending for its grace period
  const closing = older.close();
  await start("new", { socketPath: p, home });
  const ino = fs.lstatSync(p).ino;
  assert.equal((await get(p, home)).tag, "new");
  await withTimeout(closing, 5000, "the older close()");
  await withTimeout(stream.closed, 2000, "the older stream ending");
  assert.equal(fs.lstatSync(p).ino, ino, "the older close() removed or replaced the newer socket");
  assert.equal((await get(p, home)).tag, "new");
});

test("a second start while the first is still in flight: the first is SUPERSEDED, the second serves", async () => {
  const home = makeHome();
  const p = socketPathFor(NAME, home);
  const [first, second] = await Promise.allSettled([
    listenHttpOnSocket(handler("first"), { socketPath: p, home }),
    listenHttpOnSocket(handler("second"), { socketPath: p, home }),
  ]);
  if (first.status === "fulfilled") listeners.push(first.value);
  if (second.status === "fulfilled") listeners.push(second.value);
  assert.equal(first.status, "rejected", "the older in-flight start must give way");
  assert.equal(((first as PromiseRejectedResult).reason as UdsListenerError).code, "SUPERSEDED");
  assert.equal(second.status, "fulfilled");
  assert.equal((await get(p, home)).tag, "second");
  assert.deepEqual(entries(runDir(home)), [NAME], "the superseded start must leave nothing behind");
});

for (const variant of ["absent", "stale"]) {
  test(`two child processes starting at the same instant (${variant} socket): exactly one wins`, async (t) => {
    for (let round = 0; round < 2; round++) {
      const home = makeHome();
      const p = socketPathFor(NAME, home);
      if (variant === "stale") {
        makeRunDir(home);
        await makeStale(p);
        assert.deepEqual(await probeSocket(p), { state: "stale" });
      }
      const startAt = Date.now() + 700;
      const outcomes = await Promise.all([spawnChild(home, startAt).outcome, spawnChild(home, startAt).outcome]);
      t.diagnostic(`round ${round}: ${outcomes.join(" | ")}`);
      const winners = outcomes.filter((o) => o.startsWith("ready "));
      assert.equal(winners.length, 1, `exactly one start may win: ${outcomes.join(" | ")}`);
      assert.match(outcomes.find((o) => o.startsWith("refused ")) ?? "", /^refused (ALREADY_SERVED|LOST_RACE)$/);
      assert.equal((await get(p, home)).tag, `child-${winners[0].slice("ready ".length)}`);
      assert.deepEqual(entries(runDir(home)), [NAME], "the losing start must leave nothing behind");
    }
  });
}

// ---------------------------------------------------------------------------------------------
// close(), successors and onLost.

test("close() removes the published socket and keeps the run dir; a restart serves again", async () => {
  const home = makeHome();
  const p = socketPathFor(NAME, home);
  const l = await start("a", { socketPath: p, home });
  await l.close();
  assert.equal(fs.existsSync(p), false, "close() left the socket behind");
  assert.equal(l.server.listening, false);
  assert.deepEqual(entries(runDir(home)), []);
  assert.equal(modeOf(runDir(home)), 0o700);
  assert.deepEqual(await probeSocket(p), { state: "absent" });
  await l.close(); // a second close is harmless
  await start("b", { socketPath: p, home });
  assert.equal((await get(p, home)).tag, "b");
});

test("close() after another process took the path leaves that process's socket alone", async () => {
  const home = makeHome();
  const p = socketPathFor(NAME, home);
  const l = await start("in-process", { socketPath: p, home });
  fs.unlinkSync(p); // the name is removed while the listener runs...
  const successor = spawnChild(home); // ...and another process publishes it
  assert.match(await successor.outcome, /^ready /);
  const ino = fs.lstatSync(p).ino;
  l.unlinkIfOwnedSync();
  await l.close();
  assert.equal(fs.lstatSync(p).ino, ino, "the older listener removed or replaced its successor's socket");
  assert.equal((await get(p, home)).tag, `child-${successor.proc.pid}`);
});

test("onLost fires once when the socket name is removed", async () => {
  const home = makeHome();
  const p = socketPathFor(NAME, home);
  const reasons: string[] = [];
  await start("a", { socketPath: p, home, watchIntervalMs: 50, onLost: (r) => reasons.push(r) });
  await sleep(150);
  assert.deepEqual(reasons, [], "onLost fired while the socket was in place");
  fs.unlinkSync(p);
  assert.ok(await waitFor(() => reasons.length > 0, 2000), "onLost did not fire within 2 s");
  await sleep(200);
  assert.equal(reasons.length, 1, `onLost fired ${reasons.length} times`);
  assert.match(reasons[0], /was removed$/);
});

test("onLost fires once when the socket name is replaced, and close() leaves the replacement", async () => {
  const home = makeHome();
  const p = socketPathFor(NAME, home);
  const reasons: string[] = [];
  const l = await start("a", { socketPath: p, home, watchIntervalMs: 50, onLost: (r) => reasons.push(r) });
  const other = path.join(runDir(home), "other.sock");
  await listenNet(other);
  fs.renameSync(other, p); // another live socket now holds the published name
  const replacement = fs.lstatSync(p).ino;
  assert.ok(await waitFor(() => reasons.length > 0, 2000), "onLost did not fire within 2 s");
  await sleep(200);
  assert.equal(reasons.length, 1, `onLost fired ${reasons.length} times`);
  assert.match(reasons[0], /now points at another socket$/);
  await l.close();
  assert.equal(fs.lstatSync(p).ino, replacement, "close() removed the replacement");
});

test("onLost does not fire for a normal close()", async () => {
  const home = makeHome();
  const p = socketPathFor(NAME, home);
  const reasons: string[] = [];
  const l = await start("a", { socketPath: p, home, watchIntervalMs: 50, onLost: (r) => reasons.push(r) });
  await l.close();
  await sleep(200);
  assert.deepEqual(reasons, []);
});

test("close() resolves while a never-ending response is open: that connection is ended after the grace period", async () => {
  const home = makeHome();
  const p = socketPathFor(NAME, home);
  const l = await start("a", { socketPath: p, home, closeGraceMs: 200 });
  const stream = await openStream(p, home);
  const t0 = Date.now();
  await withTimeout(l.close(), 5000, "close()");
  const elapsed = Date.now() - t0;
  assert.ok(elapsed >= 150, `close() returned after ${elapsed} ms, before the 200 ms grace period`);
  assert.ok(elapsed < 3000, `close() took ${elapsed} ms`);
  await withTimeout(stream.closed, 2000, "the client seeing the stream end");
  assert.equal(fs.existsSync(p), false);
});

// ---------------------------------------------------------------------------------------------
// Client side: requestOverSocket and assertSocketTrust.

test("client: requestOverSocket refuses an empty path and a wrong expected name before any connection", async () => {
  const home = makeHome();
  const p = socketPathFor(NAME, home);
  const seen: Seen[] = [];
  await start("a", { socketPath: p, home }, seen);
  // Node would turn an empty or missing socketPath into TCP to localhost:80.
  throwsWith(() => requestOverSocket("", NAME, GET_HEALTH, home), "BAD_SOCKET_PATH");
  throwsWith(() => requestOverSocket(undefined as unknown as string, NAME, GET_HEALTH, home), "BAD_SOCKET_PATH");
  // Each bridge id is bound to its own socket name, both ways.
  throwsWith(() => requestOverSocket(p, SOCKET_NAMES.commandCenter, GET_HEALTH, home), "SOCKET_UNTRUSTED");
  throwsWith(() => requestOverSocket(socketPathFor(SOCKET_NAMES.commandCenter, home), NAME, GET_HEALTH, home), "SOCKET_UNTRUSTED");
  throwsWith(() => assertSocketTrust(p, SOCKET_NAMES.vaultBridge, home), "SOCKET_UNTRUSTED");
  await sleep(50);
  assert.equal(seen.length, 0, "a refused request must never reach the server");
  assert.equal((await get(p, home)).tag, "a", "the right name still gets through");
});

test("client: a missing run dir or socket is ENOENT; a 0777 socket or a 0755 run dir is SOCKET_UNTRUSTED", async () => {
  const home = makeHome();
  const p = socketPathFor(NAME, home);
  throwsWith(() => assertSocketTrust(p, NAME, home), "ENOENT"); // no run dir: the bridge is not running
  throwsWith(() => requestOverSocket(p, NAME, GET_HEALTH, home), "ENOENT");
  const dir = makeRunDir(home);
  throwsWith(() => requestOverSocket(p, NAME, GET_HEALTH, home), "ENOENT"); // a run dir, no socket
  await start("a", { socketPath: p, home });
  assertSocketTrust(p, NAME, home);
  fs.chmodSync(p, 0o777);
  throwsWith(() => requestOverSocket(p, NAME, GET_HEALTH, home), "SOCKET_UNTRUSTED");
  fs.chmodSync(p, 0o600);
  fs.chmodSync(dir, 0o755);
  throwsWith(() => requestOverSocket(p, NAME, GET_HEALTH, home), "SOCKET_UNTRUSTED");
  fs.chmodSync(dir, 0o700);
  assert.equal((await get(p, home)).tag, "a");
});
