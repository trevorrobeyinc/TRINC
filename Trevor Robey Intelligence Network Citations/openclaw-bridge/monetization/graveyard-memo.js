"use strict";

// graveyard-memo.js — Slice 3 v2: the structured "kill-memo" deliverables, rendered
// DETERMINISTICALLY from the runtime-fetched ClinicalTrials.gov stopped-trial records (each
// NCT-traced). Per the cost-cutting research brief these are the cost-AVOIDANCE products:
//   - Graveyard memo: prior terminated/withdrawn programs in the indication + why each died.
//   - Amendment-risk signal: how much comparable trials churned their protocols (from the
//     change-history), i.e. how likely a fresh protocol is to need a costly amendment.
// No LLM — the fetched data IS the artifact, so every claim is verifiable against a real record.
//
// ── COVERAGE COPY IS DERIVED, NEVER HARDCODED (2026-07-30) ────────────────────────────────────
// Every coverage sentence below is computed from the metadata the fetcher attaches to the record
// array. Nothing here may state a fixed number. The previous version hedged "up to 8 retrieved"
// because the fetcher was capped at 8; a future cap change must update this copy automatically
// rather than leaving a stale hedge — understating a $14,950 deliverable is a defect too.
//
// Three coverage branches, and the strong one is deliberately hard to reach:
//   COMPLETE  — the walk ended cleanly with no error AND the collected count reached the
//               registry's own countTotal. Only this branch may say "complete".
//   SHORT     — the walk ended cleanly but N < M. Records are dropped for a missing NCT id or a
//               duplicate, and the registry can change between pages, so this states the gap and
//               explicitly refuses to name a single cause it cannot know.
//   PARTIAL   — a fetch error or the page ceiling stopped the walk. Never says "every".
//
// ── COMPLETENESS IS BOUND TO THE QUERY, NOT THE DISEASE ───────────────────────────────────────
// `query.cond` is a term-matched search, not a curated indication taxonomy. Measured 2026-07-30:
// "NSCLC" returns 1,401 records where "non-small cell lung cancer" returns 1,391. A census is
// therefore complete FOR THE TERM QUERIED and never for "every way the indication can be named".
// That caveat renders on every memo, unconditionally — it is not a footnote.

const NO_COVERAGE_META = "Coverage metadata was not supplied by the fetcher for this run.";

function meta(records, key, fallback) {
  const v = records && records[key];
  return v === undefined || v === null ? fallback : v;
}

function coverageBlock(trials, records, indication) {
  const eligibleTotal = meta(records, "eligibleTotal", null);
  const complete = meta(records, "censusComplete", false) === true;
  const exhausted = meta(records, "pagesExhausted", false) === true;
  const fetchError = meta(records, "fetchError", false) === true;
  const droppedNoNct = Number(meta(records, "droppedNoNct", 0)) || 0;
  const droppedDup = Number(meta(records, "droppedDuplicate", 0)) || 0;
  const n = trials.length;
  const lines = [];

  // NOTE: test for null/undefined BEFORE converting. Number(null) is 0, and Number.isFinite(0) is
  // true — so a bare Number.isFinite(Number(x)) guard lets a missing denominator through and the
  // memo renders "1 of null record(s)". Caught by the no-metadata fixture.
  const hasTotal = eligibleTotal !== null && eligibleTotal !== undefined && Number.isFinite(Number(eligibleTotal));
  if (!hasTotal) {
    lines.push(`**${n} stopped program(s) retrieved** for the ClinicalTrials.gov condition query **"${indication}"**.`);
    lines.push("");
    lines.push(`_${NO_COVERAGE_META} This memo reports what was retrieved; it does not claim to be a census._`);
  } else if (complete) {
    lines.push(`**Complete retrieval for the ClinicalTrials.gov condition query "${indication}": ${n} of ${eligibleTotal} record(s).**`);
    lines.push("");
    lines.push("The registry walk reached the end of the result set with no error and collected every record the registry counted.");
  } else if (exhausted && !fetchError) {
    const gap = Number(eligibleTotal) - n;
    lines.push(`**${n} of ${eligibleTotal} record(s)** for the ClinicalTrials.gov condition query **"${indication}"**.`);
    lines.push("");
    lines.push(
      `The registry walk reached the end of the result set with no error, but ${gap} record(s) the ` +
      "count included are not listed. A record is omitted when it carries no NCT identifier (nothing " +
      "citable to list), when it duplicates one already listed, or when the registry changed between " +
      "pages of the walk. **This run cannot distinguish which.** " +
      `Observed this run: ${droppedNoNct} dropped for a missing NCT id, ${droppedDup} as duplicates.`
    );
  } else {
    lines.push(`**PARTIAL retrieval — ${n} of ${eligibleTotal} record(s)** for the ClinicalTrials.gov condition query **"${indication}"**.`);
    lines.push("");
    lines.push(
      (fetchError
        ? "The registry walk stopped early because a page request failed. "
        : "The registry walk stopped early at its page ceiling. ") +
      "**This is not a census** — programs matching the query are missing from the list below."
    );
  }

  lines.push("");
  lines.push(
    "_Condition search is term-based. A different name for the same indication returns a different " +
    "set (measured 2026-07-30: \"NSCLC\" returns 1,401 records where \"non-small cell lung cancer\" " +
    "returns 1,391). Any completeness stated above is complete **for the term queried**, not for " +
    "every way the indication can be named._"
  );
  return lines;
}

function buildGraveyardMemo(stoppedTrials, opts = {}) {
  const trials = Array.isArray(stoppedTrials) ? stoppedTrials.filter((t) => t && t.nctId) : [];
  const indication = String(opts.indication || "this indication").trim() || "this indication";
  const lines = [
    "# Graveyard Memo — Prior Terminated Programs",
    "",
    `Citation-traced record of clinical programs in **${indication}** that were terminated, withdrawn, or suspended, with the stop reason each sponsor reported. Every entry resolves to a real ClinicalTrials.gov record (NCT). Use it to avoid re-funding a path others have already abandoned.`,
    ""
  ];
  lines.push(...coverageBlock(trials, stoppedTrials, indication));
  lines.push("");

  if (trials.length === 0) {
    lines.push("_No terminated/withdrawn/suspended trials were retrieved for this indication at generation time._", "");
    return { count: 0, markdown: lines.join("\n") };
  }
  for (const t of trials) {
    lines.push(`### ${t.title || t.nctId}`);
    const m = [t.nctId, t.status, t.phase ? `Phase ${t.phase}` : ""].filter(Boolean).join(" · ");
    if (m) lines.push(`*${m}*`);
    lines.push(`- **Stop reason:** ${t.whyStopped ? t.whyStopped : "_(none stated by sponsor)_"}`);
    if (t.changeSummary && t.changeSummary.versions) {
      lines.push(`- **Protocol churn:** ${t.changeSummary.versions} versions; most-amended: ${(t.changeSummary.amended_modules || []).join(", ") || "n/a"}`);
    }
    lines.push(`- **Source:** https://clinicaltrials.gov/study/${t.nctId}`);
    lines.push("");
  }
  return { count: trials.length, markdown: lines.join("\n") };
}

// ── THE SECTION'S AVAILABILITY IS DISCLOSED, NEVER SILENT (2026-10-08) ────────────────────────
// The band is only as good as the version history behind it, and that history comes from an
// undocumented registry endpoint that can refuse: the first real run had every request answered
// HTTP 403. This function used to filter to trials carrying history, find none, and return an empty
// string - so the shipped memo had no amendment section and nothing said why, which a reader cannot
// tell apart from "this indication has low amendment risk". Four states, always distinguishable:
//   ok            every requested history came back
//   partial       the band is computed from what came back, and a "Retrieval gap" line says what didn't
//   unavailable   history was requested and none came back: the section states that, with the cause
//   not_computed  nothing was requested (history switched off, or no coverage metadata): no section
// How many were requested comes from the fetcher's accounting; how many came back is COUNTED FROM
// THE DATA, so the notice can never disagree with the band printed beside it.
function historyCauses(failed, emptyAnswers, firstError) {
  const causes = [];
  if (failed > 0) {
    causes.push(`**${failed}** request(s) failed${firstError ? ` (first error: ${firstError})` : ""}`);
  }
  if (emptyAnswers > 0) {
    causes.push(`**${emptyAnswers}** returned no recorded protocol versions`);
  }
  return causes.join("; ");
}

function unavailableSection(attempted, failed, emptyAnswers, firstError) {
  return [
    "## Protocol Amendment-Risk Signal",
    "",
    `**Not available for this run.** Protocol version history was requested from ClinicalTrials.gov for **${attempted}** stopped program(s) and none came back: ${historyCauses(failed, emptyAnswers, firstError)}.`,
    "",
    "No amendment-risk band is stated, because none can be derived without version history. " +
    "**An absent band is a gap in the data, not a LOW result** - do not read this section as evidence " +
    "that comparable protocols were rarely amended.",
    ""
  ].join("\n");
}

function buildAmendmentRisk(stoppedTrials) {
  const trials = Array.isArray(stoppedTrials)
    ? stoppedTrials.filter((t) => t && t.changeSummary && Number(t.changeSummary.versions) > 0)
    : [];
  const attempted = Math.max(0, Number(meta(stoppedTrials, "historyAttempted", 0)) || 0);
  const failed = Math.max(0, Number(meta(stoppedTrials, "historyFailed", 0)) || 0);
  const firstError = String(meta(stoppedTrials, "historyFirstError", "") || "").trim();
  const missing = Math.max(0, attempted - trials.length);
  const emptyAnswers = Math.max(0, missing - failed);

  if (trials.length === 0) {
    if (attempted === 0) return { sampled: 0, band: null, status: "not_computed", markdown: "" };
    return {
      sampled: 0,
      band: null,
      status: "unavailable",
      markdown: unavailableSection(attempted, failed, emptyAnswers, firstError)
    };
  }

  const versions = trials.map((t) => Number(t.changeSummary.versions) || 0).sort((a, b) => a - b);
  const median = versions[Math.floor(versions.length / 2)];
  const max = versions[versions.length - 1];
  const moduleCounts = {};
  for (const t of trials) {
    for (const m of (Array.isArray(t.changeSummary.amended_modules) ? t.changeSummary.amended_modules : [])) {
      moduleCounts[m] = (moduleCounts[m] || 0) + 1;
    }
  }
  const topModules = Object.entries(moduleCounts)
    .sort((a, b) => b[1] - a[1]).slice(0, 5).map(([m, n]) => `${m} (${n})`);
  const band = median >= 10 ? "HIGH" : median >= 5 ? "MODERATE" : "LOW";

  const population = meta(stoppedTrials, "eligibleTotal", null);
  const selectionRule = meta(stoppedTrials, "historySelectionRule", "");
  // Same null-vs-0 trap as coverageBlock — check for absence before converting.
  const populationText = (population !== null && population !== undefined && Number.isFinite(Number(population)))
    ? `**${trials.length}** of the **${population}** stopped program(s) the query returned`
    : `**${trials.length}** comparable stopped trial(s)`;

  const lines = [
    "## Protocol Amendment-Risk Signal",
    "",
    `Across ${populationText} with version history, protocols were amended a **median of ${median}** times (max ${max}). **Amendment-risk: ${band}.**`,
    ""
  ];

  if (missing > 0) {
    lines.push(
      `**Retrieval gap.** Version history was requested for **${attempted}** stopped program(s) and came back for ` +
      `**${trials.length}**: ${historyCauses(failed, emptyAnswers, firstError)}. ` +
      "The band is computed only from the programs that returned history.",
      ""
    );
  }

  lines.push(
    `Most-amended protocol modules (a draft touching these is likeliest to force a costly amendment): ${topModules.join(", ") || "n/a"}.`,
    ""
  );

  if (selectionRule) {
    lines.push(`**How this sample was chosen.** ${selectionRule}`, "");
  }

  lines.push(
    "**Three limits on this band, stated because they change how much weight it can carry:**",
    "",
    `1. **It is sample-size sensitive.** Measured on one ordered glioblastoma cohort, the same ` +
    `computation returned MODERATE at n=5 and n=8, LOW at n=10, MODERATE at n=20 and HIGH at n=40. ` +
    `This run used n=${trials.length}. Treat the band as a directional signal at this sample size, ` +
    "not a settled property of the indication.",
    `2. **The sampling frame is survivorship-inverted.** Every trial counted here was terminated, ` +
    "withdrawn, or suspended. Programs that ran to completion contribute nothing, so this is the " +
    "amendment rate for comparable programs **that died** — not a general amendment rate for the " +
    "indication. A larger sample makes it more precise, never more representative.",
    "3. **The LOW / MODERATE / HIGH thresholds are an internal heuristic** (median ≥ 10 → HIGH, " +
    "≥ 5 → MODERATE) with no published basis.",
    ""
  );
  return { sampled: trials.length, median, max, band, status: missing > 0 ? "partial" : "ok", markdown: lines.join("\n") };
}

module.exports = { buildGraveyardMemo, buildAmendmentRisk };
