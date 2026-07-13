"use strict";

/**
 * Grading + coverage-tier policy for the citation gate (spec §2). Pure, deterministic.
 *
 * Grade (per result):
 *   A — ≥1 RECORD-IDENTITY, PEER-REVIEWED structured id. Record-identity = the id identifies the
 *       record itself: either url-derived (PMID/PMCID/NCT/DOI/ChEMBL/… in the canonical locator) OR
 *       source:"metadata" (a DOI the scholarly engine returned as the record's structured field —
 *       Crossref/OpenAlex/PubMed/Semantic Scholar assert it, so it is record-identity, not a
 *       snippet mention). A PREPRINT id is NOT peer-reviewed, so it never earns A.
 *   B — a record-identity PREPRINT id (arXiv, or a bioRxiv/medRxiv/Research Square/ChemRxiv DOI), OR
 *       any text-derived citation. (A preprint is still a real source — counted at B, not dropped.)
 *   C — no structured citation, but the locator host ∈ primary_source_domains (the URL is itself a
 *       resolvable primary/authoritative source: FDA label, ClinicalTrials.gov record, EDGAR, …).
 *   D — neither → dropped from synthesis, excluded from the distinct count, retained for audit.
 *
 * @module searxng-mcp/grade
 */

/**
 * True if a citation is a PREPRINT (not peer-reviewed). The connector's citation-grammar tags these
 * two ways (read, not re-ported): `type === "arxiv"` (arXiv is inherently a preprint) OR
 * `subtype === "preprint"` (bioRxiv/medRxiv 10.1101, Research Square, ChemRxiv, … DOIs).
 */
function isPreprintCitation(c) {
  return !!c && (c.subtype === "preprint" || c.type === "arxiv");
}

/** True if `host` equals `domain` or is a subdomain of it (both www-normalized). */
function primaryDomainMatch(host, domains) {
  const h = String(host || "").toLowerCase().replace(/^www\./, "");
  if (!h || !Array.isArray(domains)) return false;
  return domains.some((raw) => {
    const d = String(raw).toLowerCase().replace(/^www\./, "");
    return h === d || h.endsWith("." + d);
  });
}

/**
 * Record-identity provenance: the id identifies the record itself — either the page URL
 * (`source:"url"`) or the scholarly engine's structured DOI field (`source:"metadata"`). Both are
 * page-identity-grade confidence, unlike `source:"text"` (a mention harvested from title/snippet).
 * Kept as one predicate so the A/B split treats a structured-field DOI the same as a url DOI.
 */
function isRecordIdentity(c) {
  return !!c && (c.source === "url" || c.source === "metadata");
}

/**
 * Grade a NORMALIZED row (citations[] present, `primary_domain_match` precomputed).
 * @param {{citations:Array<{source:string}>, primary_domain_match:boolean}} row
 * @returns {"A"|"B"|"C"|"D"}
 */
function gradeResult(row) {
  const cites = Array.isArray(row && row.citations) ? row.citations : [];
  // A — a record-identity id that is peer-reviewed (a preprint id, even record-identity, is NOT A).
  if (cites.some((c) => isRecordIdentity(c) && !isPreprintCitation(c))) return "A";
  // B — a record-identity preprint id, OR any text-derived (mention) citation.
  if (cites.some((c) => isRecordIdentity(c) && isPreprintCitation(c)) || cites.some((c) => c && c.source === "text")) return "B";
  if (row && row.primary_domain_match) return "C";
  return "D";
}

/**
 * Coverage tier from the distinct-source count (spec §2). Only meaningful on a passing gate.
 * @param {number} n distinct_source_count (clusters with ≥1 grade A/B/C member)
 * @param {boolean} hasAB whether any counted cluster has a grade-A or -B member
 * @returns {"Sparse"|"Moderate"|"Comprehensive"|null}
 */
function coverageTier(n, hasAB) {
  if (n <= 0) return null; // fail — no tier
  if (n === 1) return "Sparse";
  if (n === 2) return "Moderate";
  return hasAB ? "Comprehensive" : "Moderate"; // n >= 3: all-C stays Moderate
}

module.exports = { primaryDomainMatch, gradeResult, coverageTier, isPreprintCitation, isRecordIdentity };
