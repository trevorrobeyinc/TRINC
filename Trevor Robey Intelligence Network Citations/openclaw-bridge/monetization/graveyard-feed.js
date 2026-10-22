"use strict";

// graveyard-feed.js — the Trial Graveyard Feed PRODUCT builder. Turns ClinicalTrials.gov
// stopped-trial records (from mcp/ctgov-supplemental.js) into the shippable AWS Data Exchange
// Files data-set assets: a register CSV (one row per terminated/withdrawn/suspended trial) + a
// citation-index CSV (the NCT provenance trail) + a data dictionary.
//
// DETERMINISTIC — no LLM. Every value is rendered straight from a real CT.gov record, so each
// row is verifiable against https://clinicaltrials.gov/study/<nctId>. CSV is RFC 4180, UTF-8,
// ASCII-sanitized, header row, quoted fields. Identifiers only (NCT) — no PHI.

const REGISTER_COLUMNS = [
  "nct_id", "title", "overall_status", "phase", "why_stopped",
  "protocol_versions", "most_amended_modules", "amendment_risk_band",
  "history_first", "history_last", "study_url", "indication", "as_of",
];
const CITATION_COLUMNS = ["identifier_type", "identifier", "source_database", "nct_id", "context"];

// The file names each tier ships under. scripts/build-graveyard-feed.js writes these and the data
// dictionary documents these, from this one constant: until 2026-10-21 the script wrote the free
// tier as *-sample.csv while the dictionary still documented register.csv / citation-index.csv.
const FEED_FILES = Object.freeze({
  paid: Object.freeze({ register: "register.csv", citations: "citation-index.csv" }),
  free: Object.freeze({ register: "register-sample.csv", citations: "citation-index-sample.csv" }),
});

// What the change-history requests did, from the fetcher's accounting (ctgov-supplemental.js
// historyAttempted / historySucceeded / historyFirstError). A cause is named only when observed:
// "refused" needs a 403 in the first error, so another failure is never reported as the refusal.
function historyOutcome(history) {
  const h = history || {};
  const attempted = Math.max(0, Number(h.attempted) || 0);
  const succeeded = Math.max(0, Number(h.succeeded) || 0);
  if (attempted === 0) return "not_attempted";
  if (succeeded > 0) return "retrieved";
  return /\b403\b/.test(String(h.firstError || "")) ? "refused" : "failed";
}

// Replace common typographic non-ASCII, then strip anything still outside printable ASCII, so the
// CSV is strict ASCII (sponsor whyStopped text often carries smart quotes / em dashes).
function asciiSanitize(value) {
  return String(value == null ? "" : value)
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/[…]/g, "...")
    .replace(/ /g, " ")
    .replace(/[^\x20-\x7E]/g, "") // drop any remaining non-printable-ASCII
    .replace(/\s+/g, " ")
    .trim();
}

// RFC 4180 field: quote when it contains a comma, quote, CR, or LF; double internal quotes.
function csvField(value) {
  const s = asciiSanitize(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csvRow(values) {
  return values.map(csvField).join(",");
}

// Per-trial amendment-risk band from this trial's protocol version count (same thresholds the
// corpus-level buildAmendmentRisk uses). UNKNOWN when no change-history was fetched for the trial.
function perTrialBand(changeSummary) {
  const v = changeSummary && Number(changeSummary.versions);
  if (!Number.isFinite(v) || v <= 0) return "UNKNOWN";
  if (v >= 10) return "HIGH";
  if (v >= 5) return "MODERATE";
  return "LOW";
}

// opts.tier: "paid" (default) or "free" - picks the file names the dictionary documents.
// opts.history: { attempted, succeeded, firstError } from the fetcher; pass it explicitly, because
// the fetcher carries it as non-enumerable properties that records.slice() does not copy.
function buildGraveyardFeed(stoppedTrials, opts = {}) {
  const indication = String(opts.indication || "").trim();
  const asOf = String(opts.asOf || "").trim();
  const tier = opts.tier === "free" ? "free" : "paid";
  const trials = (Array.isArray(stoppedTrials) ? stoppedTrials : []).filter((t) => t && t.nctId);

  const registerRows = [csvRow(REGISTER_COLUMNS)];
  const citationRows = [csvRow(CITATION_COLUMNS)];
  const bandCounts = { HIGH: 0, MODERATE: 0, LOW: 0, UNKNOWN: 0 };
  let noReasonCount = 0;
  let withHistory = 0;
  const seen = new Set();

  for (const t of trials) {
    if (seen.has(t.nctId)) continue; // dedup by NCT
    seen.add(t.nctId);
    const cs = t.changeSummary || null;
    const band = perTrialBand(cs);
    bandCounts[band] += 1;
    if (cs && Number(cs.versions) > 0) withHistory += 1;
    const whyStopped = t.whyStopped ? asciiSanitize(t.whyStopped) : "(none stated by sponsor)";
    if (!t.whyStopped) noReasonCount += 1;

    registerRows.push(csvRow([
      t.nctId,
      t.title || t.nctId,
      t.status || "",
      t.phase || "",
      whyStopped,
      cs && Number.isFinite(Number(cs.versions)) ? String(cs.versions) : "",
      cs && Array.isArray(cs.amended_modules) ? cs.amended_modules.join("; ") : "",
      band,
      cs && cs.first ? cs.first : "",
      cs && cs.last ? cs.last : "",
      `https://clinicaltrials.gov/study/${t.nctId}`,
      indication,
      asOf,
    ]));

    citationRows.push(csvRow([
      "NCT",
      t.nctId,
      "ClinicalTrials.gov",
      t.nctId,
      `${t.status || "stopped"}: ${whyStopped}`,
    ]));
  }

  const summary = {
    total: seen.size,
    indication,
    as_of: asOf,
    with_history: withHistory,
    no_reason_count: noReasonCount,
    band_counts: bandCounts,
  };

  return {
    feedCsv: registerRows.join("\n") + "\n",
    citationIndexCsv: citationRows.join("\n") + "\n",
    dataDictionaryMd: renderDataDictionary(indication, asOf, { tier, rows: seen.size, history: opts.history }),
    summary,
  };
}

// Lines for the dictionary's protocol-history note, or none when history came back (the column
// descriptions already say what a blank means) or was never requested.
function protocolHistoryNote(history) {
  const outcome = historyOutcome(history);
  if (outcome !== "refused" && outcome !== "failed") return [];
  const firstError = String((history && history.firstError) || "").trim();
  return [
    "**Protocol-history columns.** `protocol_versions`, `most_amended_modules`, `history_first` and",
    "`history_last` are empty, and `amendment_risk_band` is UNKNOWN, on every row of this revision.",
    ...(outcome === "refused"
      ? [
        "Since 2026-10-08 ClinicalTrials.gov refuses the change-history endpoint (HTTP 403), and this",
        "feed does not work around the refusal. The columns stay in the schema so that a later revision",
        "can fill them without a schema change.",
      ]
      : [
        `No change history came back from ClinicalTrials.gov for any trial requested${firstError ? ` (first error: ${firstError})` : ""}.`,
        "The columns stay in the schema so that a later revision can fill them without a schema change.",
      ]),
    "",
  ];
}

function renderDataDictionary(indication, asOf, opts = {}) {
  const free = opts.tier === "free";
  const files = free ? FEED_FILES.free : FEED_FILES.paid;
  const rows = Number(opts.rows) || 0;
  return [
    `# Trial Graveyard Feed - Data Dictionary`,
    "",
    `Indication / therapeutic area: ${indication || "(unset)"}${asOf ? ` - as of ${asOf}` : ""}`,
    "",
    "Citation-traced register of terminated, withdrawn, or suspended ClinicalTrials.gov trials.",
    "Rendered deterministically from public CT.gov records (no LLM). Every row resolves to",
    "https://clinicaltrials.gov/study/<nct_id>. Public-domain source; no PHI.",
    "",
    ...(free
      ? [
        `This is the free sample: the first ${rows} row${rows === 1 ? "" : "s"} of the paid feed for this area, in the identical`,
        `schema. The paid files are named \`${FEED_FILES.paid.register}\` and \`${FEED_FILES.paid.citations}\`.`,
        "",
      ]
      : []),
    `## ${files.register}`,
    "| Column | Description |",
    "|---|---|",
    "| nct_id | ClinicalTrials.gov identifier (the provenance key). |",
    "| title | Brief title of the trial. |",
    "| overall_status | TERMINATED / WITHDRAWN / SUSPENDED. |",
    "| phase | Trial phase(s). |",
    "| why_stopped | Sponsor-stated stop reason, verbatim; '(none stated by sponsor)' when absent. |",
    "| protocol_versions | Number of protocol versions in the change history (blank if not retrieved). |",
    "| most_amended_modules | Protocol modules amended most often (semicolon-separated). |",
    "| amendment_risk_band | HIGH (>=10 versions) / MODERATE (>=5) / LOW (<5) / UNKNOWN (no history). |",
    "| history_first / history_last | First/last change-history dates. |",
    "| study_url | Resolvable ClinicalTrials.gov study URL. |",
    "| indication | The therapeutic area this feed covers. |",
    "| as_of | The feed revision date. |",
    "",
    ...protocolHistoryNote(opts.history),
    "**Trials in more than one area.** A trial whose conditions match more than one area's query",
    "appears in each of those areas' files. `nct_id` is unique within one area's file, not across",
    "areas: deduplicate on `nct_id` when you combine areas.",
    "",
    `## ${files.citations}`,
    "| Column | Description |",
    "|---|---|",
    "| identifier_type | Always NCT for this feed. |",
    "| identifier | The NCT id. |",
    "| source_database | ClinicalTrials.gov. |",
    `| nct_id | Foreign key back to ${files.register}. |`,
    "| context | Status + stop reason snippet. |",
    "",
    `Cross-file integrity: every nct_id in ${files.register} appears exactly once in ${files.citations}.`,
    "",
  ].join("\n");
}

// The free tier's SAMPLE-NOTICE.md. scripts/refresh-graveyard-feeds.sh greps it for "complete**"
// to fill its summary table, so that wording stays exactly as it is.
function renderSampleNotice(opts = {}) {
  const condition = String(opts.condition || "");
  const asOf = String(opts.asOf || "");
  const sampleTotal = Number(opts.sampleTotal) || 0;
  const fullTotal = Number(opts.fullTotal) || 0;
  const churnRows = Number(opts.churnRows) || 0;
  const eligibleTotal = opts.eligibleTotal;
  const outcome = historyOutcome(opts.history);
  const firstError = String((opts.history && opts.history.firstError) || "").trim();

  let churnCause = "";
  if (outcome === "refused") {
    churnCause = " Since 2026-10-08 ClinicalTrials.gov refuses the change-history endpoint (HTTP 403), so this " +
      "revision carries every trial and its stop reason with the churn columns empty; the feed does not " +
      "work around the refusal.";
  } else if (outcome === "failed") {
    churnCause = " No change history came back from ClinicalTrials.gov for any trial requested" +
      `${firstError ? ` (first error: ${firstError})` : ""}, so this revision carries every trial and its ` +
      "stop reason with the churn columns empty.";
  } else if (outcome === "retrieved" && churnRows < fullTotal) {
    churnCause = " Protocol history must be fetched one trial at a time from ClinicalTrials.gov, so it is sampled " +
      "deliberately rather than run across the whole register; rows outside the sample carry the trial and its " +
      "stop reason, with the churn columns empty.";
  }

  return `# Free Sample — Trial Graveyard Feed (${condition})\n\n` +
    `This free sample contains the first ${sampleTotal} of ${fullTotal} stopped trials in the ` +
    `${condition} feed (as of ${asOf}), in the identical schema, so you can evaluate data quality and format before subscribing.\n\n` +
    (opts.censusComplete === true
      ? `The paid subscription delivers the **complete** register for the ClinicalTrials.gov condition query "${condition}" — ` +
        `all ${fullTotal} of the ${eligibleTotal} terminated/withdrawn/suspended trials the registry counted — refreshed **monthly**.\n\n`
      : `The paid subscription delivers ${fullTotal} of the ${eligibleTotal} terminated/withdrawn/suspended trials the ` +
        `registry counted for the condition query "${condition}", refreshed **monthly**. This revision is a **PARTIAL** retrieval, ` +
        `not a census.\n\n`) +
    `**Protocol-churn coverage.** Amendment-risk and protocol-churn columns are populated for ${churnRows} of ${fullTotal} ` +
    `rows.${churnCause}\n\n` +
    `**Condition search is term-based.** A different name for the same indication returns a different set (measured 2026-07-30: ` +
    `"NSCLC" returns 1,401 records where "non-small cell lung cancer" returns 1,391). Completeness above is for the term queried, ` +
    `not for every way the indication can be named.\n\n` +
    `Every row resolves to a public ClinicalTrials.gov record; no PHI.\n`;
}

module.exports = {
  buildGraveyardFeed, renderSampleNotice, historyOutcome, asciiSanitize, csvField, perTrialBand,
  REGISTER_COLUMNS, CITATION_COLUMNS, FEED_FILES,
};
