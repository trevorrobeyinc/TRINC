"use strict";

// The NCBI politeness policy, pinned directly. Until 2026-10-08 it lived as two hand-kept copies (the citation
// re-resolver and the PubMed retraction screen); those modules' own tests still pin it end to end through each
// consumer, and this file pins the shared unit those tests now stand on.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { createNcbiPacing, DEFAULT_MAX_RETRY_AFTER_MS } = require("../../openclaw-bridge/core/ncbi-pacing.js");

// A clock that only moves when `sleep` is called (or when a test advances it), so spacing is proven without real
// delays.
function makeClock(start = 1_000_000) {
  let now = start;
  const sleeps = [];
  return {
    nowMs: () => now,
    sleep: async (ms) => { sleeps.push(ms); now += ms; },
    advance: (ms) => { now += ms; },
    sleeps
  };
}

// A response-like object. `retryAfter` undefined = a response with no headers object at all.
function response(status, retryAfter) {
  return retryAfter === undefined
    ? { status }
    : { status, headers: { get: (name) => (name === "retry-after" ? retryAfter : null) } };
}

// An attempt that plays back the given responses in order and records how many times it ran.
function scripted(...responses) {
  const fn = async () => responses[Math.min(fn.calls++, responses.length - 1)];
  fn.calls = 0;
  return fn;
}

describe("ncbi-pacing - pacing", () => {
  it("never makes the first request wait, then spaces each next one by minRequestIntervalMs", async () => {
    const clock = makeClock();
    const pacing = createNcbiPacing({ nowMs: clock.nowMs, sleep: clock.sleep, minRequestIntervalMs: 350 });
    await pacing.request(scripted(response(200)));
    assert.deepEqual(clock.sleeps, [], "the first request must not wait");
    await pacing.request(scripted(response(200)));
    assert.deepEqual(clock.sleeps, [350], "back to back, the second waits the full interval");
    clock.advance(100);
    await pacing.request(scripted(response(200)));
    assert.deepEqual(clock.sleeps, [350, 250], "100 ms already elapsed, so only the remainder is waited");
  });

  it("is off by default, so offline tests stay instant", async () => {
    const clock = makeClock();
    const pacing = createNcbiPacing({ nowMs: clock.nowMs, sleep: clock.sleep });
    for (let i = 0; i < 5; i += 1) await pacing.request(scripted(response(200)));
    assert.deepEqual(clock.sleeps, []);
  });

  it("keeps its spacing per instance: two consumers do not pace each other", async () => {
    const clock = makeClock();
    const a = createNcbiPacing({ nowMs: clock.nowMs, sleep: clock.sleep, minRequestIntervalMs: 350 });
    const b = createNcbiPacing({ nowMs: clock.nowMs, sleep: clock.sleep, minRequestIntervalMs: 350 });
    await a.request(scripted(response(200)));
    await b.request(scripted(response(200)));
    assert.deepEqual(clock.sleeps, []);
  });

  it("paces the retry as well as the first attempt", async () => {
    const clock = makeClock();
    const pacing = createNcbiPacing({ nowMs: clock.nowMs, sleep: clock.sleep, minRequestIntervalMs: 350 });
    // Retry-After 0 means no Retry-After wait, so the only wait before the retry is the pacing interval.
    await pacing.request(scripted(response(429, "0"), response(200)));
    assert.deepEqual(clock.sleeps, [350]);
  });
});

describe("ncbi-pacing - one retry on HTTP 429", () => {
  it("waits Retry-After seconds, retries once, and reports two attempts", async () => {
    const clock = makeClock();
    const pacing = createNcbiPacing({ nowMs: clock.nowMs, sleep: clock.sleep });
    const attempt = scripted(response(429, "2"), response(200));
    const { out, attempts } = await pacing.request(attempt);
    assert.equal(out.status, 200);
    assert.equal(attempts, 2);
    assert.equal(attempt.calls, 2);
    assert.deepEqual(clock.sleeps, [2000]);
  });

  for (const [label, retryAfter] of [
    ["no Retry-After header", null],
    ["a response with no headers object at all", undefined],
    ["an HTTP-date", "Wed, 21 Oct 2026 07:28:00 GMT"],
    ["garbage", "soon"],
    ["a negative number", "-3"]
  ]) {
    it(`treats ${label} as the 1 s NCBI window`, async () => {
      const clock = makeClock();
      const pacing = createNcbiPacing({ nowMs: clock.nowMs, sleep: clock.sleep });
      const { attempts } = await pacing.request(scripted(response(429, retryAfter), response(200)));
      assert.equal(attempts, 2);
      assert.deepEqual(clock.sleeps, [1000]);
    });
  }

  it("retries immediately, without sleeping, when Retry-After is 0", async () => {
    const clock = makeClock();
    const pacing = createNcbiPacing({ nowMs: clock.nowMs, sleep: clock.sleep });
    const { attempts } = await pacing.request(scripted(response(429, "0"), response(200)));
    assert.equal(attempts, 2);
    assert.deepEqual(clock.sleeps, []);
  });

  it("hands a second 429 back as it is, after exactly one retry", async () => {
    const clock = makeClock();
    const pacing = createNcbiPacing({ nowMs: clock.nowMs, sleep: clock.sleep });
    const attempt = scripted(response(429, "1"));
    const { out, attempts } = await pacing.request(attempt);
    assert.equal(out.status, 429);
    assert.equal(attempts, 2);
    assert.equal(attempt.calls, 2, "a persistent 429 must not be retried more than once");
  });

  it("does not wait out a Retry-After beyond the cap: no sleep, no retry", async () => {
    const clock = makeClock();
    const pacing = createNcbiPacing({ nowMs: clock.nowMs, sleep: clock.sleep });
    assert.equal(DEFAULT_MAX_RETRY_AFTER_MS, 5000);
    const attempt = scripted(response(429, "30"), response(200));
    const { out, attempts } = await pacing.request(attempt);
    assert.equal(out.status, 429);
    assert.equal(attempts, 1);
    assert.equal(attempt.calls, 1);
    assert.deepEqual(clock.sleeps, []);
  });

  it("honors a configured cap", async () => {
    const clock = makeClock();
    const pacing = createNcbiPacing({ nowMs: clock.nowMs, sleep: clock.sleep, maxRetryAfterMs: 60_000 });
    const { attempts } = await pacing.request(scripted(response(429, "30"), response(200)));
    assert.equal(attempts, 2);
    assert.deepEqual(clock.sleeps, [30_000]);
  });

  it("retries only a 429: other failures pass through untouched", async () => {
    for (const status of [200, 404, 500, 503]) {
      const clock = makeClock();
      const pacing = createNcbiPacing({ nowMs: clock.nowMs, sleep: clock.sleep });
      const attempt = scripted(response(status, "1"), response(200));
      const { out, attempts } = await pacing.request(attempt);
      assert.equal(out.status, status);
      assert.equal(attempts, 1);
      assert.equal(attempt.calls, 1);
    }
  });

  it("takes the response from a richer attempt result through responseOf", async () => {
    const clock = makeClock();
    const pacing = createNcbiPacing({ nowMs: clock.nowMs, sleep: clock.sleep });
    const results = [{ res: response(429, "1"), body: undefined }, { res: response(200), body: { ok: true } }];
    let n = 0;
    const { out, attempts } = await pacing.request(async () => results[n++], (o) => o.res);
    assert.deepEqual(out.body, { ok: true });
    assert.equal(attempts, 2);
  });

  it("copes with an attempt that resolves to nothing", async () => {
    const pacing = createNcbiPacing({ sleep: async () => {} });
    const { out, attempts } = await pacing.request(async () => undefined);
    assert.equal(out, undefined);
    assert.equal(attempts, 1);
  });

  it("propagates a throwing attempt unchanged and never retries it", async () => {
    const pacing = createNcbiPacing({ sleep: async () => {} });
    let calls = 0;
    await assert.rejects(
      pacing.request(async () => { calls += 1; throw new Error("socket hang up"); }),
      /socket hang up/
    );
    assert.equal(calls, 1);
  });
});
