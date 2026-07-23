"use strict";

// Unit tests for the obsidian-bridge-mcp adapter.
//
// The contract that matters most here is FAIL-SOFT: the bridge dies with Obsidian, so every read
// path must degrade to an empty result rather than throw into a research run. These tests use an
// injected fetchImpl + authToken, so they never touch the network or the bridge config file.

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createObsidianBridgeMcp,
} = require("../../openclaw-bridge/mcp/obsidian-bridge-mcp/index.js");

function makeFetch(handler) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return handler(url, init, calls.length);
  };
  return { fetchImpl, calls };
}

const okResponse = (data) => ({
  ok: true,
  status: 200,
  json: async () => ({ ok: true, data }),
});

test("searchNotes returns mapped matches on success", async () => {
  const { fetchImpl, calls } = makeFetch(() =>
    okResponse({ query: "aspirin", matches: [{ path: "A.md", text: "hit" }] })
  );
  const mcp = createObsidianBridgeMcp({ fetchImpl, authToken: "t" });
  const out = await mcp.searchNotes({ query: "aspirin", limit: 3 });
  assert.equal(out.length, 1);
  assert.equal(out[0].path, "A.md");
  assert.equal(out[0].source, "obsidian-vault");

  // Contract with the bridge: tool + operation + input.vault are all required.
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.tool, "obsidian_search_notes");
  assert.equal(body.operation, "search_notes");
  assert.equal(body.input.vault, "My Digital Garden");
  assert.equal(body.input.query, "aspirin");
});

test("every replay-protection header is present and body-sha256 matches the body", async () => {
  const crypto = require("node:crypto");
  const { fetchImpl, calls } = makeFetch(() => okResponse({ matches: [] }));
  const mcp = createObsidianBridgeMcp({ fetchImpl, authToken: "secret-token" });
  await mcp.searchNotes({ query: "x" });

  const h = calls[0].init.headers;
  assert.equal(h.Authorization, "Bearer secret-token");
  assert.equal(h["x-mcp-token"], "secret-token");
  assert.match(String(h["x-mcp-timestamp"]), /^\d+$/);
  assert.match(String(h["x-mcp-nonce"]), /^[0-9a-f-]{36}$/i);
  const expected = crypto.createHash("sha256").update(calls[0].init.body, "utf8").digest("hex");
  assert.equal(h["x-mcp-body-sha256"], expected, "body hash must cover the exact bytes sent");
});

test("FAIL-SOFT: a thrown transport error degrades to an empty array, never a throw", async () => {
  const { fetchImpl } = makeFetch(() => {
    throw new Error("ECONNREFUSED");
  });
  const mcp = createObsidianBridgeMcp({ fetchImpl, authToken: "t" });
  assert.deepEqual(await mcp.searchNotes({ query: "x" }), []);
  assert.deepEqual(await mcp.miyoSearchContext({ query: "x" }), []);
  assert.equal(await mcp.readNote({ notePath: "A.md" }), "");
});

test("FAIL-SOFT: a non-ok bridge response degrades quietly", async () => {
  const { fetchImpl } = makeFetch(() => ({
    ok: false,
    status: 401,
    json: async () => ({ ok: false, error: { message: "unauthorized" } }),
  }));
  const mcp = createObsidianBridgeMcp({ fetchImpl, authToken: "t" });
  assert.deepEqual(await mcp.searchNotes({ query: "x" }), []);
  assert.equal(await mcp.available(), false);
});

test("missing auth token short-circuits without any network call", async () => {
  const { fetchImpl, calls } = makeFetch(() => okResponse({ matches: [] }));
  // Point at a config path that cannot exist so the token lookup fails.
  const mcp = createObsidianBridgeMcp({
    fetchImpl,
    bridgeConfigPath: "/nonexistent/obsidian-bridge-config.json",
  });
  assert.deepEqual(await mcp.searchNotes({ query: "x" }), []);
  assert.equal(calls.length, 0, "must not attempt an unauthenticated request");
});

test("empty/blank inputs are rejected before any network call", async () => {
  const { fetchImpl, calls } = makeFetch(() => okResponse({ matches: [] }));
  const mcp = createObsidianBridgeMcp({ fetchImpl, authToken: "t" });
  assert.deepEqual(await mcp.searchNotes({ query: "   " }), []);
  assert.deepEqual(await mcp.searchNotes({}), []);
  assert.equal(await mcp.readNote({}), "");
  assert.equal(calls.length, 0);
});

test("writes are OPT-IN and blocked by default (guards the double-write)", async () => {
  const { fetchImpl, calls } = makeFetch(() => okResponse({}));
  const mcp = createObsidianBridgeMcp({ fetchImpl, authToken: "t" });
  const res = await mcp.createNote({ notePath: "X.md", content: "hi" });
  assert.equal(res.ok, false);
  assert.match(res.error, /writes disabled/);
  assert.equal(calls.length, 0, "a disabled write must not reach the bridge");

  const rw = createObsidianBridgeMcp({ fetchImpl, authToken: "t", allowWrites: true });
  const ok = await rw.createNote({ notePath: "X.md", content: "hi" });
  assert.equal(ok.ok, true);
  assert.equal(JSON.parse(calls[0].init.body).tool, "obsidian_create_note");
});

test("availability is cached, and force re-probes (cold-start race recovery)", async () => {
  let attempt = 0;
  const { fetchImpl } = makeFetch(() => {
    attempt += 1;
    // First probe fails the way the bridge does before its first capability refresh.
    if (attempt === 1) {
      return {
        ok: false,
        status: 400,
        json: async () => ({ ok: false, error: { message: "NO_CAPABLE_BACKEND", retryable: true } }),
      };
    }
    return okResponse({ status: "healthy" });
  });
  const mcp = createObsidianBridgeMcp({ fetchImpl, authToken: "t" });
  assert.equal(await mcp.available(), false);
  assert.equal(await mcp.available(), false, "second call is cached, no re-probe");
  assert.equal(attempt, 1);
  assert.equal(await mcp.available({ force: true }), true, "force re-probes and recovers");
});

test("priorResearch prefers semantic hits and falls back to full-text", async () => {
  // health ok → miyo empty → falls through to search_notes
  const { fetchImpl, calls } = makeFetch((_url, init) => {
    const body = JSON.parse(init.body);
    if (body.tool === "obsidian_health") return okResponse({ status: "healthy" });
    if (body.tool === "miyo_search_context") return okResponse({ results: [] });
    return okResponse({ matches: [{ path: "F.md", text: "fulltext" }] });
  });
  const mcp = createObsidianBridgeMcp({ fetchImpl, authToken: "t" });
  const out = await mcp.priorResearch({ topic: "aspirin" });
  assert.equal(out.length, 1);
  assert.equal(out[0].source, "obsidian-vault");
  assert.deepEqual(
    calls.map((c) => JSON.parse(c.init.body).tool),
    ["obsidian_health", "miyo_search_context", "obsidian_search_notes"]
  );
});

test("priorResearch returns [] when the vault is unavailable (no cascade of calls)", async () => {
  const { fetchImpl, calls } = makeFetch(() => {
    throw new Error("bridge down");
  });
  const mcp = createObsidianBridgeMcp({ fetchImpl, authToken: "t" });
  assert.deepEqual(await mcp.priorResearch({ topic: "aspirin" }), []);
  assert.equal(calls.length, 1, "stops after the health probe fails");
});
