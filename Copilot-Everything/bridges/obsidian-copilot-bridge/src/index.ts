import path from "node:path";
import { loadConfig } from "./config/loader";
import { StructuredLogger } from "./observability/logger";
import { Metrics } from "./observability/metrics";
import { IdempotencyLedger } from "./idempotency/ledger";
import { BoundedScheduler } from "./server/queue";
import { CliBackend } from "./backends/cliBackend";
import { InprocPluginBackend } from "./backends/inprocPluginBackend";
import { BackendSelector } from "./backends/backendSelector";
import { createWriteLocker, ReadAfterWritePins, type RuntimeContext } from "./server/context";
import { EventBus } from "./server/eventBus";
import { startHttpTransport } from "./server/httpTransport";
import { startUdsTransport } from "./server/udsTransport";
import { startWindowsPipeTransport } from "./server/windowsPipeTransport";

function parseTransportOverride(): "http" | "uds" | "pipe" | null {
  const arg = process.argv.find((value) => value.startsWith("--transport="));
  if (!arg) {
    return null;
  }
  const mode = arg.slice("--transport=".length);
  if (mode === "http" || mode === "uds" || mode === "pipe") {
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

  const cliBackend = new CliBackend(config);
  // Register the in-process plugin backend (HMAC-authenticated UDS to the
  // claude-mcp-inproc Obsidian plugin). probe() returns available=false if the
  // plugin isn't loaded, so the selector cleanly falls back to cli.
  const pluginBackend = new InprocPluginBackend();
  const selector = new BackendSelector(
    {
      cli: cliBackend,
      plugin: pluginBackend,
    },
    { preferPlugin: true }
  );

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
  };

  logger.info("mcp_server_start", {
    configPath,
    transport: config.transport.mode,
    tokenEntropyBits,
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
