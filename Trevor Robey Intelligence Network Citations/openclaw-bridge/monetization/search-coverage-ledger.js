"use strict";

// search-coverage-ledger.js — Slice 5 (Q5): the deterministic Search-Coverage Ledger.
//
// The honest-zero deliverable. Rendered with NO language model, directly from the runtime search
// log (per-source / per-query outcomes captured by tool-prefetch and persisted into each task's
// metadata sidecar), so a "0 records" row here means the source genuinely returned nothing at
// query time — not that we failed to look, and never a model guess.
//
// Under the never-hallucinate doctrine (operator ruling 2026-07-10 — "be completely honest about
// whether there were any hits in the database"), absence of evidence is itself a reportable
// finding. This ledger is what makes an INSUFFICIENT_EVIDENCE run shippable as a truthful
// "we searched X, Y, Z and here is exactly what came back (including the zeros)" artifact,
// instead of the run merely erroring. It mirrors graveyard-memo.js: the fetched data IS the
// artifact, so every row is verifiable against a real runtime search outcome.

const fs = require("node:fs");

const STATUS = Object.freeze({
  RETURNED: "returned", // call succeeded and returned >= 1 record
  EMPTY: "empty",       // call succeeded but returned 0 records (the honest-negative)
  FAILED: "failed",     // call threw / timed out (transport failure, NOT evidence of absence)
  SKIPPED: "skipped"    // not dispatched (e.g. no queryable argument) — not a real search
});

// Union of per-call coverage records across every subtask's metadata sidecar. Mirrors
// citation-gate.collectFetchedIds; fail-soft — an unreadable/absent sidecar contributes nothing.
function collectSearchCoverage(subtaskResults, readFile = fs.readFileSync) {
  const records = [];
  for (const st of Array.isArray(subtaskResults) ? subtaskResults : []) {
    if (!st || !st.metadata_path) continue;
    try {
      const meta = JSON.parse(readFile(st.metadata_path, "utf8"));
      const list = Array.isArray(meta.search_coverage) ? meta.search_coverage : [];
      for (const r of list) {
        if (r && typeof r === "object") records.push(r);
      }
    } catch { /* fail-soft */ }
  }
  return records;
}

function normStatus(s) {
  const v = String(s == null ? "" : s).toLowerCase();
  if (v === STATUS.RETURNED || v === STATUS.EMPTY || v === STATUS.FAILED || v === STATUS.SKIPPED) return v;
  // Unknown/malformed status is treated conservatively as a zero-result — NEVER invented as a hit.
  return STATUS.EMPTY;
}

function summarizeCoverage(records) {
  const rows = (Array.isArray(records) ? records : []).filter((r) => r && typeof r === "object");
  const bySource = new Map();
  let searches = 0, zero_result = 0, failed = 0, records_total = 0, skipped = 0;
  const zeroList = [];
  const failedList = [];
  for (const r of rows) {
    const status = normStatus(r.status);
    const source = String(r.source || r.tool_name || "unknown source").trim() || "unknown source";
    const query = String(r.query == null ? "" : r.query).trim();
    const count = Number.isFinite(Number(r.records)) ? Math.max(0, Math.trunc(Number(r.records))) : 0;
    if (status === STATUS.SKIPPED) { skipped++; continue; } // configuration no-op, not a network search
    searches++;
    records_total += count;
    if (!bySource.has(source)) bySource.set(source, { source, searches: 0, records: 0, zero: 0, failed: 0 });
    const b = bySource.get(source);
    b.searches++;
    b.records += count;
    if (status === STATUS.FAILED) {
      failed++; b.failed++; failedList.push({ source, query });
    } else if (status === STATUS.EMPTY || count === 0) {
      zero_result++; b.zero++; zeroList.push({ source, query });
    }
  }
  const sources = [...bySource.values()].sort((a, b) => a.source.localeCompare(b.source));
  return {
    searches,
    sources_count: sources.length,
    records_total,
    zero_result,
    failed,
    skipped,
    by_source: sources,
    zero_result_searches: zeroList,
    failed_searches: failedList
  };
}

function buildSearchCoverageLedger(records, opts = {}) {
  const summary = summarizeCoverage(records);
  const topic = String(opts.topic || opts.indication || "this report").trim() || "this report";
  // No real searches were recorded → do not fabricate coverage; emit nothing so the packager
  // skips the deliverable (mirrors graveyard-memo's empty-markdown guard).
  if (summary.searches === 0) {
    return { markdown: "", summary };
  }
  const lines = [
    "# Search-Coverage Ledger",
    "",
    `Deterministic record of every biomedical database queried at runtime for **${topic}** and exactly what each returned — including the searches that returned nothing. Rendered with no language model, directly from the runtime search log, so a **0** here means the source genuinely returned no records at query time, not that we failed to look.`,
    "",
    `**Coverage:** ${summary.searches} search(es) across ${summary.sources_count} source(s) · ${summary.records_total} record(s) retrieved · ${summary.zero_result} returned zero${summary.failed ? ` · ${summary.failed} failed (source unreachable)` : ""}.`,
    "",
    "## Per-source",
    "",
    "| Source | Searches | Records | Zero-result | Failed |",
    "|---|---:|---:|---:|---:|"
  ];
  for (const b of summary.by_source) {
    lines.push(`| ${b.source} | ${b.searches} | ${b.records} | ${b.zero} | ${b.failed} |`);
  }
  lines.push("");
  if (summary.zero_result_searches.length > 0) {
    lines.push(
      "## Zero-result searches (honest-negative record)",
      "",
      "These queries ran against live sources and returned no records. Under the zero-fabrication doctrine, absence of evidence is reported here rather than papered over — a finding is never manufactured to fill one of these gaps.",
      ""
    );
    for (const z of summary.zero_result_searches) {
      lines.push(`- **${z.source}** — ${z.query ? "`" + z.query + "`" : "_(query not recorded)_"} — 0 records`);
    }
    lines.push("");
  }
  if (summary.failed_searches.length > 0) {
    lines.push(
      "## Failed searches (source unreachable)",
      "",
      "A source that **errored** is not the same as a source that returned **zero**: these are transport failures (timeout / rate-limit / outage), so their silence is inconclusive — not evidence of absence.",
      ""
    );
    for (const f of summary.failed_searches) {
      lines.push(`- **${f.source}** — ${f.query ? "`" + f.query + "`" : "_(query not recorded)_"} — request failed`);
    }
    lines.push("");
  }
  return { markdown: lines.join("\n"), summary };
}

module.exports = { STATUS, collectSearchCoverage, summarizeCoverage, buildSearchCoverageLedger };
