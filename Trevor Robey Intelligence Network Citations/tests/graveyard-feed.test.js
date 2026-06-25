"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { buildGraveyardFeed } = require("../openclaw-bridge/monetization/graveyard-feed.js");

const SAMPLE = [
  { nctId: "NCT00000001", title: "Trial A", status: "TERMINATED", phase: "PHASE2",
    whyStopped: "Low accrual, and futility", changeSummary: { versions: 12, amended_modules: ["Eligibility", "Outcomes"], first: "2019-01-01", last: "2021-06-01" } },
  { nctId: "NCT00000002", title: "Trial B", status: "WITHDRAWN", phase: "PHASE3",
    whyStopped: "", changeSummary: { versions: 6, amended_modules: ["Arms"] } },
  { nctId: "NCT00000003", title: 'Trial "C"', status: "SUSPENDED", phase: "PHASE1",
    whyStopped: 'Sponsor said "pause", then resumed', changeSummary: { versions: 2, amended_modules: [] } },
  { nctId: "NCT00000004", title: "Trial D", status: "TERMINATED", phase: "PHASE2", whyStopped: "Safety — smart “quotes”" }, // non-ASCII -> sanitized, no history -> UNKNOWN
  { nctId: "NCT00000001", title: "DUPLICATE", status: "TERMINATED", phase: "PHASE2", whyStopped: "dup" }, // dedup
  { nctId: "", title: "no-nct", status: "TERMINATED" }, // dropped (no nctId)
];

function parseRows(csv) {
  return csv.trim().split("\n");
}

test("header + row count (dedup + drop no-nct)", () => {
  const f = buildGraveyardFeed(SAMPLE, { indication: "glioblastoma", asOf: "2026-06-19" });
  const rows = parseRows(f.feedCsv);
  assert.match(rows[0], /^nct_id,title,overall_status,phase,why_stopped/);
  assert.equal(rows.length, 1 + 4); // header + 4 unique valid trials
  assert.equal(f.summary.total, 4);
});

test("missing reason -> '(none stated by sponsor)'", () => {
  const f = buildGraveyardFeed(SAMPLE, { asOf: "2026-06-19" });
  assert.match(f.feedCsv, /\(none stated by sponsor\)/);
  assert.equal(f.summary.no_reason_count, 1);
});

test("per-trial amendment bands", () => {
  const f = buildGraveyardFeed(SAMPLE, {});
  assert.deepEqual(f.summary.band_counts, { HIGH: 1, MODERATE: 1, LOW: 1, UNKNOWN: 1 });
});

test("CSV escaping: comma field quoted; internal quotes doubled", () => {
  const f = buildGraveyardFeed(SAMPLE, {});
  // "Low accrual, and futility" must be quoted because it contains a comma
  assert.match(f.feedCsv, /"Low accrual, and futility"/);
  // 'Trial "C"' title -> doubled quotes inside quotes
  assert.match(f.feedCsv, /"Trial ""C"""/);
});

test("non-ASCII is sanitized to ASCII", () => {
  const f = buildGraveyardFeed(SAMPLE, {});
  // em dash -> hyphen, smart quotes -> ascii (value is CSV-escaped, so check the un-quoted prefix)
  assert.match(f.feedCsv, /Safety - smart/);
  assert.ok(!/[^\x00-\x7F]/.test(f.feedCsv), "feed CSV must be pure ASCII");
});

test("cross-file integrity: every nct in register is in citation-index", () => {
  const f = buildGraveyardFeed(SAMPLE, {});
  const regNcts = parseRows(f.feedCsv).slice(1).map((r) => r.split(",")[0]).sort();
  const citRows = parseRows(f.citationIndexCsv).slice(1);
  const citNcts = citRows.map((r) => r.split(",")[1]).sort(); // identifier column
  assert.deepEqual(regNcts, citNcts);
  assert.match(parseRows(f.citationIndexCsv)[0], /^identifier_type,identifier,source_database,nct_id,context/);
});

test("study_url + indication + as_of populated", () => {
  const f = buildGraveyardFeed(SAMPLE, { indication: "glioblastoma", asOf: "2026-06-19" });
  assert.match(f.feedCsv, /https:\/\/clinicaltrials\.gov\/study\/NCT00000001/);
  assert.match(f.feedCsv, /glioblastoma/);
  assert.match(f.feedCsv, /2026-06-19/);
});

test("empty input -> header only, total 0", () => {
  const f = buildGraveyardFeed([], { indication: "x", asOf: "y" });
  assert.equal(parseRows(f.feedCsv).length, 1);
  assert.equal(f.summary.total, 0);
});
