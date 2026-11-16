"use strict";

/**
 * SearXNG citation gate — engine-side adapter (spec §1–§3). FAIL-CLOSED ONLY AT ZERO.
 *
 * Consumes the `searxng-search` connector's ALREADY-CITED output (`results[].citations[]` with
 * `source:"url"|"metadata"|"text"`) and adds: grade (A/B/C/D) → dedup + distinct-count → coverage tier →
 * gate decision → one breadth reformulation retry. It does NOT re-extract citations and does NOT
 * require() the connector's grammar — consuming the connector's output keeps a single source of
 * citation truth and sidesteps cross-volume/require drift.
 *
 * Pure & deterministic — no wall-clock or RNG globals (those are forbidden under openclaw-bridge/;
 * see the engine CLAUDE.md "Restricted globals"). Cluster ids come from canonical keys, not entropy.
 *
 * The connector call (`searchFn`) and the reformulator (`reformulateFn`) are INJECTED so the gate is
 * offline/deterministic under test. The real `searchFn` wiring (require-vs-spawn of the connector's
 * `search()`) is a Step-2 decision — until then callers must inject it.
 *
 * @module searxng-mcp
 */

const { z } = require("zod");
const CONFIG = require("./gate.config.js");
const { canonicalUrl, hostOf, clusterResults } = require("./cluster.js");
const { primaryDomainMatch, gradeResult, coverageTier } = require("./grade.js");
const { reformulateQuery } = require("./reformulate.js");

/* -------------------------------- §1 schemas (zod) -------------------------------- */

const GateInput = z.object({
  query: z.string(),
  step_type: z.enum(["breadth", "depth"]),
  section_id: z.string(),
  topic: z.string().default("science"),
  max_results: z.number().int().default(10),
  min_distinct_sources: z.number().int().default(1),
  search_params: z.record(z.string(), z.any()).optional(),
});

const Citation = z.object({
  type: z.string(),
  id: z.string(),
  source: z.enum(["url", "metadata", "text"]),
  subtype: z.string().optional(),
});

const GradedResult = z.object({
  title: z.string(),
  url: z.string(),
  content: z.string(),
  score: z.number(),
  engine: z.string(),
  citations: z.array(Citation),
  grade: z.enum(["A", "B", "C", "D"]),
  source_locator: z.string(),
  primary_domain_match: z.boolean(),
  dedup_cluster_id: z.string(),
});

const GateOutput = z.object({
  gate_status: z.enum(["pass", "fail"]),
  gate_reason: z.enum(["no_results", "no_citable_sources"]).nullable(),
  coverage_tier: z.enum(["Sparse", "Moderate", "Comprehensive"]).nullable(),
  distinct_source_count: z.number().int(),
  retried: z.boolean(),
  reformulated_query: z.string().nullable(),
  section_id: z.string(),
  results: z.array(GradedResult),
  dropped: z.array(GradedResult),
  // S1 review (2026-11-15): a partial search is visible. Each entry is "<source>: <reason>" for a source
  // the back end reported as not answering, "retry <source>: <reason>" for one on the breadth retry, and
  // "retry: <reason>" when the retry itself threw (pass 1 is kept). Empty when every source answered.
  source_errors: z.array(z.string()),
  // The sources that answered on NO pass, so the count came without them (the ledger marks the section).
  unanswered_sources: z.array(z.string()),
  // What the back end says it searched (the scholarly search: "Europe PMC and Crossref"), or null.
  searched: z.string().nullable(),
});

/* -------------------------------- helpers -------------------------------- */

/** Normalize a raw connector row into a graded row (Tavily fields preserved, gate fields added). */
function normalizeAndGrade(raw, config) {
  const url = raw && raw.url ? String(raw.url) : "";
  const citations = (Array.isArray(raw && raw.citations) ? raw.citations : [])
    .filter(Boolean)
    .map((c) => {
      const out = {
        type: String(c.type),
        id: String(c.id),
        // Preserve the connector's three provenances (url/metadata = record-identity, text = mention);
        // any unrecognized value defaults to the weaker "text" claim. Was url-or-else-text, which
        // silently demoted a scholarly engine's structured-DOI ("metadata") to a snippet mention.
        source: c.source === "url" || c.source === "metadata" ? c.source : "text",
      };
      if (c.subtype) out.subtype = String(c.subtype);
      return out;
    });
  const row = {
    title: raw && raw.title ? String(raw.title) : "",
    url,
    content: raw && raw.content ? String(raw.content) : "",
    score: typeof (raw && raw.score) === "number" ? raw.score : 0,
    engine: raw && raw.engine ? String(raw.engine) : "",
    citations,
    source_locator: canonicalUrl(url),
    primary_domain_match: primaryDomainMatch(hostOf(url), config.primary_source_domains),
  };
  row.grade = gradeResult(row);
  return row;
}

/**
 * One connector call → { rawCount, graded[], sourceErrors[], failedSources[], answeredSources[], searched }.
 * A back end MAY report per-source status as `sources: { <name>: "ok" | <reason> }` (the scholarly
 * search does) and what it searched as `searched`; the SearXNG connector reports neither.
 */
async function runSearch(searchFn, query, topic, input, config, extraParams = {}) {
  const res = await searchFn(query, {
    topic,
    max_results: input.max_results,
    ...(input.search_params || {}),
    ...extraParams,
  });
  const rows = Array.isArray(res && res.results) ? res.results : [];
  const sources = Object.entries(res && res.sources && typeof res.sources === "object" ? res.sources : {});
  const failed = sources.filter(([, status]) => status !== "ok");
  return {
    rawCount: rows.length,
    graded: rows.map((r) => normalizeAndGrade(r, config)),
    sourceErrors: failed.map(([name, status]) => `${name}: ${String(status)}`),
    failedSources: failed.map(([name]) => name),
    answeredSources: sources.filter(([, status]) => status === "ok").map(([name]) => name),
    searched: res && typeof res.searched === "string" && res.searched ? res.searched : null,
  };
}

/**
 * Cluster all graded rows (spec §2), stamp each with its `dedup_cluster_id`, and split into
 * surviving A/B/C `results` vs grade-D `dropped`. `count` = clusters with ≥1 A/B/C member;
 * `hasAB` = any such cluster has an A/B member.
 */
function partitionAndCluster(graded) {
  const clusters = clusterResults(graded);
  for (const cl of clusters) {
    for (const m of cl.members) m.dedup_cluster_id = cl.id;
  }
  const abcClusters = clusters.filter((cl) => cl.members.some((m) => m.grade !== "D"));
  const hasAB = abcClusters.some((cl) => cl.members.some((m) => m.grade === "A" || m.grade === "B"));
  return {
    results: graded.filter((r) => r.grade !== "D"),
    dropped: graded.filter((r) => r.grade === "D"),
    count: abcClusters.length,
    hasAB,
  };
}

/* -------------------------------- gate -------------------------------- */

/**
 * Run the citation gate over one connector search (spec §1–§3).
 *
 * @param {object} rawInput            validated against GateInput
 * @param {object} deps
 * @param {(query:string, params:object)=>Promise<{results:object[]}>} deps.searchFn  REQUIRED (injected/stubbed)
 * @param {(query:string)=>string} [deps.reformulateFn]  defaults to the v1 heuristic
 * @param {object} [deps.config]       defaults to gate.config.js
 * @returns {Promise<object>} GateOutput
 */
async function runCitationGate(rawInput, deps = {}) {
  const input = GateInput.parse(rawInput);
  const config = deps.config || CONFIG;
  const searchFn = deps.searchFn;
  if (typeof searchFn !== "function") {
    throw new Error(
      "runCitationGate: a `searchFn` dependency is required " +
        "(injected at Step-2 connector wiring; stubbed in tests)."
    );
  }
  const reformulateFn = deps.reformulateFn || reformulateQuery;

  const topic = input.topic || config.topic_default;
  const minDistinct = input.min_distinct_sources; // v1 = 1 → gate is fail-only-at-zero

  // Pass 1
  const pass1 = await runSearch(searchFn, input.query, topic, input, config);
  let rawCount = pass1.rawCount;
  let graded = pass1.graded;
  let part = partitionAndCluster(graded);
  const source_errors = [...pass1.sourceErrors];
  let unanswered = [...pass1.failedSources];

  // Breadth reformulation retry — exactly one, only when THIN, and fail-soft.
  let retried = false;
  let reformulated_query = null;
  const retriesAllowed = input.step_type === "breadth" ? config.breadth_retries : config.depth_retries;
  if (retriesAllowed > 0 && part.count < config.thin_threshold) {
    retried = true; // an attempt is made even if it errors or adds nothing (spec T1/T9)
    try {
      const newQuery = reformulateFn(input.query);
      reformulated_query = newQuery;
      // `breadth_retry` tells a back end whose query cannot be broadened by dropping a word (the
      // scholarly search ORs its key terms) to broaden its own way; searchfn.js strips it for SearXNG.
      const pass2 = await runSearch(searchFn, newQuery, topic, input, config, { breadth_retry: true });
      rawCount += pass2.rawCount;
      graded = graded.concat(pass2.graded);
      part = partitionAndCluster(graded); // merge + re-cluster + re-count
      for (const e of pass2.sourceErrors) source_errors.push(`retry ${e}`);
      // A source down on pass 1 that answered on the retry did contribute to the count.
      unanswered = unanswered.filter((name) => !pass2.answeredSources.includes(name));
    } catch (err) {
      /* fail-soft: keep pass-1 results; retried stays true */
      source_errors.push(`retry: ${String((err && err.message) || err)}`);
    }
  }

  // Gate decision
  const pass = part.count >= minDistinct;
  const output = {
    gate_status: pass ? "pass" : "fail",
    gate_reason: pass ? null : rawCount === 0 ? "no_results" : "no_citable_sources",
    coverage_tier: pass ? coverageTier(part.count, part.hasAB) : null,
    distinct_source_count: part.count,
    retried,
    reformulated_query,
    section_id: input.section_id,
    results: part.results,
    dropped: part.dropped,
    source_errors,
    unanswered_sources: unanswered,
    searched: pass1.searched,
  };
  return GateOutput.parse(output);
}

module.exports = { runCitationGate, GateInput, GateOutput, GradedResult, CONFIG };
