"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { createObsidianBridgeMcp } = require("../../openclaw-bridge/mcp/obsidian-bridge-mcp/index.js");

function quietLogger() {
  const warns = [];
  return { warns, info() {}, warn(m) { warns.push(String(m)); }, error() {} };
}

/** A fetch stub for the :8798 bridge: answers health + the two read tools. */
function bridgeFetch({ up = true, semantic = [], fullText = [] } = {}) {
  const calls = [];
  const impl = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body.tool);
    if (!up) throw new Error("ECONNREFUSED 127.0.0.1:8798");
    const respond = (data) => ({ ok: true, status: 200, json: async () => ({ ok: true, data }) });
    if (body.tool === "obsidian_health") return respond({ ok: true });
    if (body.tool === "miyo_search_context") return respond({ results: semantic });
    if (body.tool === "obsidian_search_notes") return respond({ matches: fullText });
    return { ok: false, status: 404, json: async () => ({ ok: false, error: { message: "unknown" } }) };
  };
  impl.calls = calls;
  return impl;
}

const MIYO_RESULTS = [
  { path: "My Digital Garden/Books/E-Books/Some Textbook.pdf", chunk_text: "book chunk", score: 0.9 },
  { path: "My Digital Garden/OpenClaw/clinical-trial-landscape/2026-07-16 heart failure/Synthesizer.md", title: "Synthesizer", chunk_text: "prior run text PMID: 25176015", score: 0.7 },
  { path: "My Digital Garden/Learning/Strayer Classes/FIN317/Week 7.md", chunk_text: "course note", score: 0.6 },
  { path: "My Digital Garden/Research-Output/2026-04-29/task-x/output.md", chunk_text: "april note", score: 0.5 }
];

describe("obsidian-bridge-mcp — Miyo-direct read-back", () => {
  it("answers from Miyo with Obsidian closed, filtered to research markdown, every record context_only", async () => {
    const fetchImpl = bridgeFetch({ up: false });
    const mcp = createObsidianBridgeMcp({
      logger: quietLogger(),
      fetchImpl,
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
    assert.deepEqual(fetchImpl.calls, [], "the bridge was never consulted");
  });

  it("falls back to the :8798 bridge when Miyo is unreachable, still context_only", async () => {
    const fetchImpl = bridgeFetch({ up: true, semantic: [{ path: "OpenClaw/x/Analyst.md", chunk_text: "bridge semantic hit", score: 0.5 }] });
    const logger = quietLogger();
    const mcp = createObsidianBridgeMcp({
      logger,
      fetchImpl,
      authToken: "t",
      miyoRequest: async () => { throw new Error("ECONNREFUSED 127.0.0.1:8743"); }
    });
    const records = await mcp.priorResearch({ topic: "anything", limit: 3 });
    assert.equal(records.length, 1);
    assert.equal(records[0].path, "OpenClaw/x/Analyst.md");
    assert.equal(records[0].context_only, true);
    assert.deepEqual(fetchImpl.calls, ["obsidian_health", "miyo_search_context"]);
    assert.ok(logger.warns.some((w) => /miyo-direct unavailable/.test(w)));
  });

  it("falls through semantic → full-text on the bridge, and returns [] when everything is down", async () => {
    const fetchImpl = bridgeFetch({ up: true, semantic: [], fullText: [{ path: "OpenClaw/y/Scout.md", text: "full-text hit" }] });
    const mcp = createObsidianBridgeMcp({
      logger: quietLogger(),
      fetchImpl,
      authToken: "t",
      miyoRequest: async () => ({ status: 200, json: { results: [] } })
    });
    const records = await mcp.priorResearch({ topic: "anything" });
    assert.equal(records.length, 1);
    assert.equal(records[0].source, "obsidian-vault");
    assert.equal(records[0].context_only, true);

    const dark = createObsidianBridgeMcp({
      logger: quietLogger(),
      fetchImpl: bridgeFetch({ up: false }),
      authToken: "t",
      miyoRequest: async () => { throw new Error("down"); }
    });
    assert.deepEqual(await dark.priorResearch({ topic: "anything" }), []);
    assert.deepEqual(await dark.priorResearch({ topic: "   " }), []);
  });

  it("ignores non-200 / malformed Miyo answers and refuses a plaintext Miyo url", async () => {
    const mcp = createObsidianBridgeMcp({
      logger: quietLogger(),
      fetchImpl: bridgeFetch({ up: false }),
      authToken: "t",
      miyoRequest: async () => ({ status: 500, json: null })
    });
    assert.deepEqual(await mcp.miyoDirectSearch({ query: "x" }), []);

    const plaintext = createObsidianBridgeMcp({
      logger: quietLogger(),
      fetchImpl: bridgeFetch({ up: false }),
      authToken: "t",
      miyoUrl: "http://127.0.0.1:8742"
    });
    // The default request function rejects a non-https url before any socket is opened.
    assert.deepEqual(await plaintext.miyoDirectSearch({ query: "x" }), []);
  });

  it("writes stay opt-in (allowWrites=false by default)", async () => {
    const mcp = createObsidianBridgeMcp({ logger: quietLogger(), fetchImpl: bridgeFetch({ up: true }), authToken: "t" });
    const r = await mcp.createNote({ notePath: "OpenClaw/x.md", content: "y" });
    assert.equal(r.ok, false);
    assert.match(r.error, /writes disabled/);
    assert.equal(mcp._spec.allowWrites, false);
    assert.equal(mcp._spec.miyoUrl, "https://127.0.0.1:8743");
    assert.deepEqual([...mcp._spec.miyoPathPrefixes], ["OpenClaw/", "Research-Output/"]);
  });
});
