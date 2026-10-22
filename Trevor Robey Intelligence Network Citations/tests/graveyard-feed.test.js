"use strict";

const test = require("node:test");
const assert = require("node:assert");
const {
  buildGraveyardFeed, renderSampleNotice, historyOutcome, FEED_FILES,
} = require("../openclaw-bridge/monetization/graveyard-feed.js");

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

// Generated copy. These strings were hand-corrected in the 2026-10-21 refresh staging folder
// (marker "copy corrected 2026-10-21") and are pinned here so a monthly refresh writes them itself.
const REFUSED = { attempted: 40, succeeded: 0, firstError: "HTTP 403" };

const HISTORY_NOTE_REFUSED =
  "**Protocol-history columns.** `protocol_versions`, `most_amended_modules`, `history_first` and\n" +
  "`history_last` are empty, and `amendment_risk_band` is UNKNOWN, on every row of this revision.\n" +
  "Since 2026-10-08 ClinicalTrials.gov refuses the change-history endpoint (HTTP 403), and this\n" +
  "feed does not work around the refusal. The columns stay in the schema so that a later revision\n" +
  "can fill them without a schema change.\n";
const MULTI_AREA_NOTE =
  "**Trials in more than one area.** A trial whose conditions match more than one area's query\n" +
  "appears in each of those areas' files. `nct_id` is unique within one area's file, not across\n" +
  "areas: deduplicate on `nct_id` when you combine areas.\n";
const NOTICE_REFUSED =
  "Since 2026-10-08 ClinicalTrials.gov refuses the change-history endpoint (HTTP 403), so this " +
  "revision carries every trial and its stop reason with the churn columns empty; the feed does not " +
  "work around the refusal.";
const NOTICE_SAMPLED =
  "Protocol history must be fetched one trial at a time from ClinicalTrials.gov, so it is sampled " +
  "deliberately rather than run across the whole register";

function notice(overrides) {
  return renderSampleNotice({
    condition: "idiopathic pulmonary fibrosis", asOf: "2026-10-21", sampleTotal: 5, fullTotal: 78,
    eligibleTotal: 78, censusComplete: true, churnRows: 0, history: REFUSED, ...overrides,
  });
}

test("copy 1: the free dictionary documents the free files and says it is the sample", () => {
  const free = buildGraveyardFeed(SAMPLE, { tier: "free", history: REFUSED }).dataDictionaryMd;
  assert.match(free, /^## register-sample\.csv$/m);
  assert.match(free, /^## citation-index-sample\.csv$/m);
  assert.ok(free.includes("| nct_id | Foreign key back to register-sample.csv. |"));
  assert.ok(free.includes(
    "Cross-file integrity: every nct_id in register-sample.csv appears exactly once in citation-index-sample.csv.\n"));
  assert.ok(free.includes(
    "Public-domain source; no PHI.\n\n" +
    "This is the free sample: the first 4 rows of the paid feed for this area, in the identical\n" +
    "schema. The paid files are named `register.csv` and `citation-index.csv`.\n\n## register-sample.csv\n"));
  assert.doesNotMatch(free, /^## (register|citation-index)\.csv$/m);

  const paid = buildGraveyardFeed(SAMPLE, { history: REFUSED }).dataDictionaryMd;
  assert.match(paid, /^## register\.csv$/m);
  assert.match(paid, /^## citation-index\.csv$/m);
  assert.ok(!paid.includes("This is the free sample"));
  assert.deepEqual(FEED_FILES.free, { register: "register-sample.csv", citations: "citation-index-sample.csv" });
});

test("copy 2: both dictionaries carry the protocol-history and multi-area notes", () => {
  for (const tier of ["free", "paid"]) {
    const md = buildGraveyardFeed(SAMPLE, { tier, history: REFUSED }).dataDictionaryMd;
    assert.ok(md.includes("| as_of | The feed revision date. |\n\n" + HISTORY_NOTE_REFUSED + "\n" + MULTI_AREA_NOTE + "\n## "),
      `${tier} dictionary`);
  }
  // History came back: the 403 note would be false, so it is absent; the multi-area note stays.
  const ok = buildGraveyardFeed(SAMPLE, { history: { attempted: 4, succeeded: 3, firstError: "" } }).dataDictionaryMd;
  assert.ok(!ok.includes("Protocol-history columns"));
  assert.ok(ok.includes(MULTI_AREA_NOTE));
  // Every request failed, but not with a 403: no refusal is claimed.
  const failed = buildGraveyardFeed(SAMPLE, { history: { attempted: 4, succeeded: 0, firstError: "HTTP 500" } }).dataDictionaryMd;
  assert.ok(failed.includes("Protocol-history columns"));
  assert.ok(failed.includes("(first error: HTTP 500)"));
  assert.ok(!failed.includes("403"));
});

test("copy 3: the sample notice names the 403 refusal, and the sampling cause only when it is true", () => {
  const refused = notice();
  assert.ok(refused.includes(
    "**Protocol-churn coverage.** Amendment-risk and protocol-churn columns are populated for 0 of 78 rows. " +
    NOTICE_REFUSED + "\n\n"));
  assert.ok(!refused.includes("sampled deliberately"));

  // History came back for a subset: the sampling sentence is the true cause.
  const sampled = notice({ churnRows: 40, history: { attempted: 40, succeeded: 40, firstError: "" } });
  assert.ok(sampled.includes("populated for 40 of 78 rows. " + NOTICE_SAMPLED));
  assert.ok(!sampled.includes("403"));

  // History came back for every row: neither cause applies.
  const whole = notice({ fullTotal: 40, eligibleTotal: 40, churnRows: 40, history: { attempted: 40, succeeded: 40 } });
  assert.ok(whole.includes("populated for 40 of 40 rows.\n\n"));
  assert.ok(!whole.includes("sampled deliberately"));

  // Every request failed for another reason: no 403 claimed.
  const failed = notice({ history: { attempted: 40, succeeded: 0, firstError: "HTTP 500" } });
  assert.ok(failed.includes("(first error: HTTP 500)"));
  assert.ok(!failed.includes("403"));
});

test("copy 4: the notice keeps the complete** wording refresh-graveyard-feeds.sh greps for", () => {
  assert.match(notice(), /complete\*\*/);
  assert.ok(notice().includes(
    'The paid subscription delivers the **complete** register for the ClinicalTrials.gov condition query ' +
    '"idiopathic pulmonary fibrosis" — all 78 of the 78 terminated/withdrawn/suspended trials the registry counted'));
  const partial = notice({ fullTotal: 2000, eligibleTotal: 2034, censusComplete: false });
  assert.doesNotMatch(partial, /complete\*\*/);
  assert.ok(partial.includes("This revision is a **PARTIAL** retrieval, not a census."));
});

test("historyOutcome: a cause is named only when observed", () => {
  assert.equal(historyOutcome(undefined), "not_attempted");
  assert.equal(historyOutcome({ attempted: 0 }), "not_attempted");
  assert.equal(historyOutcome({ attempted: 3, succeeded: 1, firstError: "HTTP 403" }), "retrieved");
  assert.equal(historyOutcome({ attempted: 3, succeeded: 0, firstError: "HTTP 403" }), "refused");
  assert.equal(historyOutcome({ attempted: 3, succeeded: 0, firstError: "timeout" }), "failed");
  assert.equal(historyOutcome({ attempted: 3, succeeded: 0, firstError: "" }), "failed");
});
