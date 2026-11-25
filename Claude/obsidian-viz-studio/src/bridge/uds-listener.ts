/**
 * Unix-domain-socket listener and client rules for the TRINC bridges (bridges-uds, 2026-11-24).
 *
 * BYTE-IDENTICAL in three packages; ops/tr-suite/verify.sh compares them:
 *   Claude/obsidian-command-center/src/bridge/uds-listener.ts
 *   Claude/obsidian-viz-studio/src/bridge/uds-listener.ts
 *   Copilot-Everything/bridges/obsidian-copilot-bridge/src/server/udsListener.ts
 * Change all three together. Node built-ins only, static imports only (Obsidian's renderer breaks on
 * dynamic built-in imports), erasable TypeScript only (node --test --experimental-strip-types must
 * load it: no enums, namespaces or parameter properties). The file is on LEGITIMATE_NON_TCP in
 * scripts/lint-transport-monorepo.sh: it may call http.createServer, and it only ever listens on a
 * filesystem path inside the run directory. The JavaScript clients (proxy, adapter, engine, health
 * script) carry the same client rules as a byte-identical "bridges-uds client v1" block.
 *
 * Security model. Each bridge serves plain HTTP/1.1 on its own socket in a private run directory
 * (<home>/.local/state/trinc/run, mode 0700; sockets 0600). Only processes of the same uid can reach
 * it, and no browser can, so TLS is not used on these links; the bearer token stays as defence in
 * depth against other same-uid processes. The barrier is the directory chain: every level from home
 * down is a real directory owned by this uid that others cannot write, the run directory grants
 * others nothing, and no level carries an ACL allow entry (fs.Stats cannot see ACLs, so /bin/ls is
 * asked). The 0600 socket mode is the second layer (macOS checks it on connect).
 *
 * Publishing. The server binds a hidden name "<run>/.<name>.<pid>.<8 hex>.tmp", chmods it 0600, and
 * then hard-links it onto the published name. link() is atomic and exclusive: it fails with EEXIST
 * when anything holds the name, so two starters can never both publish. A stale socket is replaced
 * only by first renaming the name aside and checking that the inode moved is exactly the one probed
 * as stale; anything else is linked straight back and this starter refuses. The kernel keeps the
 * hidden name as the socket's bound address, so server.address(), getsockname and lsof show the
 * hidden name (with the owner's pid embedded) and never the published name: log listener.socketPath.
 * libuv unlinks the bound path when a server closes; that path is the hidden name, already gone, so a
 * closing server can never delete a successor's socket. The published name is removed by moving it
 * aside and keeping it only if the moved inode is this server's.
 *
 * "Stale" is a heuristic on macOS: a live server whose accept queue is full also answers
 * ECONNREFUSED. Stale is therefore confirmed with two more probes 100 ms apart, and a server whose
 * name is taken over notices within one watch tick (fs.watch on the run directory plus a poll) and
 * reports onLost; its owner then closes it.
 */
import { execFileSync } from "node:child_process";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as http from "node:http";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";

/** One socket per bridge, each owned by its own plugin or daemon. */
export const SOCKET_NAMES = Object.freeze({
  vaultBridge: "vault-bridge.sock",
  commandCenter: "command-center.sock",
  vizStudio: "viz-studio.sock",
});

/** macOS sun_path holds 104 bytes including the NUL; Node 22 silently truncates longer paths. */
export const MAX_SOCKET_PATH_BYTES = 103;

/** Bytes a hidden name adds to the socket name: "." + name + "." + pid (up to 7 digits) + "." + 8 hex + ".tmp". */
const HIDDEN_NAME_EXTRA_BYTES = 22;
const SOCKET_NAME_RE = /^[a-z0-9][a-z0-9-]*\.sock$/;
const DEFAULT_PROBE_TIMEOUT_MS = 500;
const DEFAULT_WATCH_INTERVAL_MS = 30_000;
const DEFAULT_CLOSE_GRACE_MS = 1_000;
const STALE_CONFIRM_PROBES = 2;
const STALE_CONFIRM_DELAY_MS = 100;
const PUBLISH_ATTEMPTS = 4;

/** Every refusal carries a stable code so callers can log and surface it precisely. */
export class UdsListenerError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "UdsListenerError";
    this.code = code;
  }
}

/**
 * The run directory. Always derived from the home directory, never from "~" or XDG variables:
 * Obsidian started from Finder does not inherit the shell environment, so an XDG-based path would
 * differ between processes.
 */
export function runDir(home: string = os.homedir()): string {
  return path.join(home, ".local", "state", "trinc", "run");
}

/** Absolute path of a bridge socket, e.g. socketPathFor(SOCKET_NAMES.vizStudio). */
export function socketPathFor(name: string, home: string = os.homedir()): string {
  if (!SOCKET_NAME_RE.test(name)) {
    throw new UdsListenerError("BAD_SOCKET_NAME", `invalid socket name: ${name}`);
  }
  return path.join(runDir(home), name);
}

function currentUid(): number {
  if (typeof process.getuid !== "function") {
    throw new UdsListenerError("UNSUPPORTED_PLATFORM", "Unix-socket bridges need a POSIX uid");
  }
  return process.getuid();
}

function lstatOrNull(p: string): fs.Stats | null {
  try {
    return fs.lstatSync(p);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

function octal(mode: number): string {
  return (mode & 0o7777).toString(8).padStart(4, "0");
}

function unrefTimer(timer: unknown): void {
  const t = timer as { unref?: () => void };
  if (typeof t.unref === "function") t.unref();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function unlinkQuietly(p: string): void {
  try {
    fs.unlinkSync(p);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

function hiddenPath(dir: string, base: string, kind: "tmp" | "old" | "bye"): string {
  return path.join(dir, `.${base}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.${kind}`);
}

/**
 * The socket path must sit directly in the run directory, with a plain name, and both it and the
 * hidden name the server binds first must fit macOS's limit. Checked before any side effect.
 */
function assertSocketPath(socketPath: string, home: string): void {
  if (typeof socketPath !== "string" || socketPath === "" || !path.isAbsolute(socketPath) || path.resolve(socketPath) !== socketPath) {
    throw new UdsListenerError("BAD_SOCKET_PATH", `socket path must be absolute and normalized: ${String(socketPath)}`);
  }
  const dir = runDir(home);
  if (path.dirname(socketPath) !== dir) {
    throw new UdsListenerError("BAD_SOCKET_PATH", `socket must live directly in ${dir}: ${socketPath}`);
  }
  const base = path.basename(socketPath);
  if (!SOCKET_NAME_RE.test(base)) {
    throw new UdsListenerError("BAD_SOCKET_NAME", `invalid socket name: ${base}`);
  }
  const hiddenBytes = Buffer.byteLength(dir) + 1 + Buffer.byteLength(base) + HIDDEN_NAME_EXTRA_BYTES;
  const bytes = Math.max(Buffer.byteLength(socketPath), hiddenBytes);
  if (bytes > MAX_SOCKET_PATH_BYTES) {
    throw new UdsListenerError(
      "SOCKET_PATH_TOO_LONG",
      `socket path needs ${bytes} bytes (with its hidden bind name); macOS allows ${MAX_SOCKET_PATH_BYTES}: ${socketPath}`
    );
  }
}

/**
 * macOS ACLs are invisible to fs.Stats. An allow entry, inherited or not, can hand other accounts
 * search, add_file or delete_child on a 0700 directory. Node has no ACL API, so ask /bin/ls (about
 * 7 ms). Deny entries, like the stock "group:everyone deny delete" on a home folder, only restrict.
 * An ls that fails or times out is a refusal with this module's code, never a pass and never a raw
 * ETIMEDOUT that a caller could mistake for a request timeout.
 */
function assertNoAllowAcl(p: string, seen: Set<string> | null, key: string): void {
  if (process.platform !== "darwin") return;
  if (seen !== null && seen.has(key)) return;
  let out: string;
  try {
    out = execFileSync("/bin/ls", ["-lde", p], { encoding: "utf8", timeout: 2000 });
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { status?: unknown };
    throw new UdsListenerError("RUN_DIR_ACL", `could not read the ACL of ${p} (${e.code ?? `ls exit ${String(e.status)}`}); refusing`);
  }
  const allow = out.split("\n").slice(1).find((line) => / allow /.test(line));
  if (allow !== undefined) {
    throw new UdsListenerError(
      "RUN_DIR_ACL",
      `${p} carries an ACL entry that grants access (${allow.trim().slice(0, 120)}); check who added it, then remove it with chmod -N`
    );
  }
  if (seen !== null) seen.add(key);
}

/**
 * Walk home and every level down to the run directory. Each level must be a real directory (not a
 * symlink) owned by this uid; levels above the run directory must not be writable by group or
 * others; the run directory must grant them nothing; no level may carry an ACL allow entry. With
 * create, missing levels are made 0700; without it, a missing level returns false. A run directory
 * with a looser mode is refused, never repaired: a mode someone else loosened is a signal, not a typo
 * to tidy up. aclSeen memoizes ACL checks by dev:ino (clients); null checks every time (servers).
 */
function verifyChain(home: string, uid: number, create: boolean, aclSeen: Set<string> | null): boolean {
  const levels = [home];
  for (const part of [".local", "state", "trinc", "run"]) levels.push(path.join(levels[levels.length - 1], part));
  for (let i = 0; i < levels.length; i++) {
    const p = levels[i];
    let st = lstatOrNull(p);
    if (st === null) {
      if (!create) return false; // a client: a missing home or level means the bridge is not running (ENOENT)
      if (i === 0) throw new UdsListenerError("RUN_DIR_UNSAFE", `home directory ${p} does not exist`);
      try {
        fs.mkdirSync(p, { mode: 0o700 });
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      }
      st = fs.lstatSync(p);
    }
    if (st.isSymbolicLink() || !st.isDirectory()) {
      throw new UdsListenerError("RUN_DIR_UNSAFE", `${p} is not a real directory`);
    }
    if (st.uid !== uid) {
      throw new UdsListenerError("RUN_DIR_UNSAFE", `${p} is owned by uid ${st.uid}, not ${uid}`);
    }
    const isRunDir = i === levels.length - 1;
    if (isRunDir && (st.mode & 0o077) !== 0) {
      throw new UdsListenerError(
        "RUN_DIR_MODE",
        `${p} has mode ${octal(st.mode)}; it must be 0700. Check who changed it, then run: chmod 700 '${p}'`
      );
    }
    if (!isRunDir && (st.mode & 0o022) !== 0) {
      throw new UdsListenerError("RUN_DIR_UNSAFE", `${p} is writable by group or others (${octal(st.mode)})`);
    }
    assertNoAllowAcl(p, aclSeen, `${st.dev}:${st.ino}`);
  }
  return true;
}

export type ProbeResult =
  | { state: "live" }
  | { state: "stale" }
  | { state: "absent" }
  | { state: "unknown"; code: string };

/**
 * Connect and hang up. "live": something accepts connections on the path. "stale": a socket file
 * with no listener (left by a crash or SIGKILL), or on macOS a live server with a full accept queue.
 * "absent": nothing at the path. "unknown": anything else, including a timeout; callers treat it as
 * live.
 */
export function probeSocket(socketPath: string, timeoutMs: number = DEFAULT_PROBE_TIMEOUT_MS): Promise<ProbeResult> {
  return new Promise((resolve) => {
    let settled = false;
    let timer: unknown = null;
    const socket = net.connect({ path: socketPath });
    const finish = (result: ProbeResult): void => {
      if (settled) return;
      settled = true;
      if (timer !== null) clearTimeout(timer as ReturnType<typeof setTimeout>);
      socket.destroy();
      resolve(result);
    };
    timer = setTimeout(() => finish({ state: "unknown", code: "ETIMEDOUT" }), timeoutMs);
    socket.once("connect", () => finish({ state: "live" }));
    socket.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ECONNREFUSED") finish({ state: "stale" });
      else if (err.code === "ENOENT") finish({ state: "absent" });
      else finish({ state: "unknown", code: err.code ?? "EUNKNOWN" });
    });
  });
}

/**
 * The published name is free when nothing is there, or when a socket of ours answers ECONNREFUSED
 * three times 100 ms apart. Never remove or replace anything else: a non-socket, a socket of another
 * uid, or a live socket (for example the same plugin in a second Obsidian window) is a refusal.
 * Returns the lstat of the stale socket that was probed (null when the name is free), so a later
 * move can prove it moves exactly that file.
 */
async function assertPathAvailable(socketPath: string, uid: number, probeTimeoutMs: number): Promise<fs.Stats | null> {
  const st = lstatOrNull(socketPath);
  if (st === null) return null;
  if (!st.isSocket()) {
    throw new UdsListenerError("NOT_A_SOCKET", `${socketPath} exists and is not a socket; refusing to replace it`);
  }
  if (st.uid !== uid) {
    throw new UdsListenerError("FOREIGN_SOCKET", `${socketPath} is owned by uid ${st.uid}, not ${uid}; refusing to replace it`);
  }
  let probe = await probeSocket(socketPath, probeTimeoutMs);
  for (let i = 0; i < STALE_CONFIRM_PROBES && probe.state === "stale"; i++) {
    await delay(STALE_CONFIRM_DELAY_MS);
    probe = await probeSocket(socketPath, probeTimeoutMs);
  }
  if (probe.state === "live") {
    throw new UdsListenerError(
      "ALREADY_SERVED",
      `another process already holds ${socketPath} (this plugin in a second Obsidian window, an older instance, or something else)`
    );
  }
  if (probe.state === "unknown") {
    throw new UdsListenerError("PROBE_FAILED", `could not tell whether ${socketPath} is in use: ${probe.code}`);
  }
  return probe.state === "absent" ? null : st;
}

/**
 * Publish the bound hidden socket under its published name, exclusively. A stale socket is moved
 * aside first, and only if the moved file is still the probed inode; otherwise someone published in
 * between, the moved file gets its name back, and this start refuses.
 */
async function publishExclusive(
  tmpPath: string,
  socketPath: string,
  dir: string,
  base: string,
  uid: number,
  probeTimeoutMs: number
): Promise<void> {
  for (let attempt = 0; attempt < PUBLISH_ATTEMPTS; attempt++) {
    try {
      fs.linkSync(tmpPath, socketPath);
      unlinkQuietly(tmpPath); // the published name is now the only name
      return;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    }
    const stale = await assertPathAvailable(socketPath, uid, probeTimeoutMs); // throws unless free or our stale socket
    if (stale === null) continue;
    const aside = hiddenPath(dir, base, "old");
    try {
      fs.renameSync(socketPath, aside);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") continue; // another starter moved it first
      throw err;
    }
    const moved = lstatOrNull(aside);
    if (moved !== null && moved.dev === stale.dev && moved.ino === stale.ino) {
      unlinkQuietly(aside); // exactly the stale inode that was probed
      continue;
    }
    if (moved !== null) {
      try {
        fs.linkSync(aside, socketPath); // a newer socket was moved by mistake: give it its name back
      } catch {
        // the name was taken again meanwhile; the moved socket's owner sees onLost
      }
      unlinkQuietly(aside);
    }
    throw new UdsListenerError("ALREADY_SERVED", `another process published ${socketPath} while this one was starting`);
  }
  throw new UdsListenerError("LOST_RACE", `${socketPath} kept changing while this server was publishing it`);
}

/** Remove hidden names a crash left behind for this socket name (only dead owners' sockets). */
function sweepLeftovers(dir: string, base: string, uid: number): void {
  const re = new RegExp(`^\\.${base.replace(/\./g, "\\.")}\\.(\\d+)\\.[0-9a-f]{8}\\.(tmp|old|bye)$`);
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names) {
    const m = re.exec(name);
    if (m === null) continue;
    const pid = Number(m[1]);
    if (pid === process.pid || pidAlive(pid)) continue;
    const p = path.join(dir, name);
    const st = lstatOrNull(p);
    if (st !== null && st.isSocket() && st.uid === uid) unlinkQuietly(p);
  }
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

function listenOnPath(server: http.Server, p: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (err: Error): void => {
      server.removeListener("listening", onListening);
      reject(err);
    };
    const onListening = (): void => {
      server.removeListener("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(p);
  });
}

/** Stop accepting, end idle connections now and all connections (SSE included) after graceMs. */
function closeServer(server: http.Server, graceMs: number): Promise<void> {
  return new Promise((resolve) => {
    if (!server.listening) {
      resolve();
      return;
    }
    let timer: unknown = null;
    server.close(() => {
      if (timer !== null) clearTimeout(timer as ReturnType<typeof setTimeout>);
      resolve();
    });
    if (typeof server.closeIdleConnections === "function") server.closeIdleConnections();
    timer = setTimeout(() => {
      if (typeof server.closeAllConnections === "function") server.closeAllConnections();
    }, graceMs);
    unrefTimer(timer);
  });
}

export interface UdsListenOptions {
  /** Absolute socket path directly inside the run directory, e.g. socketPathFor(SOCKET_NAMES.commandCenter). */
  socketPath: string;
  /** Home directory that holds the run directory (tests pass a short temp directory such as /tmp/uds-XXXXXX). */
  home?: string;
  /** Liveness-probe timeout for an existing socket file, in ms (default 500). */
  probeTimeoutMs?: number;
  /** Poll interval of the ownership check, in ms (default 30000; 0 disables the poll and fs.watch). */
  watchIntervalMs?: number;
  /** How long close() lets open connections finish before ending them, in ms (default 1000). */
  closeGraceMs?: number;
  /** Called once if the published name is removed or replaced while this server runs. The owner should close the listener. */
  onLost?: (reason: string) => void;
}

export interface UdsListener {
  /** The HTTP server. Its address() is the hidden name it bound, which no longer exists: log and report socketPath. */
  readonly server: http.Server;
  readonly socketPath: string;
  /** Stop accepting and remove the published name at once if it is still this server's; open connections get the grace period. */
  close(): Promise<void>;
  /** Synchronous last-resort cleanup: removes the published name only if it is still this server's. */
  unlinkIfOwnedSync(): void;
}

interface RegistryEntry {
  done: Promise<void>;
  listener: UdsListener | null;
  superseded: boolean;
}

const REGISTRY_KEY = Symbol.for("trinc.bridges-uds.listener-registry.v1");

/**
 * One entry per socket path per process (per window realm in Obsidian). Obsidian may load a new
 * plugin instance before the old one's asynchronous close finished; a newer start of the same path
 * in the same process waits for the older start, closes the older listener, then publishes.
 */
function registry(): Map<string, RegistryEntry> {
  const g = globalThis as unknown as Record<symbol, Map<string, RegistryEntry> | undefined>;
  let reg = g[REGISTRY_KEY];
  if (reg === undefined) {
    reg = new Map<string, RegistryEntry>();
    g[REGISTRY_KEY] = reg;
  }
  return reg;
}

async function startListener(handler: http.RequestListener, opts: UdsListenOptions, home: string, uid: number): Promise<UdsListener> {
  const probeTimeoutMs = opts.probeTimeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS;
  const watchIntervalMs = opts.watchIntervalMs ?? DEFAULT_WATCH_INTERVAL_MS;
  const closeGraceMs = opts.closeGraceMs ?? DEFAULT_CLOSE_GRACE_MS;
  const socketPath = opts.socketPath;
  const base = path.basename(socketPath);

  verifyChain(home, uid, true, null);
  const dir = runDir(home);
  sweepLeftovers(dir, base, uid);
  await assertPathAvailable(socketPath, uid, probeTimeoutMs);

  const tmpPath = hiddenPath(dir, base, "tmp"); // its length was checked by assertSocketPath
  const server = http.createServer(handler);
  await listenOnPath(server, tmpPath);

  let identity: { dev: number; ino: number };
  try {
    fs.chmodSync(tmpPath, 0o600);
    const st = fs.lstatSync(tmpPath);
    if (!st.isSocket() || st.uid !== uid || (st.mode & 0o777) !== 0o600) {
      throw new UdsListenerError("SOCKET_MODE", `${tmpPath} is not a 0600 socket owned by uid ${uid}`);
    }
    assertNoAllowAcl(tmpPath, null, "");
    identity = { dev: st.dev, ino: st.ino };
    await publishExclusive(tmpPath, socketPath, dir, base, uid, probeTimeoutMs);
    // The exclusive link made the name ours. A different inode now means a non-exclusive writer (an
    // older helper, or a person) replaced it. A missing name is not a refusal here: a losing starter
    // may have moved this socket aside for a moment and is putting it back; a real removal is onLost's.
    const published = lstatOrNull(socketPath);
    if (published !== null && (published.dev !== identity.dev || published.ino !== identity.ino)) {
      throw new UdsListenerError("LOST_RACE", `${socketPath} was replaced while this server was publishing it`);
    }
  } catch (err) {
    await closeServer(server, 0); // libuv unlinks tmpPath if it is still there
    unlinkQuietly(tmpPath);
    throw err;
  }

  const owned = (): boolean => {
    const st = lstatOrNull(socketPath);
    return st !== null && st.isSocket() && st.dev === identity.dev && st.ino === identity.ino;
  };
  // "if owned then unlink" is check-then-act across processes; move the name aside first, then keep
  // the removal only if the inode actually moved is this server's.
  const unpublishIfOwned = (): void => {
    if (!owned()) return;
    const aside = hiddenPath(dir, base, "bye");
    try {
      fs.renameSync(socketPath, aside);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
      throw err;
    }
    const moved = lstatOrNull(aside);
    if (moved !== null && !(moved.dev === identity.dev && moved.ino === identity.ino)) {
      try {
        fs.linkSync(aside, socketPath); // a successor's socket: give its name back
      } catch {
        // the name was taken again meanwhile
      }
    }
    unlinkQuietly(aside);
  };

  let lost = false;
  let pollTimer: unknown = null;
  let dirWatcher: fs.FSWatcher | null = null;
  const stopWatch = (): void => {
    if (pollTimer !== null) {
      clearInterval(pollTimer as ReturnType<typeof setInterval>);
      pollTimer = null;
    }
    if (dirWatcher !== null) {
      dirWatcher.close();
      dirWatcher = null;
    }
  };
  const checkOwnership = (): void => {
    if (lost) return;
    const st = lstatOrNull(socketPath);
    let reason = "";
    if (st === null) reason = `${socketPath} was removed`;
    else if (!st.isSocket()) reason = `${socketPath} was replaced by something that is not a socket`;
    else if (st.dev !== identity.dev || st.ino !== identity.ino) reason = `${socketPath} now points at another socket`;
    if (reason === "") return;
    lost = true;
    stopWatch();
    if (opts.onLost) opts.onLost(reason);
  };
  if (watchIntervalMs > 0) {
    pollTimer = setInterval(checkOwnership, watchIntervalMs);
    unrefTimer(pollTimer);
    try {
      dirWatcher = fs.watch(dir, { persistent: false }, () => checkOwnership());
      dirWatcher.on("error", () => {
        // the poll still covers it
      });
    } catch {
      dirWatcher = null;
    }
  }

  const exitHook = (): void => {
    try {
      unpublishIfOwned();
    } catch {
      // best effort at process exit
    }
  };
  process.once("exit", exitHook);

  return {
    server,
    socketPath,
    async close(): Promise<void> {
      stopWatch();
      const drained = closeServer(server, closeGraceMs); // stops accepting at once; open connections get the grace period
      try {
        unpublishIfOwned(); // the name goes now: clients see ENOENT, and a successor needs no stale confirmation
      } finally {
        process.removeListener("exit", exitHook); // only once the name is gone, so an exit during the drain still cleans up
      }
      await drained;
    },
    unlinkIfOwnedSync(): void {
      stopWatch();
      process.removeListener("exit", exitHook);
      unpublishIfOwned();
    },
  };
}

/**
 * Serve `handler` over HTTP/1.1 on a Unix socket. Never listens on TCP, never falls back to TCP, and
 * refuses (throws UdsListenerError) whenever the directory chain, the path or an existing file is not
 * exactly what it should be.
 */
export async function listenHttpOnSocket(handler: http.RequestListener, opts: UdsListenOptions): Promise<UdsListener> {
  const home = opts.home ?? os.homedir();
  const socketPath = opts.socketPath;
  const uid = currentUid();
  assertSocketPath(socketPath, home);

  const reg = registry();
  const prev = reg.get(socketPath);
  let settle: () => void = () => {};
  const entry: RegistryEntry = {
    done: new Promise<void>((resolve) => {
      settle = resolve;
    }),
    listener: null,
    superseded: false,
  };
  reg.set(socketPath, entry);
  try {
    if (prev !== undefined) {
      prev.superseded = true;
      await prev.done;
      if (prev.listener !== null) await prev.listener.close();
    }
    if (entry.superseded) throw new UdsListenerError("SUPERSEDED", `a newer start for ${socketPath} began in this process`);
    const inner = await startListener(handler, opts, home, uid);
    if (entry.superseded) {
      await inner.close();
      throw new UdsListenerError("SUPERSEDED", `a newer start for ${socketPath} began in this process`);
    }
    const listener: UdsListener = {
      server: inner.server,
      socketPath,
      async close(): Promise<void> {
        await inner.close();
        if (reg.get(socketPath) === entry) reg.delete(socketPath);
      },
      unlinkIfOwnedSync(): void {
        inner.unlinkIfOwnedSync();
        if (reg.get(socketPath) === entry) reg.delete(socketPath);
      },
    };
    entry.listener = listener;
    return listener;
  } catch (err) {
    if (reg.get(socketPath) === entry) reg.delete(socketPath);
    throw err;
  } finally {
    settle();
  }
}

const CLIENT_ACL_SEEN = new Set<string>();

/**
 * Client-side check before a bearer token is written to a socket. The path must be exactly
 * <run>/<expectedName>; the whole directory chain must pass the same checks the server makes; and
 * the socket must be a socket owned by this uid that grants group and others nothing, by mode or by
 * ACL. A missing home, directory or socket is refused with code "ENOENT" (bridge not running)
 * without connecting.
 */
export function assertSocketTrust(socketPath: string, expectedName: string, home: string = os.homedir()): void {
  const uid = currentUid();
  assertSocketPath(socketPath, home);
  if (path.basename(socketPath) !== expectedName) {
    throw new UdsListenerError("SOCKET_UNTRUSTED", `expected ${expectedName}, got ${path.basename(socketPath)}`);
  }
  let present: boolean;
  try {
    present = verifyChain(home, uid, false, CLIENT_ACL_SEEN);
  } catch (err) {
    if (err instanceof UdsListenerError) throw new UdsListenerError("SOCKET_UNTRUSTED", err.message);
    throw err;
  }
  if (!present) throw new UdsListenerError("ENOENT", `${path.dirname(socketPath)} does not exist (bridge not running)`);
  const st = lstatOrNull(socketPath);
  if (st === null) throw new UdsListenerError("ENOENT", `${socketPath} does not exist (bridge not running)`);
  if (!st.isSocket() || st.uid !== uid || (st.mode & 0o077) !== 0) {
    throw new UdsListenerError("SOCKET_UNTRUSTED", `${socketPath} is not a private socket owned by uid ${uid}`);
  }
  try {
    assertNoAllowAcl(socketPath, CLIENT_ACL_SEEN, `${st.dev}:${st.ino}`); // once per socket inode per process
  } catch (err) {
    if (err instanceof UdsListenerError) throw new UdsListenerError("SOCKET_UNTRUSTED", err.message);
    throw err;
  }
}

/**
 * The only way bridge clients in these packages should make a request: runs assertSocketTrust on the
 * exact path it then uses, drops any agent/host/port option, and pins the connection to the socket
 * with createConnection. Node turns an empty socketPath into TCP to localhost:80, and agent: false
 * ignores a createConnection pin; neither can happen here. Node calls the pin with the request's
 * options, timeout included, but the pin connects to the checked path on its own, so it passes the
 * timeout on itself: a pin that dropped it left the timeout option unarmed, and a stalled bridge
 * hung the request. With no timeout set, the connect options are exactly { path }. As with Node's
 * own connect, the 'timeout' event only reports; the caller destroys.
 */
export function requestOverSocket(
  socketPath: string,
  expectedName: string,
  options: http.RequestOptions,
  home: string = os.homedir()
): http.ClientRequest {
  assertSocketTrust(socketPath, expectedName, home);
  const opts: http.RequestOptions = { ...options };
  delete opts.agent;
  delete opts.host;
  delete opts.hostname;
  delete opts.port;
  delete opts.createConnection;
  const timeout = opts.timeout;
  const connectOptions = (): net.IpcNetConnectOpts => (timeout === undefined ? { path: socketPath } : { path: socketPath, timeout });
  return http.request({ ...opts, socketPath, createConnection: () => net.connect(connectOptions()) });
}
