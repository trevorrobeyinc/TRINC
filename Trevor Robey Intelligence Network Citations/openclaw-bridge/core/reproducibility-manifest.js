"use strict";

// reproducibility-manifest.js — assembles ONE delivery artifact + delivery decision from:
//   (a) citation-reresolver results (live re-resolution at delivery),
//   (b) the existing crossref-retraction screen output, and
//   (c) the existing citation-gate ground-truth cross-check.
// Produces the Reproducibility Manifest (JSON) + a human Markdown render, and the truthful
// delivery_decision that controls which strength of public claim the packager may emit.
//
// Delivery-decision policy (fail-closed on CLAIMS, fail-soft on infrastructure):
//   BLOCK              — any UNRESOLVED citation (a live DB says the id does not exist = the
//                        fabrication signature), any retracted DOI, or a gate hard-fail.
//   DELIVER_WITH_FLAGS — ships, but only the count-scoped "UNCHECKED-honest" claim is allowed,
//                        when unchecked_ratio > max_unchecked_ratio.
//   DELIVER            — full-strength claim allowed ONLY at 100% VERIFIED (0 unresolved, 0 unchecked,
//                        no retractions, gate passes).

const DECISION = Object.freeze({ DELIVER: "DELIVER", DELIVER_WITH_FLAGS: "DELIVER_WITH_FLAGS", BLOCK: "BLOCK" });
const NETWORK_UNCHECKED = new Set(["network_error", "timeout", "rate_limited", "http_5xx"]);

function round3(n) { return Math.round((Number(n) || 0) * 1000) / 1000; }

function buildReproducibilityManifest(input = {}) {
  const reresolved = Array.isArray(input.reresolved) ? input.reresolved : [];
  const retraction = input.retraction || { checked: false, retracted_dois: [] };
  const gate = input.gate || null;
  const meta = input.meta || {};
  const thresholds = {
    max_unchecked_ratio: Number.isFinite(input.thresholds && input.thresholds.max_unchecked_ratio)
      ? input.thresholds.max_unchecked_ratio : 0,
    block_on_unresolved: input.thresholds && input.thresholds.block_on_unresolved === false ? false : true,
  };
  const groundedIds = input.groundedIds
    ? new Set([...input.groundedIds].map((x) => String(x).toUpperCase()))
    : null;

  const citations = reresolved.map((r) => ({
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
  }));

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

  const retracted_dois = Array.isArray(retraction.retracted_dois) ? retraction.retracted_dois : [];
  const block_reasons = [];
  if (thresholds.block_on_unresolved && counts.unresolved > 0) block_reasons.push("unresolved_present");
  if (retracted_dois.length > 0) block_reasons.push("retracted_doi");
  if (gate && gate.hardFail) block_reasons.push("gate_fail");

  let delivery_decision;
  if (block_reasons.length > 0) {
    delivery_decision = DECISION.BLOCK;
  } else if (unchecked_ratio > thresholds.max_unchecked_ratio) {
    delivery_decision = DECISION.DELIVER_WITH_FLAGS;
    block_reasons.push("unchecked_over_threshold");
  } else {
    delivery_decision = DECISION.DELIVER;
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
    retraction_screen: { checked: Boolean(retraction.checked), retracted_dois },
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

  return { citations, summary };
}

function renderManifestMarkdown(manifest) {
  const m = manifest || {};
  const s = m.summary || {};
  const c = s.counts || { total: 0, verified: 0, unresolved: 0, unchecked: 0 };
  const lines = [];
  lines.push("# Reproducibility Manifest");
  lines.push("");
  lines.push(`Delivery decision: **${s.delivery_decision || "n/a"}**` + (Array.isArray(s.block_reasons) && s.block_reasons.length ? ` (${s.block_reasons.join(", ")})` : ""));
  if (s.as_of) lines.push(`As of: ${s.as_of}`);
  lines.push("");
  lines.push(`Citations re-resolved at delivery: **${c.verified} VERIFIED · ${c.unresolved} UNRESOLVED · ${c.unchecked} UNCHECKED** of ${c.total} (verified ratio ${s.verified_ratio}).`);
  if (s.retraction_screen) lines.push(`Retraction screen: ${s.retraction_screen.checked ? "checked" : "not checked"}; retracted DOIs: ${(s.retraction_screen.retracted_dois || []).length}.`);
  if (s.environment && s.environment.offline) lines.push("> NOTE: verification could not reach any registry this run (offline) — no identifier is reported VERIFIED.");
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
