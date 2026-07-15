/**
 * Unit tests for numeric-env parsing (numEnv) and the tool-schema time_range contract.
 * numEnv fixes the `Number(process.env.X || default)` anti-pattern: a garbage value or "0" used to
 * propagate as NaN/0 (firing setTimeout immediately / failing a truncation cap open) instead of
 * falling back to the documented default. Run: node --test test/config.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { numEnv } = require("../src/config.js");

test("numEnv: garbage / undefined / empty / negative → default; a valid positive passes through", () => {
  assert.equal(numEnv(undefined, 15000), 15000);
  assert.equal(numEnv("", 15000), 15000);
  assert.equal(numEnv("abc", 15000), 15000); // the typo case that used to NaN the timeout
  assert.equal(numEnv("-5", 15000), 15000);
  assert.equal(numEnv("2500", 15000), 2500);
  assert.equal(numEnv("2500.5", 15000), 2500.5);
});

test("numEnv: 0 → default for timeouts, but kept when allowZero (cache-TTL 'disable' semantics)", () => {
  assert.equal(numEnv("0", 300000), 300000); // a 0 timeout would fire immediately — reject it
  assert.equal(numEnv("0", 300000, { allowZero: true }), 0); // 0 legitimately disables the cache
});

test("time_range schema advertises 'week' — matches the handler's zod + week→day coercion", () => {
  const { TOOLS } = require("../src/tools.js");
  const search = TOOLS.find((t) => t.name === "search");
  assert.ok(
    search.inputSchema.properties.time_range.enum.includes("week"),
    "advertised enum must include 'week' so the contract is not stricter than the server enforces"
  );
});
