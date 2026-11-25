"use strict";

// Unit tests for the obsidian-bridge-mcp adapter.
//
// The contract that matters most here is FAIL-SOFT: the bridge dies with Obsidian, so every read
// path must degrade to an empty result rather than throw into a research run. Since bridges-uds
// (2026-11-24) the two lanes have separate seams: the vault bridge goes through `bridgeTransport`
// (by default the bridge's Unix socket, through base-mcp's bridgeSocketRequest) and Miyo-direct
// through its own fetch (`miyoFetchImpl`). Every test here injects the bridge transport and an
// authToken, so none touches a socket, the network or the bridge config file. The real socket is
// exercised in obsidian-bridge-mcp-socket.test.js under a temporary HOME.

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const {
  createObsidianBridgeMcp,
} = require("../../openclaw-bridge/mcp/obsidian-bridge-mcp/index.js");

/** A fake vault-bridge transport: records each request, answers with handler(request, n). */
function makeBridge(handler, log) {
  const calls = [];
  const bridgeTransport = async (request) => {
    calls.push(request);
    if (log) log.push(`bridge:${JSON.parse(request.body).tool}`);
    return handler(request, calls.length);
  };
  return { bridgeTransport, calls };
}

/** A fake Miyo fetch (fetch-shaped, as the default Miyo request expects). */
function makeMiyoFetch(handler, log) {
  const calls = [];
  const miyoFetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (log) log.push(`miyo:${new URL(url).pathname}`);
    return handler(url, init, calls.length);
  };
  return { miyoFetchImpl, calls };
}

const okResponse = (data) => ({ status: 200, json: { ok: true, data } });

/** The errors the socket lane raises, with the codes base-mcp's bridgeSocketRequest uses. */
function socketError(code, message = `${code}: /tmp/uds-test/.local/state/trinc/run/vault-bridge.sock`) {
  return Object.assign(new Error(message), { code });
}

function quietLogger() {
  const warns = [];
  return { warns, info() {}, warn(m) { warns.push(String(m)); }, error() {} };
}

const toolOf = (request) => JSON.parse(request.body).tool;

test("searchNotes returns mapped matches on success", async () => {
  const { bridgeTransport, calls } = makeBridge(() =>
    okResponse({ query: "aspirin", matches: [{ path: "A.md", text: "hit" }] })
  );
  const mcp = createObsidianBridgeMcp({ bridgeTransport, authToken: "t" });
  const out = await mcp.searchNotes({ query: "aspirin", limit: 3 });
  assert.equal(out.length, 1);
  assert.equal(out[0].path, "A.md");
  assert.equal(out[0].source, "obsidian-vault");

  // Contract with the bridge: POST /mcp/tool with tool + operation + input.vault.
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].path, "/mcp/tool");
  const body = JSON.parse(calls[0].body);
  assert.equal(body.tool, "obsidian_search_notes");
  assert.equal(body.operation, "search_notes");
  assert.equal(body.input.vault, "My Digital Garden");
  assert.equal(body.input.query, "aspirin");
});

test("every replay-protection header is present and body-sha256 matches the body", async () => {
  const { bridgeTransport, calls } = makeBridge(() => okResponse({ matches: [] }));
  const mcp = createObsidianBridgeMcp({ bridgeTransport, authToken: "secret-token" });
  await mcp.searchNotes({ query: "x" });

  const h = calls[0].headers;
  assert.equal(h["Content-Type"], "application/json");
  assert.equal(h.Authorization, "Bearer secret-token");
  assert.equal(h["x-mcp-token"], "secret-token");
  assert.match(String(h["x-mcp-timestamp"]), /^\d+$/);
  assert.match(String(h["x-mcp-nonce"]), /^[0-9a-f-]{36}$/i);
  const expected = crypto.createHash("sha256").update(calls[0].body, "utf8").digest("hex");
  assert.equal(h["x-mcp-body-sha256"], expected, "body hash must cover the exact bytes sent");
});

test("the bridge lane names no URL, host or port: the transport gets method, path, headers, body, signal", async () => {
  // A stale bridgeUrl and a fetch are passed on purpose: neither may reach the bridge lane.
  const strayFetch = makeMiyoFetch(() => {
    throw new Error("fetch must not serve the bridge");
  });
  const { bridgeTransport, calls } = makeBridge(() => okResponse({ status: "healthy" }));
  const mcp = createObsidianBridgeMcp({
    bridgeTransport,
    authToken: "t",
    bridgeUrl: "https://127.0.0.1:8798",
    fetchImpl: strayFetch.miyoFetchImpl,
  });
  assert.equal((await mcp.health()).ok, true);
  assert.deepEqual(await mcp.searchNotes({ query: "x" }), []);

  assert.equal(calls.length, 2);
  for (const request of calls) {
    assert.deepEqual(Object.keys(request).sort(), ["body", "headers", "method", "path", "signal"]);
    assert.ok(request.signal instanceof AbortSignal, "the 15 s abort travels with the request");
    assert.equal(request.path, "/mcp/tool");
    assert.ok(!Object.keys(request.headers).some((k) => k.toLowerCase() === "host"), "no Host is chosen here");
  }
  assert.equal(strayFetch.calls.length, 0, "fetch never serves the bridge lane");
  assert.equal(mcp._spec.bridgeSocket, "vault-bridge.sock");
  assert.equal("bridgeUrl" in mcp._spec, false);
});

test("FAIL-SOFT: a thrown transport error degrades to an empty array, never a throw", async () => {
  const { bridgeTransport } = makeBridge(() => {
    throw socketError("ECONNREFUSED");
  });
  const mcp = createObsidianBridgeMcp({ bridgeTransport, authToken: "t" });
  assert.deepEqual(await mcp.searchNotes({ query: "x" }), []);
  assert.deepEqual(await mcp.miyoSearchContext({ query: "x" }), []);
  assert.equal(await mcp.readNote({ notePath: "A.md" }), "");
});

test("FAIL-SOFT: a non-ok bridge response degrades quietly", async () => {
  const { bridgeTransport } = makeBridge(() => ({
    status: 401,
    json: { ok: false, error: { message: "unauthorized" } },
  }));
  const mcp = createObsidianBridgeMcp({ bridgeTransport, authToken: "t" });
  assert.deepEqual(await mcp.searchNotes({ query: "x" }), []);
  assert.deepEqual(await mcp.health(), { ok: false, error: "unauthorized", status: 401 });
  assert.equal(await mcp.available(), false);
});

test("a missing or stale socket reads as 'bridge unavailable'", async () => {
  for (const code of ["ENOENT", "ECONNREFUSED"]) {
    const { bridgeTransport } = makeBridge(() => {
      throw socketError(code);
    });
    const mcp = createObsidianBridgeMcp({ bridgeTransport, authToken: "t", logger: quietLogger() });
    assert.deepEqual(await mcp.health(), { ok: false, error: `bridge unavailable (${code})` });
    assert.deepEqual(await mcp.searchNotes({ query: "x" }), []);
    assert.equal(await mcp.available(), false);
  }
});

test("a refused socket fails soft as 'bridge socket untrusted' and logs why, never the token", async () => {
  const logger = quietLogger();
  const { bridgeTransport, calls } = makeBridge(() => {
    throw socketError("SOCKET_UNTRUSTED", "/tmp/uds-test/.local/state/trinc/run has mode 755");
  });
  const mcp = createObsidianBridgeMcp({ bridgeTransport, authToken: "secret-token", logger });
  assert.deepEqual(await mcp.health(), { ok: false, error: "bridge socket untrusted" });
  assert.deepEqual(await mcp.searchNotes({ query: "x" }), []);
  assert.equal(await mcp.readNote({ notePath: "A.md" }), "");
  assert.equal(await mcp.available(), false);
  assert.equal(calls.length, 4, "one attempt per call; nothing retried over another transport");
  assert.ok(logger.warns.some((w) => w.includes("SOCKET_UNTRUSTED") && w.includes("has mode 755")));
  assert.ok(!logger.warns.some((w) => w.includes("secret-token")), "no log line carries the token");

  const long = createObsidianBridgeMcp({
    bridgeTransport: makeBridge(() => {
      throw socketError("SOCKET_PATH_TOO_LONG");
    }).bridgeTransport,
    authToken: "t",
    logger: quietLogger(),
  });
  assert.deepEqual(await long.health(), { ok: false, error: "bridge socket path too long" });
});

test("missing auth token short-circuits without any network call", async () => {
  const { bridgeTransport, calls } = makeBridge(() => okResponse({ matches: [] }));
  // Point at a config path that cannot exist so the token lookup fails.
  const mcp = createObsidianBridgeMcp({
    bridgeTransport,
    bridgeConfigPath: "/nonexistent/obsidian-bridge-config.json",
  });
  assert.deepEqual(await mcp.searchNotes({ query: "x" }), []);
  assert.equal(calls.length, 0, "must not attempt an unauthenticated request");
});

test("empty/blank inputs are rejected before any network call", async () => {
  const { bridgeTransport, calls } = makeBridge(() => okResponse({ matches: [] }));
  const mcp = createObsidianBridgeMcp({ bridgeTransport, authToken: "t" });
  assert.deepEqual(await mcp.searchNotes({ query: "   " }), []);
  assert.deepEqual(await mcp.searchNotes({}), []);
  assert.equal(await mcp.readNote({}), "");
  assert.equal(calls.length, 0);
});

test("writes are OPT-IN and blocked by default (guards the double-write)", async () => {
  const { bridgeTransport, calls } = makeBridge(() => okResponse({}));
  const mcp = createObsidianBridgeMcp({ bridgeTransport, authToken: "t" });
  const res = await mcp.createNote({ notePath: "X.md", content: "hi" });
  assert.equal(res.ok, false);
  assert.match(res.error, /writes disabled/);
  assert.equal(calls.length, 0, "a disabled write must not reach the bridge");

  const rw = createObsidianBridgeMcp({ bridgeTransport, authToken: "t", allowWrites: true });
  const ok = await rw.createNote({ notePath: "X.md", content: "hi" });
  assert.equal(ok.ok, true);
  assert.equal(toolOf(calls[0]), "obsidian_create_note");
});

test("availability is cached, and force re-probes (cold-start race recovery)", async () => {
  let attempt = 0;
  const { bridgeTransport } = makeBridge(() => {
    attempt += 1;
    // First probe fails the way the bridge does before its first capability refresh.
    if (attempt === 1) {
      return { status: 400, json: { ok: false, error: { message: "NO_CAPABLE_BACKEND", retryable: true } } };
    }
    return okResponse({ status: "healthy" });
  });
  const mcp = createObsidianBridgeMcp({ bridgeTransport, authToken: "t" });
  assert.equal(await mcp.available(), false);
  assert.equal(await mcp.available(), false, "second call is cached, no re-probe");
  assert.equal(attempt, 1);
  assert.equal(await mcp.available({ force: true }), true, "force re-probes and recovers");
});

test("priorResearch asks Miyo-direct first, then the bridge: health, semantic, full-text", async () => {
  // Since 2026-09-22 the FIRST hop is Miyo-direct (its own HTTPS fetch, no `tool` in the body, works
  // with Obsidian closed); with Miyo empty it goes to the bridge's socket: health ok → bridge miyo
  // empty → search_notes. One log across both seams proves the order and the count.
  const order = [];
  const miyo = makeMiyoFetch(() => ({ status: 200, json: async () => ({ results: [] }) }), order);
  const bridge = makeBridge((request) => {
    const tool = toolOf(request);
    if (tool === "obsidian_health") return okResponse({ status: "healthy" });
    if (tool === "miyo_search_context") return okResponse({ results: [] });
    return okResponse({ matches: [{ path: "F.md", text: "fulltext" }] });
  }, order);
  const mcp = createObsidianBridgeMcp({
    bridgeTransport: bridge.bridgeTransport,
    miyoFetchImpl: miyo.miyoFetchImpl,
    authToken: "t",
  });
  const out = await mcp.priorResearch({ topic: "aspirin" });
  assert.equal(out.length, 1);
  assert.equal(out[0].source, "obsidian-vault");
  assert.equal(out[0].context_only, true, "read-back is context, never evidence");
  assert.deepEqual(order, [
    "miyo:/v0/search",
    "bridge:obsidian_health",
    "bridge:miyo_search_context",
    "bridge:obsidian_search_notes",
  ]);
  assert.equal(miyo.calls.length, 1);
  assert.equal(miyo.calls[0].url, "https://127.0.0.1:8743/v0/search", "Miyo-direct is unchanged");
  assert.equal(bridge.calls.length, 3);
  assert.ok(bridge.calls.every((c) => c.path === "/mcp/tool"), "the bridge transport never serves Miyo");
});

test("priorResearch returns [] when the vault is unavailable (no cascade of calls)", async () => {
  const order = [];
  const miyo = makeMiyoFetch(() => {
    throw new Error("miyo down");
  }, order);
  const bridge = makeBridge(() => {
    throw socketError("ENOENT");
  }, order);
  const mcp = createObsidianBridgeMcp({
    bridgeTransport: bridge.bridgeTransport,
    miyoFetchImpl: miyo.miyoFetchImpl,
    authToken: "t",
  });
  assert.deepEqual(await mcp.priorResearch({ topic: "aspirin" }), []);
  // One Miyo-direct attempt, then the bridge health probe — and nothing after it fails.
  assert.deepEqual(order, ["miyo:/v0/search", "bridge:obsidian_health"], "stops after both lanes fail once");
});

test("a legacy fetchImpl still serves Miyo-direct only, never the bridge", async () => {
  const order = [];
  const legacy = makeMiyoFetch(
    () => ({ status: 200, json: async () => ({ results: [{ path: "My Digital Garden/OpenClaw/x/Scout.md", chunk_text: "prior", score: 0.4 }] }) }),
    order
  );
  const bridge = makeBridge(() => okResponse({ status: "healthy" }), order);
  const mcp = createObsidianBridgeMcp({ bridgeTransport: bridge.bridgeTransport, fetchImpl: legacy.miyoFetchImpl, authToken: "t" });
  const out = await mcp.priorResearch({ topic: "aspirin" });
  assert.deepEqual(out.map((r) => r.path), ["OpenClaw/x/Scout.md"]);
  assert.deepEqual(order, ["miyo:/v0/search"], "a Miyo hit never wakes the bridge");
});
