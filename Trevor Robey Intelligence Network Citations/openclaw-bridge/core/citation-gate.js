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
const {
  extractCitations, extractCitationSpans, deduplicateCitations, crossCheckCitations, groundingKey
} = require("./citation-extractor.js");
const { insertionPoint } = require("./citation-attribution.js");

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

// T1-5 (2026-11-14): the union of the TYPE:ID keys of everything retrieved at runtime
// (metadata.fetched_citation_keys), or null when ANY readable sidecar lacks the array — a resumed
// mission, or one written before the keys existed. Then the whole report falls back to id-only
// matching, and the gate result says so (grounding_match "id_only"): one untyped section cannot be
// type-checked, and mixing the two rules would ground the same id differently in one report.
function collectFetchedKeys(subtaskResults, readFile = fs.readFileSync) {
  const keys = new Set();
  for (const st of Array.isArray(subtaskResults) ? subtaskResults : []) {
    if (!st || !st.metadata_path) continue;
    let meta;
    try { meta = JSON.parse(readFile(st.metadata_path, "utf8")); } catch { continue; /* unreadable: no ground truth either way */ }
    if (!meta || !Array.isArray(meta.fetched_citation_keys)) return null;
    for (const k of meta.fetched_citation_keys) keys.add(String(k).toUpperCase());
  }
  return [...keys];
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

// ── [UNVERIFIED] marks (T1-3, 2026-11-14) ────────────────────────────────────────────────────────
// Every mention of an untraced TYPE:ID gets one mark, anchored to the extractor's own span (so
// "PMID: 5" never tags a bare 5, and an untraced 12345678 is never tagged inside "CID 112345678"),
// placed after a whole wiki-link, markdown link or URL (citation-attribution.js insertionPoint).
// Before this, only the FIRST raw-substring match per id was replaced, case-sensitively — the sealed
// offer-7e373eb2de36a7a2e73e7c1c report marked 2 of an untraced DOI's 4 mentions, one inside the
// wiki-link's brackets. A second pass changes nothing: a mention already followed by the mark (after
// any attribution mark) is skipped, and the appended verification list is never re-marked.
const UNVERIFIED_MARK = "[UNVERIFIED]";
const VERIFICATION_HEADER = "\n\n## ⚠️ Citation Verification\n\n";
const ALREADY_MARKED = /(?:[ \t]*\[ATTRIBUTION MISMATCH:[^\]\n]*\])*[ \t]*\[UNVERIFIED\]/y;

// The appended verification lists (header, intro line, "- TYPE: ID" bullets). An assembled report
// carries one per annotated section, mid-text, so only these blocks are skipped, never what follows.
function verificationListRanges(text) {
  const ranges = [];
  let from = 0;
  for (;;) {
    const start = text.indexOf(VERIFICATION_HEADER, from);
    if (start < 0) break;
    let j = start + VERIFICATION_HEADER.length;
    const introEnd = text.indexOf("\n", j);
    j = introEnd < 0 ? text.length : introEnd + 1;
    while (j < text.length && text[j] === "\n") j++;
    while (j < text.length && text.startsWith("- ", j)) {
      const e = text.indexOf("\n", j);
      j = e < 0 ? text.length : e + 1;
    }
    ranges.push([start, j]);
    from = j;
  }
  return ranges;
}

// Mentions in the body: every span outside the appended verification lists.
function bodySpans(text) {
  const lists = verificationListRanges(text);
  return extractCitationSpans(text).filter((s) => !lists.some(([a, b]) => s.start >= a && s.start < b));
}

// The text index where a mention's mark belongs.
function markPosition(text, span) {
  const lineStart = text.lastIndexOf("\n", span.start - 1) + 1;
  let lineEnd = text.indexOf("\n", span.start);
  if (lineEnd < 0) lineEnd = text.length;
  const line = text.slice(lineStart, lineEnd);
  return lineStart + insertionPoint(line, span.start - lineStart, span.end - lineStart);
}

function isMarkedAt(text, at) {
  ALREADY_MARKED.lastIndex = at;
  return ALREADY_MARKED.test(text);
}

// Untraced mentions in the body that carry no mark. 0 after a successful annotation.
function countUnmarkedUntraced(text, untracedKeys) {
  const s = String(text || "");
  let n = 0;
  for (const span of bodySpans(s)) {
    if (untracedKeys.has(groundingKey(span)) && !isMarkedAt(s, markPosition(s, span))) n++;
  }
  return n;
}

// Inline-mark every mention of each ungrounded identifier with [UNVERIFIED] and append a
// verification summary (once).
function annotateUngrounded(reportText, ungroundedList) {
  let out = String(reportText || "");
  const list = Array.isArray(ungroundedList) ? ungroundedList : [];
  if (list.length === 0) return out;
  const untraced = new Set(list.map((c) => groundingKey(c)));
  const positions = new Set();
  for (const span of bodySpans(out)) {
    if (untraced.has(groundingKey(span))) positions.add(markPosition(out, span));
  }
  // Right to left, so an insertion never moves a position still to be marked.
  for (const at of [...positions].sort((a, b) => b - a)) {
    if (isMarkedAt(out, at)) continue;
    out = `${out.slice(0, at)} ${UNVERIFIED_MARK}${out.slice(at)}`;
  }
  if (!out.includes(VERIFICATION_HEADER)) {
    out += VERIFICATION_HEADER +
      "The following cited identifiers were NOT found in the evidence fetched at runtime and are flagged **UNVERIFIED**. " +
      "Per the zero-fabrication policy, treat each as unconfirmed until independently checked — they must not be presented as verified citations.\n\n" +
      list.map((c) => `- ${c.type}: ${c.id}`).join("\n") + "\n";
  }
  return out;
}

// Annotate each subtask's output file in place so the SHIPPED bundle carries the [UNVERIFIED] marks
// (each section checked against the union of fetched ids). `opts.fetchedKeys` (T1-5): the gate's
// TYPE:ID keys, so a section is marked by the same rule the gate counted with (null = id-only).
// FAIL-CLOSED (T1-3): after each write the file is re-read and every untraced mention must carry its
// mark; a section with an unmarked mention, or any read or write error, is returned in `failed`, and
// the engine refuses to ship (PHASE30_CITATION_ANNOTATE_FAILED). Write errors used to be swallowed.
function annotateSubtaskOutputs(subtaskResults, fetchedIds, opts = {}) {
  const readFile = opts.readFile || fs.readFileSync;
  const writeFile = opts.writeFile || fs.writeFileSync;
  const knownKeys = Array.isArray(opts.fetchedKeys) ? opts.fetchedKeys : undefined;
  let annotated = 0;
  const failed = [];
  for (const st of Array.isArray(subtaskResults) ? subtaskResults : []) {
    if (!st || !st.output_path) continue;
    const label = String(st.task_id || st.subtask_id || st.output_path);
    try {
      const text = readFile(st.output_path, "utf8");
      const x = crossCheckCitations(text, fetchedIds, { knownKeys });
      if (x.unverified_count === 0) continue;
      const untraced = new Set(x.unverified.map((c) => groundingKey(c)));
      const next = annotateUngrounded(text, x.unverified);
      if (next !== text) {
        writeFile(st.output_path, next);
        annotated++;
      }
      if (countUnmarkedUntraced(readFile(st.output_path, "utf8"), untraced) > 0) failed.push(label);
    } catch {
      failed.push(label);
    }
  }
  return { annotated, failed };
}

// Verify an assembled report's citations against the fetched ground-truth set.
function verifyReportCitations(opts = {}) {
  const subtaskResults = opts.subtaskResults;
  const readFile = opts.readFile;
  const threshold = effectiveGroundedFloor(opts.minGroundedRatio);
  const evidenceRequired = opts.evidenceRequired !== false; // Q1: default true — every shipping template needs evidence
  const fetchedIds = collectFetchedIds(subtaskResults, readFile);
  const fetchedKeys = collectFetchedKeys(subtaskResults, readFile); // T1-5: null = id-only fallback
  const reportText = collectReportText(subtaskResults, readFile);
  const list = Array.isArray(subtaskResults) ? subtaskResults : [];
  const deskSections = list.filter((st) => isDeskAuthoredSubtask(st, readFile));
  // The ratio is computed over model-written text; with no desk section this IS the full report.
  const gatedText = deskSections.length > 0
    ? collectReportText(list.filter((st) => !deskSections.includes(st)), readFile)
    : reportText;
  const x = crossCheckCitations(gatedText, fetchedIds, { knownKeys: fetchedKeys || undefined });
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
    // T1-5: "type_and_id" when every readable sidecar carried TYPE:ID keys, else "id_only".
    grounding_match: x.grounding_match,
    desk_authored_sections: deskSections.map((st) => String(st.task_id || st.subtask_id || "")),
    fetchedIds,
    fetchedKeys,
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
  // deduplicateCitations compares DOIs case-insensitively (T1-4): "10.1056/NEJMoa…" and
  // "10.1056/nejmoa…" are one work, screened once.
  const cited = deduplicateCitations(extractCitations(String(reportText || "")));
  const dois = cited.filter((c) => c.type === "DOI").map((c) => c.id);
  const pmids = cited.filter((c) => c.type === "PMID").map((c) => c.id);

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
  collectFetchedKeys,
  collectReportText,
  isDeskAuthoredSubtask,
  annotateUngrounded,
  annotateSubtaskOutputs,
  countUnmarkedUntraced,
  verifyReportCitations,
  checkRetractions
};
