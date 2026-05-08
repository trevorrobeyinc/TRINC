import { describe, expect, it } from "vitest";
import { PassThrough } from "node:stream";
import type { ServerResponse } from "node:http";
import { EventBus } from "../server/eventBus";

/**
 * PassThrough is a duplex stream that quacks enough like a ServerResponse
 * for our writer needs (we only call write/end, and emit close/error).
 */
function fakeWriter(): { res: ServerResponse; chunks: string[] } {
  const stream = new PassThrough();
  const chunks: string[] = [];
  stream.on("data", (chunk) => chunks.push(chunk.toString("utf8")));
  return { res: stream as unknown as ServerResponse, chunks };
}

describe("EventBus", () => {
  it("starts empty", () => {
    const bus = new EventBus();
    expect(bus.size()).toBe(0);
  });

  it("delivers an event to a matching subscriber", () => {
    const bus = new EventBus();
    const w = fakeWriter();
    bus.subscribe("research", w.res);
    bus.publish({ type: "research_arrived", stream: "research", taskId: "t1" });

    expect(w.chunks.length).toBe(1);
    expect(w.chunks[0]).toContain("data:");
    const json = JSON.parse(w.chunks[0].replace(/^data: /, "").trim());
    expect(json.type).toBe("research_arrived");
    expect(json.taskId).toBe("t1");
  });

  it("filters by stream", () => {
    const bus = new EventBus();
    const wA = fakeWriter();
    const wB = fakeWriter();
    bus.subscribe("research", wA.res);
    bus.subscribe("other", wB.res);

    bus.publish({ type: "x", stream: "research", payload: 1 });
    expect(wA.chunks.length).toBe(1);
    expect(wB.chunks.length).toBe(0);
  });

  it("removes subscribers on close", () => {
    const bus = new EventBus();
    const w = fakeWriter();
    bus.subscribe("research", w.res);
    expect(bus.size()).toBe(1);

    (w.res as unknown as PassThrough).emit("close");
    expect(bus.size()).toBe(0);
  });

  it("heartbeat writes a comment frame to all subscribers", () => {
    const bus = new EventBus();
    const w = fakeWriter();
    bus.subscribe("research", w.res);

    bus.heartbeat();
    expect(w.chunks.length).toBe(1);
    expect(w.chunks[0].startsWith(": ping")).toBe(true);
  });

  it("publish does not throw when there are no subscribers", () => {
    const bus = new EventBus();
    expect(() =>
      bus.publish({ type: "x", stream: "research" })
    ).not.toThrow();
  });

  it("closeAll empties the subscriber set", () => {
    const bus = new EventBus();
    bus.subscribe("a", fakeWriter().res);
    bus.subscribe("b", fakeWriter().res);
    expect(bus.size()).toBe(2);
    bus.closeAll();
    expect(bus.size()).toBe(0);
  });
});
