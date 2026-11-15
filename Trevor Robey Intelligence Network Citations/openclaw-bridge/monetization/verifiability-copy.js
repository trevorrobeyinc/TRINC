"use strict";

// verifiability-copy.js — T1-9 (2026-11-14): the one sentence a marketplace or social adapter says
// about how a bundle's citations were checked, decided by the bundle's own citation-gate record.
//   * Gate and retraction sentences print ONLY for a record whose `pass` is true.
//   * A dataset-sourced bundle gets a scoped sentence: the gate checked the source report's cited
//     identifiers, not each dataset row.
//   * "Retraction-screened" is said only when the screen covered every cited DOI and PMID (T1-7).
//   * "Never presented as fact" is not said (operator default D4): an untraced identifier's sentence
//     still ships, flagged [UNVERIFIED] at every mention (T1-3).
//   * ChEMBL is not named among the cited registries: it is excluded from paid deliverables until
//     counsel answers the share-alike question (scripts/_delivery-checks.js).
// Deterministic: the same source context always yields the same text.

function asPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function verifiabilitySentence(sourceContext) {
  const ctx = asPlainObject(sourceContext);
  const cv = asPlainObject(ctx.citation_verification);
  if (cv.pass !== true) return "No citation-gate result is stated for this bundle.";
  if (String(ctx.source_kind || "") === "dataset") {
    return "It was built from a research report that passed the citation gate; the gate checked that report's cited identifiers, not each dataset row.";
  }
  const screen = cv.retraction_screen_checked === true
    ? "Cited DOIs and PMIDs are retraction-screened against Crossref and PubMed."
    : "Cited DOIs and PMIDs are put through the Crossref and PubMed retraction screen; any paper it could not screen is named in the citation-integrity ledger.";
  return "Every cited identifier (PubMed, ClinicalTrials.gov, PubChem, DOI) is cross-checked at generation time against the evidence retrieved for the report, and one not found in that evidence is flagged [UNVERIFIED] at every mention. "
    + screen;
}

module.exports = { verifiabilitySentence };
