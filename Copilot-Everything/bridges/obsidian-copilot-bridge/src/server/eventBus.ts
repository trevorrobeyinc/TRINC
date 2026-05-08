import type { ServerResponse } from "node:http";

/**
 * In-memory pub/sub for server-pushed events.
 *
 * Subscribers are SSE response writers added via `subscribe()`. The bus
 * fan-outs each `publish()` call to every subscriber with a matching stream
 * filter. If a writer fails (closed socket, slow consumer), it is silently
 * dropped — the publish path never throws.
 *
 * Designed for low-volume coordination events (e.g., "research arrived")
 * rather than high-throughput streaming. Buffers nothing; if no subscriber
 * is connected when an event publishes, the event is lost. Callers that
 * need durability should write a separate ledger.
 */

export interface BusEvent {
  /** Event type discriminator, e.g. "research_arrived". */
  type: string;
  /** Stream channel — subscribers filter on this string. */
  stream: string;
  /** Arbitrary JSON-serializable payload. */
  [key: string]: unknown;
}

interface Subscriber {
  id: string;
  stream: string;
  writer: ServerResponse;
}

export class EventBus {
  private readonly subscribers = new Map<string, Subscriber>();
  private nextId = 1;

  /** Active subscriber count (for tests + metrics). */
  size(): number {
    return this.subscribers.size;
  }

  /**
   * Register an SSE response writer. Returns a disposer that removes the
   * subscriber on disconnect.
   */
  subscribe(stream: string, writer: ServerResponse): () => void {
    const id = `sub-${this.nextId++}`;
    this.subscribers.set(id, { id, stream, writer });

    const dispose = (): void => {
      this.subscribers.delete(id);
    };

    writer.once("close", dispose);
    writer.once("error", dispose);

    return dispose;
  }

  /**
   * Broadcast `event` to all subscribers whose stream matches `event.stream`.
   * Failures on individual writers do not propagate.
   */
  publish(event: BusEvent): void {
    const payload = JSON.stringify(event);
    const frame = `data: ${payload}\n\n`;

    for (const sub of this.subscribers.values()) {
      if (sub.stream !== event.stream) {
        continue;
      }
      try {
        sub.writer.write(frame);
      } catch {
        this.subscribers.delete(sub.id);
      }
    }
  }

  /**
   * Send a comment-frame heartbeat to all subscribers (keeps idle proxies
   * from dropping the connection). Should be called on a timer.
   */
  heartbeat(): void {
    const frame = `: ping ${Date.now()}\n\n`;
    for (const sub of this.subscribers.values()) {
      try {
        sub.writer.write(frame);
      } catch {
        this.subscribers.delete(sub.id);
      }
    }
  }

  /** Close all subscribers (used on shutdown). */
  closeAll(): void {
    for (const sub of this.subscribers.values()) {
      try {
        sub.writer.end();
      } catch {
        // ignore
      }
    }
    this.subscribers.clear();
  }
}
