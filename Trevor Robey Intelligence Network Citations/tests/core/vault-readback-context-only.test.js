"use strict";

// Pins the 2026-09-22 rule: prior-research context (vault read-back, memory priors) informs a role
// but NEVER grounds a citation. Before this rule, an identifier sitting in an old vault note counted
// as "fetched at runtime" and satisfied the 0.75 grounded floor without any live source fetch.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { createToolPrefetch } = require("../../openclaw-bridge/core/tool-prefetch.js");
const { collectEvidenceContent, buildPrompt } = require("../../openclaw-bridge/core/agent-engine.js");
const { extractCitations } = require("../../openclaw-bridge/core/citation-extractor.js");

const ROOT_DIR = path.resolve(__dirname, "..", "..");

function mockToolUniverse() {
  return {
    execute: async () => [{ tool_name: "mock_tool", pmid: "30000001", abstract: "live evidence" }]
  };
}

function quietLogger() {
  return { info() {}, warn() {}, error() {} };
}

const PRIOR_NOTE = {
  path: "OpenClaw/clinical-trial-landscape/2026-07-16 heart failure/Synthesizer.md",
  text: "Prior run concluded sacubitril/valsartan reduced hospitalization (PMID: 25176015; NCT01035255; doi: 10.1056/NEJMoa1409077; CHEMBL2028661).",
  score: 0.71,
  source: "obsidian-vault-semantic"
};

describe("vault read-back is context-only (never citation evidence)", () => {
  it("prefetch renders a context_only map entry under a NOT-evidence banner with every identifier withheld", async () => {
    const prefetch = createToolPrefetch({
      toolUniverseMcp: mockToolUniverse(),
      logger: quietLogger(),
      rootDir: ROOT_DIR,
      localFetchers: {
        obsidian_prior_research: async () => [PRIOR_NOTE]
      }
    });
    const docs = await prefetch.prefetchForRole("scout", {
      indication: "heart failure", compound_name: "sacubitril", therapeutic_area: "cardiology", topic: "heart failure"
    });

    const vaultDocs = docs.filter((d) => d.context_only === true);
    assert.equal(vaultDocs.length, 1, "exactly one context-only doc for obsidian_prior_research");
    const doc = vaultDocs[0];
    assert.equal(doc.path, "vault://obsidian_prior_research");
    assert.equal(doc.rel, "prior-context/obsidian_prior_research");
    assert.match(doc.content, /Prior Context \(NOT evidence\)/);
    assert.match(doc.content, /CONTEXT ONLY - NOT EVIDENCE/);
    // A read-back record has no title, so its vault path becomes the record heading.
    assert.match(doc.content, /### OpenClaw\/clinical-trial-landscape\/2026-07-16 heart failure\/Synthesizer\.md/);
    assert.match(doc.content, /\*score 0\.71\*/);
    for (const raw of ["25176015", "NCT01035255", "10.1056/NEJMoa1409077", "CHEMBL2028661"]) {
      assert.doesNotMatch(doc.content, new RegExp(raw.replace(/[.\/]/g, "\\$&")), `identifier ${raw} must be withheld`);
    }
    assert.match(doc.content, /<prior-run PMID withheld>/);
    assert.match(doc.content, /<prior-run NCT withheld>/);
    assert.equal(extractCitations(doc.content).length, 0, "nothing in a context-only doc is extractable");

    // Live-data docs are untouched by the rule.
    const liveDocs = docs.filter((d) => d.context_only !== true);
    assert.ok(liveDocs.length > 0);
    for (const live of liveDocs) {
      assert.ok(live.path.startsWith("tooluniverse://"), live.path);
      assert.equal(live.context_only, undefined);
    }
    // Coverage still records the source honestly.
    const cov = docs.coverage.find((c) => c.source === "obsidian_prior_research");
    assert.ok(cov);
    assert.equal(cov.status, "returned");
    assert.equal(cov.records, 1);
  });

  it("a fetcher whose records carry context_only makes the doc context-only even without the map flag", async () => {
    const prefetch = createToolPrefetch({
      toolUniverseMcp: mockToolUniverse(),
      logger: quietLogger(),
      rootDir: ROOT_DIR,
      localFetchers: {
        // ctgov_stopped_trials is a real evidence source in the map (no context_only flag) — a
        // record-level flag must still win, so a map edit alone can never re-launder ids.
        ctgov_stopped_trials: async () => [{ nctId: "NCT88888888", whyStopped: "futility", context_only: true }]
      }
    });
    const docs = await prefetch.prefetchForRole("scout", {
      indication: "glioblastoma", compound_name: "temozolomide", therapeutic_area: "oncology", topic: "glioblastoma"
    });
    const doc = docs.find((d) => d.path === "vault://ctgov_stopped_trials");
    assert.ok(doc, "record-level context_only produced a vault:// doc");
    assert.equal(doc.context_only, true);
    assert.doesNotMatch(doc.content, /NCT88888888/);
  });

  it("collectEvidenceContent drops context_only docs, so their identifiers never enter fetched_citation_ids", () => {
    const docs = [
      { path: "tooluniverse://PubMed_search_articles", content: "PMID: 30000001", rel: "live-data/x" },
      { path: "vault://obsidian_prior_research", content: "old note PMID: 25176015 NCT01035255", rel: "prior-context/x", context_only: true },
      { path: "tooluniverse://search_clinical_trials", content: "NCT04000000", rel: "live-data/y" }
    ];
    const ids = extractCitations(collectEvidenceContent(docs)).map((c) => c.id);
    assert.deepEqual(ids.sort(), ["30000001", "NCT04000000"].sort());
    assert.ok(!ids.includes("25176015"));
    assert.ok(!ids.includes("NCT01035255"));
    assert.equal(collectEvidenceContent([]), "");
    assert.equal(collectEvidenceContent(null), "");
  });

  it("buildPrompt fences prior context as NOT evidence only when a vault:// doc is present", () => {
    const task = { type: "summarize", description: "t", output_format: "markdown", constraints: {} };
    const withPrior = buildPrompt(task, [
      { path: "tooluniverse://PubMed_search_articles", rel: "live-data/a", content: "PMID: 30000001" },
      { path: "vault://obsidian_prior_research", rel: "prior-context/b", content: "prior", context_only: true }
    ]);
    assert.match(String(withPrior), /PRIOR VAULT CONTEXT/);
    assert.match(String(withPrior), /CONTEXT ONLY, never evidence/);
    const without = buildPrompt(task, [
      { path: "tooluniverse://PubMed_search_articles", rel: "live-data/a", content: "PMID: 30000001" }
    ]);
    assert.doesNotMatch(String(without), /PRIOR VAULT CONTEXT/);
  });
});
