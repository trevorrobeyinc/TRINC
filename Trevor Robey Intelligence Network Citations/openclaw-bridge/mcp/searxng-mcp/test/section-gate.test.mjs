/**
 * Integration tests for the section-level citation-coverage gate (Step 2 wiring).
 * Offline + deterministic: `searchFn` and `readFile` are STUBBED; the REAL `runCitationGate` adapter
 * is injected as `runGate` (so grading/clustering/coverage-tier logic is exercised end-to-end).
 * Run: `node --test openclaw-bridge/mcp/searxng-mcp/test/section-gate.test.mjs`
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { runCitationGate } = require("../index.js");
const { deriveSectionQuery, runSectionGate, assertCoverageOrThrow } = require("../section-gate.js");

/* -------- section fixtures: distinctive Capitalized terms drive both query derivation AND stub routing -------- */
const SEC1 = "Efficacy of CodeBreaK 100. CodeBreaK 100 demonstrated Objective Response Rate benefit in NSCLC.";
const SEC2 = "Unicornase Pathway speculation. The Unicornase Pathway remains unproven; Unicornase is hypothetical.";
const SEC3 = "Hepatotoxicity Signal. Hepatotoxicity was the main Adverse Event; Hepatotoxicity recurred.";

/** Stub connector: routes on the derived query. Sourced → 2 distinct primary sources; zero → none; infra → throw. */
async function routerSearch(query) {
  const q = String(query);
  if (/Unicornase/i.test(q)) return { results: [] }; // genuine zero-coverage
  if (/Hepatotoxicity/i.test(q)) throw new Error("SearXNG unreachable (127.0.0.1:8890)"); // infra
  return {
    results: [
      { title: "Trial A", url: "https://clinicaltrials.gov/study/NCT01111111", content: "", score: 1, engine: "crossref", citations: [] },
      { title: "Trial B", url: "https://clinicaltrials.gov/study/NCT02222222", content: "", score: 1, engine: "crossref", citations: [] },
    ],
  };
}

const files = { "/s/1.md": SEC1, "/s/2.md": SEC2, "/s/3.md": SEC3 };
const readFile = (p) => {
  if (!(p in files)) throw new Error("ENOENT");
  return files[p];
};
const subtasks = [
  { subtask_id: "sub-1", output_path: "/s/1.md" },
  { subtask_id: "sub-2", output_path: "/s/2.md" },
  { subtask_id: "sub-3", output_path: "/s/3.md" },
];

test("deriveSectionQuery: section-specific, distinct, deterministic, includes primary subject", () => {
  const args1 = { primarySubject: "sotorasib", sectionText: SEC1 };
  const q1 = deriveSectionQuery(args1);
  const q2 = deriveSectionQuery({ primarySubject: "sotorasib", sectionText: SEC2 });
  const q3 = deriveSectionQuery({ primarySubject: "sotorasib", sectionText: SEC3 });
  assert.ok(q1.toLowerCase().startsWith("sotorasib")); // includes the primary subject
  assert.notEqual(q1, q2);
  assert.notEqual(q2, q3);
  assert.notEqual(q1, q3); // MUST differ across sections (guards topic-level collapse)
  assert.equal(q1, deriveSectionQuery(args1)); // deterministic
  // empty text → falls back to the primary subject alone
  assert.equal(deriveSectionQuery({ primarySubject: "sotorasib", sectionText: "" }), "sotorasib");
});

test("deriveSectionQuery: keeps rare domain terms, drops trial-table boilerplate + citation IDs + scaffolding", () => {
  // A realistic structured-report section: status/table boilerplate, a literal NCT id, leaked prompt
  // scaffolding, and ONE rare multi-word domain term (the SGLT2 inhibitor).
  const noisy =
    "Status: COMPLETED. Phase III trial NCT02686749 (Sponsor: Novartis). Purpose: evaluate the " +
    "SGLT2 Inhibitor Empagliflozin. Primary Endpoint reached. This report prioritizes LIVE DATABASE " +
    "CONTEXT over TRAINING KNOWLEDGE.";
  const q = deriveSectionQuery({ primarySubject: "heart failure", sectionText: noisy });
  const lc = q.toLowerCase();

  // CONTAINS the rare domain term…
  assert.match(q, /Empagliflozin/i);
  // …and EXCLUDES the boilerplate, the citation ID, and the prompt scaffolding.
  for (const junk of ["completed", "nct02686749", "training", "knowledge", "purpose", "sponsor", "phase iii"]) {
    assert.ok(!lc.includes(junk), `query should not contain boilerplate/ID "${junk}": got "${q}"`);
  }
  assert.ok(lc.startsWith("heart failure")); // primary subject still leads
});

test("runSectionGate: sourced pass + tiers, genuine zero → failing, infra → UNCHECKED (not failing)", async () => {
  const coverage = await runSectionGate({
    subtasks,
    primarySubject: "sotorasib",
    searchFn: routerSearch,
    runGate: runCitationGate,
    readFile,
    maxResults: 8,
  });
  assert.equal(coverage.section_coverage.length, 3);
  const byId = Object.fromEntries(coverage.section_coverage.map((s) => [s.section_id, s]));

  // sub-1 sourced → pass, 2 distinct → Moderate
  assert.equal(byId["sub-1"].checked, true);
  assert.equal(byId["sub-1"].gate_status, "pass");
  assert.equal(byId["sub-1"].coverage_tier, "Moderate");
  assert.equal(byId["sub-1"].distinct_source_count, 2);

  // sub-2 genuine zero → fail
  assert.equal(byId["sub-2"].checked, true);
  assert.equal(byId["sub-2"].gate_status, "fail");

  // sub-3 infra → UNCHECKED, not failed
  assert.equal(byId["sub-3"].checked, false);
  assert.match(byId["sub-3"].skip_reason, /unreachable/i);

  // only the genuine zero-coverage section is failing
  assert.equal(coverage.failing.length, 1);
  assert.equal(coverage.failing[0].section_id, "sub-2");
});

test("assertCoverageOrThrow: fail-closed with PHASE30_CITATION_COVERAGE_ZERO on a failing section", async () => {
  const coverage = await runSectionGate({
    subtasks: [subtasks[1]], // only the zero-coverage section
    primarySubject: "sotorasib",
    searchFn: routerSearch,
    runGate: runCitationGate,
    readFile,
  });
  assert.equal(coverage.failing.length, 1);
  try {
    assertCoverageOrThrow(coverage);
    assert.fail("expected a throw");
  } catch (e) {
    assert.equal(e.code, "PHASE30_CITATION_COVERAGE_ZERO");
    assert.ok(e.coverage_report);
    assert.match(e.message, /zero distinct primary sources/);
  }
});

test("assertCoverageOrThrow: passes cleanly when every section has coverage or is unchecked", async () => {
  const coverage = await runSectionGate({
    subtasks: [subtasks[0], subtasks[2]], // sourced + infra-unchecked (no genuine zero)
    primarySubject: "sotorasib",
    searchFn: routerSearch,
    runGate: runCitationGate,
    readFile,
  });
  assert.equal(coverage.failing.length, 0);
  assert.doesNotThrow(() => assertCoverageOrThrow(coverage));
});
