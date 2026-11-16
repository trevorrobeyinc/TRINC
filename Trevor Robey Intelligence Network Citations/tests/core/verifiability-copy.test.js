"use strict";

// T1-9 (2026-11-14): the sentence the marketplace and social adapters say about how a bundle's
// citations were checked follows the bundle's own gate record, and both adapters' output is free of
// the retired claims.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { verifiabilitySentence } = require("../../openclaw-bridge/monetization/verifiability-copy.js");
const { createManualPlaceholderAdapter } = require("../../openclaw-bridge/monetization/adapters/manual-placeholder-adapter.js");
const { createSocialContentAdapter } = require("../../openclaw-bridge/monetization/adapters/social-content-adapter.js");
const platformTargetsConfig = require("../../config/platform-targets.json");

const BANNED = [
  /every claim/i,
  /never presented as fact/i,
  /rather than presented as fact/i,
  /cross-validat/i,
  /citation density verification/i,
  /immediately after purchase/i,
  /ChEMBL/
];

const PASSED = { pass: true, retraction_screen_checked: true };

describe("verifiabilitySentence (T1-9)", () => {
  it("states the gate and a complete retraction screen only for a record that passed", () => {
    const s = verifiabilitySentence({ source_kind: "mission", citation_verification: PASSED });
    assert.match(s, /flagged \[UNVERIFIED\] at every mention/);
    assert.match(s, /retraction-screened against Crossref and PubMed/);
  });

  it("does not say retraction-screened when the screen was incomplete", () => {
    const s = verifiabilitySentence({ source_kind: "mission", citation_verification: { pass: true, retraction_screen_checked: false } });
    assert.doesNotMatch(s, /retraction-screened/);
    assert.match(s, /named in the citation-integrity ledger/);
  });

  it("states no gate result for a record that did not pass, or no record at all", () => {
    for (const ctx of [{ source_kind: "mission", citation_verification: { pass: false } }, { source_kind: "mission" }]) {
      assert.equal(verifiabilitySentence(ctx), "No citation-gate result is stated for this bundle.");
    }
  });

  // Tier 1 review (2026-11-14).
  it("a business-lane bundle names its own identifier types and its Crossref-only screen", () => {
    const s = verifiabilitySentence({ source_kind: "mission", research_profile: "business", citation_verification: PASSED });
    assert.match(s, /SEC filing, official statistics series, World Bank indicator, DOI/);
    assert.doesNotMatch(s, /PubMed|ClinicalTrials\.gov|PubChem/);
    assert.match(s, /Cited DOIs are retraction-screened against Crossref\./);
  });

  it("says which cited DOIs were screened against Crossref alone", () => {
    const s = verifiabilitySentence({ source_kind: "mission", citation_verification: { ...PASSED, retraction_dois_crossref_only: 3 } });
    assert.match(s, /retraction-screened against Crossref and PubMed\. For 3 cited DOIs the PubMed cross-check reached no verdict, so they were screened against Crossref alone\./);
  });

  it("scopes a dataset-sourced bundle to what the gate checked", () => {
    const s = verifiabilitySentence({ source_kind: "dataset", citation_verification: PASSED });
    assert.match(s, /the gate checked that report's cited identifiers, not each dataset row/);
    assert.doesNotMatch(s, /UNVERIFIED/);
  });
});

function emitAll(adapter, sourceContext, targetConfig) {
  const emitted = {};
  adapter.generateArtifacts({
    offer: { offer_id: "offer-t19", offer_title: "Test pack", product_line: "biomedical_research_packs", tier: "standard" },
    source_context: sourceContext,
    target_config: targetConfig,
    emitJson: (name, content) => { emitted[name] = JSON.stringify(content); return `submission/x/${name}`; },
    emitText: (name, content) => { emitted[name] = String(content); return `submission/x/${name}`; }
  });
  return Object.values(emitted).join("\n");
}

describe("the marketplace and social adapters carry no retired claim (T1-9)", () => {
  const contexts = [
    { source_kind: "mission", source_id: "mission-t", citation_verification: PASSED, artifacts: [{ output_full: "x".repeat(4000) }] },
    { source_kind: "mission", source_id: "mission-t", artifacts: [] }
  ];
  for (const target of ["datarade", "kaggle", "hugging_face", "github_sponsors", "aws_data_exchange"]) {
    it(`manual adapter for ${target}`, () => {
      const adapter = createManualPlaceholderAdapter({ platform_target: target });
      for (const ctx of contexts) {
        const out = emitAll(adapter, ctx, { manual_only: true });
        for (const re of BANNED) assert.doesNotMatch(out, re, `${target} carries ${re}`);
      }
    });
  }
  for (const channel of ["youtube", "tiktok", "instagram", "facebook_page"]) {
    it(`social adapter for ${channel}`, () => {
      const adapter = createSocialContentAdapter({ platform_target: channel });
      for (const ctx of contexts) {
        const out = emitAll(adapter, ctx, platformTargetsConfig.platform_targets[channel]);
        for (const re of BANNED) assert.doesNotMatch(out, re, `${channel} carries ${re}`);
      }
    });
  }

  // Tier 1 review (2026-11-14).
  it("social copy for a dataset-sourced bundle lists the dataset files, not a report or citation index", () => {
    const adapter = createSocialContentAdapter({ platform_target: "youtube" });
    const out = emitAll(adapter, { source_kind: "dataset", source_id: "dataset-t", citation_verification: PASSED, artifacts: [] }, platformTargetsConfig.platform_targets.youtube);
    assert.match(out, /In the bundle: the dataset rows, its schema, and a dataset card\./);
    assert.doesNotMatch(out, /In the bundle: the full report/);
  });

  it("the manual listing for a business-lane bundle names business sources, not biomedical registries", () => {
    const adapter = createManualPlaceholderAdapter({ platform_target: "datarade" });
    const out = emitAll(adapter, { source_kind: "mission", source_id: "mission-t", research_profile: "business", citation_verification: PASSED, artifacts: [] }, { manual_only: true });
    assert.match(out, /citation-backed business intelligence/);
    assert.match(out, /SEC EDGAR filings, official statistics series, World Bank indicators/);
    assert.doesNotMatch(out, /PubMed|ClinicalTrials\.gov|PubChem/);
  });
});
