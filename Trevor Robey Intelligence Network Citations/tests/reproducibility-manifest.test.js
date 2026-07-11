"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { buildReproducibilityManifest, renderManifestMarkdown } = require("../openclaw-bridge/core/reproducibility-manifest.js");

const META = { reportId: "r1", deliveryId: "d1", asOf: "2026-06-19", startedAt: "t0", completedAt: "t1" };
function cit(type, id, status, reason) {
  return { id, type, status, resolver_type: "primary", resolved_url: "https://x", http_status: 200, checked_at: "2026-06-19T00:00:00Z", evidence: reason ? { reason } : {}, attempts: 1 };
}

test("all verified -> DELIVER, counts sum", () => {
  const m = buildReproducibilityManifest({ reresolved: [cit("PMID", "1", "VERIFIED"), cit("NCT", "NCT00000102", "VERIFIED")], meta: META });
  assert.equal(m.summary.delivery_decision, "DELIVER");
  assert.equal(m.summary.counts.total, 2);
  assert.equal(m.summary.counts.verified + m.summary.counts.unresolved + m.summary.counts.unchecked, 2);
  assert.equal(m.summary.verified_ratio, 1);
});

test("any UNRESOLVED -> BLOCK (the fabrication signature)", () => {
  const m = buildReproducibilityManifest({ reresolved: [cit("PMID", "1", "VERIFIED"), cit("PMID", "999999999", "UNRESOLVED", "cannot_get_document_summary")], meta: META });
  assert.equal(m.summary.delivery_decision, "BLOCK");
  assert.ok(m.summary.block_reasons.includes("unresolved_present"));
});

test("UNCHECKED over default 0 tolerance -> DELIVER_WITH_FLAGS", () => {
  const m = buildReproducibilityManifest({ reresolved: [cit("PMID", "1", "VERIFIED"), cit("ChEMBL", "CHEMBL25", "UNCHECKED", "rate_limited")], meta: META });
  assert.equal(m.summary.delivery_decision, "DELIVER_WITH_FLAGS");
  assert.ok(m.summary.block_reasons.includes("unchecked_over_threshold"));
});

test("retracted DOI -> BLOCK", () => {
  const m = buildReproducibilityManifest({ reresolved: [cit("DOI", "10.x/y", "VERIFIED")], retraction: { checked: true, retracted_dois: ["10.x/y"] }, meta: META });
  assert.equal(m.summary.delivery_decision, "BLOCK");
  assert.ok(m.summary.block_reasons.includes("retracted_doi"));
});

test("retracted PMID -> BLOCK, and is labeled a PMID (never merged into retracted_dois)", () => {
  const m = buildReproducibilityManifest({ reresolved: [cit("PMID", "9500320", "VERIFIED")], retraction: { checked: true, retracted_dois: [], retracted_pmids: ["9500320"] }, meta: META });
  assert.equal(m.summary.delivery_decision, "BLOCK");
  assert.ok(m.summary.block_reasons.includes("retracted_pmid"));
  assert.deepEqual(m.summary.retraction_screen.retracted_dois, [], "a retracted PMID is not a retracted DOI");
  assert.deepEqual(m.summary.retraction_screen.retracted_pmids, ["9500320"]);
  assert.match(renderManifestMarkdown(m), /retracted DOIs: 0; retracted PMIDs: 1\./);
});

// An outage must degrade the CLAIM, not silently read as a clean screen, in the sealed manifest.
test("retraction screen incomplete -> manifest says INCOMPLETE, and still DELIVERs", () => {
  const m = buildReproducibilityManifest({ reresolved: [cit("PMID", "1", "VERIFIED")], retraction: { checked: false, retracted_dois: [], retracted_pmids: [] }, meta: META });
  assert.equal(m.summary.retraction_screen.checked, false);
  assert.equal(m.summary.delivery_decision, "DELIVER", "an unreachable source must never block a passing report");
  assert.match(renderManifestMarkdown(m), /Retraction screen: INCOMPLETE/);
});

test("gate hard-fail -> BLOCK", () => {
  const m = buildReproducibilityManifest({ reresolved: [cit("PMID", "1", "VERIFIED")], gate: { hardFail: true, cited: 10, grounded: 2, grounded_ratio: 0.2, min_grounded_ratio: 0.34 }, meta: META });
  assert.equal(m.summary.delivery_decision, "BLOCK");
  assert.ok(m.summary.block_reasons.includes("gate_fail"));
});

test("all network-UNCHECKED -> environment.offline true, never DELIVER", () => {
  const m = buildReproducibilityManifest({ reresolved: [cit("PMID", "1", "UNCHECKED", "network_error"), cit("NCT", "NCT1", "UNCHECKED", "timeout")], meta: META });
  assert.equal(m.summary.environment.offline, true);
  assert.notEqual(m.summary.delivery_decision, "DELIVER");
});

test("block_on_unresolved=false downgrades unresolved to flags, not block", () => {
  const m = buildReproducibilityManifest({ reresolved: [cit("PMID", "999", "UNRESOLVED", "cannot_get_document_summary")], thresholds: { block_on_unresolved: false }, meta: META });
  assert.notEqual(m.summary.delivery_decision, "BLOCK");
});

test("grounded_in_run set from groundedIds", () => {
  const m = buildReproducibilityManifest({ reresolved: [cit("PMID", "1", "VERIFIED"), cit("PMID", "2", "VERIFIED")], groundedIds: ["1"], meta: META });
  const byId = Object.fromEntries(m.citations.map((c) => [c.id, c.grounded_in_run]));
  assert.equal(byId["1"], true);
  assert.equal(byId["2"], false);
});

test("markdown render includes decision + manifest header", () => {
  const m = buildReproducibilityManifest({ reresolved: [cit("PMID", "1", "VERIFIED")], meta: META });
  const md = renderManifestMarkdown(m);
  assert.match(md, /Reproducibility Manifest/);
  assert.match(md, /DELIVER/);
});
