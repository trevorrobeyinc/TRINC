"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { createObsidianBridgeMcp } = require("../../openclaw-bridge/mcp/obsidian-bridge-mcp/index.js");

function quietLogger() {
  const warns = [];
  return { warns, info() {}, warn(m) { warns.push(String(m)); }, error() {} };
}

/**
 * A fake for the adapter's bridge transport (by default the vault bridge's Unix socket): answers
 * health + the two read tools. `up: false` fails the way a missing socket does with Obsidian closed.
 */
function fakeBridge({ up = true, semantic = [], fullText = [] } = {}) {
  const calls = [];
  const transport = async (request) => {
    const body = JSON.parse(request.body);
    calls.push(body.tool);
    if (!up) {
      throw Object.assign(
        new Error("/tmp/uds-test/.local/state/trinc/run/vault-bridge.sock does not exist (bridge not running)"),
        { code: "ENOENT" }
      );
    }
    const respond = (data) => ({ status: 200, json: { ok: true, data } });
    if (body.tool === "obsidian_health") return respond({ ok: true });
    if (body.tool === "miyo_search_context") return respond({ results: semantic });
    if (body.tool === "obsidian_search_notes") return respond({ matches: fullText });
    return { status: 404, json: { ok: false, error: { message: "unknown" } } };
  };
  transport.calls = calls;
  return transport;
}

const MIYO_RESULTS = [
  { path: "My Digital Garden/Books/E-Books/Some Textbook.pdf", chunk_text: "book chunk", score: 0.9 },
  { path: "My Digital Garden/OpenClaw/clinical-trial-landscape/2026-07-16 heart failure/Synthesizer.md", title: "Synthesizer", chunk_text: "prior run text PMID: 25176015", score: 0.7 },
  { path: "My Digital Garden/Learning/Strayer Classes/FIN317/Week 7.md", chunk_text: "course note", score: 0.6 },
  { path: "My Digital Garden/Research-Output/2026-04-29/task-x/output.md", chunk_text: "april note", score: 0.5 }
];

describe("obsidian-bridge-mcp — Miyo-direct read-back", () => {
  it("answers from Miyo with Obsidian closed, filtered to research markdown, every record context_only", async () => {
    const bridgeTransport = fakeBridge({ up: false });
    const mcp = createObsidianBridgeMcp({
      logger: quietLogger(),
      bridgeTransport,
      authToken: "t",
      miyoRequest: async (url, body) => {
        assert.equal(url, "https://127.0.0.1:8743/v0/search");
        assert.equal(body.query, "heart failure sacubitril");
        return { status: 200, json: { results: MIYO_RESULTS } };
      }
    });
    const records = await mcp.priorResearch({ topic: "heart failure sacubitril", limit: 5 });
    assert.deepEqual(records.map((r) => r.path), [
      "OpenClaw/clinical-trial-landscape/2026-07-16 heart failure/Synthesizer.md",
      "Research-Output/2026-04-29/task-x/output.md"
    ]);
    for (const r of records) {
      assert.equal(r.context_only, true);
      assert.equal(r.source, "obsidian-vault-semantic");
    }
    assert.equal(records[0].text, "prior run text PMID: 25176015");
    assert.equal(records[0].score, 0.7);
    assert.deepEqual(bridgeTransport.calls, [], "the bridge was never consulted");
  });

  it("falls back to the vault bridge when Miyo is unreachable, still context_only", async () => {
    const bridgeTransport = fakeBridge({ up: true, semantic: [{ path: "OpenClaw/x/Analyst.md", chunk_text: "bridge semantic hit", score: 0.5 }] });
    const logger = quietLogger();
    const mcp = createObsidianBridgeMcp({
      logger,
      bridgeTransport,
      authToken: "t",
      miyoRequest: async () => { throw new Error("ECONNREFUSED 127.0.0.1:8743"); }
    });
    const records = await mcp.priorResearch({ topic: "anything", limit: 3 });
    assert.equal(records.length, 1);
    assert.equal(records[0].path, "OpenClaw/x/Analyst.md");
    assert.equal(records[0].context_only, true);
    assert.deepEqual(bridgeTransport.calls, ["obsidian_health", "miyo_search_context"]);
    assert.ok(logger.warns.some((w) => /miyo-direct unavailable/.test(w)));
  });

  it("falls through semantic → full-text on the bridge, and returns [] when everything is down", async () => {
    const bridgeTransport = fakeBridge({ up: true, semantic: [], fullText: [{ path: "OpenClaw/y/Scout.md", text: "full-text hit" }] });
    const mcp = createObsidianBridgeMcp({
      logger: quietLogger(),
      bridgeTransport,
      authToken: "t",
      miyoRequest: async () => ({ status: 200, json: { results: [] } })
    });
    const records = await mcp.priorResearch({ topic: "anything" });
    assert.equal(records.length, 1);
    assert.equal(records[0].source, "obsidian-vault");
    assert.equal(records[0].context_only, true);

    const dark = createObsidianBridgeMcp({
      logger: quietLogger(),
      bridgeTransport: fakeBridge({ up: false }),
      authToken: "t",
      miyoRequest: async () => { throw new Error("down"); }
    });
    assert.deepEqual(await dark.priorResearch({ topic: "anything" }), []);
    assert.deepEqual(await dark.priorResearch({ topic: "   " }), []);
  });

  it("ignores non-200 / malformed Miyo answers and refuses a plaintext Miyo url", async () => {
    const mcp = createObsidianBridgeMcp({
      logger: quietLogger(),
      bridgeTransport: fakeBridge({ up: false }),
      authToken: "t",
      miyoRequest: async () => ({ status: 500, json: null })
    });
    assert.deepEqual(await mcp.miyoDirectSearch({ query: "x" }), []);

    const plaintext = createObsidianBridgeMcp({
      logger: quietLogger(),
      bridgeTransport: fakeBridge({ up: false }),
      authToken: "t",
      miyoUrl: "http://127.0.0.1:8742"
    });
    // The default request function rejects a non-https url before any socket is opened.
    assert.deepEqual(await plaintext.miyoDirectSearch({ query: "x" }), []);
  });

  it("writes stay opt-in (allowWrites=false by default)", async () => {
    const mcp = createObsidianBridgeMcp({ logger: quietLogger(), bridgeTransport: fakeBridge({ up: true }), authToken: "t" });
    const r = await mcp.createNote({ notePath: "OpenClaw/x.md", content: "y" });
    assert.equal(r.ok, false);
    assert.match(r.error, /writes disabled/);
    assert.equal(mcp._spec.allowWrites, false);
    assert.equal(mcp._spec.miyoUrl, "https://127.0.0.1:8743");
    assert.deepEqual([...mcp._spec.miyoPathPrefixes], ["OpenClaw/", "Research-Output/"]);
    // The bridge is named by its socket, never by a URL (bridges-uds, 2026-11-24).
    assert.equal(mcp._spec.bridgeSocket, "vault-bridge.sock");
    assert.equal("bridgeUrl" in mcp._spec, false);
  });
});
