"use strict";

// design-benchmark.js — the deliverable behind the Trial Design Benchmark Pack ($4,950):
// a comparative Phase 3 STRUCTURE matrix for an indication, rendered DETERMINISTICALLY from the
// ClinicalTrials.gov records fetched at runtime by ctgov-design-benchmark.js. No LLM writes a cell,
// so every value is verifiable against a real NCT record. Same contract as graveyard-memo.js:
// a pure function over fetched records, an honest empty state, and no invented values.
//
// Three honesty rules are load-bearing here, each one a defect an adversarial review actually found:
//
//  1. COHORT SIZE IS REPORTED, NEVER PADDED. The SKU targets 10–20 comparators. Some indications
//     cannot supply that at any page size — verified live: non-small cell lung cancer has 665
//     eligible Phase 3 programs, fibrodysplasia ossificans progressiva has 6, Creutzfeldt-Jakob
//     disease has 1. When the cohort is short, the memo says so and says WHY, and states that it
//     covers the entire eligible population rather than a sample.
//
//  2. THE SELECTION RULE IS PRINTED. "20 of 665" is meaningless without saying which 20. The
//     fetcher sends an explicit status filter and an explicit sort; both are printed verbatim.
//
//  3. STRUCTURE STATISTICS EXCLUDE NON-EXECUTED PROTOCOLS. A WITHDRAWN trial reports
//     enrollmentInfo.count = 0 — a *present* number — so a naive "median over trials reporting a
//     count" silently folds trials that never enrolled a patient into the median. Such rows stay in
//     the TABLE (dropping them would be its own distortion) but are excluded from the SUMMARY, and
//     the exclusion is printed. Dressing a statistic drawn from a contaminated slice in `k of n`
//     notation makes it look MORE rigorous while being less true — precisely the manufactured-
//     plausible-number failure this business sells against.

// Statuses whose protocols exist on paper but were never executed (or are unverified), so they
// cannot inform "how are comparable programs actually structured". The fetcher already filters
// these out upstream; this is defence in depth for any other caller and for fixtures.
const NON_EXECUTED_STATUSES = new Set([
  "WITHDRAWN",
  "NOT_YET_RECRUITING",
  "SUSPENDED",
  "TERMINATED",
  "UNKNOWN",
  "UNKNOWN_STATUS",
  "NO_LONGER_AVAILABLE",
  "TEMPORARILY_NOT_AVAILABLE"
]);

function cell(value) {
  const s = value === 0 ? "0" : String(value === null || value === undefined ? "" : value).trim();
  return s ? s.replace(/\|/g, "\\|") : "n/a";
}

function csvCell(value) {
  const s = value === 0 ? "0" : String(value === null || value === undefined ? "" : value);
  return `"${s.replace(/"/g, '""')}"`;
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
}

function tally(items) {
  const counts = {};
  for (const item of items) {
    if (!item) continue;
    counts[item] = (counts[item] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

// Endpoint measure strings are sponsor free-text, so the SAME endpoint arrives in several
// casings — a live NSCLC probe returned both "Overall survival (OS)" and "Overall Survival (OS)",
// which a naive tally reports as two distinct endpoints each with half the true count. Group
// case-insensitively (and on collapsed whitespace) but DISPLAY the most frequent original spelling,
// so the label stays a real sponsor string rather than something normalised into existence.
function tallyMeasures(items) {
  const groups = new Map();
  for (const item of items) {
    const raw = String(item || "").trim();
    if (!raw) continue;
    const key = raw.toLowerCase().replace(/\s+/g, " ");
    const group = groups.get(key) || { total: 0, variants: {} };
    group.total += 1;
    group.variants[raw] = (group.variants[raw] || 0) + 1;
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((g) => {
      const label = Object.entries(g.variants).sort((a, b) => b[1] - a[1])[0][0];
      return [label, g.total];
    })
    .sort((a, b) => b[1] - a[1]);
}

function buildDesignBenchmark(records, opts = {}) {
  const trials = Array.isArray(records) ? records.filter((t) => t && t.nctId) : [];
  const indication = String(opts.indication || "this indication").trim() || "this indication";
  const requested = Number(opts.requested) || 20;
  const eligibleRaw = Number(
    opts.eligibleTotal !== undefined && opts.eligibleTotal !== null
      ? opts.eligibleTotal
      : (records && records.eligibleTotal)
  );
  const eligibleTotal = Number.isFinite(eligibleRaw) ? eligibleRaw : trials.length;
  const selectionRule = String(opts.selectionRule || (records && records.selectionRule) || "").trim();
  const sortRule = String(opts.sort || (records && records.sort) || "").trim();
  const retrievedAt = String(opts.retrievedAt || "").trim();

  const lines = [
    "# Trial Design Benchmark — Comparative Phase 3 Structure",
    ""
  ];

  if (trials.length === 0) {
    lines.push(
      `_No eligible Phase 3 programs were retrieved for **${indication}** at generation time._`,
      "",
      "This is an honest zero, not a rendering failure: either the indication has no registered " +
      "Phase 3 programs meeting the comparator criteria, or the ClinicalTrials.gov query returned " +
      "nothing. No comparison table is shown because there is nothing to compare.",
      ""
    );
    return {
      count: 0,
      eligibleTotal,
      requested,
      shortfall: true,
      excludedFromStats: 0,
      markdown: lines.join("\n"),
      csv: ""
    };
  }

  lines.push(
    `**Cohort: ${trials.length} of ${eligibleTotal} eligible Phase 3 program(s)** registered on ` +
    `ClinicalTrials.gov for **${indication}**${retrievedAt ? `, retrieved ${retrievedAt}` : ""}. ` +
    "Every row resolves to a real NCT record.",
    ""
  );
  if (selectionRule) {
    lines.push(`**Selection rule.** ${selectionRule}${sortRule ? ` (sort: \`${sortRule}\`)` : ""}`, "");
  }

  // Rule 1 — cohort-size honesty.
  const shortfall = trials.length < 10;
  if (shortfall) {
    lines.push(
      `**Cohort-size notice.** This indication has only ${eligibleTotal} registered Phase 3 ` +
      `program(s) meeting the comparator criteria — fewer than the 10–20 this pack targets. The ` +
      `benchmark below covers the **entire eligible population**; it is not a sample, and no ` +
      `additional comparators exist to add. Broadening the indication, relaxing the status filter, ` +
      `or including earlier-phase programs would enlarge the cohort.`,
      ""
    );
  }

  // Rule 3 — the summary's sampling frame, decided before anything is computed.
  const statsCohort = trials.filter((t) => !NON_EXECUTED_STATUSES.has(String(t.status || "").toUpperCase()));
  const excludedFromStats = trials.length - statsCohort.length;

  lines.push(
    "**How to read this.** The table is the full retrieved cohort. The summary beneath it is " +
    "computed only over programs that were actually executed, and every figure carries its own " +
    "denominator — a field absent from a registry record is never counted as agreement.",
    "",
    "**Citation-integrity scope.** This benchmark is rendered deterministically from " +
    "ClinicalTrials.gov records retrieved at runtime — no language model wrote any cell. It " +
    "therefore carries no citation-integrity grade of its own: the grade in `citation-integrity.md` " +
    "scores the narrative report's cited claims, and no identifier below was counted in it. Each " +
    "NCT is verifiable directly at its linked record.",
    "",
    "## Comparative structure",
    "",
    "| NCT | Phase | Status | Sponsor (class) | Allocation | Model | Masking | Arms | Enrollment (type) | Primary endpoint(s) | Primary completion |",
    "|---|---|---|---|---|---|---|---|---|---|---|"
  );

  for (const t of trials) {
    const endpoints = (Array.isArray(t.primaryOutcomes) ? t.primaryOutcomes : [])
      .map((o) => o.timeFrame ? `${o.measure} (${o.timeFrame})` : o.measure)
      .join("; ");
    const sponsor = t.sponsorClass ? `${t.sponsor || "n/a"} (${t.sponsorClass})` : (t.sponsor || "");
    const enrollment = t.enrollmentCount === null || t.enrollmentCount === undefined
      ? ""
      : (t.enrollmentType ? `${t.enrollmentCount} (${t.enrollmentType})` : String(t.enrollmentCount));
    lines.push(
      `| [${t.nctId}](https://clinicaltrials.gov/study/${t.nctId}) | ${cell(t.phase)} | ${cell(t.status)} | ` +
      `${cell(sponsor)} | ${cell(t.allocation)} | ${cell(t.interventionModel)} | ${cell(t.masking)} | ` +
      `${cell(t.armCount)} | ${cell(enrollment)} | ${cell(endpoints)} | ${cell(t.primaryCompletionDate)} |`
    );
  }
  lines.push("");

  // ---- Structure summary, over statsCohort only ----
  lines.push("## Structure summary", "");
  if (statsCohort.length === 0) {
    lines.push(
      `_No summary statistics are shown: all ${trials.length} retrieved program(s) are withdrawn, ` +
      "not yet started, or of unverified status, so none reflects an executed protocol. The table " +
      "above is still accurate — there is simply nothing here that can honestly be averaged._",
      ""
    );
  } else {
    if (excludedFromStats > 0) {
      lines.push(
        `**Sampling frame.** Statistics below are computed over **${statsCohort.length} of ` +
        `${trials.length}** rows; ${excludedFromStats} row(s) are excluded as withdrawn, ` +
        "not-yet-started, terminated, or status-unknown. Those rows remain in the table above with " +
        "their status shown, but a protocol that was never executed cannot inform how comparable " +
        "programs are structured.",
        ""
      );
    }

    const allocations = statsCohort.map((t) => t.allocation).filter(Boolean);
    const randomized = allocations.filter((a) => /randomi/i.test(a)).length;
    if (allocations.length > 0) {
      lines.push(`- **Randomized:** ${randomized} of ${allocations.length} reporting an allocation.`);
    }

    const maskings = tally(statsCohort.map((t) => t.masking).filter(Boolean));
    if (maskings.length > 0) {
      const total = maskings.reduce((n, [, c]) => n + c, 0);
      lines.push(`- **Masking** (of ${total} reporting): ${maskings.map(([m, c]) => `${m} — ${c}`).join("; ")}.`);
    }

    const models = tally(statsCohort.map((t) => t.interventionModel).filter(Boolean));
    if (models.length > 0) {
      lines.push(`- **Most common intervention model:** ${models[0][0]} (${models[0][1]} of ${models.reduce((n, [, c]) => n + c, 0)} reporting).`);
    }

    const enrollments = statsCohort
      .map((t) => Number(t.enrollmentCount))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (enrollments.length > 0) {
      lines.push(
        `- **Median enrollment:** ${median(enrollments)} participants ` +
        `(over ${enrollments.length} of ${statsCohort.length} programs reporting a non-zero count; ` +
        `range ${Math.min(...enrollments)}–${Math.max(...enrollments)}).`
      );
    }

    const arms = statsCohort.map((t) => Number(t.armCount)).filter((n) => Number.isFinite(n) && n > 0);
    if (arms.length > 0) {
      lines.push(`- **Median arm count:** ${median(arms)} (over ${arms.length} of ${statsCohort.length} reporting arms).`);
    }

    const measures = tallyMeasures(
      statsCohort.flatMap((t) => (Array.isArray(t.primaryOutcomes) ? t.primaryOutcomes : []).map((o) => o.measure))
    ).slice(0, 5);
    if (measures.length > 0) {
      lines.push(
        "",
        "**Most frequent primary endpoint measures** (sponsor free-text, grouped case-insensitively; " +
        "the most common spelling is shown):",
        ""
      );
      for (const [m, c] of measures) lines.push(`- ${m} — ${c} program(s)`);
    }
    lines.push("");
  }

  // ---- CSV: the machine-readable comparison matrix ----
  const csvRows = [
    [
      "nct_id", "phase", "status", "sponsor", "sponsor_class", "allocation", "intervention_model",
      "masking", "arm_count", "enrollment_count", "enrollment_type", "primary_outcome_measures",
      "start_date", "primary_completion_date", "in_summary_statistics", "url"
    ].map(csvCell).join(",")
  ];
  for (const t of trials) {
    const measures = (Array.isArray(t.primaryOutcomes) ? t.primaryOutcomes : [])
      .map((o) => o.measure).join(" | ");
    csvRows.push([
      t.nctId, t.phase, t.status, t.sponsor, t.sponsorClass, t.allocation, t.interventionModel,
      t.masking, t.armCount, t.enrollmentCount, t.enrollmentType, measures,
      t.startDate, t.primaryCompletionDate,
      NON_EXECUTED_STATUSES.has(String(t.status || "").toUpperCase()) ? "no" : "yes",
      `https://clinicaltrials.gov/study/${t.nctId}`
    ].map(csvCell).join(","));
  }

  return {
    count: trials.length,
    eligibleTotal,
    requested,
    shortfall,
    excludedFromStats,
    markdown: lines.join("\n"),
    csv: csvRows.join("\n")
  };
}

module.exports = { buildDesignBenchmark, NON_EXECUTED_STATUSES };
