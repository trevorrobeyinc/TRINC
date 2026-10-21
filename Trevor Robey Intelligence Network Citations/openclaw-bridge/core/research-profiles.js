"use strict";

// research-profiles.js — the research DOMAIN a workflow runs in (2026-10-21).
//
// WHY THIS EXISTS. Until now every run was biomedical by construction: one prefetch map, one set of
// role identities (SOUL.md), and a prompt that told the model to cite PMID / NCT / ChEMBL / CID /
// UniProt / DOI. A non-biomedical question therefore fetched biomedical evidence, cited nothing the
// gate could ground, and was BLOCKED as INSUFFICIENT_EVIDENCE (general-research-pack.json says so).
//
// A profile swaps exactly those three domain-specific inputs and NOTHING else. The citation gate,
// the re-resolver, the Reproducibility Manifest, the packager and the approval gates are shared, so
// a business report is held to the same zero-fabrication bar as a biomedical one: every cited id
// must be grounded in evidence this run fetched, and every one must re-resolve at delivery.
//
// A workflow template opts in with `"research_profile": "business"`. Absent or unknown → biomedical,
// so every existing template behaves byte-for-byte as before.

const DEFAULT_PROFILE_ID = "biomedical";

const BIOMEDICAL_CITATION_INSTRUCTION =
  "CITATION REQUIREMENTS: For every factual claim, include specific database identifiers inline. Use: PubChem CID (e.g. CID: 2244), PMID (e.g. PMID: 12345678), NCT numbers (e.g. NCT01234567), ChEMBL IDs (e.g. CHEMBL25), ENSG IDs (e.g. ENSG00000157764), UniProt accessions (e.g. UniProt: P04637), DOIs (e.g. doi: 10.1000/example). Aim for at least one verifiable identifier per substantive paragraph. This output will be automatically audited for verifiable citations.";

const BUSINESS_CITATION_INSTRUCTION =
  "CITATION REQUIREMENTS: For every factual claim, cite the source inline using the identifier exactly as it appears in the live evidence below. Business identifiers: web source snapshots (e.g. WEB: 3f9a1c0b7d2e), SEC filings (e.g. SEC: 320193/0000320193-24-000123), World Bank indicators (e.g. WB: FP.CPI.TOTL.ZG), and DOIs for published research (e.g. doi: 10.1000/example). Every figure, price, percentage or date must carry the identifier of the source it came from. Aim for at least one verifiable identifier per substantive paragraph. This output will be automatically audited: each identifier is checked against the sources actually retrieved for this run and re-checked at delivery.";

// Business-lane primary/authoritative hosts for the section-level coverage gate. A host here lets a
// search result with no structured citation still count as a primary source (grade C). Extend
// deliberately, against domains that actually appear in real business source sets.
const BUSINESS_PRIMARY_SOURCE_DOMAINS = Object.freeze([
  "sec.gov",
  "bls.gov",
  "bea.gov",
  "census.gov",
  "federalreserve.gov",
  "fred.stlouisfed.org",
  "treasury.gov",
  "irs.gov",
  "sba.gov",
  "gao.gov",
  "eia.gov",
  "ftc.gov",
  "data.gov",
  "worldbank.org",
  "imf.org",
  "oecd.org",
  "europa.eu",
  "un.org",
  "wto.org",
  "doi.org",
  "crossref.org",
  "openalex.org"
]);

const PROFILES = Object.freeze({
  biomedical: Object.freeze({
    id: "biomedical",
    prefetchMapFile: "tool-prefetch-map.json",
    soulFile: "SOUL.md",
    citationInstruction: BIOMEDICAL_CITATION_INSTRUCTION,
    identifierList: "PMID/NCT/DOI/ChEMBL/CID/UniProt",
    sectionGate: null
  }),
  business: Object.freeze({
    id: "business",
    prefetchMapFile: "tool-prefetch-map.business.json",
    soulFile: "SOUL.business.md",
    citationInstruction: BUSINESS_CITATION_INSTRUCTION,
    identifierList: "WEB/SEC/WB/DOI",
    sectionGate: Object.freeze({ topic: "general", extraPrimaryDomains: BUSINESS_PRIMARY_SOURCE_DOMAINS })
  })
});

function getResearchProfile(id) {
  const key = typeof id === "string" ? id.trim().toLowerCase() : "";
  return PROFILES[key] || PROFILES[DEFAULT_PROFILE_ID];
}

module.exports = {
  DEFAULT_PROFILE_ID,
  PROFILES,
  BUSINESS_PRIMARY_SOURCE_DOMAINS,
  getResearchProfile
};
