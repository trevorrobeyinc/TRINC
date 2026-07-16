/**
 * DIAGNOSTIC (read-only, NOT wired into any workflow) — live end-to-end sanity check of the
 * section-level citation-coverage gate against the REAL SearXNG at 127.0.0.1 (port 8890).
 *
 * It runs the section gate exactly as the engine's executeQualityAuditStep does — same
 * `deriveSectionQuery` (from section-gate.js), same `runCitationGate` invocation, same
 * infra/zero-coverage classification — but NEVER calls assertCoverageOrThrow: a "fail" is DATA to
 * inspect, not a throw. The per-section runGate call is inlined (identical to runSectionGate's loop
 * body in section-gate.js) ONLY so we can also surface the graded results runSectionGate discards.
 *
 * Mutates nothing. Sequential (one section at a time) to respect the connector's real throttling.
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
const { searchFn } = require(path.join(MCP, "searchfn.js"));

// Liveness ping of the raw SearXNG process (plaintext upstream still listens on port 8890).
// The section gate itself reaches SearXNG through the connector, which as of 2026-07-06 uses
// the HTTPS TLS proxy at https://127.0.0.1:8891 (see Claude/searxng-search-mcp/src/config.js).
// The raw-upstream probe below is PERMANENT by design (not migration debt, no deadline): it
// deliberately isolates upstream-process liveness from the proxy/connector layer; routing it
// via :8891 would test a different thing and require mkcert CA trust in this diagnostic.
const SEARXNG = "http://127.0.0.1:8890"; // lint-transport: outbound-carve-out
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

async function confirmSearxngUp() {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(`${SEARXNG}/search?q=heart+failure&format=json&categories=science`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const n = Array.isArray(data.results) ? data.results.length : 0;
    console.log(`SearXNG UP @ ${SEARXNG} — probe returned ${n} results (e.g. ${(data.results?.[0]?.url || "").slice(0, 60)})`);
    if (n === 0) throw new Error("probe returned 0 results");
  } finally {
    clearTimeout(t);
  }
}

function topResults(out, k = 3) {
  const rows = (out.results && out.results.length ? out.results : out.dropped) || [];
  const label = out.results && out.results.length ? "graded A/B/C" : "grade-D (dropped)";
  return { label, rows: rows.slice(0, k) };
}

async function main() {
  console.log("\n=== SearXNG section-gate LIVE e2e diagnostic (read-only) ===\n");
  await confirmSearxngUp();
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
        { query, step_type: "breadth", section_id: st.subtask_id, topic: "science", max_results: MAX_RESULTS },
        { searchFn }
      );
      const ms = Date.now() - t0;
      const { label, rows } = topResults(out);
      rec = {
        section_id: st.subtask_id, query, checked: true,
        gate_status: out.gate_status, gate_reason: out.gate_reason || null,
        coverage_tier: out.coverage_tier || null, distinct_source_count: out.distinct_source_count,
        retried: out.retried, reformulated_query: out.reformulated_query || null,
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
  console.error("If SearXNG is down, start it: launchctl kickstart -k gui/$(id -u)/com.trevorrobey.searxng");
  process.exit(1);
});
