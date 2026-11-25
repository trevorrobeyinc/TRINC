import fs from "node:fs";
import path from "node:path";
import type { RuntimeContext } from "./context";
import { createRequestListener } from "./httpCommon";
import { listenHttpOnSocket, runDir, UdsListenerError, type UdsListener } from "./udsListener";
import { auditLog } from "../observability/auditLog";

/*
 * The vault bridge's listener on macOS and Linux since bridges-uds (2026-11-24): plain HTTP/1.1 on
 * <home>/.local/state/trinc/run/vault-bridge.sock, served through the shared helper udsListener.ts
 * (a byte-identical copy; never edit it here alone). The helper creates and checks the private run
 * directory, publishes the socket 0600, replaces a stale socket (the launcher SIGKILLs this daemon on
 * unload, so a stale vault-bridge.sock is the normal case at the next start), refuses a live, foreign
 * or non-socket file at the path, and watches the published name while the daemon runs.
 */

/**
 * On SIGTERM/SIGINT, open connections (SSE included) get this long to finish before they are ended. This grace plus
 * index.ts's SHUTDOWN_DRAIN_MS (4 s in all) must stay under the launcher's default shutdownTimeoutMs (5 s), so a
 * daemon the launcher stops closes its ledger before any SIGKILL can arrive.
 */
export const DAEMON_CLOSE_GRACE_MS = 2_000;

/** "<pid>\n" in the run directory, rewritten on every start and never deleted: the launcher reads it. */
export const PIDFILE_NAME = "vault-bridge.pid";

export interface UdsTransportOptions {
  /** Home directory that holds the run directory (tests pass a short /tmp/uds-* directory). */
  home?: string;
  /** Ownership poll interval passed to the helper, in ms (tests only; default: the helper's). */
  watchIntervalMs?: number;
  /** Ends the process after SOCKET_LOST (tests pass a stub). */
  exit?: (code: number) => void;
}

/**
 * Write the pidfile atomically: a fresh temp file "vault-bridge.pid.<pid>.tmp" created 0600 with
 * O_EXCL (so it never follows a planted symlink), then renamed over the pidfile. The pidfile is never
 * deleted, not even on a graceful stop: the launcher validates the pid it names before it signals.
 */
export function writePidfile(dir: string, pid: number = process.pid): string {
  const target = path.join(dir, PIDFILE_NAME);
  const tmp = path.join(dir, `${PIDFILE_NAME}.${pid}.tmp`);
  try {
    fs.unlinkSync(tmp);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
  try {
    fs.writeFileSync(tmp, `${pid}\n`, { mode: 0o600, flag: "wx" });
    fs.chmodSync(tmp, 0o600);
    fs.renameSync(tmp, target);
  } catch (error) {
    try {
      fs.unlinkSync(tmp);
    } catch {
      // best effort: the temp file may not exist
    }
    throw error;
  }
  return target;
}

/**
 * Serve the bridge on its socket. A refusal by the helper (UdsListenerError) is written to the audit
 * log as SOCKET_REFUSED with its code and rethrown, so the daemon exits 1. If the published name is
 * later removed or replaced, SOCKET_LOST is audited and the daemon exits 1.
 */
export async function startUdsTransport(runtime: RuntimeContext, options: UdsTransportOptions = {}): Promise<UdsListener> {
  const socketPath = runtime.config.transport.udsPath;
  const exit = options.exit ?? ((code: number) => process.exit(code));

  let listener: UdsListener;
  try {
    listener = await listenHttpOnSocket(createRequestListener(runtime), {
      socketPath,
      home: options.home,
      watchIntervalMs: options.watchIntervalMs,
      closeGraceMs: DAEMON_CLOSE_GRACE_MS,
      onLost: (reason) => {
        runtime.logger.error("uds_socket_lost", { socketPath, reason });
        auditLog.emit({ eventType: "SOCKET_LOST", source: "obsidian-copilot-bridge", socketPath, reason });
        exit(1);
      },
    });
  } catch (error) {
    if (error instanceof UdsListenerError) {
      runtime.logger.error("uds_socket_refused", { socketPath, errorCode: error.code, message: error.message });
      auditLog.emit({ eventType: "SOCKET_REFUSED", source: "obsidian-copilot-bridge", errorCode: error.code, socketPath });
    }
    throw error;
  }

  // The helper removes its own "error" listener once the server listens. Without this one, an accept() error that
  // reaches Node (EMFILE or ENFILE that libuv cannot absorb, ENOBUFS, ENOMEM) would be an uncaught exception that
  // ends the daemon. The message only: never a token or a request header.
  listener.server.on("error", (error: Error) => {
    runtime.logger.error("uds_server_error", { socketPath, error: error.message });
  });

  // Only after a successful publish: a refused start must not overwrite the live holder's pid.
  let pidfile: string | null = null;
  try {
    pidfile = writePidfile(runDir(options.home));
  } catch (error) {
    runtime.logger.warn("pidfile_write_failed", { error: (error as Error).message });
  }

  // listener.socketPath, never server.address(): that is the hidden name the helper bound first.
  runtime.logger.info("uds_transport_started", { socketPath: listener.socketPath, pidfile });
  return listener;
}
