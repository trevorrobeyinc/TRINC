"use strict";

// graveyard-memo.js — Slice 3 v2: the structured "kill-memo" deliverables, rendered
// DETERMINISTICALLY from the runtime-fetched ClinicalTrials.gov stopped-trial records (each
// NCT-traced). Per the cost-cutting research brief these are the cost-AVOIDANCE products:
//   - Graveyard memo: prior terminated/withdrawn programs in the indication + why each died.
//   - Amendment-risk signal: how much comparable trials churned their protocols (from the
//     change-history), i.e. how likely a fresh protocol is to need a costly amendment.
// No LLM — the fetched data IS the artifact, so every claim is verifiable against a real record.

function buildGraveyardMemo(stoppedTrials, opts = {}) {
  const trials = Array.isArray(stoppedTrials) ? stoppedTrials.filter((t) => t && t.nctId) : [];
  const indication = String(opts.indication || "this indication").trim() || "this indication";
  const lines = [
    "# Graveyard Memo — Prior Terminated Programs",
    "",
    `Citation-traced record of clinical programs in **${indication}** that were terminated, withdrawn, or suspended, with the stop reason each sponsor reported. Every entry resolves to a real ClinicalTrials.gov record (NCT). Use it to avoid re-funding a path others have already abandoned.`,
    "",
    `**${trials.length} stopped program(s) retrieved.**`,
    ""
  ];
  if (trials.length === 0) {
    lines.push("_No terminated/withdrawn/suspended trials were retrieved for this indication at generation time._", "");
    return { count: 0, markdown: lines.join("\n") };
  }
  for (const t of trials) {
    lines.push(`### ${t.title || t.nctId}`);
    const meta = [t.nctId, t.status, t.phase ? `Phase ${t.phase}` : ""].filter(Boolean).join(" · ");
    if (meta) lines.push(`*${meta}*`);
    lines.push(`- **Stop reason:** ${t.whyStopped ? t.whyStopped : "_(none stated by sponsor)_"}`);
    if (t.changeSummary && t.changeSummary.versions) {
      lines.push(`- **Protocol churn:** ${t.changeSummary.versions} versions; most-amended: ${(t.changeSummary.amended_modules || []).join(", ") || "n/a"}`);
    }
    lines.push(`- **Source:** https://clinicaltrials.gov/study/${t.nctId}`);
    lines.push("");
  }
  return { count: trials.length, markdown: lines.join("\n") };
}

function buildAmendmentRisk(stoppedTrials) {
  const trials = Array.isArray(stoppedTrials)
    ? stoppedTrials.filter((t) => t && t.changeSummary && Number(t.changeSummary.versions) > 0)
    : [];
  if (trials.length === 0) return { sampled: 0, markdown: "" };

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

  const lines = [
    "## Protocol Amendment-Risk Signal",
    "",
    `Across **${trials.length}** comparable stopped trial(s) with version history, protocols were amended a **median of ${median}** times (max ${max}). **Amendment-risk: ${band}.**`,
    "",
    `Most-amended protocol modules (a draft touching these is likeliest to force a costly amendment): ${topModules.join(", ") || "n/a"}.`,
    ""
  ];
  return { sampled: trials.length, median, max, band, markdown: lines.join("\n") };
}

module.exports = { buildGraveyardMemo, buildAmendmentRisk };
