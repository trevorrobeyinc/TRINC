import { AppError } from "./errors";
import { ERROR_CODES } from "./errorCodes";

export type QueueLane = "interactive" | "mutating";

interface QueueTask<T> {
  lane: QueueLane;
  enqueuedAt: number;
  waitTimeoutMs: number;
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

export class BoundedScheduler {
  private readonly capacity: number;
  private readonly workerConcurrency: number;
  private readonly interactive: QueueTask<unknown>[] = [];
  private readonly mutating: QueueTask<unknown>[] = [];
  private activeWorkers = 0;
  private interactiveBudget = 3;
  private overflowCount = 0;
  private timeoutCount = 0;
  private waitTimesMs: number[] = [];

  constructor(capacity: number, workerConcurrency: number) {
    this.capacity = capacity;
    this.workerConcurrency = workerConcurrency;
  }

  depth(): number {
    return this.interactive.length + this.mutating.length;
  }

  snapshot(): {
    depth: number;
    interactiveDepth: number;
    mutatingDepth: number;
    activeWorkers: number;
    overflowCount: number;
    timeoutCount: number;
    p95WaitMs: number;
  } {
    return {
      depth: this.depth(),
      interactiveDepth: this.interactive.length,
      mutatingDepth: this.mutating.length,
      activeWorkers: this.activeWorkers,
      overflowCount: this.overflowCount,
      timeoutCount: this.timeoutCount,
      p95WaitMs: this.p95WaitMs(),
    };
  }

  async enqueue<T>(lane: QueueLane, waitTimeoutMs: number, execute: () => Promise<T>): Promise<T> {
    if (this.depth() >= this.capacity) {
      const evicted = this.evictStaleLowPriority();
      if (!evicted) {
        this.overflowCount += 1;
        throw new AppError(ERROR_CODES.QUEUE_OVERFLOW, "Queue is full.", true, { retryAfterMs: 500 });
      }
    }

    return await new Promise<T>((resolve, reject) => {
      const task: QueueTask<T> = {
        lane,
        enqueuedAt: Date.now(),
        waitTimeoutMs,
        execute,
        resolve,
        reject,
      };

      if (lane === "interactive") {
        this.interactive.push(task as QueueTask<unknown>);
      } else {
        this.mutating.push(task as QueueTask<unknown>);
      }

      this.drain().catch((error) => {
        reject(error);
      });
    });
  }

  /**
   * Bounded drain for shutdown: resolves true once no task is running or queued, or false when
   * timeoutMs passes first. Queued tasks keep running meanwhile; nothing is cancelled. Never rejects.
   */
  async waitForIdle(timeoutMs: number, pollMs = 25): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (this.activeWorkers > 0 || this.depth() > 0) {
      const left = deadline - Date.now();
      if (left <= 0) {
        return false;
      }
      await new Promise<void>((resolve) => {
        setTimeout(resolve, Math.min(pollMs, left));
      });
    }
    return true;
  }

  private evictStaleLowPriority(): boolean {
    const now = Date.now();
    const mutateIndex = this.findOldestStaleIndex(this.mutating, now);
    if (mutateIndex !== -1) {
      const [evicted] = this.mutating.splice(mutateIndex, 1);
      this.timeoutCount += 1;
      evicted.reject(new AppError(ERROR_CODES.QUEUE_TIMEOUT, "Queue request timed out before execution.", true));
      return true;
    }

    const interactiveIndex = this.findOldestStaleIndex(this.interactive, now);
    if (interactiveIndex === -1) {
      return false;
    }
    const [evicted] = this.interactive.splice(interactiveIndex, 1);
    this.timeoutCount += 1;
    evicted.reject(new AppError(ERROR_CODES.QUEUE_TIMEOUT, "Queue request timed out before execution.", true));
    return true;
  }

  private findOldestStaleIndex(queue: QueueTask<unknown>[], now: number): number {
    let idx = -1;
    let oldestAt = Number.POSITIVE_INFINITY;
    for (let i = 0; i < queue.length; i += 1) {
      const task = queue[i];
      if (now - task.enqueuedAt <= task.waitTimeoutMs) {
        continue;
      }
      if (task.enqueuedAt < oldestAt) {
        oldestAt = task.enqueuedAt;
        idx = i;
      }
    }
    return idx;
  }

  private pickNext(): QueueTask<unknown> | null {
    const now = Date.now();
    const oldestInteractive = this.interactive[0];
    const oldestMutating = this.mutating[0];

    const interactiveAged = oldestInteractive && now - oldestInteractive.enqueuedAt > 2_000;
    const mutatingAged = oldestMutating && now - oldestMutating.enqueuedAt > 2_000;

    if (interactiveAged && this.interactive.length > 0) {
      return this.interactive.shift() ?? null;
    }
    if (mutatingAged && this.mutating.length > 0) {
      return this.mutating.shift() ?? null;
    }

    if (this.interactiveBudget > 0 && this.interactive.length > 0) {
      this.interactiveBudget -= 1;
      return this.interactive.shift() ?? null;
    }

    if (this.mutating.length > 0) {
      this.interactiveBudget = 3;
      return this.mutating.shift() ?? null;
    }

    if (this.interactive.length > 0) {
      this.interactiveBudget = Math.max(this.interactiveBudget - 1, 0);
      return this.interactive.shift() ?? null;
    }

    return null;
  }

  private async drain(): Promise<void> {
    while (this.activeWorkers < this.workerConcurrency) {
      const task = this.pickNext();
      if (!task) {
        return;
      }

      this.activeWorkers += 1;
      this.runTask(task)
        .catch(() => {
          // handled inside runTask
        })
        .finally(() => {
          this.activeWorkers -= 1;
          this.drain().catch(() => {
            // no-op
          });
        });
    }
  }

  private async runTask(task: QueueTask<unknown>): Promise<void> {
    const waited = Date.now() - task.enqueuedAt;
    this.recordWait(waited);
    if (waited > task.waitTimeoutMs) {
      this.timeoutCount += 1;
      task.reject(new AppError(ERROR_CODES.QUEUE_TIMEOUT, "Queue request timed out before execution.", true));
      return;
    }

    try {
      const result = await task.execute();
      task.resolve(result);
    } catch (error) {
      task.reject(error);
    }
  }

  private recordWait(waitedMs: number): void {
    this.waitTimesMs.push(waitedMs);
    if (this.waitTimesMs.length > 1_000) {
      this.waitTimesMs.shift();
    }
  }

  private p95WaitMs(): number {
    if (this.waitTimesMs.length === 0) {
      return 0;
    }
    const sorted = [...this.waitTimesMs].sort((a, b) => a - b);
    const index = Math.floor(0.95 * (sorted.length - 1));
    return sorted[index];
  }
}
