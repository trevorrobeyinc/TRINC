/**
 * Unit tests for the rerank guard + fail-soft paths (no network).
 * Run: `node --test test/rerank.test.mjs`
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { rerank, isPermutation, repairOrder, isHttpsLoopback } = require("../src/rerank.js");

test("isHttpsLoopback: only https on a loopback host passes", () => {
  assert.equal(isHttpsLoopback("https://127.0.0.1:11435/api/chat"), true);
  assert.equal(isHttpsLoopback("https://localhost:1235/v1/chat/completions"), true);
  assert.equal(isHttpsLoopback("https://[::1]:11435/api/chat"), true);
  assert.equal(isHttpsLoopback("http://127.0.0.1:11435/api/chat"), false); // plaintext
  assert.equal(isHttpsLoopback("https://evil.example.com/api"), false); // remote
  assert.equal(isHttpsLoopback("not a url"), false);
});

test("isPermutation: exact permutation of 0..n-1", () => {
  assert.equal(isPermutation([0, 1, 2], 3), true);
  assert.equal(isPermutation([2, 0, 1], 3), true);
  assert.equal(isPermutation([0, 1], 3), false); // wrong length
  assert.equal(isPermutation([0, 0, 1], 3), false); // dup
  assert.equal(isPermutation([0, 1, 3], 3), false); // out of range
});

test("repairOrder: a filtered response keeps its prefix, omitted indices append in native order", () => {
  // The real qwen2.5:7b-instruct failure: asked to rank 10, it returns only what it judged relevant.
  assert.deepEqual(repairOrder([0, 1, 6], 10), [0, 1, 6, 2, 3, 4, 5, 7, 8, 9]);
  assert.deepEqual(repairOrder([0, 1], 5), [0, 1, 2, 3, 4]);
  // A true permutation survives untouched.
  assert.deepEqual(repairOrder([2, 0, 1], 3), [2, 0, 1]);
  // Junk is stripped, not trusted: dupes, out-of-range and non-integers drop out.
  assert.deepEqual(repairOrder([2, 2, 0], 3), [2, 0, 1]);
  assert.deepEqual(repairOrder([9, 1], 3), [1, 0, 2]);
  assert.deepEqual(repairOrder([1.5, "0", 2], 3), [2, 0, 1]);
  // No usable index at all → null, so the caller keeps native order.
  assert.equal(repairOrder([], 3), null);
  assert.equal(repairOrder([99], 3), null);
  assert.equal(repairOrder(["a"], 3), null);
  assert.equal(repairOrder(null, 3), null);
});

test("rerank: fail-soft to original order without any network call", async () => {
  const rows = [{ title: "a" }, { title: "b" }];
  // disabled → unchanged
  assert.deepEqual(await rerank("q", rows, { enabled: false }), rows);
  // enabled but < 2 results → unchanged
  const one = [{ title: "solo" }];
  assert.deepEqual(await rerank("q", one, { enabled: true }), one);
  // enabled but plaintext/remote endpoint → guard blocks the send, returns unchanged
  assert.deepEqual(await rerank("q", rows, { enabled: true, endpoint: "http://127.0.0.1:11435/api/chat" }), rows);
  assert.deepEqual(await rerank("q", rows, { enabled: true, endpoint: "https://evil.example.com" }), rows);
});

test("rerank: an unreachable local model fails soft AND says so on stderr", async () => {
  const rows = [{ title: "a" }, { title: "b" }];
  const captured = [];
  const realWrite = process.stderr.write;
  process.stderr.write = (chunk) => {
    captured.push(String(chunk));
    return true;
  };
  let out;
  try {
    // Nothing listens on 59321, so fetch rejects with ECONNREFUSED — the catch path an operator hits
    // when Ollama simply isn't running. https + loopback, so the endpoint guard passes first.
    // (Do NOT use a low port like 1: the Fetch spec blocks those as "bad port" before connecting,
    // which exercises a different branch than the one this test is about.)
    out = await rerank("q", rows, { enabled: true, endpoint: "https://127.0.0.1:59321/api/chat", timeoutMs: 1500 });
  } finally {
    process.stderr.write = realWrite;
  }
  // The invariant the warning must never break: callers still get usable, natively-ordered results.
  assert.deepEqual(out, rows);
  const warning = captured.join("");
  assert.match(warning, /rerank skipped, keeping native order/);
  assert.match(warning, /127\.0\.0\.1:59321/);
  // The diagnostic must name the real cause, not just fetch's opaque "fetch failed".
  assert.match(warning, /ECONNREFUSED/);
  // Keyed warnOnce: the earlier "bad-endpoint" warning must not have masked this one.
  assert.equal(captured.filter((c) => /keeping native order/.test(c)).length, 1);
});
