import fs from "node:fs";
import type http from "node:http";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  assertSocketTrust,
  listenHttpOnSocket,
  MAX_SOCKET_PATH_BYTES,
  requestOverSocket,
  runDir,
  SOCKET_NAMES,
  socketPathFor,
  type UdsListener,
  type UdsListenOptions,
} from "../server/udsListener";
import {
  copyHelperForChildren,
  escapeRegExp,
  expectUdsCode,
  expectUdsRejection,
  getOverSocket,
  killChild,
  makeRunDirChain,
  makeShortHome,
  modeOf,
  sleep,
  spawnSocketChild,
  waitFor,
  type SocketChild,
} from "./udsSpecHelpers";

// DESIGN.md D11 (bridges-uds, 2026-11-24): the helper matrix for the vault bridge's copy of the
// shared Unix-socket helper (src/server/udsListener.ts, byte-identical with the Command Center and
// Viz Studio copies, which run the same matrix under node --test). Every case passes its own short
// home, so nothing here touches the real ~/.local/state/trinc/run.

const NAME = SOCKET_NAMES.vaultBridge;
const UID = typeof process.getuid === "function" ? process.getuid() : -1;

const homes: string[] = [];
const listeners: UdsListener[] = [];
const children: SocketChild[] = [];
let helperDir = "";
let helperCopy = "";

beforeAll(() => {
  helperDir = makeShortHome();
  helperCopy = copyHelperForChildren(helperDir);
});

afterAll(() => {
  fs.rmSync(helperDir, { recursive: true, force: true });
});

afterEach(async () => {
  await Promise.allSettled(listeners.splice(0).map((listener) => listener.close()));
  for (const { child } of children.splice(0)) {
    killChild(child);
  }
  for (const home of homes.splice(0)) {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

function home(): string {
  const dir = makeShortHome();
  homes.push(dir);
  return dir;
}

interface Seen {
  host: string | undefined;
  remoteAddress: string | undefined;
  localPort: number | undefined;
}

function handler(tag: string, seen: Seen[] = []): http.RequestListener {
  return (req, res) => {
    seen.push({ host: req.headers.host, remoteAddress: req.socket.remoteAddress, localPort: req.socket.localPort });
    if (req.url === "/events") {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write(": open\n\n");
      return; // never ends, like the bridge's SSE route
    }
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: true, tag, pid: process.pid }));
  };
}

async function start(dir: string, tag = "parent", opts: Partial<UdsListenOptions> = {}, seen?: Seen[]): Promise<UdsListener> {
  const listener = await listenHttpOnSocket(handler(tag, seen), {
    socketPath: socketPathFor(NAME, dir),
    home: dir,
    watchIntervalMs: 0,
    ...opts,
  });
  listeners.push(listener);
  return listener;
}

function child(dir: string, startAt?: number): SocketChild {
  const spawned = spawnSocketChild(helperCopy, dir, NAME, startAt);
  children.push(spawned);
  return spawned;
}

async function servedBy(dir: string): Promise<string> {
  try {
    const reply = await getOverSocket(socketPathFor(NAME, dir), NAME, dir);
    return `${String(reply.json?.tag)}:${String(reply.json?.pid)}`;
  } catch (error) {
    return `error:${String((error as NodeJS.ErrnoException).code)}`;
  }
}

function hiddenNames(dir: string): string[] {
  return fs.readdirSync(runDir(dir)).filter((entry) => entry.startsWith("."));
}

describe("vault bridge socket helper: directories, modes and the bind name", () => {
  it("creates the run directory chain 0700 and publishes vault-bridge.sock 0600", async () => {
    const dir = home();
    const listener = await start(dir);
    let level = dir;
    for (const part of [".local", "state", "trinc", "run"]) {
      level = path.join(level, part);
      const st = fs.lstatSync(level);
      expect(st.isDirectory() && !st.isSymbolicLink()).toBe(true);
      expect(st.uid).toBe(UID);
      expect(modeOf(level)).toBe(0o700);
    }
    const socketPath = socketPathFor(NAME, dir);
    expect(listener.socketPath).toBe(socketPath);
    expect(fs.lstatSync(socketPath).isSocket()).toBe(true);
    expect(modeOf(socketPath)).toBe(0o600);
  });

  it("binds a hidden name first: server.address() is that name, a string, never a TCP address", async () => {
    const dir = home();
    const listener = await start(dir);
    const address = listener.server.address();
    expect(typeof address).toBe("string");
    const hidden = new RegExp(`^${escapeRegExp(runDir(dir))}/\\.vault-bridge\\.sock\\.${process.pid}\\.[0-9a-f]{8}\\.tmp$`);
    expect(String(address)).toMatch(hidden);
    expect(fs.existsSync(String(address))).toBe(false); // only the published name remains
    expect(hiddenNames(dir)).toEqual([]);
  });

  it("answers GET /healthz through requestOverSocket; the handler sees Host localhost and no TCP peer", async () => {
    const dir = home();
    const seen: Seen[] = [];
    await start(dir, "parent", {}, seen);
    const reply = await getOverSocket(socketPathFor(NAME, dir), NAME, dir);
    expect(reply.status).toBe(200);
    expect(reply.json).toMatchObject({ ok: true, tag: "parent" });
    expect(["localhost", "localhost:80"]).toContain(seen[0]?.host);
    expect(seen[0]?.remoteAddress).toBeUndefined();
    expect(seen[0]?.localPort).toBeUndefined();
  });
});

describe("vault bridge socket helper: refusals", () => {
  it("refuses a run directory with mode 0755 (RUN_DIR_MODE) and never repairs it", async () => {
    const dir = home();
    const run = makeRunDirChain(dir);
    fs.chmodSync(run, 0o755);
    await expectUdsRejection(start(dir), "RUN_DIR_MODE");
    expect(modeOf(run)).toBe(0o755);
    expect(fs.readdirSync(run)).toEqual([]);
  });

  it("refuses a symlinked run directory (RUN_DIR_UNSAFE) and binds nothing in its target", async () => {
    const dir = home();
    const run = makeRunDirChain(dir);
    fs.rmdirSync(run);
    const target = path.join(dir, "elsewhere");
    fs.mkdirSync(target, { mode: 0o700 });
    fs.symlinkSync(target, run);
    await expectUdsRejection(start(dir), "RUN_DIR_UNSAFE");
    expect(fs.lstatSync(run).isSymbolicLink()).toBe(true);
    expect(fs.readdirSync(target)).toEqual([]);
  });

  it("refuses a symlinked ancestor (RUN_DIR_UNSAFE) and creates nothing below it", async () => {
    const dir = home();
    fs.mkdirSync(path.join(dir, ".local"), { mode: 0o700 });
    const target = path.join(dir, "real-state");
    fs.mkdirSync(target, { mode: 0o700 });
    fs.symlinkSync(target, path.join(dir, ".local", "state"));
    await expectUdsRejection(start(dir), "RUN_DIR_UNSAFE");
    expect(fs.readdirSync(target)).toEqual([]);
  });

  it("refuses an ancestor that group or others can write, such as a 0777 .local (RUN_DIR_UNSAFE)", async () => {
    const dir = home();
    const local = path.join(dir, ".local");
    fs.mkdirSync(local);
    fs.chmodSync(local, 0o777);
    await expectUdsRejection(start(dir), "RUN_DIR_UNSAFE");
    expect(fs.readdirSync(local)).toEqual([]);
  });

  it("refuses a regular file at the socket path (NOT_A_SOCKET) and leaves the file untouched", async () => {
    const dir = home();
    const run = makeRunDirChain(dir);
    const socketPath = socketPathFor(NAME, dir);
    fs.writeFileSync(socketPath, "not a socket", { mode: 0o600 });
    const before = fs.lstatSync(socketPath);
    await expectUdsRejection(start(dir), "NOT_A_SOCKET");
    const after = fs.lstatSync(socketPath);
    expect(after.ino).toBe(before.ino);
    expect(fs.readFileSync(socketPath, "utf8")).toBe("not a socket");
    expect(fs.readdirSync(run)).toEqual([NAME]);
  });

  it("refuses a socket another process serves (ALREADY_SERVED) and that process stays reachable", async () => {
    const dir = home();
    const holder = child(dir);
    const report = await holder.report;
    expect(report.event).toBe("up");
    await expectUdsRejection(start(dir), "ALREADY_SERVED");
    expect(await servedBy(dir)).toBe(`child:${String(report.pid)}`);
  });

  it("refuses a published path or hidden bind name over 103 bytes (SOCKET_PATH_TOO_LONG) before creating anything", async () => {
    const dir = home();
    const suffixBytes = Buffer.byteLength(path.join("/.local", "state", "trinc", "run", NAME));
    // Published path exactly 103 bytes: it fits, but the hidden name the helper binds first does not.
    const fitsHome = path.join(dir, "h".repeat(MAX_SOCKET_PATH_BYTES - suffixBytes - Buffer.byteLength(dir) - 1));
    // Published path itself over the limit.
    const longHome = path.join(dir, "l".repeat(MAX_SOCKET_PATH_BYTES - suffixBytes - Buffer.byteLength(dir) + 10));
    for (const longDir of [fitsHome, longHome]) {
      fs.mkdirSync(longDir, { mode: 0o700 });
      const socketPath = socketPathFor(NAME, longDir);
      await expectUdsRejection(
        listenHttpOnSocket(handler("long"), { socketPath, home: longDir, watchIntervalMs: 0 }),
        "SOCKET_PATH_TOO_LONG"
      );
      expect(fs.readdirSync(longDir)).toEqual([]);
      expectUdsCode(() => assertSocketTrust(socketPath, NAME, longDir), "SOCKET_PATH_TOO_LONG");
    }
    expect(Buffer.byteLength(socketPathFor(NAME, fitsHome))).toBe(MAX_SOCKET_PATH_BYTES);
  });

  it("refuses a bad socket name (BAD_SOCKET_NAME) and a path outside the run directory (BAD_SOCKET_PATH) before touching the disk", async () => {
    const dir = home();
    expectUdsCode(() => socketPathFor("Vault-Bridge.sock", dir), "BAD_SOCKET_NAME");
    expectUdsCode(() => socketPathFor("vault-bridge.socket", dir), "BAD_SOCKET_NAME");
    const opts = { home: dir, watchIntervalMs: 0 };
    await expectUdsRejection(listenHttpOnSocket(handler("x"), { ...opts, socketPath: path.join(runDir(dir), "vault bridge.sock") }), "BAD_SOCKET_NAME");
    await expectUdsRejection(listenHttpOnSocket(handler("x"), { ...opts, socketPath: path.join(dir, NAME) }), "BAD_SOCKET_PATH");
    await expectUdsRejection(listenHttpOnSocket(handler("x"), { ...opts, socketPath: path.join("/tmp", NAME) }), "BAD_SOCKET_PATH");
    await expectUdsRejection(listenHttpOnSocket(handler("x"), { ...opts, socketPath: `${runDir(dir)}/../run/${NAME}` }), "BAD_SOCKET_PATH");
    await expectUdsRejection(listenHttpOnSocket(handler("x"), { ...opts, socketPath: path.join("relative", NAME) }), "BAD_SOCKET_PATH");
    expect(fs.readdirSync(dir)).toEqual([]);
  });
});

describe("vault bridge socket helper: stale sockets, restarts and races", () => {
  it("replaces the stale socket a SIGKILLed child left behind, and serves", async () => {
    const dir = home();
    const socketPath = socketPathFor(NAME, dir);
    const holder = child(dir);
    expect((await holder.report).event).toBe("up");
    const staleIno = fs.lstatSync(socketPath).ino;
    holder.child.kill("SIGKILL");
    await holder.exited;
    expect(fs.lstatSync(socketPath).isSocket()).toBe(true); // left behind, nobody accepts on it

    await start(dir, "replacement");
    expect(fs.lstatSync(socketPath).ino).not.toBe(staleIno);
    expect(await servedBy(dir)).toBe(`replacement:${process.pid}`);
    expect(fs.readdirSync(runDir(dir))).toEqual([NAME]);
  });

  it("lets a newer start in the same process supersede the older listener", async () => {
    const dir = home();
    const older = await start(dir, "older");
    await start(dir, "newer");
    expect(older.server.listening).toBe(false);
    expect(await servedBy(dir)).toBe(`newer:${process.pid}`);
  });

  it("lets exactly one of two child processes started at the same instant publish", { timeout: 30_000 }, async () => {
    for (let round = 0; round < 3; round++) {
      const dir = home();
      const startAt = Date.now() + 1_500;
      const racers = [child(dir, startAt), child(dir, startAt)];
      const reports = await Promise.all(racers.map((racer) => racer.report));
      const winners = reports.filter((report) => report.event === "up");
      const loser = reports.findIndex((report) => report.event === "refused");
      expect(winners).toHaveLength(1);
      expect(loser).toBeGreaterThanOrEqual(0);
      expect(["ALREADY_SERVED", "LOST_RACE"]).toContain(reports[loser].code);
      expect(await servedBy(dir)).toBe(`child:${String(winners[0].pid)}`);
      await racers[loser].exited;
      expect(hiddenNames(dir)).toEqual([]);
    }
  });
});

describe("vault bridge socket helper: close and ownership", () => {
  it("close() removes the published socket and keeps the run directory", async () => {
    const dir = home();
    const listener = await start(dir);
    await listener.close();
    expect(fs.existsSync(socketPathFor(NAME, dir))).toBe(false);
    expect(modeOf(runDir(dir))).toBe(0o700);
    expect(fs.readdirSync(runDir(dir))).toEqual([]);
  });

  it("close() after a successor took the path leaves the successor's socket alone", async () => {
    const dir = home();
    const socketPath = socketPathFor(NAME, dir);
    const first = await start(dir, "first");
    fs.unlinkSync(socketPath); // the first server is still running, but its name is gone
    const successor = child(dir);
    const report = await successor.report;
    expect(report.event).toBe("up");
    const successorIno = fs.lstatSync(socketPath).ino;

    await first.close();
    expect(fs.lstatSync(socketPath).ino).toBe(successorIno);
    expect(await servedBy(dir)).toBe(`child:${String(report.pid)}`);
  });

  it("calls onLost once when the published name is removed", async () => {
    const dir = home();
    const reasons: string[] = [];
    await start(dir, "watched", { watchIntervalMs: 50, onLost: (reason) => reasons.push(reason) });
    fs.unlinkSync(socketPathFor(NAME, dir));
    expect(await waitFor(() => reasons.length > 0, 2_000)).toBe(true);
    await sleep(200);
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toMatch(/was removed/);
  });

  it("calls onLost once when the published name is replaced by another socket, and close() leaves the replacement", async () => {
    const dir = home();
    const socketPath = socketPathFor(NAME, dir);
    const reasons: string[] = [];
    const watched = await start(dir, "watched", { watchIntervalMs: 50, onLost: (reason) => reasons.push(reason) });
    const other = await listenHttpOnSocket(handler("other"), {
      socketPath: socketPathFor(SOCKET_NAMES.commandCenter, dir),
      home: dir,
      watchIntervalMs: 0,
    });
    listeners.push(other);
    fs.renameSync(other.socketPath, socketPath);
    expect(await waitFor(() => reasons.length > 0, 2_000)).toBe(true);
    await sleep(200);
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toMatch(/now points at another socket/);

    const replacementIno = fs.lstatSync(socketPath).ino;
    await watched.close();
    expect(fs.lstatSync(socketPath).ino).toBe(replacementIno);
    expect(await servedBy(dir)).toBe(`other:${process.pid}`);
  });

  it("close() resolves within the grace period while a never-ending response is open", async () => {
    const dir = home();
    const listener = await start(dir, "streaming", { closeGraceMs: 300 });
    const streamClosed = new Promise<void>((resolve, reject) => {
      const req = requestOverSocket(listener.socketPath, NAME, { method: "GET", path: "/events" }, dir);
      req.on("response", (res) => {
        res.on("error", () => undefined); // "aborted" when the server ends the stream
        res.on("close", () => resolve());
        res.resume();
      });
      req.on("error", reject);
      req.end();
    });
    await sleep(100);
    const started = Date.now();
    await listener.close();
    const elapsed = Date.now() - started;
    expect(elapsed).toBeGreaterThanOrEqual(250);
    expect(elapsed).toBeLessThan(2_000);
    await streamClosed;
    expect(fs.existsSync(listener.socketPath)).toBe(false);
  });
});

describe("vault bridge socket helper: client rules", () => {
  it("throws before any request exists for an empty path or a wrong expected name", async () => {
    const dir = home();
    const listener = await start(dir);
    let connections = 0;
    listener.server.on("connection", () => {
      connections += 1;
    });
    expectUdsCode(() => requestOverSocket("", NAME, { method: "GET", path: "/healthz" }, dir), "BAD_SOCKET_PATH");
    expectUdsCode(
      () => requestOverSocket(listener.socketPath, SOCKET_NAMES.commandCenter, { method: "GET", path: "/healthz" }, dir),
      "SOCKET_UNTRUSTED"
    );
    await sleep(50);
    expect(connections).toBe(0);
  });

  it("reports a missing run directory or socket as ENOENT without connecting", () => {
    const dir = home();
    const socketPath = socketPathFor(NAME, dir);
    expectUdsCode(() => assertSocketTrust(socketPath, NAME, dir), "ENOENT");
    makeRunDirChain(dir);
    expectUdsCode(() => assertSocketTrust(socketPath, NAME, dir), "ENOENT");
  });

  it("refuses a 0777 socket and a 0755 run directory (SOCKET_UNTRUSTED)", async () => {
    const dir = home();
    const listener = await start(dir);
    assertSocketTrust(listener.socketPath, NAME, dir);

    fs.chmodSync(listener.socketPath, 0o777);
    expectUdsCode(() => assertSocketTrust(listener.socketPath, NAME, dir), "SOCKET_UNTRUSTED");
    expectUdsCode(() => requestOverSocket(listener.socketPath, NAME, { method: "GET", path: "/healthz" }, dir), "SOCKET_UNTRUSTED");
    fs.chmodSync(listener.socketPath, 0o600);

    fs.chmodSync(runDir(dir), 0o755);
    expectUdsCode(() => assertSocketTrust(listener.socketPath, NAME, dir), "SOCKET_UNTRUSTED");
    fs.chmodSync(runDir(dir), 0o700);
    assertSocketTrust(listener.socketPath, NAME, dir);
  });
});
