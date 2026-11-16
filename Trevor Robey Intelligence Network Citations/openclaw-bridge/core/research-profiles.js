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
  "CITATION REQUIREMENTS: For every factual claim, cite the source inline using the identifier exactly as it appears in the live evidence below. Business identifiers: web source snapshots, with the passage number when quoting one (e.g. WEB: 3f9a1c0b7d2e ¶4), SEC filings (e.g. SEC: 320193/0000320193-24-000123), World Bank indicators (e.g. WB: FP.CPI.TOTL.ZG), official statistics series (e.g. BLS: CES4349300003, EUROSTAT: nrg_pc_205, CENSUS: cbp/2023/493, EIA: ELEC.PRICE.US-IND.M), and DOIs for published research (e.g. doi: 10.1000/example). Every figure, price, percentage or date must carry the identifier of the source it came from, with the period and geography the source states. Aim for at least one verifiable identifier per substantive paragraph. This output will be automatically audited: each identifier is checked against the sources actually retrieved for this run and re-checked at delivery.";

// Eurostat geography codes for the run's `country` (ISO 3166 alpha-2 or alpha-3). EU27 plus the
// EFTA states Eurostat reports; Greece is "EL" in Eurostat. "EU"/"EU27" → the EU-27 aggregate.
const EUROSTAT_GEO = Object.freeze({
  AT: "AT", AUT: "AT", BE: "BE", BEL: "BE", BG: "BG", BGR: "BG", HR: "HR", HRV: "HR", CY: "CY", CYP: "CY",
  CZ: "CZ", CZE: "CZ", DK: "DK", DNK: "DK", EE: "EE", EST: "EE", FI: "FI", FIN: "FI", FR: "FR", FRA: "FR",
  DE: "DE", DEU: "DE", GR: "EL", GRC: "EL", EL: "EL", HU: "HU", HUN: "HU", IE: "IE", IRL: "IE", IT: "IT", ITA: "IT",
  LV: "LV", LVA: "LV", LT: "LT", LTU: "LT", LU: "LU", LUX: "LU", MT: "MT", MLT: "MT", NL: "NL", NLD: "NL",
  PL: "PL", POL: "PL", PT: "PT", PRT: "PT", RO: "RO", ROU: "RO", SK: "SK", SVK: "SK", SI: "SI", SVN: "SI",
  ES: "ES", ESP: "ES", SE: "SE", SWE: "SE", IS: "IS", ISL: "IS", LI: "LI", LIE: "LI", NO: "NO", NOR: "NO",
  CH: "CH", CHE: "CH", EU: "EU27_2020", EU27: "EU27_2020", EU27_2020: "EU27_2020"
});

/**
 * Inputs the business lane derives from the run's own inputs (Evidence Desk, 2026-10-21), so the
 * prefetch map can say which sources apply (`requires` in tool-prefetch.js): the U.S. agencies
 * (BLS, Census, EIA) only for a U.S. run, Eurostat only for a European one. A caller-supplied value
 * wins; an empty string means "does not apply", and the source is recorded as skipped.
 */
function deriveBusinessInputs(inputs = {}) {
  const country = String(inputs.country || "").trim().toUpperCase();
  return {
    us_scope: country === "US" || country === "USA" ? "US" : "",
    eurostat_geo: EUROSTAT_GEO[country] || ""
  };
}

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
    sectionGate: null,
    deriveInputs: null,
    deskAuthoredRoles: Object.freeze([])
  }),
  business: Object.freeze({
    id: "business",
    prefetchMapFile: "tool-prefetch-map.business.json",
    soulFile: "SOUL.business.md",
    citationInstruction: BUSINESS_CITATION_INSTRUCTION,
    identifierList: "WEB/SEC/WB/BLS/EUROSTAT/CENSUS/EIA/DOI",
    // Operator decision 2026-10-21: the section gate searches the `science` topic, because SearXNG's
    // `general` answers with Bing alone, keyed on one word, and that junk grades D — a business section
    // would throw PHASE30_CITATION_COVERAGE_ZERO after every role call was paid for. Since 2026-11-15
    // `science` is Europe PMC + Crossref directly (mcp/scholarly-search), not SearXNG. Grading and
    // thresholds are unchanged. Revert to "general" once a legitimate general-web engine is live (Brave's
    // Search API, Evidence Desk P3, has needed a card since its free tier ended in 2026).
    sectionGate: Object.freeze({ topic: "science", extraPrimaryDomains: BUSINESS_PRIMARY_SOURCE_DOMAINS }),
    deriveInputs: deriveBusinessInputs,
    // Operator decision 2026-10-21: on this lane the scout's collect-and-summarise job is done by the
    // Evidence Desk deterministically (mcp/business-sources/evidence-desk.js), not by a model call.
    // Desk-authored sections still ship, but the citation gate and the density audit judge only
    // model-written text (citation-gate.js, workflow-engine.js).
    deskAuthoredRoles: Object.freeze(["scout"])
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
  EUROSTAT_GEO,
  deriveBusinessInputs,
  getResearchProfile
};
