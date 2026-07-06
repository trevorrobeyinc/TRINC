/**
 * Deterministic unit tests for the robustness layer (no network, injected sleep/rand).
 * Run: `node --test test/robust.test.mjs`
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { TTLCache, retry, dedupe, canonicalUrl } = require("../src/robust.js");

const noSleep = () => Promise.resolve();

test("TTLCache: hit within TTL, miss after expiry, FIFO eviction at capacity", async () => {
  const c = new TTLCache(10000, 2);
  c.set("a", 1);
  assert.equal(c.get("a"), 1);
  // Expiry: a 5ms TTL is reliably past after a 25ms wait.
  const e = new TTLCache(5, 5);
  e.set("k", 42);
  await new Promise((r) => setTimeout(r, 25));
  assert.equal(e.get("k"), undefined);
  // Capacity 2: inserting a third distinct key evicts the oldest.
  const d = new TTLCache(10000, 2);
  d.set("k1", 1);
  d.set("k2", 2);
  d.set("k3", 3);
  assert.equal(d.get("k1"), undefined); // evicted
  assert.equal(d.get("k2"), 2);
  assert.equal(d.get("k3"), 3);
});

test("retry: returns immediately on success (one attempt)", async () => {
  let calls = 0;
  const out = await retry(async () => { calls++; return "ok"; }, { attempts: 3, sleep: noSleep });
  assert.equal(out, "ok");
  assert.equal(calls, 1);
});

test("retry: retries transient 500 then succeeds", async () => {
  let calls = 0;
  const out = await retry(
    async () => {
      calls++;
      if (calls < 2) { const e = new Error("boom"); e.status = 500; throw e; }
      return "recovered";
    },
    { attempts: 3, sleep: noSleep, rand: () => 0 }
  );
  assert.equal(out, "recovered");
  assert.equal(calls, 2);
});

test("retry: does NOT retry a 4xx (non-transient)", async () => {
  let calls = 0;
  await assert.rejects(
    () => retry(async () => { calls++; const e = new Error("bad"); e.status = 404; throw e; },
      { attempts: 4, sleep: noSleep }),
    /bad/
  );
  assert.equal(calls, 1);
});

test("retry: does NOT retry an AbortError (timeout) — bounds latency", async () => {
  let calls = 0;
  await assert.rejects(
    () => retry(async () => { calls++; const e = new Error("t/o"); e.name = "AbortError"; throw e; },
      { attempts: 4, sleep: noSleep }),
    /t\/o/
  );
  assert.equal(calls, 1);
});

test("retry: exhausts attempts on persistent transient error", async () => {
  let calls = 0;
  await assert.rejects(
    () => retry(async () => { calls++; const e = new Error("503"); e.status = 503; throw e; },
      { attempts: 3, sleep: noSleep, rand: () => 0.5 }),
    /503/
  );
  assert.equal(calls, 3);
});

test("retry: full-jitter delay stays within [0, min(cap, base*2^i)]", async () => {
  const delays = [];
  const capture = (ms) => { delays.push(ms); return Promise.resolve(); };
  let calls = 0;
  await assert.rejects(
    () => retry(async () => { calls++; const e = new Error("x"); e.status = 500; throw e; },
      { attempts: 3, baseMs: 400, capMs: 8000, sleep: capture, rand: () => 1 }),
    /x/
  );
  // Two waits between three attempts, at ceilings 400 and 800 (rand=1 → the ceiling itself).
  assert.deepEqual(delays, [400, 800]);
});

test("dedupe: URL-collapse + url-derived-id collapse, but text-derived ids do NOT merge", () => {
  const rows = [
    { url: "https://a.com/x/", score: 0.9, citations: [{ type: "pmid", id: "1", source: "url" }] },
    { url: "http://www.A.com/x", score: 0.5 }, // same canonical url → dropped
    { url: "https://b.com/y", citations: [{ type: "pmid", id: "1", source: "url" }] }, // shared URL-derived id → dropped
    { url: "https://c.com/z", citations: [{ type: "pmid", id: "1", source: "text" }] }, // shares id but TEXT-derived → KEPT (distinct source)
    { url: "https://d.com/w", citations: [{ type: "doi", id: "10.1/z", source: "url" }] }, // unique → kept
  ];
  const out = dedupe(rows);
  // G4: a review citing paper #1's PMID in its snippet is NOT collapsed into paper #1.
  assert.deepEqual(out.map((r) => r.url), ["https://a.com/x/", "https://c.com/z", "https://d.com/w"]);
});

test("dedupe: non-array passes through untouched", () => {
  assert.equal(dedupe(null), null);
});

test("canonicalUrl: lowercases host, folds www/default-ports, preserves case-sensitive path", () => {
  // Host lowercased, www + scheme + trailing slash + default port dropped, PATH CASE PRESERVED.
  assert.equal(canonicalUrl("HTTPS://Www.Example.com:443/Path/"), "example.com/Path");
  // Two URLs differing only in path case are DISTINCT (not folded together).
  assert.notEqual(canonicalUrl("https://x.com/AbC"), canonicalUrl("https://x.com/abc"));
  // scheme / www / default-port / trailing-slash differences all fold to the same page.
  assert.equal(canonicalUrl("http://www.A.com:80/x/"), canonicalUrl("https://a.com/x"));
  // a non-default port is preserved (distinct service).
  assert.notEqual(canonicalUrl("https://a.com:8443/x"), canonicalUrl("https://a.com/x"));
});
