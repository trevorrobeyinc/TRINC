import { execFileSync } from "child_process";
import { closeSync, constants as fsConstants, existsSync, fstatSync, lstatSync, openSync, readSync, realpathSync } from "fs";
import * as http from "http";
import * as net from "net";
import { isAbsolute, resolve } from "path";

/*
 * The launcher's side of the vault bridge's Unix socket (bridges-uds, 2026-11-24). The bridge serves
 * plain HTTP/1.1 on <home>/.local/state/trinc/run/vault-bridge.sock and never on TCP. The launcher
 * sends it no token: it only asks /healthz for readiness and, before a spawn, works out whether a live
 * socket belongs to an orphaned bridge of this package that it may kill.
 *
 * No TCP lookups at all. A bound Unix socket is found by the hidden name the shared helper binds before it
 * publishes, "<run>/.vault-bridge.sock.<pid>.<8 hex>.tmp": the kernel keeps that name as the socket's
 * address (rename does not change it), so lsof shows it, with the owner's pid embedded, and never the
 * published name.
 */

export type ProbeState = "live" | "stale" | "absent" | "unknown";

/** Re-probes before a live socket counts as held: a just-killed holder accepts connects for ~2 ms. */
const STALE_REPROBES = 5;
const STALE_REPROBE_DELAY_MS = 100;
/** After SIGTERM, how long the holder gets to exit before SIGKILL (the bridge's own drain is longer). */
const TERM_WAIT_MS = 1_500;
/** Bounds on the polls after the signals: kill(pid, 0) until ESRCH, then the probe until not live. */
const GONE_WAIT_MS = 5_000;
const RELEASE_WAIT_MS = 2_000;
const POLL_MS = 50;

const LSOF = existsSync("/usr/sbin/lsof") ? "/usr/sbin/lsof" : "lsof";
const PS = existsSync("/bin/ps") ? "/bin/ps" : "ps";

function delay(ms: number): Promise<void> {
  return new Promise((done) => {
    setTimeout(done, ms);
  });
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Connect and hang up, like the helper's probeSocket: live, stale (ECONNREFUSED), absent (ENOENT) or unknown. */
export function probeSocket(socketPath: string, timeoutMs = 500): Promise<ProbeState> {
  return new Promise((done) => {
    if (!isAbsolute(socketPath)) {
      done("unknown");
      return;
    }
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const socket = net.connect({ path: socketPath });
    const finish = (state: ProbeState): void => {
      if (settled) return;
      settled = true;
      if (timer !== null) clearTimeout(timer);
      socket.destroy();
      done(state);
    };
    timer = setTimeout(() => finish("unknown"), timeoutMs);
    socket.once("connect", () => finish("live"));
    socket.once("error", (err: NodeJS.ErrnoException) => {
      finish(err.code === "ECONNREFUSED" ? "stale" : err.code === "ENOENT" ? "absent" : "unknown");
    });
  });
}

/** A probe that is not plainly free or stale counts as held: never spawn beside, or kill, on a guess. */
function isHeld(state: ProbeState): boolean {
  return state === "live" || state === "unknown";
}

/**
 * GET /healthz pinned to the socket: socketPath plus createConnection, no agent (agent: false ignores
 * the pin), no token. Resolves the HTTP status, or null on any error or after timeoutMs.
 */
export function getHealthz(socketPath: string, timeoutMs: number): Promise<number | null> {
  return new Promise((done) => {
    // An empty or relative socketPath would make Node dial TCP localhost:80 instead: refuse it.
    if (!isAbsolute(socketPath)) {
      done(null);
      return;
    }
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const finish = (status: number | null): void => {
      if (settled) return;
      settled = true;
      if (timer !== null) clearTimeout(timer);
      done(status);
    };
    const req = http.request(
      {
        socketPath,
        createConnection: () => net.connect({ path: socketPath }),
        method: "GET",
        path: "/healthz",
        timeout: timeoutMs,
      },
      (res) => {
        res.resume();
        finish(res.statusCode ?? null);
      }
    );
    timer = setTimeout(() => {
      req.destroy();
      finish(null);
    }, timeoutMs);
    req.on("timeout", () => {
      req.destroy();
      finish(null);
    });
    req.on("error", () => finish(null));
    req.end();
  });
}

/**
 * The pid in the bridge's pidfile, or null unless the pidfile is a regular file (not a symlink) owned
 * by this uid that holds exactly "<pid>\n". It is read through an O_NOFOLLOW descriptor whose fstat
 * must match the lstat, so the file checked is the file read.
 */
export function readPidfile(pidfilePath: string, uid: number): number | null {
  let fd: number | null = null;
  try {
    const st = lstatSync(pidfilePath);
    if (st.isSymbolicLink() || !st.isFile() || st.uid !== uid) return null;
    fd = openSync(pidfilePath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    const opened = fstatSync(fd);
    if (!opened.isFile() || opened.uid !== uid || opened.dev !== st.dev || opened.ino !== st.ino) return null;
    const buf = Buffer.alloc(32);
    const n = readSync(fd, buf, 0, buf.length, 0);
    const m = /^([0-9]{1,10})\n?$/.exec(buf.subarray(0, n).toString("utf8"));
    if (m === null) return null;
    const pid = Number(m[1]);
    return Number.isSafeInteger(pid) && pid > 1 ? pid : null;
  } catch {
    return null;
  } finally {
    if (fd !== null) {
      try {
        closeSync(fd);
      } catch {
        // ignore
      }
    }
  }
}

/** stdout of a fixed-argument command, or null on any failure. execFileSync: no shell, numeric args only. */
function run(file: string, args: string[]): string | null {
  try {
    return execFileSync(file, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 5_000 });
  } catch {
    return null;
  }
}

/**
 * True when lsof lists, among pid's Unix sockets, the hidden bind name
 * <runDir>/.<socketName>.<pid>.<8 hex>.tmp with pid's own number embedded.
 */
export function holdsHiddenBindName(pid: number, runDir: string, socketName: string): boolean {
  const out = run(LSOF, ["-a", "-p", String(pid), "-U", "-Fn"]);
  if (out === null) return false;
  const re = new RegExp(`^n${escapeRegExp(runDir)}/\\.${escapeRegExp(socketName)}\\.(\\d+)\\.[0-9a-f]{8}\\.tmp$`);
  return out.split("\n").some((line) => {
    const m = re.exec(line);
    return m !== null && m[1] === String(pid);
  });
}

/** pid's working directory as lsof reports it, or null. */
export function cwdOf(pid: number): string | null {
  const out = run(LSOF, ["-a", "-p", String(pid), "-d", "cwd", "-Fn"]);
  if (out === null) return null;
  const line = out.split("\n").find((l) => l.startsWith("n"));
  return line === undefined ? null : line.slice(1);
}

/** pid's parent pid from ps, or null when pid is gone. */
export function parentPid(pid: number): number | null {
  const out = run(PS, ["-o", "ppid=", "-p", String(pid)]);
  if (out === null) return null;
  const trimmed = out.trim();
  return /^[0-9]+$/.test(trimmed) ? Number(trimmed) : null;
}

export function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Same directory after resolving symlinks (lsof reports real paths). */
export function samePath(a: string, b: string): boolean {
  const real = (p: string): string => {
    try {
      return realpathSync(p);
    } catch {
      return resolve(p);
    }
  };
  return real(a) === real(b);
}

async function waitUntil(condition: () => boolean | Promise<boolean>, timeoutMs: number): Promise<boolean> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    if (await condition()) return true;
    if (Date.now() >= until) return false;
    await delay(POLL_MS);
  }
}

export interface StaleHolderOptions {
  /** <runDir>/<socketName>, the published socket. */
  socketPath: string;
  runDir: string;
  socketName: string;
  /** <runDir>/vault-bridge.pid, written by the bridge on every start and never deleted. */
  pidfilePath: string;
  /** The holder must run in this directory: the launcher spawns the bridge with it as cwd. */
  bridgePackagePath: string;
  /** settings.staleProcessKillEnabled: without it a held socket is always a refusal. */
  killEnabled: boolean;
  /** True once the plugin unloaded: no signal is sent after that. */
  cancelled?: () => boolean;
}

export type StaleHolderResult =
  | { action: "free" }
  | { action: "killed"; pid: number }
  | { action: "refused"; reason: string };

/**
 * Before a spawn, with no live child of this launcher: make sure the socket is not served by someone
 * else. A held socket is re-probed up to 5 times 100 ms apart. It may then be killed only when the
 * pidfile (a regular file of this uid) names a pid that lsof shows holding the helper's hidden bind
 * name with that same pid, whose working directory is the bridge package, and whose parent is
 * launchd (pid 1: the renderer that spawned it crashed) or this renderer (an earlier instance of this
 * plugin). Any other live parent means another Obsidian window owns that bridge: refuse. The parent
 * is read again right before each signal: SIGTERM, up to 1.5 s, SIGKILL, then kill(pid, 0) until
 * ESRCH and the probe until the socket is no longer live.
 */
export async function clearStaleHolder(opts: StaleHolderOptions): Promise<StaleHolderResult> {
  let state = await probeSocket(opts.socketPath);
  for (let i = 0; i < STALE_REPROBES && isHeld(state); i++) {
    await delay(STALE_REPROBE_DELAY_MS);
    state = await probeSocket(opts.socketPath);
  }
  if (!isHeld(state)) return { action: "free" };

  const held = `${opts.socketName} is already served by another process`;
  if (!opts.killEnabled) {
    return { action: "refused", reason: `${held}; "Kill stale bridge on start" is off` };
  }
  const uid = typeof process.getuid === "function" ? process.getuid() : -1;
  const pid = readPidfile(opts.pidfilePath, uid);
  if (pid === null || pid === process.pid) {
    return { action: "refused", reason: `${held}, and its pidfile names no process this launcher may signal` };
  }
  if (!holdsHiddenBindName(pid, opts.runDir, opts.socketName)) {
    return { action: "refused", reason: `${held}; pid ${pid} from the pidfile does not hold it` };
  }
  const cwd = cwdOf(pid);
  if (cwd === null || !samePath(cwd, opts.bridgePackagePath)) {
    return { action: "refused", reason: `${held}; pid ${pid} is not a bridge from ${opts.bridgePackagePath}` };
  }

  const orphanParent = (ppid: number): boolean => ppid === 1 || ppid === process.pid;
  const firstParent = parentPid(pid);
  if (firstParent !== null && !orphanParent(firstParent)) {
    return {
      action: "refused",
      reason: `${held}: bridge pid ${pid} belongs to live parent pid ${firstParent} (another Obsidian window owns it)`,
    };
  }

  // Re-read the parent right before each signal; "gone" means there is nothing left to signal.
  const signal = (sig: "SIGTERM" | "SIGKILL"): "sent" | "gone" | "refused" => {
    if (opts.cancelled?.()) return "refused";
    const ppid = parentPid(pid);
    if (ppid === null) return "gone";
    if (!orphanParent(ppid)) return "refused";
    try {
      process.kill(pid, sig);
      return "sent";
    } catch (err) {
      return (err as NodeJS.ErrnoException).code === "ESRCH" ? "gone" : "refused";
    }
  };

  let step = signal("SIGTERM");
  let signalled = step === "sent";
  if (step === "sent" && !(await waitUntil(() => !pidAlive(pid), TERM_WAIT_MS))) {
    step = signal("SIGKILL");
  }
  if (step === "refused") {
    return { action: "refused", reason: `${held}; stale bridge pid ${pid} could not be signalled safely` };
  }
  signalled = signalled || step === "sent";
  const gone = await waitUntil(() => !pidAlive(pid), GONE_WAIT_MS);
  const released = gone && (await waitUntil(async () => !isHeld(await probeSocket(opts.socketPath)), RELEASE_WAIT_MS));
  if (!gone || !released) {
    return { action: "refused", reason: `${held}; stale bridge pid ${pid} did not go away` };
  }
  return signalled ? { action: "killed", pid } : { action: "free" };
}
