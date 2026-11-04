"use strict";

// reproducibility-manifest.js — assembles ONE delivery artifact + delivery decision from:
//   (a) citation-reresolver results (live re-resolution at delivery),
//   (b) the existing crossref-retraction screen output, and
//   (c) the existing citation-gate ground-truth cross-check.
// Produces the Reproducibility Manifest (JSON) + a human Markdown render, and the truthful
// delivery_decision that controls which strength of public claim the packager may emit.
//
// Delivery-decision policy (fail-closed on CLAIMS, fail-soft on infrastructure). ONLY BLOCK stops a
// report from shipping; DELIVER and DELIVER_WITH_FLAGS BOTH ship — the difference is purely which
// strength of public claim the packager may emit. So `block_reasons` is reserved for HARD stops; a
// soft disclosure that merely restricts the claim goes in `flag_reasons` (Q8 — a report that ships
// must never list a "block reason").
//   BLOCK              — hard stop, does NOT ship: any UNRESOLVED citation (a live registry says the id
//                        does not exist = the fabrication signature), any retracted DOI/PMID, or a
//                        gate hard-fail.
//   DELIVER_WITH_FLAGS — SHIPS with a restricted claim, for either (or both) of two flag_reasons:
//                        "unchecked_over_threshold" — unchecked_ratio > max_unchecked_ratio: the report
//                        is still fully GROUNDED, some ids just could not be re-resolved (network);
//                        "attribution_mismatch" (2026-11-04) — every id may be VERIFIED, but the
//                        author or year written beside one or more of them is not the registry's
//                        (citation-attribution.js). Operator decision: flag and mark inline, never block.
//   DELIVER            — SHIPS; the full-strength "every cited id independently re-resolved" claim is
//                        allowed ONLY at 100% VERIFIED (0 unresolved, 0 unchecked, no retractions,
//                        gate passes) AND no attribution mismatch.
// Q8 policy: max_unchecked_ratio defaults to 0, and this is DOCTRINE-REQUIRED, not a tunable quality
// dial — the full-strength DELIVER claim asserts "every id was re-resolved," so any tolerance > 0
// would let that claim appear when it is untrue (a label overclaim). To earn more clean DELIVERs,
// make the re-resolver more resilient (retry transient timeouts) — never lower this bar.

const DECISION = Object.freeze({ DELIVER: "DELIVER", DELIVER_WITH_FLAGS: "DELIVER_WITH_FLAGS", BLOCK: "BLOCK" });
const NETWORK_UNCHECKED = new Set(["network_error", "timeout", "rate_limited", "http_5xx"]);

function round3(n) { return Math.round((Number(n) || 0) * 1000) / 1000; }

function buildReproducibilityManifest(input = {}) {
  const reresolved = Array.isArray(input.reresolved) ? input.reresolved : [];
  const retraction = input.retraction || { checked: false, retracted_dois: [] };
  const gate = input.gate || null;
  const meta = input.meta || {};
  const thresholds = {
    // Q8: 0 is doctrine-required (see header) — any unchecked id forfeits the full-strength DELIVER
    // claim. Overridable via input.thresholds for tests; a production value > 0 would overclaim.
    max_unchecked_ratio: Number.isFinite(input.thresholds && input.thresholds.max_unchecked_ratio)
      ? input.thresholds.max_unchecked_ratio : 0,
    block_on_unresolved: input.thresholds && input.thresholds.block_on_unresolved === false ? false : true,
  };
  const groundedIds = input.groundedIds
    ? new Set([...input.groundedIds].map((x) => String(x).toUpperCase()))
    : null;

  // Attribution check (citation-attribution.js, 2026-11-04): optional, so a manifest built without it
  // is byte-identical to before. When present, each DOI/PMID carries what the report wrote beside it
  // and what the registry lists.
  const attribution = input.attribution && typeof input.attribution === "object" ? input.attribution : null;
  const attributionById = new Map();
  if (attribution && Array.isArray(attribution.results)) {
    for (const a of attribution.results) {
      if (a && a.id) attributionById.set(`${a.type}:${String(a.id).toUpperCase()}`, a);
    }
  }

  const citations = reresolved.map((r) => {
    const c = {
      id: r.id,
      type: r.type,
      status: r.status,
      resolver_type: r.resolver_type || "primary",
      resolved_url: r.resolved_url || null,
      http_status: r.http_status == null ? null : r.http_status,
      checked_at: r.checked_at || null,
      evidence: r.evidence || {},
      grounded_in_run: groundedIds ? groundedIds.has(String(r.id).toUpperCase()) : null,
      attempts: r.attempts || 1,
    };
    const a = attributionById.get(`${r.type}:${String(r.id).toUpperCase()}`);
    if (a) {
      c.attribution = {
        status: a.status,
        reason: a.reason || null,
        written: a.written || null,
        registry_label: a.registry_label || null,
      };
    }
    return c;
  });

  const counts = { total: citations.length, verified: 0, unresolved: 0, unchecked: 0 };
  const by_type = {};
  for (const c of citations) {
    const bucket = c.status === "VERIFIED" ? "verified" : c.status === "UNRESOLVED" ? "unresolved" : "unchecked";
    counts[bucket] += 1;
    if (!by_type[c.type]) by_type[c.type] = { total: 0, verified: 0, unresolved: 0, unchecked: 0 };
    by_type[c.type].total += 1;
    by_type[c.type][bucket] += 1;
  }

  const verified_ratio = counts.total ? round3(counts.verified / counts.total) : 0;
  const unresolved_ratio = counts.total ? round3(counts.unresolved / counts.total) : 0;
  const unchecked_ratio = counts.total ? round3(counts.unchecked / counts.total) : 0;

  const offline = counts.total > 0
    && counts.unchecked === counts.total
    && citations.every((c) => NETWORK_UNCHECKED.has((c.evidence && c.evidence.reason) || ""));

  // Retractions are screened per identifier class (DOIs via Crossref, PMIDs via PubMed). Keep the
  // classes distinct: merging them into `retracted_dois` mislabels a retracted PMID as a DOI in a
  // customer-facing, checksum-sealed document. Either class blocks delivery.
  const retracted_dois = Array.isArray(retraction.retracted_dois) ? retraction.retracted_dois : [];
  const retracted_pmids = Array.isArray(retraction.retracted_pmids) ? retraction.retracted_pmids : [];
  const block_reasons = [];
  const flag_reasons = []; // Q8: soft disclosures that RESTRICT the claim but still SHIP (never block)
  if (thresholds.block_on_unresolved && counts.unresolved > 0) block_reasons.push("unresolved_present");
  if (retracted_dois.length > 0) block_reasons.push("retracted_doi");
  if (retracted_pmids.length > 0) block_reasons.push("retracted_pmid");
  if (gate && gate.hardFail) block_reasons.push("gate_fail");

  // An attribution mismatch is a soft disclosure (operator decision 2026-11-04: flag and mark inline,
  // never block): the identifier is real and grounded, the author or year written beside it is not
  // the registry's. It restricts the claim exactly like an unchecked id does.
  const attributionMismatches = attribution && Array.isArray(attribution.results)
    ? attribution.results.filter((a) => a && (a.status === "author_mismatch" || a.status === "year_mismatch"))
    : [];

  let delivery_decision;
  if (block_reasons.length > 0) {
    delivery_decision = DECISION.BLOCK;
  } else {
    if (unchecked_ratio > thresholds.max_unchecked_ratio) flag_reasons.push("unchecked_over_threshold");
    if (attributionMismatches.length > 0) flag_reasons.push("attribution_mismatch");
    delivery_decision = flag_reasons.length > 0 ? DECISION.DELIVER_WITH_FLAGS : DECISION.DELIVER;
  }

  const summary = {
    report_id: meta.reportId || null,
    delivery_id: meta.deliveryId || null,
    engine_version: meta.engineVersion || null,
    resolver_table_version: meta.resolverTableVersion || null,
    as_of: meta.asOf || null,
    verification_started_at: meta.startedAt || null,
    verification_completed_at: meta.completedAt || null,
    counts,
    by_type,
    verified_ratio,
    unresolved_ratio,
    unchecked_ratio,
    delivery_decision,
    block_reasons,
    flag_reasons,
    retraction_screen: { checked: Boolean(retraction.checked), retracted_dois, retracted_pmids },
    gate_crosscheck: gate
      ? {
          cited: gate.cited == null ? null : gate.cited,
          grounded: gate.grounded == null ? null : gate.grounded,
          ungrounded: gate.ungrounded == null ? null : gate.ungrounded,
          grounded_ratio: gate.grounded_ratio == null ? null : gate.grounded_ratio,
          min_grounded_ratio: gate.min_grounded_ratio == null ? null : gate.min_grounded_ratio,
        }
      : null,
    thresholds,
    environment: { offline },
  };
  // Recorded when the check ran over at least one DOI / PMID, or when it could not run at all. A
  // report with no DOI or PMID (the business lane's WEB / SEC / statistics ids) gets no section.
  const attributionCited = attribution && attribution.counts && Number.isFinite(attribution.counts.cited)
    ? attribution.counts.cited : 0;
  if (attribution && (attribution.checked !== true || attributionCited > 0)) {
    summary.attribution_check = {
      checked: attribution.checked === true,
      counts: attribution.counts || null,
      mismatches: attributionMismatches.map((a) => ({
        id: a.id,
        type: a.type,
        kind: a.status,
        written: a.written || null,
        registry_label: a.registry_label || null,
      })),
      // Lines actually marked in the shipped sections; set by the engine after annotation.
      marked_lines: Number.isFinite(attribution.marked_lines) ? attribution.marked_lines : null,
      // A fixed reason code only — never an exception message — because this file ships.
      error: attribution.error ? String(attribution.error) : null,
    };
  }

  return { citations, summary };
}

function renderManifestMarkdown(manifest) {
  const m = manifest || {};
  const s = m.summary || {};
  const c = s.counts || { total: 0, verified: 0, unresolved: 0, unchecked: 0 };
  const lines = [];
  lines.push("# Reproducibility Manifest");
  lines.push("");
  lines.push(`Delivery decision: **${s.delivery_decision || "n/a"}**`
    + (Array.isArray(s.block_reasons) && s.block_reasons.length ? ` — blocked: ${s.block_reasons.join(", ")}` : "")
    + (Array.isArray(s.flag_reasons) && s.flag_reasons.length ? ` — flags: ${s.flag_reasons.join(", ")}` : ""));
  const flags = Array.isArray(s.flag_reasons) ? s.flag_reasons : [];
  if (s.delivery_decision === "DELIVER_WITH_FLAGS" && (flags.includes("unchecked_over_threshold") || !flags.includes("attribution_mismatch"))) {
    lines.push("> This report SHIPS. DELIVER_WITH_FLAGS means some cited identifiers could not be independently re-resolved at delivery time (a network/throttle limit at re-resolution, NOT a defect): the report remains fully GROUNDED — every cited id was present in the runtime-fetched evidence. Only an UNRESOLVED id (a live registry says it does not exist) or a retraction blocks delivery.");
  }
  if (s.delivery_decision === "DELIVER_WITH_FLAGS" && flags.includes("attribution_mismatch")) {
    const ac = s.attribution_check || {};
    const k = ac.counts || {};
    const n = Number.isFinite(k.mismatched_works) && k.mismatched_works > 0
      ? k.mismatched_works
      : (Array.isArray(ac.mismatches) ? ac.mismatches.length : 0);
    const where = Number.isFinite(ac.marked_lines) && ac.marked_lines > 0
      ? "marked [ATTRIBUTION MISMATCH] in the report and listed"
      : "listed";
    lines.push(`> This report SHIPS with a flag: ${n} cited work${n === 1 ? "" : "s"} resolve${n === 1 ? "s" : ""} to a real record, but the author or year written beside ${n === 1 ? "it" : "them"} is not the record's. ${n === 1 ? "It is" : "Each is"} ${where} under "Attribution check" below; correct the attribution before relying on it.`);
  }
  if (s.as_of) lines.push(`As of: ${s.as_of}`);
  lines.push("");
  lines.push(`Citations re-resolved at delivery: **${c.verified} VERIFIED · ${c.unresolved} UNRESOLVED · ${c.unchecked} UNCHECKED** of ${c.total} (verified ratio ${s.verified_ratio}).`);
  if (s.retraction_screen) {
    const rd = (s.retraction_screen.retracted_dois || []).length;
    const rp = (s.retraction_screen.retracted_pmids || []).length;
    lines.push(
      `Retraction screen: ${s.retraction_screen.checked ? "checked" : "INCOMPLETE — not every cited identifier could be screened"}; `
      + `retracted DOIs: ${rd}; retracted PMIDs: ${rp}.`
    );
  }
  if (s.environment && s.environment.offline) lines.push("> NOTE: verification could not reach any registry this run (offline) — no identifier is reported VERIFIED.");
  if (s.attribution_check) {
    const ac = s.attribution_check;
    const k = ac.counts || {};
    lines.push("");
    lines.push("## Attribution check");
    lines.push("");
    if (!ac.checked) {
      lines.push(`Not completed this run${ac.error ? ` (${ac.error})` : ""}: no attribution is asserted either way.`);
    } else {
      lines.push(`Author and year written beside each cited DOI / PMID, compared with its registry record (Crossref / NCBI): `
        + `${k.checked || 0} identifiers checked · ${k.matched || 0} match · ${k.mismatched || 0} mismatch`
        + `${Number.isFinite(k.mismatched_works) && k.mismatched_works > 0 && k.mismatched_works !== k.mismatched ? ` (${k.mismatched_works} cited works)` : ""}`
        + ` · ${k.not_checked || 0} not checkable (no single author named beside the identifier, or no registry author list).`);
      if (Array.isArray(ac.mismatches) && ac.mismatches.length > 0) {
        lines.push("");
        lines.push("| Type | Identifier | Report says | Registry lists | Result |");
        lines.push("|---|---|---|---|---|");
        for (const m of ac.mismatches) {
          const said = m.written ? `${m.written.name || ""}${m.written.year ? `, ${m.written.year}` : ""}` : "";
          lines.push(`| ${m.type} | ${m.id} | ${said} | ${m.registry_label || ""} | ${m.kind === "year_mismatch" ? "year mismatch" : "author mismatch"} |`);
        }
      }
      lines.push("");
      lines.push("_A citation is checked only where the report names a single author (\"X et al.\", \"X & Y\") beside it; a name matches when it is anywhere on the record's author list. This checks who wrote the cited work and when, not what the report says about it._");
    }
  }
  lines.push("");
  lines.push("| Type | Identifier | Status | HTTP | Resolved URL | Checked (UTC) |");
  lines.push("|---|---|---|---|---|---|");
  for (const cit of (m.citations || [])) {
    lines.push(`| ${cit.type} | ${cit.id} | ${cit.status} | ${cit.http_status == null ? "" : cit.http_status} | ${cit.resolved_url || ""} | ${cit.checked_at || ""} |`);
  }
  lines.push("");
  lines.push("_Each VERIFIED identifier resolved to an existing record in its issuing public registry at the time shown. Verification confirms the identifier RESOLVES — not the scientific correctness of the source. UNCHECKED = no definitive answer this run (network/throttle); never treated as verified._");
  return lines.join("\n");
}

module.exports = { buildReproducibilityManifest, renderManifestMarkdown, DECISION };
