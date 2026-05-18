import type { ServerConfig } from "../config/types";
import { BackendSelector } from "../backends/backendSelector";
import type { IdempotencyLedger } from "../idempotency/ledger";
import { StructuredLogger } from "../observability/logger";
import { Metrics } from "../observability/metrics";
import type { BoundedScheduler } from "./queue";
import type { BackendId } from "../types";
import type { EventBus } from "./eventBus";
import type { LauncherIpcClient } from "./launcherIpc";

export interface RuntimeContext {
  config: ServerConfig;
  selector: BackendSelector;
  ledger: IdempotencyLedger;
  logger: StructuredLogger;
  metrics: Metrics;
  scheduler: BoundedScheduler;
  tokenEntropyBits: number;
  withWriteLock: <T>(key: string, task: () => Promise<T>) => Promise<T>;
  readPins: ReadAfterWritePins;
  eventBus: EventBus;
  launcherIpc: LauncherIpcClient | null;
}

export function createWriteLocker(): <T>(key: string, task: () => Promise<T>) => Promise<T> {
  const locks = new Map<string, Promise<void>>();

  return async function withWriteLock<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = locks.get(key) ?? Promise.resolve();

    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });

    const chain = previous
      .catch(() => {
        // ignore previous failure
      })
      .then(() => current);

    locks.set(
      key,
      chain
    );

    await previous.catch(() => {
      // no-op
    });

    try {
      return await task();
    } finally {
      release();
      if (locks.get(key) === chain) {
        locks.delete(key);
      }
    }
  };
}

interface ReadPin {
  backend: BackendId;
  expiresAt: number;
}

export class ReadAfterWritePins {
  private readonly ttlMs: number;
  private readonly pins = new Map<string, ReadPin>();

  constructor(ttlMs = 2_000) {
    this.ttlMs = ttlMs;
  }

  pin(key: string, backend: BackendId): void {
    this.pins.set(key, {
      backend,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  get(key: string): BackendId | undefined {
    const pin = this.pins.get(key);
    if (!pin) {
      return undefined;
    }
    if (Date.now() > pin.expiresAt) {
      this.pins.delete(key);
      return undefined;
    }
    return pin.backend;
  }
}
