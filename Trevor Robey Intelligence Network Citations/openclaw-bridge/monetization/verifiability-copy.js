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
//   * Tier 1 review (2026-11-14): the identifier types and the retraction screen follow the bundle's
//     research profile (a business-lane bundle cites SEC, statistics, World Bank, DOI and WEB ids, and
//     its DOIs are screened against Crossref only), and DOIs whose PubMed cross-check reached no verdict
//     are said to have been screened against Crossref alone.
// Deterministic: the same source context always yields the same text.

function asPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

const PROFILE_SENTENCES = Object.freeze({
  biomedical: Object.freeze({
    // T2-16 (2026-11-16): PMC full texts and the ISRCTN and EU trial registers are read too, and
    // UniProt, read since T1-4, was missing from this list.
    identifiers: "Every cited identifier (PubMed, PubMed Central, ClinicalTrials.gov, the ISRCTN and EU trial registers, PubChem, UniProt, DOI)",
    complete: "Cited DOIs, PMIDs and PMCIDs are retraction-screened against Crossref and PubMed.",
    partial: "Cited DOIs, PMIDs and PMCIDs are put through the Crossref and PubMed retraction screen; any paper it could not screen is named in the citation-integrity ledger.",
    mentionsPubmed: true
  }),
  business: Object.freeze({
    identifiers: "Every cited identifier (SEC filing, official statistics series, World Bank indicator, DOI, or the stored snapshot of a web page)",
    complete: "Cited DOIs are retraction-screened against Crossref.",
    partial: "Cited DOIs are put through the Crossref retraction screen; any it could not screen is named in the citation-integrity ledger.",
    mentionsPubmed: false
  })
});

function verifiabilitySentence(sourceContext) {
  const ctx = asPlainObject(sourceContext);
  const cv = asPlainObject(ctx.citation_verification);
  if (cv.pass !== true) return "No citation-gate result is stated for this bundle.";
  if (String(ctx.source_kind || "") === "dataset") {
    return "It was built from a research report that passed the citation gate; the gate checked that report's cited identifiers, not each dataset row.";
  }
  const profile = PROFILE_SENTENCES[String(ctx.research_profile || "")] || PROFILE_SENTENCES.biomedical;
  const crossrefOnly = Number.isFinite(cv.retraction_dois_crossref_only) ? cv.retraction_dois_crossref_only : 0;
  const crossrefNote = profile.mentionsPubmed && crossrefOnly > 0
    ? ` For ${crossrefOnly} cited DOI${crossrefOnly === 1 ? "" : "s"} the PubMed cross-check reached no verdict, so ${crossrefOnly === 1 ? "it was" : "they were"} screened against Crossref alone.`
    : "";
  const screen = `${cv.retraction_screen_checked === true ? profile.complete : profile.partial}${crossrefNote}`;
  return `${profile.identifiers} is cross-checked at generation time against the evidence retrieved for the report, and one not found in that evidence is flagged [UNVERIFIED] at every mention. `
    + screen;
}

module.exports = { verifiabilitySentence };
