// No .env.local is loaded since 2026-11-25: it held only the Local REST API's key, base URL and certificate
// path, and the bridge no longer talks to that plugin. The file stays on disk as the rollback's credentials
// until the plugin is uninstalled (ops/security/vault-ipc-2026-11-25.md, Rollback): do not delete it before then.
import path from "node:path";
import { loadConfig } from "./config/loader";
import { StructuredLogger } from "./observability/logger";
import { Metrics } from "./observability/metrics";
import { IdempotencyLedger } from "./idempotency/ledger";
import { BoundedScheduler } from "./server/queue";
import { LauncherIpcBackend } from "./backends/launcherIpcBackend";
import { BackendSelector } from "./backends/backendSelector";
import { createWriteLocker, ReadAfterWritePins, type RuntimeContext } from "./server/context";
import { EventBus } from "./server/eventBus";
import { startUdsTransport } from "./server/udsTransport";
import { startWindowsPipeTransport } from "./server/windowsPipeTransport";
import { createLauncherIpcClient, launcherIpcMissingReason } from "./server/launcherIpc";

/**
 * On SIGTERM/SIGINT, in-flight tool calls get this long after the listener closed, then the ledger closes. With the
 * transport's DAEMON_CLOSE_GRACE_MS the whole shutdown takes at most 4 s, under the launcher's 5 s SIGKILL window.
 */
const SHUTDOWN_DRAIN_MS = 2_000;

async function main(): Promise<void> {
  // --transport=<mode> (the launcher passes --transport=uds) overrides transport.mode from the config
  // file. The TCP transport was removed on 2026-11-24 (bridges-uds): the loader refuses "http" and
  // "https" as the effective mode, and the daemon serves only on its Unix socket (a pipe on Windows).
  const { config, tokenEntropyBits, configPath } = loadConfig({ argv: process.argv });
  const logger = new StructuredLogger(config.logging.level, config.logging.file);
  const metrics = new Metrics();
  const scheduler = new BoundedScheduler(config.queue.capacity, config.queue.workerConcurrency);
  const ledger = new IdempotencyLedger(path.resolve(process.cwd(), "state/idempotency.sqlite"));

  // The launcher's fd-3 pipe carries the dev-console tools and, since 2026-11-25, all six vault operations:
  // LauncherIpcBackend is the SOLE backend (it replaced the Local REST API plugin on :27124). When Obsidian is
  // closed or the launcher predates its vault methods, operations fail with a structured diagnostic, and
  // obsidian_health reports the probe's failure mode with suggested fixes. There is no silent fallback.
  const launcherIpc = createLauncherIpcClient();
  const missingReason = launcherIpc ? undefined : launcherIpcMissingReason();
  if (launcherIpc) {
    logger.info("launcher_ipc_attached", { fd: process.env.BRIDGE_IPC_FD });
  } else {
    // No usable pipe (most often a start outside Obsidian: bridge-start.sh, a terminal): /healthz still answers,
    // but no vault operation can run. Said on stderr too, because that is where a terminal start looks.
    logger.warn("launcher_ipc_missing", { reason: missingReason });
    process.stderr.write(
      `[vault-bridge] no launcher pipe (${missingReason}): the six vault tools will fail; obsidian_health says why. ` +
        "Start the bridge from Obsidian instead.\n"
    );
  }
  const selector = new BackendSelector({
    launcherIpc: new LauncherIpcBackend(launcherIpc, {
      vaultRoot: config.allowedVaultRoots[0],
      missingReason,
    }),
  });

  await selector.refresh(true);

  const eventBus = new EventBus();
  const heartbeatTimer = setInterval(() => {
    eventBus.heartbeat();
  }, 20_000);
  // setInterval keeps the event loop alive; unref so it doesn't block shutdown.
  heartbeatTimer.unref();

  const runtime: RuntimeContext = {
    config,
    selector,
    ledger,
    logger,
    metrics,
    scheduler,
    tokenEntropyBits,
    withWriteLock: createWriteLocker(),
    readPins: new ReadAfterWritePins(),
    eventBus,
    launcherIpc,
  };

  logger.info("mcp_server_start", {
    configPath,
    transport: config.transport.mode,
    tokenEntropyBits,
    backend: "launcherIpc",
  });

  let closeTransport: () => Promise<void>;
  if (config.transport.mode === "pipe") {
    const server = await startWindowsPipeTransport(runtime);
    closeTransport = () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
  } else {
    // A UdsListenerError (socket refused) rejects here and exits 1 below, after SOCKET_REFUSED is audited.
    const listener = await startUdsTransport(runtime);
    closeTransport = () => listener.close();
  }

  // Order: stop accepting and close the socket (open connections get the 2 s grace), let in-flight
  // tool calls finish for at most SHUTDOWN_DRAIN_MS, then close the ledger they write to, then exit 0.
  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info("mcp_server_shutdown", { signal });
    clearInterval(heartbeatTimer);
    eventBus.closeAll();
    try {
      await closeTransport();
    } catch (error) {
      logger.warn("mcp_server_shutdown_close_failed", { error: (error as Error).message });
    }
    if (!(await scheduler.waitForIdle(SHUTDOWN_DRAIN_MS))) {
      logger.warn("mcp_server_shutdown_drain_timeout", { queue: scheduler.snapshot() });
    }
    try {
      ledger.close();
    } catch {
      // best-effort — never block shutdown on ledger close
    }
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

void main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
