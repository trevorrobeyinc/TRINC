/**
 * Regression tests: the connector's `source:"metadata"` provenance (a scholarly engine's structured
 * DOI field) must grade as RECORD-IDENTITY, same tier as `source:"url"` — not be demoted to a text
 * mention. Before the 2026-07-10 connector change, metadata DOIs did not exist; index.js coerced any
 * non-url provenance to "text", so a peer-reviewed structured DOI graded B instead of A.
 * Offline + deterministic. Run: node --test openclaw-bridge/mcp/searxng-mcp/test/grade-metadata.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { gradeResult, isRecordIdentity } = require("../grade.js");
const { runCitationGate } = require("../index.js");

test("isRecordIdentity: url and metadata are record-identity; text is not", () => {
  assert.equal(isRecordIdentity({ source: "url" }), true);
  assert.equal(isRecordIdentity({ source: "metadata" }), true);
  assert.equal(isRecordIdentity({ source: "text" }), false);
  assert.equal(isRecordIdentity(null), false);
});

test("gradeResult: a non-preprint metadata DOI grades A (peer-reviewed record-identity)", () => {
  const row = {
    citations: [{ type: "doi", id: "10.1001/jama.2023.13239", source: "metadata" }],
    primary_domain_match: false,
  };
  assert.equal(gradeResult(row), "A");
});

test("gradeResult: a preprint metadata DOI grades B, not A", () => {
  const row = {
    citations: [{ type: "doi", id: "10.1101/2024.01.15.575000", source: "metadata", subtype: "preprint" }],
    primary_domain_match: false,
  };
  assert.equal(gradeResult(row), "B");
});

test("gradeResult: text-only citation still grades B; nothing still grades C/D", () => {
  assert.equal(gradeResult({ citations: [{ type: "pmid", id: "1", source: "text" }], primary_domain_match: false }), "B");
  assert.equal(gradeResult({ citations: [], primary_domain_match: true }), "C");
  assert.equal(gradeResult({ citations: [], primary_domain_match: false }), "D");
});

test("runCitationGate: a metadata-DOI-only result survives normalization as grade A and is counted", async () => {
  const searchFn = async () => ({
    results: [
      {
        title: "Donanemab in Early Symptomatic Alzheimer Disease: TRAILBLAZER-ALZ 2",
        url: "https://www.ncbi.nlm.nih.gov/pubmed/37459141",
        content: "…",
        score: 15.9,
        engine: "semantic scholar",
        // pmid is url-derived (A on its own); the metadata DOI is the interesting part — it must be
        // preserved through normalization (not coerced to "text") and remain record-identity.
        citations: [
          { type: "pmid", id: "37459141", source: "url" },
          { type: "doi", id: "10.1001/jama.2023.13239", source: "metadata" },
        ],
      },
      {
        // A result whose ONLY id is a metadata DOI — the case that used to be demoted to B.
        title: "Posttreatment Amyloid Levels and Clinical Outcomes",
        url: "https://example.org/some-landing-page",
        content: "…",
        score: 9.6,
        engine: "crossref",
        citations: [{ type: "doi", id: "10.1001/jamaneurol.2025.3869", source: "metadata" }],
      },
    ],
  });

  const out = await runCitationGate(
    { query: "donanemab TRAILBLAZER outcomes", step_type: "breadth", section_id: "analyst", topic: "science" },
    { searchFn, reformulateFn: (q) => q }
  );

  assert.equal(out.gate_status, "pass");
  // The metadata-only result kept its provenance and graded A.
  const metaOnly = out.results.find((r) => r.url === "https://example.org/some-landing-page");
  assert.ok(metaOnly, "metadata-only result should be present, not dropped");
  assert.equal(metaOnly.grade, "A");
  assert.equal(metaOnly.citations[0].source, "metadata"); // NOT coerced to "text"
});
