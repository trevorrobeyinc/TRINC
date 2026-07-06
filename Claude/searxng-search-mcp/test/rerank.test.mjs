/**
 * Unit tests for the rerank guard + fail-soft paths (no network).
 * Run: `node --test test/rerank.test.mjs`
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { rerank, isPermutation, isHttpsLoopback } = require("../src/rerank.js");

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
