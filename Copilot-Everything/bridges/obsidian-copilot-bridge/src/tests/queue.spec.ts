import { describe, expect, it } from "vitest";
import { BoundedScheduler } from "../server/queue";

describe("BoundedScheduler", () => {
  it("runs enqueued tasks", async () => {
    const scheduler = new BoundedScheduler(10, 2);
    const out = await Promise.all([
      scheduler.enqueue("interactive", 1000, async () => 1),
      scheduler.enqueue("interactive", 1000, async () => 2),
    ]);
    expect(out.sort()).toEqual([1, 2]);
  });

  it("waitForIdle: true once running and queued work is done, false at its bound (the shutdown drain)", async () => {
    const scheduler = new BoundedScheduler(4, 1);
    expect(await scheduler.waitForIdle(10)).toBe(true);

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const running = scheduler.enqueue("mutating", 5_000, async () => {
      await gate;
      return 1;
    });
    const queued = scheduler.enqueue("interactive", 5_000, async () => 2);
    const started = Date.now();
    expect(await scheduler.waitForIdle(60)).toBe(false);
    expect(Date.now() - started).toBeLessThan(1_000);

    release();
    expect(await scheduler.waitForIdle(1_000)).toBe(true);
    expect(await Promise.all([running, queued])).toEqual([1, 2]);
    expect(scheduler.snapshot()).toMatchObject({ depth: 0, activeWorkers: 0 });
  });

  it("reports queue depth and wait metrics", async () => {
    const scheduler = new BoundedScheduler(4, 1);
    await scheduler.enqueue("interactive", 1_000, async () => 1);
    const snap = scheduler.snapshot();
    expect(snap.depth).toBe(0);
    expect(snap.p95WaitMs).toBeGreaterThanOrEqual(0);
  });
});
