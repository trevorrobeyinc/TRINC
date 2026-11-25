// Load .env.local (e.g., OBSIDIAN_REST_API_KEY) BEFORE any module that reads
// process.env at load time. The obsidian-bridge-launcher Obsidian plugin spawns
// this daemon as a child process and does not auto-source .env.local.
import { loadEnvLocal } from "./config/envLocal";
const envResult = loadEnvLocal();

import path from "node:path";
import { loadConfig } from "./config/loader";
import { StructuredLogger } from "./observability/logger";
import { Metrics } from "./observability/metrics";
import { IdempotencyLedger } from "./idempotency/ledger";
import { BoundedScheduler } from "./server/queue";
import { RestApiBackend } from "./backends/restApiBackend";
import { BackendSelector } from "./backends/backendSelector";
import { createWriteLocker, ReadAfterWritePins, type RuntimeContext } from "./server/context";
import { EventBus } from "./server/eventBus";
import { startUdsTransport } from "./server/udsTransport";
import { startWindowsPipeTransport } from "./server/windowsPipeTransport";
import { createLauncherIpcClient } from "./server/launcherIpc";

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

  // Local REST API plugin backend is the SOLE backend. When Obsidian.app is
  // closed, the plugin is disabled, or auth fails, operations error with a
  // structured diagnostic. The obsidian_health tool returns a rich error report
  // including the probe failure mode and suggested fixes. There is no silent
  // CLI fallback — failures surface clearly so they can be debugged.
  const restApiBackend = new RestApiBackend();
  const selector = new BackendSelector({
    restApi: restApiBackend,
  });

  await selector.refresh(true);

  const eventBus = new EventBus();
  const heartbeatTimer = setInterval(() => {
    eventBus.heartbeat();
  }, 20_000);
  // setInterval keeps the event loop alive; unref so it doesn't block shutdown.
  heartbeatTimer.unref();

  const launcherIpc = createLauncherIpcClient();
  if (launcherIpc) {
    logger.info("launcher_ipc_attached", { fd: process.env.BRIDGE_IPC_FD });
  }

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
    envLocal: { loaded: envResult.loaded, path: envResult.path, count: envResult.count },
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
