"use strict";

// citation-gate.js — Slice 1 of the post-research engine: the report-level citation gate.
//
// Verifies the assembled mission report against the UNION of runtime-fetched identifiers (the
// live ToolUniverse records, persisted per-task as metadata.fetched_citation_ids by
// agent-engine), and HARD-FAILS when too many cited identifiers are "ungrounded" — present in
// the report but absent from anything actually fetched, the signature of a model-introduced
// (hallucinated) citation. This is the enforcement backbone of the zero-fabrication brand
// promise: a report whose citations can't be traced to fetched evidence does not ship.
//
// Doctrine (operator ruling 2026-07-10 — "never hallucinate; be completely honest about whether
// there were any hits in the database"): the gate returns a THREE-STATE verdict, not a silent
// boolean. When evidence is required (the default for every shipping template):
//   • PASS                  — evidence was fetched, the report cites it, and the grounded ratio meets
//                             the configured floor (config/agent-config.json minGroundedCitationRatio).
//   • INSUFFICIENT_EVIDENCE — NO runtime evidence was fetched. "Cannot verify" is now a RECORDED,
//                             NON-SHIPPABLE verdict — never a silent pass. (This case previously
//                             auto-passed; that was the doctrine hole this ruling closes. It is still
//                             surfaced upstream as tool_prefetch_zero_docs, but now it also BLOCKS.)
//   • NO_CITATIONS          — evidence was fetched but the report cites nothing to ground.
//   • UNVERIFIED            — evidence + citations present, but too few cited ids are grounded.
// Only PASS is shippable. A template may opt out with evidenceRequired:false (none do today).

const fs = require("node:fs");
const { extractCitations, deduplicateCitations, crossCheckCitations } = require("./citation-extractor.js");

// Q7: the grounded-citation floor. config/agent-config.json `minGroundedCitationRatio` is the source
// of truth; this is the fail-CLOSED fallback (strict, not lax) used only when that config is absent
// or malformed. Kept here so citation-gate and workflow-engine agree on ONE number by construction.
const DEFAULT_MIN_GROUNDED_RATIO = 0.75;

// T1-6 (2026-11-14): configuration may TIGHTEN the floor, never loosen or switch it off. Only a number
// from DEFAULT_MIN_GROUNDED_RATIO to 1 is accepted; anything else (missing, null, "", false, 0, 0.5, a
// string, 1.5) resolves to the strict default and is reported as rejected. `Number(null)`, `Number("")`
// and `Number(false)` are all a FINITE 0, which is how a blanked config used to turn the floor off.
function resolveConfiguredGroundedFloor(raw) {
  const accepted = typeof raw === "number" && Number.isFinite(raw)
    && raw >= DEFAULT_MIN_GROUNDED_RATIO && raw <= 1;
  return accepted
    ? { value: raw, accepted: true }
    : { value: DEFAULT_MIN_GROUNDED_RATIO, accepted: false, rejected: raw === undefined ? "(missing)" : raw };
}

// The gate-level sanity check. Unit callers may pass a lower floor (the tests use 0.5); a floor that
// is non-finite, zero, negative or above 1 cannot be meant and is treated as absent (strict default).
function effectiveGroundedFloor(raw) {
  return Number.isFinite(raw) && raw > 0 && raw <= 1 ? raw : DEFAULT_MIN_GROUNDED_RATIO;
}

// PASS is decided on integers: verified × 1000 ≥ round(floor × 1000) × total. The ratio is rounded to
// three decimals for DISPLAY (citation-extractor.js), and comparing that rounded value let 752 grounded
// of 1003 cited (0.74975, shown as 0.75) pass a 0.75 floor. Neither rounding nor float error decides it.
function meetsGroundedFloor(verifiedCount, total, floor) {
  if (!(total > 0)) return false;
  return verifiedCount * 1000 >= Math.round(floor * 1000) * total;
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Union of live-fetched identifiers across every subtask's metadata sidecar.
function collectFetchedIds(subtaskResults, readFile = fs.readFileSync) {
  const ids = new Set();
  for (const st of Array.isArray(subtaskResults) ? subtaskResults : []) {
    if (!st || !st.metadata_path) continue;
    try {
      const meta = JSON.parse(readFile(st.metadata_path, "utf8"));
      const list = Array.isArray(meta.fetched_citation_ids) ? meta.fetched_citation_ids : [];
      for (const id of list) ids.add(String(id).toUpperCase());
    } catch { /* fail-soft: an unreadable sidecar just contributes no ground truth */ }
  }
  return [...ids];
}

// Evidence Desk (operator decision 2026-10-21). On the business lane the scout section is written
// deterministically by the Evidence Desk (metadata `authored_by: "evidence-desk"`). It cites only
// sources the run fetched, so it is grounded by construction — counting it would pad the grounded
// ratio and could carry weaker model-written sections over the floor. So the ratio judges MODEL text
// only. The desk section is still in `reportText`: it is retraction-screened, re-resolved, annotated
// and license-scanned like every other shipped section. Unreadable metadata counts as model text
// (the strict side).
const DESK_AUTHOR = "evidence-desk";

function isDeskAuthoredSubtask(subtask, readFile = fs.readFileSync) {
  if (!subtask || !subtask.metadata_path) return false;
  try {
    return JSON.parse(readFile(subtask.metadata_path, "utf8")).authored_by === DESK_AUTHOR;
  } catch {
    return false;
  }
}

// Concatenate all subtask outputs into the assembled report text.
function collectReportText(subtaskResults, readFile = fs.readFileSync) {
  const parts = [];
  for (const st of Array.isArray(subtaskResults) ? subtaskResults : []) {
    if (!st || !st.output_path) continue;
    try { parts.push(readFile(st.output_path, "utf8")); } catch { /* fail-soft */ }
  }
  return parts.join("\n\n");
}

// Inline-mark each ungrounded identifier with [UNVERIFIED] and append a verification summary.
function annotateUngrounded(reportText, ungroundedList) {
  let out = String(reportText || "");
  const seen = new Set();
  for (const c of Array.isArray(ungroundedList) ? ungroundedList : []) {
    const id = String(c.id);
    if (seen.has(id)) continue;
    seen.add(id);
    out = out.replace(new RegExp(escapeRegExp(id) + "(?!\\s*\\[UNVERIFIED\\])"), `${id} [UNVERIFIED]`);
  }
  if (Array.isArray(ungroundedList) && ungroundedList.length > 0) {
    out += "\n\n## ⚠️ Citation Verification\n\n" +
      "The following cited identifiers were NOT found in the evidence fetched at runtime and are flagged **UNVERIFIED**. " +
      "Per the zero-fabrication policy, treat each as unconfirmed until independently checked — they must not be presented as verified citations.\n\n" +
      ungroundedList.map((c) => `- ${c.type}: ${c.id}`).join("\n") + "\n";
  }
  return out;
}

// Annotate each subtask's output file in place so the SHIPPED bundle carries the [UNVERIFIED]
// marks (each section checked against the union of fetched ids). Fail-soft; returns count.
function annotateSubtaskOutputs(subtaskResults, fetchedIds, opts = {}) {
  const readFile = opts.readFile || fs.readFileSync;
  const writeFile = opts.writeFile || fs.writeFileSync;
  let annotated = 0;
  for (const st of Array.isArray(subtaskResults) ? subtaskResults : []) {
    if (!st || !st.output_path) continue;
    try {
      const text = readFile(st.output_path, "utf8");
      const x = crossCheckCitations(text, fetchedIds);
      if (x.unverified_count > 0) {
        writeFile(st.output_path, annotateUngrounded(text, x.unverified));
        annotated++;
      }
    } catch { /* fail-soft */ }
  }
  return annotated;
}

// Verify an assembled report's citations against the fetched ground-truth set.
function verifyReportCitations(opts = {}) {
  const subtaskResults = opts.subtaskResults;
  const readFile = opts.readFile;
  const threshold = effectiveGroundedFloor(opts.minGroundedRatio);
  const evidenceRequired = opts.evidenceRequired !== false; // Q1: default true — every shipping template needs evidence
  const fetchedIds = collectFetchedIds(subtaskResults, readFile);
  const reportText = collectReportText(subtaskResults, readFile);
  const list = Array.isArray(subtaskResults) ? subtaskResults : [];
  const deskSections = list.filter((st) => isDeskAuthoredSubtask(st, readFile));
  // The ratio is computed over model-written text; with no desk section this IS the full report.
  const gatedText = deskSections.length > 0
    ? collectReportText(list.filter((st) => !deskSections.includes(st)), readFile)
    : reportText;
  const x = crossCheckCitations(gatedText, fetchedIds);
  const hasEvidence = fetchedIds.length > 0;
  const hasCitations = x.total > 0;
  // Q1 three-state verdict — zero-evidence / zero-citation are RECORDED as non-shippable, not auto-passed.
  let verdict;
  if (hasEvidence && hasCitations) {
    verdict = meetsGroundedFloor(x.verified_count, x.total, threshold) ? "PASS" : "UNVERIFIED";
  } else if (!evidenceRequired) {
    verdict = "PASS"; // template explicitly declares evidence optional
  } else if (!hasEvidence) {
    verdict = "INSUFFICIENT_EVIDENCE"; // expected runtime evidence, fetched none — cannot verify, so cannot ship
  } else {
    verdict = "NO_CITATIONS"; // evidence existed but the report cited nothing to ground
  }
  const pass = verdict === "PASS";
  return {
    pass,
    verdict,
    evidence_required: evidenceRequired,
    cited: x.total,
    grounded: x.verified_count,
    ungrounded: x.unverified_count,
    grounded_ratio: x.verified_ratio,
    min_grounded_ratio: threshold,
    fetched_id_count: fetchedIds.length,
    ungrounded_list: x.unverified,
    desk_authored_sections: deskSections.map((st) => String(st.task_id || st.subtask_id || "")),
    fetchedIds,
    reportText,
    annotatedReport: annotateUngrounded(reportText, x.unverified)
  };
}

// Per-screen cap: bounds the outbound request cost of a single gate run. Anything beyond the cap
// is reported as `unscreened` rather than silently dropped (it used to be silently dropped while
// `dois_checked` still reported the FULL cited count — the ledger overstated its own coverage).
const MAX_IDS_PER_SCREEN = 50;

// Run one retraction screen over one identifier class, fail-soft.
//
// `complete` means EVERY cited id of this class received a definitive verdict. It is NOT merely
// "the checker did not throw" — the production checkers (crossref-retraction, pubmed-retraction)
// are fail-soft by contract and NEVER throw: on a 429/503/timeout they RESOLVE with rows carrying
// `checked:false`. Keying completeness off "didn't throw" therefore reported a screen as `checked`
// while zero identifiers had actually been screened, and that boolean is rendered verbatim into
// the customer-facing, checksum-sealed Reproducibility Manifest. Unknown must never read as clean.
//
// Incomplete for any of: absent checker, checker threw, source unreachable/rate-limited, or ids
// dropped by the per-screen cap. A retraction found by a partially-complete screen still surfaces —
// incompleteness suppresses the CLAIM of coverage, never a real finding.
async function runScreen(ids, checkFn, idKey) {
  if (ids.length === 0) return { complete: true, retracted: [], checked_count: 0, unscreened: 0, rows: [] };
  if (typeof checkFn !== "function") {
    return { complete: false, retracted: [], checked_count: 0, unscreened: ids.length, rows: [] };
  }
  const batch = ids.slice(0, MAX_IDS_PER_SCREEN);
  let results;
  try {
    results = await checkFn(batch);
  } catch {
    return { complete: false, retracted: [], checked_count: 0, unscreened: ids.length, rows: [] };
  }
  const rows = Array.isArray(results) ? results : [];
  const checked_count = rows.filter((r) => r && r.checked).length;
  return {
    complete: checked_count === ids.length,
    retracted: rows.filter((r) => r && r.retracted).map((r) => String(r[idKey])),
    checked_count,
    unscreened: ids.length - checked_count,
    rows   // per-id verdict rows, so a caller can reuse a verdict instead of re-fetching it
  };
}

// PubMed cross-screen for cited DOIs. Resolves EVERY cited DOI → PMID(s), checks their pubtypes,
// and returns a per-DOI PubMed verdict `{ pubmedRetracted, pubmedNotice }`. It serves two roles:
//   * ESCALATION — a DOI Crossref left clean but PubMed marks `Retracted Publication` (Wakefield
//     class: the publisher never deposited an `update-to` relation in Crossref).
//   * DISAMBIGUATION — Crossref's `update-to: [retraction]` cannot distinguish a retracted paper
//     from its retraction NOTICE (it appears on both; verified live 2026-07-10). PubMed's pubtype
//     can, so `pubmedNotice` lets the caller un-flag a Crossref-flagged notice.
//
// `applicable:false` when the resolver/PMID screen is not wired (2-/3-arg caller) — no effect on
// completeness, so those callers keep pure-Crossref behavior. Fail-soft: a transport failure in
// either leg yields `complete:false` (degrades the coverage CLAIM) and never a fabricated verdict.
// `knownVerdicts` (pmid → verdict row) lets the caller pass the directly-cited-PMID screen's rows
// so a PMID that is both cited directly AND resolved from a DOI is not fetched from NCBI twice.
async function screenDoisViaPubmed(dois, doiToPmid, checkPmids, knownVerdicts) {
  const perDoi = new Map();
  const known = knownVerdicts instanceof Map ? knownVerdicts : new Map();
  if (typeof doiToPmid !== "function" || typeof checkPmids !== "function") {
    return { applicable: false, complete: true, perDoi, escalated: 0 };
  }
  if (dois.length === 0) return { applicable: true, complete: true, perDoi, escalated: 0 };
  const batch = dois.slice(0, MAX_IDS_PER_SCREEN);
  let pairs;
  try {
    pairs = await doiToPmid(batch);
  } catch {
    return { applicable: true, complete: false, perDoi, escalated: 0 };
  }
  const rows = Array.isArray(pairs) ? pairs.filter((p) => p && p.doi) : [];
  // Full coverage requires every candidate DOI to have definitively resolved (a DOI not in PubMed
  // resolves to zero PMIDs but still counts as resolved) AND none dropped by the cap.
  const allResolved = batch.length === dois.length
    && rows.length === batch.length
    && rows.every((r) => r.resolved === true);

  const doiPmids = new Map();
  const pmidSet = new Set();
  for (const r of rows) {
    // Trust a row's PMIDs ONLY when the lookup DEFINITIVELY resolved. A `resolved:false` row is a
    // transport failure; using its pmids could manufacture a retraction from an unverified mapping.
    const ps = (r.resolved === true && Array.isArray(r.pmids)) ? r.pmids.map(String) : [];
    doiPmids.set(r.doi, ps);
    for (const p of ps) pmidSet.add(p);
  }
  const escalated = rows.filter((r) => r.resolved === true).length;

  // Verdicts we already have (from the direct-PMID screen) need no second fetch.
  const vById = new Map(known);
  const toCheck = [...pmidSet].filter((p) => !vById.has(p));
  const cappedToCheck = toCheck.slice(0, MAX_IDS_PER_SCREEN);   // bound outbound cost like runScreen
  const droppedByCap = toCheck.length > cappedToCheck.length;
  if (cappedToCheck.length > 0) {
    let verdicts;
    try {
      verdicts = await checkPmids(cappedToCheck);
    } catch {
      return { applicable: true, complete: false, perDoi, escalated };
    }
    for (const v of Array.isArray(verdicts) ? verdicts : []) {
      if (v && v.pmid != null) vById.set(String(v.pmid), v);
    }
  }
  // Complete iff every DOI resolved, nothing was dropped by the cap, and every resolved PMID has a
  // definitive verdict (reused-from-known or freshly fetched).
  const pmidComplete = !droppedByCap
    && [...pmidSet].every((p) => { const v = vById.get(p); return v && v.checked; });

  for (const [doi, ps] of doiPmids) {
    let retracted = false;
    let notice = false;
    for (const p of ps) {
      const v = vById.get(p);
      if (v && v.retracted) retracted = true;
      if (v && v.is_notice) notice = true;
    }
    // A record that is a retracted paper wins over the notice flag (defensive; they never co-occur).
    perDoi.set(doi, { pubmedRetracted: retracted, pubmedNotice: notice && !retracted });
  }
  return { applicable: true, complete: allResolved && pmidComplete, perDoi, escalated };
}

// Literature-integrity check: extract the report's cited DOIs and PMIDs and decide which are
// retracted. Fail-soft — any error yields no NEW retractions, so a network problem can never
// wrongly flag the report. A confirmed-retracted citation is a critical integrity failure (the
// gate treats it as a hard stop).
//
// No single source is sufficient, so DOIs are judged by Crossref AND PubMed together:
//   * DOI → Crossref. Misses retractions with no deposited `update-to`; also flags retraction
//     NOTICES because `update-to` can't tell a notice from a retracted paper.
//   * DOI → PMID → PubMed. Catches the Crossref misses (Wakefield class) and, via pubtype,
//     positively identifies retraction notices so a Crossref false-flag can be overridden.
//   * PMID → PubMed. Citations carrying a PMID and no DOI never reach Crossref at all.
// Per-DOI rule: retracted = pubmedRetracted OR (crossFlagged AND NOT pubmedNotice). PubMed's
// notice identification is the ONLY thing that overrides a Crossref flag; under a PubMed outage a
// Crossref flag stands (fail-closed on the retraction axis).
// `checkPmids` and `doiToPmid` are optional so existing 2-/3-argument callers keep prior behavior.
async function checkRetractions(reportText, checkDois, checkPmids, doiToPmid) {
  if (typeof checkDois !== "function" && typeof checkPmids !== "function") {
    return { checked: false, retracted: [] };
  }
  const cited = extractCitations(String(reportText || ""));
  const dois = [...new Set(cited.filter((c) => c.type === "DOI").map((c) => c.id))];
  const pmids = [...new Set(cited.filter((c) => c.type === "PMID").map((c) => c.id))];

  const doiScreen = await runScreen(dois, checkDois, "doi");
  const pmidScreen = await runScreen(pmids, checkPmids, "pmid");
  const crossFlagged = new Set(doiScreen.retracted);

  // Reuse the direct-PMID verdicts so a PMID cited both directly and via a DOI is not fetched twice.
  const directVerdicts = new Map(
    (pmidScreen.rows || []).filter((r) => r && r.pmid != null).map((r) => [String(r.pmid), r])
  );
  const pubmed = await screenDoisViaPubmed(dois, doiToPmid, checkPmids, directVerdicts);

  const retracted_dois = dois.filter((doi) => {
    const v = pubmed.perDoi.get(doi) || {};
    return v.pubmedRetracted || (crossFlagged.has(doi) && !v.pubmedNotice);
  });
  // DOIs caught by the PubMed escalation that Crossref did not flag.
  const retracted_dois_via_pmid = retracted_dois.filter((doi) => !crossFlagged.has(doi));
  // Crossref-flagged DOIs that PubMed positively identified as retraction notices → not retracted.
  const unflagged_notice_dois = [...crossFlagged].filter((doi) => !retracted_dois.includes(doi));

  return {
    // `checked` asserts full coverage of every cited identifier. A rate-limited or unreachable
    // source yields `false` here, never a silent "clean". It is a REPORTING flag only — it does
    // not gate delivery, so an outage degrades the claim, it does not block a passing report.
    checked: doiScreen.complete && pmidScreen.complete && pubmed.complete,
    retracted: [...retracted_dois, ...pmidScreen.retracted],
    retracted_dois,
    retracted_pmids: pmidScreen.retracted,
    retracted_dois_via_pmid,
    unflagged_notice_dois,
    dois_checked: doiScreen.checked_count,
    pmids_checked: pmidScreen.checked_count,
    dois_escalated_via_pmid: pubmed.escalated,
    dois_cited: dois.length,
    pmids_cited: pmids.length,
    unscreened: doiScreen.unscreened + pmidScreen.unscreened
  };
}

module.exports = {
  DEFAULT_MIN_GROUNDED_RATIO,
  resolveConfiguredGroundedFloor,
  effectiveGroundedFloor,
  meetsGroundedFloor,
  collectFetchedIds,
  collectReportText,
  isDeskAuthoredSubtask,
  annotateUngrounded,
  annotateSubtaskOutputs,
  verifyReportCitations,
  checkRetractions
};
