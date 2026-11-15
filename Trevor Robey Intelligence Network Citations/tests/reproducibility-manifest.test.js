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

test("UNCHECKED over default 0 tolerance -> DELIVER_WITH_FLAGS (a soft FLAG, not a block)", () => {
  const m = buildReproducibilityManifest({ reresolved: [cit("PMID", "1", "VERIFIED"), cit("ChEMBL", "CHEMBL25", "UNCHECKED", "rate_limited")], meta: META });
  assert.equal(m.summary.delivery_decision, "DELIVER_WITH_FLAGS");
  // Q8: unchecked_over_threshold is a FLAG (the report still SHIPS), NOT a block reason.
  assert.ok(m.summary.flag_reasons.includes("unchecked_over_threshold"));
  assert.deepEqual(m.summary.block_reasons, [], "a report that SHIPS must carry no block_reasons");
  const md = renderManifestMarkdown(m);
  assert.match(md, /flags: unchecked_over_threshold/);
  assert.match(md, /This report SHIPS/);
});

test("Q8: max_unchecked_ratio is honored when overridden — default 0 is the doctrine-required floor", () => {
  const cits = [cit("PMID", "1", "VERIFIED"), cit("ChEMBL", "CHEMBL25", "UNCHECKED", "rate_limited")]; // 0.5 unchecked
  // Default 0 forfeits the clean DELIVER claim for any unchecked id.
  assert.equal(buildReproducibilityManifest({ reresolved: cits, meta: META }).summary.delivery_decision, "DELIVER_WITH_FLAGS");
  // A deliberate override is respected (0.5 <= 0.6) — but a production value > 0 would overclaim (see header).
  assert.equal(buildReproducibilityManifest({ reresolved: cits, thresholds: { max_unchecked_ratio: 0.6 }, meta: META }).summary.delivery_decision, "DELIVER");
});

// T1-6: decided on integers. 1 of 2,500 is 0.0004, which rounds to 0.000 for display.
test("1 UNCHECKED id of 2,500 -> DELIVER_WITH_FLAGS (rounding never earns the full-strength claim)", () => {
  const cits = Array.from({ length: 2499 }, (_, i) => cit("PMID", String(1000 + i), "VERIFIED"));
  cits.push(cit("PMID", "99999", "UNCHECKED", "rate_limited"));
  const m = buildReproducibilityManifest({ reresolved: cits, meta: META });
  assert.equal(m.summary.unchecked_ratio, 0, "the rounded ratio is display only");
  assert.equal(m.summary.delivery_decision, "DELIVER_WITH_FLAGS");
  assert.deepEqual(m.summary.flag_reasons, ["unchecked_over_threshold"]);
});

// T1-9 (2026-11-14): the flag explanation names the real reasons, and "fully GROUNDED" only when true.
test("ungrounded ids + a rate-limited UNCHECKED: no 'fully GROUNDED', the untraced count instead", () => {
  const m = buildReproducibilityManifest({
    reresolved: [cit("PMID", "1", "VERIFIED"), cit("PMID", "2", "UNCHECKED", "rate_limited")],
    gate: { cited: 6, grounded: 4, ungrounded: 2, grounded_ratio: 0.667, min_grounded_ratio: 0.5 },
    meta: META
  });
  const md = renderManifestMarkdown(m);
  assert.doesNotMatch(md, /fully GROUNDED/);
  assert.match(md, /2 of 6 cited identifiers were not found in the retrieved evidence and are flagged \[UNVERIFIED\] in the report/);
  assert.match(md, /network\/throttle limit/, "every UNCHECKED reason here is a network one");
});

test("a no_resolver UNCHECKED: no network/throttle sentence, the reason is listed", () => {
  const m = buildReproducibilityManifest({
    reresolved: [cit("PMID", "1", "VERIFIED"), cit("CENSUS", "cbp/2023/493", "UNCHECKED", "no_resolver")],
    gate: { cited: 2, grounded: 2, ungrounded: 0, grounded_ratio: 1, min_grounded_ratio: 0.75 },
    meta: META
  });
  const md = renderManifestMarkdown(m);
  assert.doesNotMatch(md, /network\/throttle/);
  assert.match(md, /UNCHECKED by reason: no_resolver: 1/);
  assert.match(md, /The report remains fully GROUNDED/);
  assert.match(md, /UNCHECKED = no definitive answer this run \(reason recorded per identifier\)/);
});

test("all-network UNCHECKED with nothing untraced keeps the original explanation", () => {
  const m = buildReproducibilityManifest({
    reresolved: [cit("PMID", "1", "VERIFIED"), cit("NCT", "NCT1", "UNCHECKED", "timeout")],
    gate: { cited: 2, grounded: 2, ungrounded: 0, grounded_ratio: 1, min_grounded_ratio: 0.75 },
    meta: META
  });
  const md = renderManifestMarkdown(m);
  assert.match(md, /This report SHIPS\. DELIVER_WITH_FLAGS means some cited identifiers could not be independently re-resolved when this report was assembled \(a network\/throttle limit at re-resolution, NOT a defect\)\. The report remains fully GROUNDED/);
  assert.match(md, /Citations re-resolved when this report was assembled \(as of 2026-06-19\)/);
  assert.doesNotMatch(md, /at delivery/);
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
// T1-7 (2026-11-14): an incomplete screen now forfeits the full-strength DELIVER (a flag), and it
// still never blocks: block_reasons stays empty.
test("retraction screen incomplete -> manifest says INCOMPLETE, flags it, and still ships (DELIVER_WITH_FLAGS)", () => {
  const m = buildReproducibilityManifest({
    reresolved: [cit("PMID", "1", "VERIFIED")],
    retraction: { checked: false, retracted_dois: [], retracted_pmids: [], cited: 3, unscreened_ids: ["DOI:10.4/missing"] },
    meta: META
  });
  assert.equal(m.summary.retraction_screen.checked, false);
  assert.equal(m.summary.delivery_decision, "DELIVER_WITH_FLAGS");
  assert.deepEqual(m.summary.flag_reasons, ["retraction_screen_incomplete"]);
  assert.deepEqual(m.summary.block_reasons, [], "an unreachable source must never block a passing report");
  const md = renderManifestMarkdown(m);
  assert.match(md, /Retraction screen: INCOMPLETE — 1 of 3 cited DOIs and PMIDs not screened/);
  assert.match(md, /Not screened: DOI:10\.4\/missing\./);
  assert.match(md, /This report SHIPS with a flag: the retraction screen could not screen every cited DOI and PMID/);
  assert.doesNotMatch(md, /network\/throttle limit/, "a retraction-screen gap is not a re-resolution limit");
});

// T1-8: the fallback manifest the engine builds when the re-resolution pass crashed.
test("a crashed re-resolution pass: every id UNCHECKED (reresolution_error) ships flagged, never offline, says so", () => {
  const m = buildReproducibilityManifest({
    reresolved: [cit("PMID", "1", "UNCHECKED", "reresolution_error"), cit("NCT", "NCT01111111", "UNCHECKED", "reresolution_error")],
    retraction: { checked: true, retracted_dois: [], retracted_pmids: [] },
    reresolutionCompleted: false,
    meta: META
  });
  assert.equal(m.summary.delivery_decision, "DELIVER_WITH_FLAGS");
  assert.deepEqual(m.summary.block_reasons, []);
  assert.equal(m.summary.environment.offline, false, "a crash is not an offline registry");
  assert.equal(m.summary.reresolution_completed, false);
  const md = renderManifestMarkdown(m);
  assert.match(md, /Re-resolution did not complete this run; no identifier was looked up\./);
  assert.doesNotMatch(md, /network\/throttle limit/, "a crash is not a network limit");
  const normal = buildReproducibilityManifest({ reresolved: [cit("PMID", "1", "VERIFIED")], reresolutionCompleted: true, meta: META });
  assert.equal(normal.summary.reresolution_completed, true);
  assert.ok(!("reresolution_completed" in buildReproducibilityManifest({ reresolved: [], meta: META }).summary), "absent unless the caller says");
});

test("a complete retraction screen adds no flag", () => {
  const m = buildReproducibilityManifest({ reresolved: [cit("PMID", "1", "VERIFIED")], retraction: { checked: true, retracted_dois: [], retracted_pmids: [] }, meta: META });
  assert.equal(m.summary.delivery_decision, "DELIVER");
  assert.match(renderManifestMarkdown(m), /Retraction screen: checked/);
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

// T1-5: with TYPE:ID keys, grounded_in_run is decided by type as well as number.
test("grounded_in_run by key: a retrieved CID 2244 does not ground PMID 2244", () => {
  const m = buildReproducibilityManifest({
    reresolved: [cit("PMID", "2244", "VERIFIED"), cit("PubChem CID", "2244", "VERIFIED")],
    groundedIds: ["2244"],
    groundedKeys: ["PUBCHEM CID:2244"],
    meta: META
  });
  const byType = Object.fromEntries(m.citations.map((c) => [c.type, c.grounded_in_run]));
  assert.equal(byType.PMID, false);
  assert.equal(byType["PubChem CID"], true);
  const idOnly = buildReproducibilityManifest({ reresolved: [cit("PMID", "2244", "VERIFIED")], groundedIds: ["2244"], meta: META });
  assert.equal(idOnly.citations[0].grounded_in_run, true, "without keys the id alone is matched, as before");
});

test("markdown render includes decision + manifest header", () => {
  const m = buildReproducibilityManifest({ reresolved: [cit("PMID", "1", "VERIFIED")], meta: META });
  const md = renderManifestMarkdown(m);
  assert.match(md, /Reproducibility Manifest/);
  assert.match(md, /DELIVER/);
});

// Attribution check (2026-11-04): operator decision — flag and mark inline, never block.
const FELDMAN_DOI = "10.1016/s0140-6736(22)01272-7";
const ATTRIBUTION = {
  checked: true,
  marked_lines: 1,
  counts: { cited: 2, checked: 2, matched: 1, mismatched: 1, mismatched_works: 1, not_checked: 0 },
  results: [
    { id: FELDMAN_DOI, type: "DOI", status: "author_mismatch", written: { name: "Chio", year: 2022 }, registry_label: "Feldman et al., 2022" },
    { id: "28700839", type: "PMID", status: "match", written: { name: "Brown", year: 2017 }, registry_label: "Brown & Al-Chalabi, 2017" }
  ]
};

test("attribution mismatch -> DELIVER_WITH_FLAGS with its own reason and markdown, not the network blurb", () => {
  const m = buildReproducibilityManifest({
    reresolved: [cit("DOI", FELDMAN_DOI, "VERIFIED"), cit("PMID", "28700839", "VERIFIED")],
    attribution: ATTRIBUTION,
    meta: META
  });
  assert.equal(m.summary.delivery_decision, "DELIVER_WITH_FLAGS");
  assert.deepEqual(m.summary.flag_reasons, ["attribution_mismatch"]);
  assert.deepEqual(m.summary.block_reasons, []);
  assert.equal(m.summary.counts.verified, 2, "every identifier still resolved");
  assert.equal(m.summary.attribution_check.mismatches.length, 1);
  assert.equal(m.summary.attribution_check.mismatches[0].registry_label, "Feldman et al., 2022");
  assert.equal(m.citations[0].attribution.status, "author_mismatch");
  const md = renderManifestMarkdown(m);
  assert.match(md, /## Attribution check/);
  assert.match(md, /\| DOI \| 10\.1016\/s0140-6736\(22\)01272-7 \| Chio, 2022 \| Feldman et al\., 2022 \| author mismatch \|/);
  assert.match(md, /marked \[ATTRIBUTION MISMATCH\]/);
  assert.doesNotMatch(md, /network\/throttle limit/, "a wrong author is not a network problem");
});

test("attribution mismatch + unchecked ids -> both flags and both explanations", () => {
  const m = buildReproducibilityManifest({
    reresolved: [cit("DOI", FELDMAN_DOI, "VERIFIED"), cit("PMID", "28700839", "UNCHECKED", "rate_limited")],
    attribution: ATTRIBUTION,
    meta: META
  });
  assert.deepEqual(m.summary.flag_reasons, ["unchecked_over_threshold", "attribution_mismatch"]);
  const md = renderManifestMarkdown(m);
  assert.match(md, /network\/throttle limit/);
  assert.match(md, /ATTRIBUTION MISMATCH/);
});

test("all attributions match -> DELIVER stays DELIVER", () => {
  const clean = { checked: true, counts: { cited: 1, checked: 1, matched: 1, mismatched: 0, not_checked: 0 }, results: [ATTRIBUTION.results[1]] };
  const m = buildReproducibilityManifest({ reresolved: [cit("PMID", "28700839", "VERIFIED")], attribution: clean, meta: META });
  assert.equal(m.summary.delivery_decision, "DELIVER");
  assert.deepEqual(m.summary.flag_reasons, []);
});

test("an attribution mismatch never turns a BLOCK into a delivery", () => {
  const m = buildReproducibilityManifest({
    reresolved: [cit("DOI", FELDMAN_DOI, "VERIFIED"), cit("PMID", "999999999", "UNRESOLVED", "cannot_get_document_summary")],
    attribution: ATTRIBUTION,
    meta: META
  });
  assert.equal(m.summary.delivery_decision, "BLOCK");
});

test("attribution flag says 'listed', not 'marked', when no line was actually marked", () => {
  const unmarked = { ...ATTRIBUTION, marked_lines: 0 };
  const m = buildReproducibilityManifest({ reresolved: [cit("DOI", FELDMAN_DOI, "VERIFIED"), cit("PMID", "28700839", "VERIFIED")], attribution: unmarked, meta: META });
  const md = renderManifestMarkdown(m);
  assert.match(md, /It is listed under "Attribution check"/);
  assert.doesNotMatch(md, /marked \[ATTRIBUTION MISMATCH\]/);
});

test("a report with no DOI or PMID (business lane) gets no attribution section; a crash records a fixed code", () => {
  const none = { checked: true, counts: { cited: 0, checked: 0, matched: 0, mismatched: 0, mismatched_works: 0, not_checked: 0 }, results: [] };
  const m1 = buildReproducibilityManifest({ reresolved: [cit("WEB", "abc123abc123", "VERIFIED")], attribution: none, meta: META });
  assert.ok(!("attribution_check" in m1.summary));
  assert.doesNotMatch(renderManifestMarkdown(m1), /Attribution check/);
  const crashed = { checked: false, error: "internal_error", results: [] };
  const m2 = buildReproducibilityManifest({ reresolved: [cit("PMID", "1", "VERIFIED")], attribution: crashed, meta: META });
  assert.equal(m2.summary.attribution_check.error, "internal_error");
  assert.equal(m2.summary.delivery_decision, "DELIVER", "a check that could not run never flags or blocks");
  assert.match(renderManifestMarkdown(m2), /Not completed this run \(internal_error\)/);
});

test("no attribution input -> the manifest is exactly as before (no new keys)", () => {
  const m = buildReproducibilityManifest({ reresolved: [cit("PMID", "1", "VERIFIED")], meta: META });
  assert.ok(!("attribution_check" in m.summary));
  assert.ok(!("attribution" in m.citations[0]));
  assert.doesNotMatch(renderManifestMarkdown(m), /Attribution check/);
});
