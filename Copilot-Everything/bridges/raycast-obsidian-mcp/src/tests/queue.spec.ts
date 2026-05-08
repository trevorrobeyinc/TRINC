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

  it("reports queue depth and wait metrics", async () => {
    const scheduler = new BoundedScheduler(4, 1);
    await scheduler.enqueue("interactive", 1_000, async () => 1);
    const snap = scheduler.snapshot();
    expect(snap.depth).toBe(0);
    expect(snap.p95WaitMs).toBeGreaterThanOrEqual(0);
  });
});
