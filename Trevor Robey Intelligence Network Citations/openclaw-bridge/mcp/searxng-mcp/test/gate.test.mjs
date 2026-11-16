/**
 * Acceptance tests T1–T9 for the SearXNG citation gate (spec §4).
 * Behavioral + offline: the connector `searchFn` and `reformulateFn` are STUBBED — no live SearXNG,
 * fully deterministic. Run: `node --test openclaw-bridge/mcp/searxng-mcp/test/gate.test.mjs`
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { runCitationGate } = require("../index.js");

/* -------- stubs -------- */

/** Connector stub: returns queued responses per call; an Error entry throws on that call. */
function makeSearch(responses) {
  let idx = 0;
  const fn = async () => {
    const r = responses[idx];
    idx += 1;
    fn.calls = idx;
    if (r instanceof Error) throw r;
    return r || { results: [] };
  };
  fn.calls = 0;
  return fn;
}

/** Reformulator stub: counts invocations. */
function makeReformulate(newQuery) {
  const fn = (q) => {
    fn.count += 1;
    return newQuery !== undefined ? newQuery : q + " broadened";
  };
  fn.count = 0;
  return fn;
}

/* -------- row fixtures (raw connector shape) -------- */

const A = (url, pmid) => ({ title: "t", url, content: "c", score: 1, engine: "pubmed", citations: [{ type: "pmid", id: pmid, source: "url" }] });
const B = (url, doi) => ({ title: "t", url, content: "c", score: 1, engine: "semantic scholar", citations: [{ type: "doi", id: doi, source: "text" }] });
const C = (url) => ({ title: "t", url, content: "c", score: 1, engine: "crossref", citations: [] });
const D = (url) => ({ title: "t", url, content: "c", score: 1, engine: "brave", citations: [] });

const input = (over) => ({ query: "sotorasib KRAS G12C", step_type: "breadth", section_id: "s1", ...over });

/* -------- T1–T9 -------- */

test("T1  breadth, zero citable → FAIL/no_results, retried", async () => {
  const searchFn = makeSearch([{ results: [] }, { results: [] }]);
  const reformulateFn = makeReformulate();
  const out = await runCitationGate(input({ step_type: "breadth" }), { searchFn, reformulateFn });
  assert.equal(out.gate_status, "fail");
  assert.equal(out.gate_reason, "no_results");
  assert.equal(out.coverage_tier, null);
  assert.equal(out.distinct_source_count, 0);
  assert.equal(out.retried, true);
  assert.equal(reformulateFn.count, 1);
});

test("T1b raw exists but all grade D; reformulation finds nothing → FAIL/no_citable_sources", async () => {
  const searchFn = makeSearch([{ results: [D("https://blog.example/1")] }, { results: [D("https://blog.example/2")] }]);
  const reformulateFn = makeReformulate();
  const out = await runCitationGate(input({ step_type: "breadth" }), { searchFn, reformulateFn });
  assert.equal(out.gate_status, "fail");
  assert.equal(out.gate_reason, "no_citable_sources");
  assert.equal(out.distinct_source_count, 0);
  assert.equal(out.retried, true);
  assert.equal(out.dropped.length, 2);
});

test("T2  breadth, 2 failed trials (grade C) → MODERATE, no fail, no retry", async () => {
  const searchFn = makeSearch([{ results: [C("https://clinicaltrials.gov/study/NCT01"), C("https://accessdata.fda.gov/label/1")] }]);
  const reformulateFn = makeReformulate();
  const out = await runCitationGate(input({ step_type: "breadth" }), { searchFn, reformulateFn });
  assert.equal(out.gate_status, "pass");
  assert.equal(out.coverage_tier, "Moderate");
  assert.equal(out.distinct_source_count, 2);
  assert.equal(out.results.length, 2);
  assert.equal(out.dropped.length, 0);
  assert.equal(out.retried, false);
  assert.equal(reformulateFn.count, 0);
});

test("T3  thin breadth → EXACTLY ONE reformulation, merged 3 → Comprehensive", async () => {
  const searchFn = makeSearch([
    { results: [A("https://pubmed.ncbi.nlm.nih.gov/1/", "1")] },
    { results: [A("https://pubmed.ncbi.nlm.nih.gov/2/", "2"), A("https://pubmed.ncbi.nlm.nih.gov/3/", "3")] },
  ]);
  const reformulateFn = makeReformulate("broader q");
  const out = await runCitationGate(input({ step_type: "breadth" }), { searchFn, reformulateFn });
  assert.equal(reformulateFn.count, 1);
  assert.equal(out.distinct_source_count, 3);
  assert.equal(out.coverage_tier, "Comprehensive");
  assert.equal(out.retried, true);
  assert.equal(out.reformulated_query, "broader q");
});

test("T4  thin depth → NO retry", async () => {
  const searchFn = makeSearch([{ results: [A("https://pubmed.ncbi.nlm.nih.gov/1/", "1")] }]);
  const reformulateFn = makeReformulate();
  const out = await runCitationGate(input({ step_type: "depth" }), { searchFn, reformulateFn });
  assert.equal(reformulateFn.count, 0);
  assert.equal(out.gate_status, "pass");
  assert.equal(out.coverage_tier, "Sparse");
  assert.equal(out.retried, false);
});

test("T5  every surviving result bundles source + grade; D dropped", async () => {
  const rows = [
    A("https://pubmed.ncbi.nlm.nih.gov/1/", "1"),
    B("https://jour.example/x", "10.1/x"),
    C("https://clinicaltrials.gov/study/NCT9"),
    D("https://blog.example/z"),
  ];
  const searchFn = makeSearch([{ results: rows }]);
  const out = await runCitationGate(input({ step_type: "depth" }), { searchFn, reformulateFn: makeReformulate() });
  assert.ok(out.results.every((r) => ["A", "B", "C"].includes(r.grade)));
  assert.ok(out.results.every((r) => r.citations.every((c) => ["url", "text"].includes(c.source))));
  assert.ok(!out.results.some((r) => r.grade === "D"));
  assert.ok(out.dropped.every((r) => r.grade === "D"));
  assert.equal(out.dropped.length, 1);
  assert.notEqual(out.coverage_tier, null);
});

test("T6  distinct counting dedups multi-hits from one source → 1 (Sparse)", async () => {
  const u = "https://clinicaltrials.gov/study/NCT04280705";
  const searchFn = makeSearch([{ results: [C(u), C(u), C(u), C(u), C(u)] }]);
  const out = await runCitationGate(input({ step_type: "depth" }), { searchFn, reformulateFn: makeReformulate() });
  assert.equal(out.distinct_source_count, 1);
  assert.equal(out.coverage_tier, "Sparse");
  assert.equal(out.results.length, 5);
  assert.equal(new Set(out.results.map((r) => r.dedup_cluster_id)).size, 1);
});

test("T7  G4 no-over-merge: paper + review citing same PMID in text → 2 distinct", async () => {
  const paper = A("https://pubmed.ncbi.nlm.nih.gov/30345906/", "30345906"); // pmid source:url → A
  const review = {
    title: "review", url: "https://review.example/x", content: "cites PMID 30345906",
    score: 1, engine: "semantic scholar", citations: [{ type: "pmid", id: "30345906", source: "text" }],
  };
  const searchFn = makeSearch([{ results: [paper, review] }]);
  const out = await runCitationGate(input({ step_type: "breadth" }), { searchFn, reformulateFn: makeReformulate() });
  assert.equal(out.distinct_source_count, 2);
  assert.equal(out.coverage_tier, "Moderate");
});

test("T8  grade boundaries A/B/C/D", async () => {
  const rows = [
    A("https://pubmed.ncbi.nlm.nih.gov/111/", "111"), // url pmid → A
    B("https://journal.example/a", "10.1/a"),          // text doi, non-allowlist → B
    C("https://clinicaltrials.gov/study/NCT2"),        // no cite, allowlist → C
    D("https://some-blog.example/post"),               // no cite, non-allowlist → D
  ];
  const searchFn = makeSearch([{ results: rows }]);
  const out = await runCitationGate(input({ step_type: "depth" }), { searchFn, reformulateFn: makeReformulate() });
  const grade = {};
  for (const r of out.results.concat(out.dropped)) grade[r.url] = r.grade;
  assert.equal(grade["https://pubmed.ncbi.nlm.nih.gov/111/"], "A");
  assert.equal(grade["https://journal.example/a"], "B");
  assert.equal(grade["https://clinicaltrials.gov/study/NCT2"], "C");
  assert.equal(grade["https://some-blog.example/post"], "D");
});

test("preprint grading: a url-derived arXiv / preprint-DOI id → B (not A, not D); peer-reviewed url id stays A", async () => {
  const PRE = (url, id) => ({ title: "t", url, content: "c", score: 1, engine: "arxiv", citations: [{ type: "arxiv", id, source: "url" }] });
  const PREDOI = (url, doi) => ({ title: "t", url, content: "c", score: 1, engine: "openalex", citations: [{ type: "doi", id: doi, source: "url", subtype: "preprint" }] });
  const rows = [
    PRE("https://arxiv.org/abs/2401.00001", "2401.00001"),          // url arXiv (preprint) → B
    PREDOI("https://www.biorxiv.org/x", "10.1101/2024.01.01.123"),  // url bioRxiv DOI (preprint) → B
    A("https://pubmed.ncbi.nlm.nih.gov/222/", "222"),               // url PMID (peer-reviewed) → A (unchanged)
  ];
  const searchFn = makeSearch([{ results: rows }]);
  const out = await runCitationGate(input({ step_type: "depth" }), { searchFn, reformulateFn: makeReformulate() });
  const grade = {};
  for (const r of out.results.concat(out.dropped)) grade[r.url] = r.grade;
  assert.equal(grade["https://arxiv.org/abs/2401.00001"], "B");
  assert.equal(grade["https://www.biorxiv.org/x"], "B");
  assert.equal(grade["https://pubmed.ncbi.nlm.nih.gov/222/"], "A");
  // all three are still real, counted sources (none dropped to D)
  assert.equal(out.dropped.length, 0);
  assert.equal(out.distinct_source_count, 3);
});

test("T9  reformulation is fail-soft (retry search throws) → keep pass-1, no throw", async () => {
  const searchFn = makeSearch([
    { results: [A("https://pubmed.ncbi.nlm.nih.gov/1/", "1")] },
    new Error("reformulated search failed"),
  ]);
  const reformulateFn = makeReformulate("broader");
  const out = await runCitationGate(input({ step_type: "breadth" }), { searchFn, reformulateFn });
  assert.equal(out.distinct_source_count, 1);
  assert.equal(out.coverage_tier, "Sparse");
  assert.equal(out.retried, true);
  assert.equal(reformulateFn.count, 1);
  assert.equal(out.gate_status, "pass");
  assert.deepEqual(out.source_errors, ["retry: reformulated search failed"], "the failed retry is recorded");
});

/* -------- S1 review (2026-11-15): the retry flag and per-source status -------- */

test("the retry pass carries breadth_retry; a source down on pass 1 that answers on the retry is not unanswered", async () => {
  const seen = [];
  const searchFn = async (q, params) => {
    seen.push(params);
    if (seen.length === 1) {
      return { results: [A("https://pubmed.ncbi.nlm.nih.gov/1/", "1")], sources: { a: "ok", b: "HTTP 503" }, searched: "A and B" };
    }
    return { results: [], sources: { a: "ok", b: "ok" } };
  };
  const out = await runCitationGate(input({ step_type: "breadth", search_params: { primary_subject: "kras" } }), { searchFn, reformulateFn: makeReformulate() });
  assert.equal(seen[0].breadth_retry, undefined);
  assert.equal(seen[0].primary_subject, "kras");
  assert.equal(seen[1].breadth_retry, true);
  assert.equal(seen[1].primary_subject, "kras");
  assert.deepEqual(out.source_errors, ["b: HTTP 503"]);
  assert.deepEqual(out.unanswered_sources, []);
  assert.equal(out.searched, "A and B");
});

test("a source down on both passes, or with the retry throwing, stays unanswered; a SearXNG-shaped answer reports none", async () => {
  const both = makeSearch([
    { results: [A("https://pubmed.ncbi.nlm.nih.gov/1/", "1")], sources: { a: "ok", b: "timed out after 15000 ms" } },
    { results: [], sources: { a: "ok", b: "HTTP 429" } },
  ]);
  const out = await runCitationGate(input({ step_type: "breadth" }), { searchFn: both, reformulateFn: makeReformulate() });
  assert.deepEqual(out.source_errors, ["b: timed out after 15000 ms", "retry b: HTTP 429"]);
  assert.deepEqual(out.unanswered_sources, ["b"]);
  const thrown = makeSearch([
    { results: [A("https://pubmed.ncbi.nlm.nih.gov/1/", "1")], sources: { a: "ok", b: "HTTP 503" } },
    new Error("boom"),
  ]);
  const out2 = await runCitationGate(input({ step_type: "breadth" }), { searchFn: thrown, reformulateFn: makeReformulate() });
  assert.deepEqual(out2.source_errors, ["b: HTTP 503", "retry: boom"]);
  assert.deepEqual(out2.unanswered_sources, ["b"]);
  const plain = makeSearch([{ results: [A("https://pubmed.ncbi.nlm.nih.gov/1/", "1"), A("https://pubmed.ncbi.nlm.nih.gov/2/", "2")] }]);
  const out3 = await runCitationGate(input({ step_type: "breadth" }), { searchFn: plain, reformulateFn: makeReformulate() });
  assert.deepEqual(out3.source_errors, []);
  assert.deepEqual(out3.unanswered_sources, []);
  assert.equal(out3.searched, null);
});
