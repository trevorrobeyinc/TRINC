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
import { startHttpTransport } from "./server/httpTransport";
import { startUdsTransport } from "./server/udsTransport";
import { startWindowsPipeTransport } from "./server/windowsPipeTransport";
import { createLauncherIpcClient } from "./server/launcherIpc";

function parseTransportOverride(): "http" | "uds" | "pipe" | null {
  const arg = process.argv.find((value) => value.startsWith("--transport="));
  if (!arg) {
    return null;
  }
  const mode = arg.slice("--transport=".length);
  // "https" is accepted as a synonym for "http" — the http transport-mode
  // is HTTPS-only at the implementation layer (see src/server/httpTransport.ts
  // and the monorepo-wide HTTPS-only invariant in CLAUDE.md). The internal
  // mode field stays "http" so the dispatcher and config schema are
  // unchanged; the alias only exists so callers don't have to think the
  // word "http" means plaintext.
  if (mode === "http" || mode === "https") {
    return "http";
  }
  if (mode === "uds" || mode === "pipe") {
    return mode;
  }
  return null;
}

async function main(): Promise<void> {
  const { config, tokenEntropyBits, configPath } = loadConfig();
  const transportOverride = parseTransportOverride();
  if (transportOverride) {
    config.transport.mode = transportOverride;
  }
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

  const server =
    config.transport.mode === "uds"
      ? await startUdsTransport(runtime)
      : config.transport.mode === "pipe"
        ? await startWindowsPipeTransport(runtime)
        : await startHttpTransport(runtime);

  const shutdown = async (signal: string): Promise<void> => {
    logger.info("mcp_server_shutdown", { signal });
    clearInterval(heartbeatTimer);
    eventBus.closeAll();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
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
