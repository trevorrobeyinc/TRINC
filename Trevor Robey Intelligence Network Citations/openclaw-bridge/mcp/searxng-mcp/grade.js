"use strict";

/**
 * Grading + coverage-tier policy for the citation gate (spec §2). Pure, deterministic.
 *
 * Grade (per result):
 *   A — ≥1 url-derived, PEER-REVIEWED structured id (PMID/PMCID/NCT/DOI/ChEMBL/… in the canonical
 *       locator). A PREPRINT id is NOT peer-reviewed, so it never earns A.
 *   B — a url-derived PREPRINT id (arXiv, or a bioRxiv/medRxiv/Research Square/ChemRxiv DOI), OR any
 *       text-derived citation. (A preprint is still a real source — counted at B, not dropped.)
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
 * Grade a NORMALIZED row (citations[] present, `primary_domain_match` precomputed).
 * @param {{citations:Array<{source:string}>, primary_domain_match:boolean}} row
 * @returns {"A"|"B"|"C"|"D"}
 */
function gradeResult(row) {
  const cites = Array.isArray(row && row.citations) ? row.citations : [];
  // A — a url-derived id that is peer-reviewed (a preprint id, even url-derived, is NOT A).
  if (cites.some((c) => c && c.source === "url" && !isPreprintCitation(c))) return "A";
  // B — a url-derived preprint id, OR any text-derived citation.
  if (cites.some((c) => c && c.source === "url" && isPreprintCitation(c)) || cites.some((c) => c && c.source === "text")) return "B";
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

module.exports = { primaryDomainMatch, gradeResult, coverageTier, isPreprintCitation };
