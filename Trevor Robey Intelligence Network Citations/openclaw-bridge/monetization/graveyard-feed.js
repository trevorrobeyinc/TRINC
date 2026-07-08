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

function buildGraveyardFeed(stoppedTrials, opts = {}) {
  const indication = String(opts.indication || "").trim();
  const asOf = String(opts.asOf || "").trim();
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
    dataDictionaryMd: renderDataDictionary(indication, asOf),
    summary,
  };
}

function renderDataDictionary(indication, asOf) {
  return [
    `# Trial Graveyard Feed - Data Dictionary`,
    "",
    `Indication / therapeutic area: ${indication || "(unset)"}${asOf ? ` - as of ${asOf}` : ""}`,
    "",
    "Citation-traced register of terminated, withdrawn, or suspended ClinicalTrials.gov trials.",
    "Rendered deterministically from public CT.gov records (no LLM). Every row resolves to",
    "https://clinicaltrials.gov/study/<nct_id>. Public-domain source; no PHI.",
    "",
    "## register.csv",
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
    "## citation-index.csv",
    "| Column | Description |",
    "|---|---|",
    "| identifier_type | Always NCT for this feed. |",
    "| identifier | The NCT id. |",
    "| source_database | ClinicalTrials.gov. |",
    "| nct_id | Foreign key back to register.csv. |",
    "| context | Status + stop reason snippet. |",
    "",
    "Cross-file integrity: every nct_id in register.csv appears exactly once in citation-index.csv.",
  ].join("\n");
}

module.exports = { buildGraveyardFeed, asciiSanitize, csvField, perTrialBand, REGISTER_COLUMNS, CITATION_COLUMNS };
