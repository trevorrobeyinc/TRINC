"use strict";

/**
 * scrape-sidecar lifecycle binding.
 *
 * Auto-starts the Python scrape-sidecar at the beginning of a research
 * session and tears it down on exit, so the operator does not run
 * `bash scripts/start-sidecar.sh` by hand. The lifecycle is bound to the
 * parent process — the sidecar dies when the research script does, which
 * keeps the agents-repo "browser automation manual-only" boundary intact:
 * the sidecar never becomes a long-lived daemon, never registers with
 * launchd / PM2, never auto-starts at boot.
 *
 * Behavior:
 *   - If the sidecar is already healthy on https://127.0.0.1:8842/health,
 *     attach without spawning. Do NOT stop it on session exit (whoever
 *     started it owns the process).
 *   - Otherwise, spawn `scrape-sidecar/scripts/start-sidecar.sh` as a child,
 *     poll /health until ready, return a handle. SIGTERM (then SIGKILL after
 *     5 s) when the parent exits.
 *
 * Disable via environment:
 *   OPENCLAW_AUTOSTART_SCRAPE_SIDECAR=0   (default "1" — on)
 *
 * TLS:
 *   The sidecar listens on HTTPS via mkcert; this module requires
 *   NODE_EXTRA_CA_CERTS to point at the mkcert root CA so the /health probe
 *   can verify the cert. If NODE_EXTRA_CA_CERTS is not set, the lifecycle
 *   logs a clear warning and falls back to a CA-pinned probe by reading
 *   ~/Library/Application Support/mkcert/rootCA.pem directly. If neither
 *   is available the lifecycle is a no-op so it cannot block research runs.
 */

const childProcess = require("node:child_process");
const fs = require("node:fs");
const https = require("node:https");
const path = require("node:path");

const { nowMs } = require("./time-provider.js");

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 8842;
const DEFAULT_BOOT_TIMEOUT_MS = 90_000;
const DEFAULT_HEALTH_POLL_INTERVAL_MS = 750;
const DEFAULT_STOP_GRACE_MS = 5_000;
const SIDECAR_DIR = path.resolve(__dirname, "..", "..", "scrape-sidecar");
const START_SCRIPT = path.join(SIDECAR_DIR, "scripts", "start-sidecar.sh");
const MKCERT_CA_DEFAULT = path.join(
  process.env.HOME || "",
  "Library",
  "Application Support",
  "mkcert",
  "rootCA.pem"
);

function isAutostartEnabled() {
  const flag = String(process.env.OPENCLAW_AUTOSTART_SCRAPE_SIDECAR || "1").trim();
  return flag !== "0" && flag.toLowerCase() !== "false";
}

function readCaIfAvailable() {
  const explicit = process.env.NODE_EXTRA_CA_CERTS;
  if (explicit && fs.existsSync(explicit)) {
    try {
      return fs.readFileSync(explicit);
    } catch {
      // fall through to default
    }
  }
  if (fs.existsSync(MKCERT_CA_DEFAULT)) {
    try {
      return fs.readFileSync(MKCERT_CA_DEFAULT);
    } catch {
      return null;
    }
  }
  return null;
}

function probeHealth({ host, port, timeoutMs, ca }) {
  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: host,
        port,
        method: "GET",
        path: "/health",
        rejectUnauthorized: true,
        ca: ca || undefined,
        timeout: timeoutMs
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
          if (body.length > 64 * 1024) {
            req.destroy();
          }
        });
        res.on("end", () => {
          if (res.statusCode === 200) {
            try {
              const parsed = JSON.parse(body);
              resolve({ alive: true, payload: parsed });
              return;
            } catch {
              resolve({ alive: false, reason: "invalid_json" });
              return;
            }
          }
          resolve({ alive: false, reason: `status_${res.statusCode}` });
        });
      }
    );
    req.on("error", (err) => resolve({ alive: false, reason: err.code || err.message }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ alive: false, reason: "probe_timeout" });
    });
    req.end();
  });
}

function spawnSidecar({ logger }) {
  if (!fs.existsSync(START_SCRIPT)) {
    throw new Error(
      `scrape-sidecar lifecycle: start script not found at ${START_SCRIPT}. ` +
        "Run the sidecar setup once or set OPENCLAW_AUTOSTART_SCRAPE_SIDECAR=0 to disable."
    );
  }
  const child = childProcess.spawn("bash", [START_SCRIPT], {
    cwd: SIDECAR_DIR,
    env: process.env,
    stdio: ["ignore", "inherit", "inherit"],
    detached: false
  });
  child.on("error", (err) => {
    logger.warn({ event: "scrape_sidecar_spawn_error", error: err.message });
  });
  return child;
}

async function waitForHealth({ host, port, ca, timeoutMs, intervalMs, logger }) {
  const deadline = nowMs() + timeoutMs;
  let lastReason = "no_attempt";
  while (nowMs() < deadline) {
    const result = await probeHealth({ host, port, timeoutMs: intervalMs * 2, ca });
    if (result.alive) {
      return result;
    }
    lastReason = result.reason;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  logger.warn({
    event: "scrape_sidecar_boot_timeout",
    last_reason: lastReason,
    boot_timeout_ms: timeoutMs
  });
  throw new Error(`scrape-sidecar did not respond on https://${host}:${port}/health within ${timeoutMs}ms (${lastReason})`);
}

function noopHandle() {
  return Object.freeze({
    ownsProcess: false,
    childProcess: null,
    payload: null,
    async stop() {
      // no-op
    }
  });
}

async function ensureSidecar(options = {}) {
  const logger = options.logger || { info() {}, warn() {}, error() {} };
  if (!isAutostartEnabled()) {
    logger.info({ event: "scrape_sidecar_autostart_disabled" });
    return noopHandle();
  }

  const host = options.host || process.env.SCRAPE_SIDECAR_HOST || DEFAULT_HOST;
  const port = Number(options.port || process.env.SCRAPE_SIDECAR_PORT || DEFAULT_PORT);
  const bootTimeoutMs = Number(options.bootTimeoutMs || DEFAULT_BOOT_TIMEOUT_MS);
  const intervalMs = Number(options.healthPollIntervalMs || DEFAULT_HEALTH_POLL_INTERVAL_MS);
  const stopGraceMs = Number(options.stopGraceMs || DEFAULT_STOP_GRACE_MS);

  const ca = readCaIfAvailable();
  if (!ca) {
    logger.warn({
      event: "scrape_sidecar_no_ca",
      detail:
        "NODE_EXTRA_CA_CERTS is unset and ~/Library/Application Support/mkcert/rootCA.pem is missing. " +
        "scrape-sidecar autostart is being skipped to avoid TLS errors."
    });
    return noopHandle();
  }

  const initial = await probeHealth({ host, port, timeoutMs: 1500, ca });
  if (initial.alive) {
    logger.info({ event: "scrape_sidecar_attached_existing" });
    return Object.freeze({
      ownsProcess: false,
      childProcess: null,
      payload: initial.payload,
      async stop() {
        // attached to externally-owned process; do not stop
      }
    });
  }

  logger.info({ event: "scrape_sidecar_spawning", host, port });
  const child = spawnSidecar({ logger });

  let earlyExit = null;
  child.once("exit", (code, signal) => {
    earlyExit = { code, signal };
  });

  try {
    const ready = await waitForHealth({ host, port, ca, timeoutMs: bootTimeoutMs, intervalMs, logger });
    if (earlyExit !== null) {
      throw new Error(`scrape-sidecar exited during boot (code=${earlyExit.code}, signal=${earlyExit.signal})`);
    }
    logger.info({ event: "scrape_sidecar_ready", payload: ready.payload });

    let stopped = false;
    async function stop() {
      if (stopped) return;
      stopped = true;
      if (!child || child.exitCode !== null) return;
      try {
        child.kill("SIGTERM");
      } catch (err) {
        logger.warn({ event: "scrape_sidecar_sigterm_error", error: err.message });
      }
      const stopDeadline = nowMs() + stopGraceMs;
      while (child.exitCode === null && nowMs() < stopDeadline) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (child.exitCode === null) {
        try {
          child.kill("SIGKILL");
        } catch (err) {
          logger.warn({ event: "scrape_sidecar_sigkill_error", error: err.message });
        }
      }
      logger.info({ event: "scrape_sidecar_stopped" });
    }

    return Object.freeze({
      ownsProcess: true,
      childProcess: child,
      payload: ready.payload,
      stop
    });
  } catch (bootError) {
    if (child && child.exitCode === null) {
      try {
        child.kill("SIGTERM");
      } catch {
        // ignore — best-effort cleanup
      }
    }
    throw bootError;
  }
}

async function withSidecar(asyncFn, options = {}) {
  const logger = options.logger || { info() {}, warn() {}, error() {} };
  let handle = noopHandle();
  try {
    handle = await ensureSidecar({ ...options, logger });
  } catch (bootError) {
    logger.warn({
      event: "scrape_sidecar_boot_failed_continuing",
      error: bootError.message
    });
  }
  try {
    return await asyncFn(handle);
  } finally {
    try {
      await handle.stop();
    } catch (stopError) {
      logger.warn({ event: "scrape_sidecar_stop_error", error: stopError.message });
    }
  }
}

module.exports = {
  ensureSidecar,
  withSidecar,
  noopHandle,
  isAutostartEnabled
};
