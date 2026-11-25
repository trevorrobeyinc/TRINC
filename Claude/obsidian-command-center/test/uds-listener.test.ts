// Tests for src/bridge/uds-listener.ts, the bridges-uds listener and client helper (DESIGN.md D11, 2026-11-24).
// Run: npm test
//
// The helper is byte-identical in Command Center, Viz Studio and the vault bridge (ops/tr-suite/verify.sh compares
// the copies); this is Command Center's run of the D11 matrix against its copy. Every test makes its own short home
// with fs.mkdtempSync("/tmp/uds-") and removes it afterwards: macOS sun_path holds 104 bytes, and a longer temp root
// (os.tmpdir() under /var/folders, or a scratch directory) would not fit. Nothing here touches the real home: every
// call passes `home`, and the child processes (test/support/uds-child.ts) derive their socket path from the home
// they are given. ACL cases are covered by the helper's own verification, not here: never run `chmod +a` on a
// command line.
import { afterEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as http from "node:http";
import { createRequire, syncBuiltinESMExports } from "node:module";
import type * as net from "node:net";
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
  type UdsListenOptions,
  type UdsListener,
} from "../src/bridge/uds-listener.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CHILD = path.join(HERE, "support", "uds-child.ts");
const CHILD_FLAGS = ["--experimental-strip-types", "--no-warnings"];
const NAME = SOCKET_NAMES.commandCenter;
const UID = typeof process.getuid === "function" ? process.getuid() : -1;
const RUN_LEVELS = [".local", "state", "trinc", "run"];
// The CommonJS node:net exports. A spy set on them and synced into the ES module namespace sees the helper's own
// net.connect calls, which is how the client tests prove a refusal opened no connection at all.
const netExports = createRequire(import.meta.url)("node:net") as typeof net;

// ─── Bookkeeping: everything a test opens is closed, killed or removed in afterEach ─────────────────────────────

const homes: string[] = [];
const listeners: UdsListener[] = [];
const servers: http.Server[] = [];
const children: ChildProcess[] = [];

afterEach(async () => {
  await Promise.allSettled(listeners.splice(0).map((l) => l.close()));
  await Promise.allSettled(servers.splice(0).map((s) => new Promise<void>((resolve) => s.close(() => resolve()))));
  await Promise.allSettled(
    children.splice(0).map((c) => {
      if (c.exitCode !== null || c.signalCode !== null) return Promise.resolve();
      const exited = new Promise<void>((resolve) => c.once("exit", () => resolve()));
      c.kill("SIGKILL");
      return exited;
    })
  );
  for (const h of homes.splice(0)) fs.rmSync(h, { recursive: true, force: true });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────────────────────────────────────────

function makeHome(): string {
  const home = fs.mkdtempSync("/tmp/uds-");
  homes.push(home);
  return home;
}

/** Make <home>/<levels...> by hand, every level 0700 (as the helper would), and return the deepest one. */
function makeLevels(home: string, levels: string[] = RUN_LEVELS): string {
  let dir = home;
  for (const level of levels) {
    dir = path.join(dir, level);
    fs.mkdirSync(dir);
    fs.chmodSync(dir, 0o700);
  }
  return dir;
}

function modeOf(p: string): number {
  return fs.lstatSync(p).mode & 0o7777;
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

function reEscape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

interface Seen {
  host: string | undefined;
  url: string | undefined;
  localPort: number | undefined;
  remoteAddress: string | undefined;
}

/** A bridge-like handler: {"ok":true,"tag":...} on any path, and a never-ending stream on /events (the SSE stub). */
function handler(tag: string, seen: Seen[] = []): http.RequestListener {
  return (req, res) => {
    seen.push({
      host: req.headers.host,
      url: req.url,
      localPort: req.socket.localPort,
      remoteAddress: req.socket.remoteAddress,
    });
    if (req.url === "/events") {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
      res.write(": open\n\n");
      return;
    }
    const body = JSON.stringify({ ok: true, tag });
    res.writeHead(200, { "content-type": "application/json", "content-length": String(Buffer.byteLength(body)) });
    res.end(body);
  };
}

async function start(tag: string, home: string, extra: Partial<UdsListenOptions> = {}, seen?: Seen[]): Promise<UdsListener> {
  const listener = await listenHttpOnSocket(handler(tag, seen), {
    socketPath: socketPathFor(NAME, home),
    home,
    watchIntervalMs: 0,
    ...extra,
  });
  listeners.push(listener);
  return listener;
}

/** The refusal code of a start, or "served" (the listener is closed in afterEach). */
async function refusal(home: string, socketPath: string = socketPathFor(NAME, home)): Promise<string> {
  try {
    listeners.push(await listenHttpOnSocket(handler("unexpected"), { socketPath, home, watchIntervalMs: 0 }));
    return "served";
  } catch (err) {
    assert.ok(err instanceof UdsListenerError, `not a UdsListenerError: ${String(err)}`);
    return err.code;
  }
}

interface Reply {
  status: number;
  body: string;
}

/** A request the way the bridges' clients make one: requestOverSocket, then the reply body. */
function get(home: string, reqPath = "/healthz", extra: http.RequestOptions = {}): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = requestOverSocket(socketPathFor(NAME, home), NAME, { method: "GET", path: reqPath, ...extra }, home);
    // A 2 s guard, so a broken case fails instead of hanging. The helper's pin would pass a `timeout` option on to the
    // socket too (the client test "passes the request's timeout on" proves it); setTimeout arms that same socket timer.
    req.setTimeout(2000);
    req.on("timeout", () => req.destroy(new Error(`GET ${reqPath} timed out`)));
    req.on("error", reject);
    req.on("response", (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.end();
  });
}

/** Who serves the path now: a listener's tag, "pid <n>" for a child, or "error <code>". */
async function servedBy(home: string): Promise<string> {
  try {
    const reply = JSON.parse((await get(home)).body) as { tag?: string; pid?: number };
    return reply.tag ?? `pid ${reply.pid}`;
  } catch (err) {
    return `error ${(err as NodeJS.ErrnoException).code ?? String(err)}`;
  }
}

/** Open a never-ending response and resolve once its first bytes arrived; `closed` settles when it ends. */
function openStream(home: string): Promise<{ closed: Promise<void> }> {
  return new Promise((resolve, reject) => {
    const req = requestOverSocket(socketPathFor(NAME, home), NAME, { method: "GET", path: "/events" }, home);
    req.on("error", reject);
    req.on("response", (res) => {
      const closed = new Promise<void>((done) => res.on("close", () => done()));
      res.on("error", () => {}); // "aborted" when the server ends the stream
      res.once("data", () => resolve({ closed }));
    });
    req.end();
  });
}

function listenOn(server: http.Server, p: string): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(p, () => resolve());
  });
}

/** A socket file of ours with nobody listening, as a crash leaves it (listen, move the name aside, close, move back). */
async function makeStaleSocket(home: string): Promise<string> {
  const run = makeLevels(home);
  const p = path.join(run, NAME);
  const aside = path.join(run, "aside.sock");
  const server = http.createServer();
  await listenOn(server, p);
  fs.renameSync(p, aside);
  await new Promise<void>((resolve) => server.close(() => resolve())); // libuv unlinks p, which is already gone
  fs.renameSync(aside, p);
  return p;
}

interface Child {
  proc: ChildProcess;
  nextLine(timeoutMs?: number): Promise<string>;
  end(): Promise<void>;
}

/** Start test/support/uds-child.ts and read its stdout line by line. */
function spawnChild(mode: "serve" | "race", home: string): Child {
  const proc = spawn(process.execPath, [...CHILD_FLAGS, CHILD, mode, home, NAME], { stdio: ["pipe", "pipe", "inherit"] });
  children.push(proc);
  const lines: string[] = [];
  const waiting: Array<(line: string) => void> = [];
  let buffered = "";
  proc.stdout!.setEncoding("utf8");
  proc.stdout!.on("data", (chunk: string) => {
    buffered += chunk;
    for (let i = buffered.indexOf("\n"); i >= 0; i = buffered.indexOf("\n")) {
      const line = buffered.slice(0, i);
      buffered = buffered.slice(i + 1);
      const next = waiting.shift();
      if (next) next(line);
      else lines.push(line);
    }
  });
  proc.once("exit", (code, signal) => {
    for (const next of waiting.splice(0)) next(`exited ${code ?? signal}`);
  });
  const exited = new Promise<void>((resolve) => proc.once("exit", () => resolve()));
  return {
    proc,
    nextLine(timeoutMs = 15_000) {
      const queued = lines.shift();
      if (queued !== undefined) return Promise.resolve(queued);
      if (proc.exitCode !== null || proc.signalCode !== null) return Promise.resolve(`exited ${proc.exitCode ?? proc.signalCode}`);
      return withTimeout(new Promise<string>((resolve) => waiting.push(resolve)), timeoutMs, "a line from the child");
    },
    end() {
      proc.stdin!.end();
      return withTimeout(exited, 10_000, "the child to exit");
    },
  };
}

/** Run fn with a spy on net.connect that the helper's ES module namespace sees too. */
async function withConnectSpy<T>(fn: (connects: () => number) => Promise<T>): Promise<T> {
  const spy = mock.method(netExports, "connect");
  syncBuiltinESMExports();
  try {
    return await fn(() => spy.mock.callCount());
  } finally {
    spy.mock.restore();
    syncBuiltinESMExports();
  }
}

// ─── The listener ────────────────────────────────────────────────────────────────────────────────────────────────

test("creates the run dir chain 0700 and publishes the socket 0600; address() is the hidden name, never TCP", async () => {
  const home = makeHome();
  const listener = await start("chain", home);
  let dir = home;
  for (const level of RUN_LEVELS) {
    dir = path.join(dir, level);
    const st = fs.lstatSync(dir);
    assert.ok(st.isDirectory() && !st.isSymbolicLink(), `${dir} is a real directory`);
    assert.equal(st.mode & 0o777, 0o700, `${dir} mode`);
    assert.equal(st.uid, UID, `${dir} owner`);
  }
  assert.equal(dir, runDir(home));
  assert.equal(listener.socketPath, socketPathFor(NAME, home));
  const sock = fs.lstatSync(listener.socketPath);
  assert.ok(sock.isSocket());
  assert.equal(sock.mode & 0o777, 0o600);
  assert.equal(sock.uid, UID);

  // The kernel keeps the name the helper bound first: logs and health payloads must use listener.socketPath.
  const address = listener.server.address();
  assert.equal(typeof address, "string", "a Unix socket's address is a path, never {address, port}");
  assert.match(
    String(address),
    new RegExp(`^${reEscape(runDir(home))}/\\.${reEscape(NAME)}\\.${process.pid}\\.[0-9a-f]{8}\\.tmp$`)
  );
  assert.equal(fs.existsSync(String(address)), false, "the hidden bind name is gone once published");
  assert.deepEqual(fs.readdirSync(runDir(home)), [NAME]);
  assert.equal(process.getActiveResourcesInfo().includes("TCPServerWrap"), false, "nothing listens on TCP");
});

test("GET /healthz through requestOverSocket reaches the handler, which sees Host localhost and no TCP peer", async () => {
  const home = makeHome();
  const seen: Seen[] = [];
  await start("health", home, {}, seen);
  const reply = await get(home, "/healthz");
  assert.equal(reply.status, 200);
  assert.equal(JSON.parse(reply.body).tag, "health");
  assert.equal(seen.length, 1);
  assert.ok(seen[0].host === "localhost" || seen[0].host === "localhost:80", `Host was ${seen[0].host}`);
  assert.equal(seen[0].url, "/healthz");
  // What the byte-identical browser guards key on: no port, so they skip the Host check (and still refuse Origin).
  assert.equal(seen[0].localPort, undefined);
  assert.equal(seen[0].remoteAddress, undefined);
});

test("refuses a run dir with mode 0755 (RUN_DIR_MODE) and never repairs it", async () => {
  const home = makeHome();
  const run = makeLevels(home);
  fs.chmodSync(run, 0o755);
  assert.equal(await refusal(home), "RUN_DIR_MODE");
  assert.equal(modeOf(run), 0o755, "a loosened run dir is a signal, not a typo to tidy up");
  assert.deepEqual(fs.readdirSync(run), []);
});

test("refuses a symlinked run dir and a symlinked ancestor (RUN_DIR_UNSAFE) and binds nothing in the target", async () => {
  const home = makeHome();
  const trinc = makeLevels(home, [".local", "state", "trinc"]);
  const elsewhere = makeLevels(home, ["elsewhere"]);
  fs.symlinkSync(elsewhere, path.join(trinc, "run"));
  assert.equal(await refusal(home), "RUN_DIR_UNSAFE");
  assert.ok(fs.lstatSync(path.join(trinc, "run")).isSymbolicLink(), "the symlink is left in place");
  assert.deepEqual(fs.readdirSync(elsewhere), []);

  const home2 = makeHome();
  makeLevels(home2, [".local"]);
  const realState = makeLevels(home2, ["real-state"]);
  fs.symlinkSync(realState, path.join(home2, ".local", "state"));
  assert.equal(await refusal(home2), "RUN_DIR_UNSAFE");
  assert.deepEqual(fs.readdirSync(realState), [], "nothing was created through the symlinked ancestor");
});

test("refuses an ancestor that others can write, a 0777 trinc (RUN_DIR_UNSAFE)", async () => {
  const home = makeHome();
  const run = makeLevels(home);
  fs.chmodSync(path.dirname(run), 0o777);
  assert.equal(await refusal(home), "RUN_DIR_UNSAFE");
  assert.deepEqual(fs.readdirSync(run), []);
  assert.equal(modeOf(path.dirname(run)), 0o777, "refused, not repaired");
});

test("refuses a regular file at the socket path (NOT_A_SOCKET) and leaves the file untouched", async () => {
  const home = makeHome();
  const run = makeLevels(home);
  const p = socketPathFor(NAME, home);
  fs.writeFileSync(p, "not a socket\n", { mode: 0o600 });
  const before = fs.lstatSync(p);
  assert.equal(await refusal(home), "NOT_A_SOCKET");
  const after = fs.lstatSync(p);
  assert.equal(after.ino, before.ino);
  assert.equal(after.mode, before.mode);
  assert.equal(fs.readFileSync(p, "utf8"), "not a socket\n");
  assert.deepEqual(fs.readdirSync(run), [NAME], "no hidden name left behind");
});

test("refuses a live socket held by another process (ALREADY_SERVED); the first server stays reachable", async () => {
  const home = makeHome();
  const holder = spawnChild("serve", home);
  const ready = await holder.nextLine();
  assert.match(ready, /^ready \d+$/);
  const p = socketPathFor(NAME, home);
  const ino = fs.lstatSync(p).ino;
  assert.equal(await refusal(home), "ALREADY_SERVED");
  assert.equal(fs.lstatSync(p).ino, ino, "the holder's socket is the same file");
  assert.equal(await servedBy(home), `pid ${holder.proc.pid}`);
  assert.deepEqual(fs.readdirSync(runDir(home)), [NAME], "no hidden name left behind");
  await holder.end();
  assert.equal(fs.existsSync(p), false, "the holder's own close() removed its name");
});

test("refuses a published path or a hidden bind name over 103 bytes (SOCKET_PATH_TOO_LONG) before creating anything", async () => {
  const base = makeHome();
  const homeOfLength = (bytes: number): string => {
    const home = path.join(base, "h".repeat(bytes - Buffer.byteLength(base) - 1));
    fs.mkdirSync(home, { mode: 0o700 });
    assert.equal(Buffer.byteLength(home), bytes);
    return home;
  };
  // The published path is the home plus 43 bytes (/.local/state/trinc/run/command-center.sock); the hidden name the
  // helper binds first is 22 bytes longer still.
  const pathTooLong = homeOfLength(61);
  const hiddenTooLong = homeOfLength(39);
  const fits = homeOfLength(38);
  assert.equal(Buffer.byteLength(socketPathFor(NAME, pathTooLong)), MAX_SOCKET_PATH_BYTES + 1);
  assert.equal(Buffer.byteLength(socketPathFor(NAME, hiddenTooLong)), 82);

  assert.equal(await refusal(pathTooLong), "SOCKET_PATH_TOO_LONG");
  assert.equal(await refusal(hiddenTooLong), "SOCKET_PATH_TOO_LONG");
  assert.equal(fs.existsSync(path.join(pathTooLong, ".local")), false, "refused before anything was created");
  assert.equal(fs.existsSync(path.join(hiddenTooLong, ".local")), false, "refused before anything was created");
  assert.throws(() => assertSocketTrust(socketPathFor(NAME, pathTooLong), NAME, pathTooLong), {
    code: "SOCKET_PATH_TOO_LONG",
  });

  await start("fits", fits);
  assert.equal(await servedBy(fits), "fits", "a hidden name of exactly 103 bytes still serves");
});

test("refuses a bad socket name (BAD_SOCKET_NAME) and a socket outside the run dir (BAD_SOCKET_PATH) before touching the disk", async () => {
  const home = makeHome();
  const run = runDir(home);
  assert.throws(() => socketPathFor("Bad.sock", home), { code: "BAD_SOCKET_NAME" });
  for (const bad of ["Bad.sock", "x.socket", ".hidden.sock", "x y.sock", "-x.sock", "x"]) {
    assert.equal(await refusal(home, path.join(run, bad)), "BAD_SOCKET_NAME", bad);
  }
  const outside = [
    path.join(home, NAME),
    path.join(run, "sub", NAME),
    path.join(path.dirname(run), NAME),
    `${run}/../run/${NAME}`,
    `${run}//${NAME}`,
    `${run}/./${NAME}`,
    NAME,
    "",
    `/tmp/${NAME}`,
    socketPathFor(NAME, makeHome()),
  ];
  for (const bad of outside) {
    assert.equal(await refusal(home, bad), "BAD_SOCKET_PATH", JSON.stringify(bad));
  }
  assert.equal(fs.existsSync(path.join(home, ".local")), false, "nothing was created");
});

test("replaces a stale socket left by a SIGKILLed child process, and serves", async () => {
  const home = makeHome();
  const holder = spawnChild("serve", home);
  assert.match(await holder.nextLine(), /^ready \d+$/);
  const p = socketPathFor(NAME, home);
  const exited = new Promise<void>((resolve) => holder.proc.once("exit", () => resolve()));
  holder.proc.kill("SIGKILL");
  await exited;
  const stale = fs.lstatSync(p);
  assert.ok(stale.isSocket(), "SIGKILL leaves the socket file behind");
  assert.equal((await probeSocket(p)).state, "stale");

  await start("fresh", home);
  const published = fs.lstatSync(p);
  assert.notEqual(published.ino, stale.ino, "a new socket holds the name");
  assert.equal(published.mode & 0o777, 0o600);
  assert.equal(await servedBy(home), "fresh");
  assert.deepEqual(fs.readdirSync(runDir(home)), [NAME], "only the published name is left");
});

test("a newer start in the same process supersedes the older listener (a plugin reload)", async () => {
  const home = makeHome();
  const older = await start("older", home);
  await start("newer", home);
  assert.equal(older.server.listening, false, "the older listener was closed");
  assert.equal(await servedBy(home), "newer");
  await older.close(); // the old instance's late close (Obsidian's unload never awaits) leaves the new socket alone
  assert.equal(await servedBy(home), "newer");
});

test("close() then a new start in the same tick: the new start takes the path and keeps it", async () => {
  const home = makeHome();
  const older = await start("older", home, { closeGraceMs: 200 });
  await openStream(home); // an open SSE-like response keeps the older close() busy for its grace period
  const closing = older.close(); // not awaited, as in onunload
  await start("newer", home);
  await closing;
  assert.equal(await servedBy(home), "newer");
});

test("a start still in flight when a newer one begins is SUPERSEDED, and the newer one serves", async () => {
  const home = makeHome();
  const opts = { socketPath: socketPathFor(NAME, home), home, watchIntervalMs: 0 };
  const [first, second] = await Promise.allSettled([
    listenHttpOnSocket(handler("first"), opts),
    listenHttpOnSocket(handler("second"), opts),
  ]);
  if (first.status === "fulfilled") listeners.push(first.value);
  if (second.status === "fulfilled") listeners.push(second.value);
  assert.equal(first.status, "rejected");
  assert.equal((first as PromiseRejectedResult).reason.code, "SUPERSEDED");
  assert.equal(second.status, "fulfilled");
  assert.equal(await servedBy(home), "second");
  assert.deepEqual(fs.readdirSync(runDir(home)), [NAME]);
});

test("two child processes started at the same instant: exactly one wins (empty path, and over a stale socket)", async () => {
  for (const variant of ["empty", "stale"]) {
    const home = makeHome();
    if (variant === "stale") await makeStaleSocket(home);
    const racers = [spawnChild("race", home), spawnChild("race", home)];
    for (const racer of racers) assert.equal(await racer.nextLine(), "armed", `${variant}: racer armed`);
    const at = Date.now() + 150;
    for (const racer of racers) racer.proc.stdin!.write(`go ${at}\n`);
    const results = await Promise.all(racers.map((racer) => racer.nextLine()));
    assert.equal(results.filter((r) => r === "won").length, 1, `${variant}: ${results.join(", ")}`);
    assert.match(results.find((r) => r !== "won") ?? "", /^lost (ALREADY_SERVED|LOST_RACE)$/, variant);
    const winner = racers[results.indexOf("won")];
    assert.equal(await servedBy(home), `pid ${winner.proc.pid}`, `${variant}: the winner serves`);
    for (const racer of racers) await racer.end();
    assert.deepEqual(fs.readdirSync(runDir(home)), [], `${variant}: nothing is left behind`);
  }
});

test("close() removes the published socket, keeps the run dir, and a restart serves again", async () => {
  const home = makeHome();
  const listener = await start("first", home);
  await listener.close();
  assert.equal(fs.existsSync(listener.socketPath), false);
  assert.equal(listener.server.listening, false);
  assert.equal(modeOf(runDir(home)), 0o700);
  assert.deepEqual(fs.readdirSync(runDir(home)), []);
  assert.equal((await probeSocket(listener.socketPath)).state, "absent");
  await listener.close(); // a second close() is harmless
  await start("second", home);
  assert.equal(await servedBy(home), "second");
});

test("close() after a successor took the path leaves the successor's socket alone", async () => {
  const home = makeHome();
  const first = await start("first", home);
  const p = first.socketPath;
  fs.unlinkSync(p); // first's name is gone; a successor (another process, or a person) publishes its own
  const successor = http.createServer(handler("successor"));
  servers.push(successor);
  await listenOn(successor, p);
  fs.chmodSync(p, 0o600);
  const ino = fs.lstatSync(p).ino;
  first.unlinkIfOwnedSync();
  await first.close();
  assert.equal(fs.lstatSync(p).ino, ino, "the successor's socket is still published");
  assert.equal(await servedBy(home), "successor");
});

test("onLost fires once when the published name is removed, and once when it is replaced", async () => {
  const home = makeHome();
  const lost: string[] = [];
  const listener = await start("watched", home, { watchIntervalMs: 50, onLost: (reason) => lost.push(reason) });
  await sleep(150);
  assert.deepEqual(lost, [], "no call while the socket is in place");
  fs.unlinkSync(listener.socketPath);
  assert.ok(await waitFor(() => lost.length > 0, 2000), "onLost fired after the removal");
  await sleep(150);
  assert.equal(lost.length, 1, lost.join(" | "));
  assert.match(lost[0], /was removed$/);

  const home2 = makeHome();
  const lost2: string[] = [];
  const watched = await start("watched", home2, { watchIntervalMs: 50, onLost: (reason) => lost2.push(reason) });
  const other = path.join(runDir(home2), "other.sock");
  const replacement = http.createServer(handler("replacement"));
  servers.push(replacement);
  await listenOn(replacement, other);
  fs.chmodSync(other, 0o600);
  fs.renameSync(other, watched.socketPath);
  assert.ok(await waitFor(() => lost2.length > 0, 2000), "onLost fired after the replacement");
  await sleep(150);
  assert.equal(lost2.length, 1, lost2.join(" | "));
  assert.match(lost2[0], /now points at another socket$/);
  await watched.close();
  assert.equal(await servedBy(home2), "replacement", "close() removed nothing that was no longer its own");
});

test("close() resolves within the grace period while a never-ending response is open", async () => {
  const home = makeHome();
  const listener = await start("sse", home, { closeGraceMs: 200 });
  const stream = await openStream(home);
  const t0 = Date.now();
  await withTimeout(listener.close(), 3000, "close()");
  const took = Date.now() - t0;
  assert.ok(took < 2000, `close() took ${took} ms`);
  await withTimeout(stream.closed, 2000, "the open stream to end");
  assert.equal(fs.existsSync(listener.socketPath), false);
});

// ─── The client ──────────────────────────────────────────────────────────────────────────────────────────────────

test("requestOverSocket refuses an empty path and a wrong expected name before any connection, and drops TCP options", async () => {
  const home = makeHome();
  const listener = await start("client", home);
  await withConnectSpy(async (connects) => {
    assert.equal((await get(home)).status, 200);
    assert.equal(connects(), 1, "the spy sees the helper's pinned connect");

    // Node would turn an empty or missing socketPath into TCP to localhost:80; the helper never gets that far.
    assert.throws(() => requestOverSocket("", NAME, { method: "GET", path: "/" }, home), { code: "BAD_SOCKET_PATH" });
    assert.throws(() => requestOverSocket(undefined as unknown as string, NAME, { method: "GET", path: "/" }, home), {
      code: "BAD_SOCKET_PATH",
    });
    assert.throws(
      () => requestOverSocket(listener.socketPath, SOCKET_NAMES.vizStudio, { method: "GET", path: "/" }, home),
      { code: "SOCKET_UNTRUSTED" }
    );
    assert.throws(
      () => requestOverSocket(socketPathFor(SOCKET_NAMES.vizStudio, home), SOCKET_NAMES.vizStudio, { method: "GET" }, home),
      { code: "ENOENT" }
    );
    assert.equal(connects(), 1, "no refusal opened a connection");

    // host, port and agent are dropped: the request still goes to the socket (agent:false would undo the pin).
    const reply = await get(home, "/healthz", { host: "127.0.0.1", port: 8799, agent: false });
    assert.equal(reply.status, 200);
    assert.equal(connects(), 2);
  });
});

test("requestOverSocket passes the request's timeout on to the socket: with no req.setTimeout, a silent bridge times out", async () => {
  const home = makeHome();
  const silent = await listenHttpOnSocket(
    () => {
      // never answers
    },
    { socketPath: socketPathFor(NAME, home), home, watchIntervalMs: 0, closeGraceMs: 100 }
  );
  listeners.push(silent);
  const t0 = Date.now();
  const req = requestOverSocket(silent.socketPath, NAME, { method: "GET", path: "/healthz", timeout: 200 }, home);
  req.on("error", () => {}); // the destroy below ends the request
  const timedOut = new Promise<number>((resolve) => {
    req.once("timeout", () => {
      resolve(Date.now() - t0);
      req.destroy(); // as a caller must: like Node's own connect, the 'timeout' event only reports
    });
  });
  req.end();
  try {
    const took = await withTimeout(timedOut, 1500, "the request's 'timeout' event");
    assert.ok(took >= 150, `the 200 ms timeout fired after ${took} ms`);
  } finally {
    req.destroy();
  }
});

test("the client refuses a missing socket as ENOENT, and a 0777 socket or a 0755 run dir as SOCKET_UNTRUSTED", async () => {
  const home = makeHome();
  const p = socketPathFor(NAME, home);
  await withConnectSpy(async (connects) => {
    assert.throws(() => assertSocketTrust(p, NAME, home), { code: "ENOENT" }); // no run dir at all
    makeLevels(home);
    assert.throws(() => requestOverSocket(p, NAME, { method: "GET", path: "/" }, home), { code: "ENOENT" });
    assert.equal(connects(), 0, "a missing socket is refused without connecting");
  });

  await start("trust", home);
  assert.doesNotThrow(() => assertSocketTrust(p, NAME, home));
  await withConnectSpy(async (connects) => {
    fs.chmodSync(p, 0o777);
    assert.throws(() => requestOverSocket(p, NAME, { method: "GET", path: "/" }, home), { code: "SOCKET_UNTRUSTED" });
    fs.chmodSync(p, 0o600);
    fs.chmodSync(runDir(home), 0o755);
    assert.throws(() => requestOverSocket(p, NAME, { method: "GET", path: "/" }, home), { code: "SOCKET_UNTRUSTED" });
    fs.chmodSync(runDir(home), 0o700);
    assert.equal(connects(), 0, "an untrusted socket is refused without connecting");
  });
  assert.equal(await servedBy(home), "trust");
});
