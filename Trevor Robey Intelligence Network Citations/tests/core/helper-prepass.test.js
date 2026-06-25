"use strict";

// Multi-agent helper pre-pass (2026-06-22). scout/analyst/synthesizer now run on Opus 4.8; the
// open-source models (Ollama / LM Studio) are demoted to a small per-role "helper" that triages
// the prefetched evidence BEFORE the primary backend. Invariants tested here:
//   (1) buildPrompt renders the helper digest as advisory / non-authoritative, after the
//       ZERO-FABRICATION rule and before the evidence;
//   (2) runHelperPrePass is fail-soft — a helper error (e.g. Ollama down) yields "" and the
//       primary runs alone, and it routes to the helper provider/model with no fallback;
//   (3) THE LOAD-BEARING SAFETY INVARIANT — a fabricated identifier present only in the helper
//       digest never enters the grounded-citation set, so the deterministic citation gate still
//       flags it as ungrounded. The helper can never launder a citation. See trinc-never-hallucinate.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { buildPrompt, runHelperPrePass } = require("../../openclaw-bridge/core/agent-engine.js");
const { extractCitations, deduplicateCitations } = require("../../openclaw-bridge/core/citation-extractor.js");

const TASK = { type: "search", description: "Find sources on aspirin.", output_format: "markdown", constraints: {} };
const logger = { info() {}, warn() {} };

describe("buildPrompt — advisory helper digest", () => {
  it("renders the digest fenced + labeled non-authoritative, after the zero-fabrication rule and before the evidence", () => {
    const docs = [{ rel: "tooluniverse://pubmed", content: "Result PMID: 11111111" }];
    const prompt = buildPrompt(TASK, docs, { helperDigest: "- aspirin lowers X (PMID: 11111111)" });
    assert.match(prompt, /ADVISORY HELPER DIGEST \(UNVERIFIED, NON-AUTHORITATIVE\)/);
    assert.match(prompt, /BEGIN ADVISORY DIGEST[\s\S]*aspirin lowers X[\s\S]*END ADVISORY DIGEST/);
    assert.ok(prompt.indexOf("ZERO FABRICATION") < prompt.indexOf("BEGIN ADVISORY DIGEST"), "digest follows the zero-fabrication rule");
    assert.ok(prompt.indexOf("END ADVISORY DIGEST") < prompt.indexOf("Input Documents:"), "digest precedes the evidence");
  });

  it("omits the advisory section entirely when there is no digest", () => {
    const prompt = buildPrompt(TASK, [{ rel: "d", content: "x" }], {});
    assert.doesNotMatch(prompt, /ADVISORY HELPER DIGEST/);
  });
});

describe("runHelperPrePass — active assist, fail-soft", () => {
  const docs = [{ rel: "tooluniverse://pubmed", content: "Record PMID: 22222222" }];

  it("returns the helper digest and routes to the helper provider/model with no fallback", async () => {
    const calls = [];
    const llmAdapter = { complete: async (_prompt, opts) => { calls.push(opts); return { text: "DIGEST OK" }; } };
    const digest = await runHelperPrePass({
      taskDefinition: TASK, inputDocs: docs,
      helper: { provider: "local", model: "qwen2.5:7b-instruct", maxTokens: 512 },
      llmAdapter, logger, taskId: "t1", role: "scout"
    });
    assert.equal(digest, "DIGEST OK");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].provider, "local");
    assert.equal(calls[0].model, "qwen2.5:7b-instruct");
    assert.equal(calls[0].maxTokens, 512);
    assert.equal(calls[0].taskId, "t1:helper");
    assert.equal(calls[0].fallbackProvider, undefined, "helper must not carry a fallback — it is optional");
  });

  it("is fail-soft: a helper error returns \"\" so the primary still runs", async () => {
    const llmAdapter = { complete: async () => { throw new Error("ollama down"); } };
    const digest = await runHelperPrePass({
      taskDefinition: TASK, inputDocs: docs,
      helper: { provider: "local", model: "qwen2.5:7b-instruct" },
      llmAdapter, logger, taskId: "t2", role: "scout"
    });
    assert.equal(digest, "");
  });

  it("no-ops (no model call) when the helper is absent or there is no evidence", async () => {
    let called = 0;
    const llmAdapter = { complete: async () => { called++; return { text: "x" }; } };
    assert.equal(await runHelperPrePass({ taskDefinition: TASK, inputDocs: docs, helper: null, llmAdapter, logger, taskId: "t3", role: "scout" }), "");
    assert.equal(await runHelperPrePass({ taskDefinition: TASK, inputDocs: [], helper: { provider: "local" }, llmAdapter, logger, taskId: "t4", role: "scout" }), "");
    assert.equal(called, 0, "helper must not be called with no helper / no evidence");
  });
});

describe("ZERO-FABRICATION invariant — the helper cannot launder a citation", () => {
  it("a fake identifier present only in the digest is NOT grounded, even though it is in the prompt", () => {
    // The fetched evidence carries a real PMID; the helper hallucinated a different one.
    const inputDocs = [{ rel: "tooluniverse://pubmed", content: "Fetched record PMID: 33333333" }];
    const helperDigest = "- aspirin reduces risk (PMID: 99999999)"; // 99999999 is NOT in the evidence

    // groundedCitationIds is computed EXACTLY as agent-engine.executeTask does: from inputDocs only.
    const groundedCitationIds = deduplicateCitations(
      extractCitations(inputDocs.map((d) => d.content).join("\n\n"))
    ).map((c) => String(c.id));

    const prompt = buildPrompt(TASK, inputDocs, { helperDigest });

    assert.ok(prompt.includes("99999999"), "the fake id IS visible in the prompt (digest injected)");
    assert.ok(groundedCitationIds.includes("33333333"), "the real fetched id is grounded");
    assert.ok(!groundedCitationIds.includes("99999999"), "the helper-only fake id is NOT grounded → the gate will flag it");
  });
});
