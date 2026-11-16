/**
 * DIAGNOSTIC (read-only, NOT wired into any workflow) — live end-to-end sanity check of the
 * section-level citation-coverage gate against its REAL search back end. Since 2026-11-15 the
 * `science` topic the gate uses is Europe PMC + Crossref, queried directly
 * (openclaw-bridge/mcp/scholarly-search/); SearXNG is not involved. The file name is historical.
 *
 * It runs the section gate exactly as the engine's executeQualityAuditStep does — same
 * `deriveSectionQuery` (from section-gate.js), same `runCitationGate` input (the report's subject
 * as `search_params.primary_subject`), same infra/zero-coverage classification — but NEVER calls
 * assertCoverageOrThrow: a "fail" is DATA to inspect, not a throw. The per-section runGate call is
 * inlined (identical to runSectionGate's loop body in section-gate.js) ONLY so we can also surface
 * the graded results runSectionGate discards.
 *
 * Mutates nothing. Sequential (one section at a time), as the gate runs; the Crossref leg paces
 * itself to Crossref's public pool (one request per second).
 * Run: node scripts/diag/searxng-section-gate-e2e.mjs
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const ENGINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const MCP = path.join(ENGINE, "openclaw-bridge", "mcp", "searxng-mcp");
const { deriveSectionQuery } = require(path.join(MCP, "section-gate.js"));
const { runCitationGate } = require(path.join(MCP, "index.js"));
const { searchFn, getScholarlySearch } = require(path.join(MCP, "searchfn.js"));

const PRIMARY_SUBJECT = "heart failure"; // therapeutic_area from the real run (clinical-trial-landscape)
const MAX_RESULTS = 8; // engine default (step.max_results || 8)

// Real role-section outputs from mission-7ea38920… (clinical_trial_intelligence, heart failure).
const RO = path.join(ENGINE, "workspace", "research-output");
const SUBTASKS = [
  { subtask_id: "scout", output_path: path.join(RO, "task-bc1abb08879df16b8a01a737", "output.md") },
  { subtask_id: "analyst", output_path: path.join(RO, "task-a31c9cea7c06af352a857112", "output.md") },
  { subtask_id: "synthesizer", output_path: path.join(RO, "task-b781b4075c33b0a71f6cafca", "output.md") },
];

const line = (n = 78) => console.log("─".repeat(n));

// One scholarly search on the subject alone, through the same module the gate uses: shows whether
// each source answers before the sections run. It throws (and the diagnostic aborts) only when the
// search cannot run in full and finds nothing, which is when the gate would mark sections UNCHECKED.
async function confirmSearchUp() {
  const out = await getScholarlySearch().search({ query: PRIMARY_SUBJECT, primary_subject: PRIMARY_SUBJECT, max_results: 1 });
  console.log(`Scholarly search (${out.searched}) — Europe PMC: ${out.sources.europepmc}; Crossref: ${out.sources.crossref}; e.g. ${(out.results[0]?.url || "").slice(0, 60)}`);
}

function topResults(out, k = 3) {
  const rows = (out.results && out.results.length ? out.results : out.dropped) || [];
  const label = out.results && out.results.length ? "graded A/B/C" : "grade-D (dropped)";
  return { label, rows: rows.slice(0, k) };
}

async function main() {
  console.log("\n=== Section-gate LIVE e2e diagnostic, Europe PMC + Crossref (read-only) ===\n");
  await confirmSearchUp();
  console.log(`Primary subject: "${PRIMARY_SUBJECT}"  |  sections: ${SUBTASKS.length}  |  max_results: ${MAX_RESULTS}\n`);

  const report = [];
  const startAll = Date.now();

  for (const st of SUBTASKS) {
    const sectionText = fs.existsSync(st.output_path) ? fs.readFileSync(st.output_path, "utf8") : "";
    const query = deriveSectionQuery({ primarySubject: PRIMARY_SUBJECT, sectionText });

    const t0 = Date.now();
    let rec;
    try {
      const out = await runCitationGate(
        { query, step_type: "breadth", section_id: st.subtask_id, topic: "science", max_results: MAX_RESULTS, search_params: { primary_subject: PRIMARY_SUBJECT } },
        { searchFn }
      );
      const ms = Date.now() - t0;
      const { label, rows } = topResults(out);
      rec = {
        section_id: st.subtask_id, query, checked: true,
        gate_status: out.gate_status, gate_reason: out.gate_reason || null,
        coverage_tier: out.coverage_tier || null, distinct_source_count: out.distinct_source_count,
        retried: out.retried, reformulated_query: out.reformulated_query || null,
        source_errors: out.source_errors || [], unanswered_sources: out.unanswered_sources || [],
        ms, topLabel: label, top: rows, resultCount: (out.results || []).length, droppedCount: (out.dropped || []).length,
      };
    } catch (err) {
      const ms = Date.now() - t0;
      rec = { section_id: st.subtask_id, query, checked: false, skip_reason: String(err && err.message || err), ms };
    }
    report.push(rec);

    // ---- per-section print ----
    line();
    console.log(`SECTION: ${rec.section_id}   (${rec.ms} ms)`);
    console.log(`  query        : "${rec.query}"`);
    if (!rec.checked) {
      console.log(`  checked      : false (infra) — skip_reason: ${rec.skip_reason}`);
      continue;
    }
    console.log(`  checked      : true`);
    console.log(`  gate_status  : ${rec.gate_status}${rec.gate_reason ? " (" + rec.gate_reason + ")" : ""}`);
    console.log(`  coverage_tier: ${rec.coverage_tier}`);
    console.log(`  distinct_src : ${rec.distinct_source_count}   (results A/B/C=${rec.resultCount}, dropped D=${rec.droppedCount})`);
    console.log(`  retried      : ${rec.retried}${rec.reformulated_query ? `  → "${rec.reformulated_query}"` : ""}`);
    if (rec.source_errors.length) {
      console.log(`  source errors: ${rec.source_errors.join(" | ")}${rec.unanswered_sources.length ? `  (count without: ${rec.unanswered_sources.join(", ")})` : ""}`);
    }
    console.log(`  top 3 (${rec.topLabel}):`);
    if (!rec.top.length) console.log("     (none)");
    for (const r of rec.top) {
      console.log(`     [${r.grade}] ${(r.title || "").slice(0, 66)}`);
      console.log(`         ${r.url}`);
    }
  }

  const totalMs = Date.now() - startAll;

  // ---- summary / the four questions ----
  line();
  console.log("\n=== SUMMARY — the four questions ===\n");

  const queries = report.map((r) => r.query);
  const norm = queries.map((q) => q.toLowerCase().trim());
  const dupes = norm.filter((q, i) => norm.indexOf(q) !== i);
  console.log("1) DISTINCTNESS:");
  console.log(`   ${new Set(norm).size}/${queries.length} distinct queries.`);
  report.forEach((r) => console.log(`     - ${r.section_id}: "${r.query}"`));
  if (dupes.length) console.log(`   ⚠ COLLISION(S): ${[...new Set(dupes)].map((q) => `"${q}"`).join(", ")}`);
  else console.log("   ✓ no collisions — queries are section-specific (did NOT collapse to the bare subject).");

  const checked = report.filter((r) => r.checked);
  const failed = checked.filter((r) => r.gate_status === "fail");
  const unchecked = report.filter((r) => !r.checked);
  console.log("\n2) NO FALSE-FAIL (known-good subject — every section SHOULD find >=1 primary source):");
  console.log(`   checked ${checked.length}, unchecked(infra) ${unchecked.length}, FAILED(zero-coverage) ${failed.length}`);
  if (failed.length === 0) console.log("   ✓ every checked section retrieved >=1 distinct primary source — no false-fail.");
  for (const f of failed) {
    console.log(`   ✗ FAIL: ${f.section_id}  query="${f.query}"  (inspect below whether query is noisy or gap is real)`);
    console.log(`     dropped D top: ${(f.top || []).map((r) => r.url).join(" | ") || "(nothing retrieved)"}`);
  }

  console.log("\n3) TIER SANITY (is the gate discriminating, or everything flattened to one tier?):");
  const tiers = checked.map((r) => `${r.section_id}=${r.coverage_tier}(${r.distinct_source_count})`);
  console.log(`   ${tiers.join(", ")}`);
  const uniqTiers = new Set(checked.map((r) => r.coverage_tier));
  console.log(`   ${uniqTiers.size === 1 ? "⚠ all one tier — check discrimination" : "✓ multiple tiers observed"}`);

  console.log("\n4) LATENCY (real sequential search cost):");
  report.forEach((r) => console.log(`   ${r.section_id}: ${r.ms} ms`));
  console.log(`   TOTAL: ${totalMs} ms (${(totalMs / 1000).toFixed(1)} s) across ${report.length} sections`);
  console.log("");
}

main().catch((e) => {
  console.error("\nDIAGNOSTIC ABORTED:", e && e.message || e);
  console.error("The scholarly search could not run in full and found nothing: check this Mac's network to www.ebi.ac.uk and api.crossref.org. The gate marks sections UNCHECKED in that state; it does not fail them.");
  process.exit(1);
});
