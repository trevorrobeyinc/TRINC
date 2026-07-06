/**
 * Grammar-drift guard: the connector's citation grammar (src/citation-grammar.js) and the engine's
 * report-level gate grammar (Trevor Robey…/openclaw-bridge/core/citation-extractor.js) are two copies
 * that MUST agree on the load-bearing common cases, or the retrieval layer and the no-hallucinations
 * gate speak different languages. This runs a canonical fixture through both and fails on divergence.
 *
 * Runs only in the full repo (both files present). In the staged/standalone deployment the engine
 * file is unreachable, so the test skips rather than fails.
 * Run: `node --test test/citation-grammar.drift.test.mjs`
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { extractCitations: connectorExtract } = require("../src/citation-grammar.js");

// Relative to this test file: test → searxng-search-mcp → Claude → repo-root → engine package.
const ENGINE_PATH =
  "../../../Trevor Robey Intelligence Network Citations/openclaw-bridge/core/citation-extractor.js";

test("grammar drift guard: connector and engine agree on canonical ids", (t) => {
  let engineExtract;
  try {
    engineExtract = require(ENGINE_PATH).extractCitations;
  } catch {
    t.skip("engine citation-extractor.js not reachable (staged/standalone context) — drift check skipped");
    return;
  }

  // Canonical, unambiguous ids both grammars are expected to recognize identically.
  const CANON = "PMID: 30345906 NCT01909453 doi:10.1016/j.cell.2020.01.001 CHEMBL25 DB00945";
  const EXPECT = [
    "pmid:30345906",
    "nct:nct01909453",
    "doi:10.1016/j.cell.2020.01.001",
    "chembl:chembl25",
    "drugbank:db00945",
  ];

  const norm = (arr) => new Set(arr.map((c) => `${c.type}:${c.id}`.toLowerCase()));
  const connSet = norm(connectorExtract(CANON));
  const engSet = norm(engineExtract(CANON));

  for (const e of EXPECT) {
    assert.ok(connSet.has(e), `connector grammar dropped canonical ${e}`);
    assert.ok(engSet.has(e), `engine grammar dropped canonical ${e} — the two grammars have DRIFTED`);
  }
});
