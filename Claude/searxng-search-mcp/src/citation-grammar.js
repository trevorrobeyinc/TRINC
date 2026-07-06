"use strict";

/**
 * Canonical, validated citation-identifier grammar for biomedical/scholarly text.
 *
 * This is the SINGLE source of truth for the connector's citation grammar. It is deliberately
 * self-contained (no cross-package require) because the connector is staged to the INTERNAL
 * volume at ~/.claude/mcp-servers/searxng-search/ and can only load files under its own `src/`.
 * The engine's report-level citation GATE lives in a separate runtime (`Trevor Robey Intelligence
 * Network Citations/openclaw-bridge/core/citation-extractor.js`) and cannot be required across the
 * volume/package boundary. `test/citation-grammar.drift.test.mjs` runs a canonical fixture corpus
 * through BOTH extractors and fails if they stop agreeing — turning "aligned by hand" into a CI
 * guard so the two grammars can never silently diverge on the load-bearing common cases.
 *
 * Extraction is PER FIELD (title / content / url extracted separately, then merged). This means a
 * cue in one field can NEVER attach to digits in another (the `{title:"See PMID", content:"12345"}`
 * cross-field false match is impossible by construction — no field-join to bridge), and it lets us
 * record PROVENANCE: `source:"url"` (the id is part of the page's own address → high confidence) vs
 * `source:"text"` (harvested from title/snippet → medium). Dedup upstream only merges on url-derived
 * ids, so a review article that merely CITES a paper's PMID is never collapsed into that paper.
 *
 * Formats + sources (see the research brief "Making-SearXNG-Better"):
 *   DOI      — Crossref-recommended pattern (Bilder 2011), extraction form (no anchors). Preprint
 *              DOIs (bioRxiv/medRxiv 10.1101, Research Square, ChemRxiv, …) get subtype:"preprint".
 *   PMID     — NLM 1–8 digits. REQUIRES an explicit cue ("PMID" or a PubMed URL); a bare integer is
 *              NEVER a PMID. (Real PMIDs carry no leading zeros; the cue — not a regex clause — guards it.)
 *   PMCID    — "PMC" + digits.   NCT — "NCT" + 8 digits.   ChEMBL — "CHEMBL" + integer.
 *   DrugBank — "DB" + 5 digits.  UniProt — official 6/10-char accession, gated on a NEARBY "uniprot" cue.
 *   arXiv    — arXiv:YYMM.NNNN(N) or an arxiv.org/abs|pdf URL (over-long digit runs rejected, not truncated).
 *   GEO      — GSE/GSM/GPL/GDS + ≥2 digits.   SRA — SRR/SRX/SRP/SRS/ERR/ERX/DRR + ≥6 digits.
 *   BioProject — PRJNA/PRJEB/PRJDB + ≥5.   BioSample — SAMN/SAMEA/SAMD + ≥5.   RRID — "RRID:AB_/SCR_/…".
 *
 * @module citation-grammar
 */

/** Compiled patterns. Extraction forms (global). */
const PATTERNS = Object.freeze({
  doi: /10\.\d{4,9}\/[-._;()\/:a-z0-9]+/gi,
  pmcid: /\bPMC\d+\b/g,
  nct: /\bNCT\d{8}\b/g,
  chembl: /\bCHEMBL\d+\b/g,
  drugbank: /\bDB\d{5}\b/g,
  // Digit FLOORS matter for precision: real NCBI accessions are multi-digit, and short widths
  // collide with common tokens. GEO >=2 digits kills the GNU-license "GPL2"/"GPL3" (1 digit) while
  // keeping GPL96/GPL570. SRA study/run/exp/sample accessions are ALWAYS >=6 digits, so >=6 kills
  // gene names like "SRP54"/"SRP9". BioProject/BioSample >=5.
  geo: /\b(?:GSE|GSM|GPL|GDS)\d{2,}\b/g,
  sra: /\b(?:SRR|SRX|SRP|SRS|ERR|ERX|DRR)\d{6,}\b/g,
  bioproject: /\b(?:PRJNA|PRJEB|PRJDB)\d{5,}\b/g,
  biosample: /\b(?:SAMN|SAMEA|SAMD)\d{5,}\b/g,
  rrid: /\bRRID:\s*([A-Za-z]+[_:][A-Za-z0-9]+)/gi, // i: accept "rrid:"/"Rrid:" too
  // arXiv: URL form (arxiv.org/abs|pdf/<id>) OR "arXiv:<id>" cue form. The (?!\d) REJECTS (rather
  // than silently truncating) an over-long digit run — a valid new-style id is YYMM.NNNN(N) only.
  arxiv: /arxiv\.org\/(?:abs|pdf)\/(\d{4}\.\d{4,5})(?!\d)|arxiv:\s*(\d{4}\.\d{4,5})(?!\d)/gi,
  // Official UniProt accession (6 or 10 chars). Only kept when a "uniprot" cue sits near the match.
  uniprot: /\b([OPQ][0-9][A-Z0-9]{3}[0-9]|[A-NR-Z][0-9]([A-Z][A-Z0-9]{2}[0-9]){1,2})\b/g,
  // PMID requires an explicit cue so a bare integer is never captured. The URL form covers BOTH the
  // modern host (pubmed.ncbi.nlm.nih.gov/<id>) and the classic path SearXNG's `pubmed` engine returns
  // (www.ncbi.nlm.nih.gov/pubmed/<id>).
  pmidCue: /\bPMID:?\s*(\d{1,8})\b/gi,
  pubmedUrl: /(?:pubmed\.ncbi\.nlm\.nih\.gov\/|ncbi\.nlm\.nih\.gov\/pubmed\/)(\d{1,8})\b/gi,
});

/** DOI prefixes that denote a preprint (not peer-reviewed) — a provenance distinction worth surfacing. */
const PREPRINT_DOI_PREFIXES = [
  "10.1101/", // Cold Spring Harbor — bioRxiv / medRxiv
  "10.21203/", // Research Square
  "10.20944/", // Preprints.org
  "10.26434/", // ChemRxiv
  "10.31219/", // OSF Preprints
  "10.31234/", // PsyArXiv
];

/** How near the "uniprot" cue must sit to a candidate accession (chars, either side). */
const UNIPROT_CUE_WINDOW = 80;

/** Strip URL/scheme/`doi:` wrappers + trailing prose punctuation, then lowercase. */
function normalizeDoi(raw) {
  return String(raw)
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .replace(/[.,;:)\]\}>"'|]+$/, "") // trailing markdown/prose artifacts (a DOI never ends in these)
    .toLowerCase();
}

/** "preprint" if the DOI is from a known preprint registrant, else undefined. */
function classifyDoi(id) {
  return PREPRINT_DOI_PREFIXES.some((p) => id.startsWith(p)) ? "preprint" : undefined;
}

/** Run every pattern over ONE field and feed matches to `add(type, id, source, subtype?)`. */
function extractField(text, source, add) {
  if (!text) return;
  const s = String(text);
  for (const m of s.matchAll(PATTERNS.doi)) {
    const id = normalizeDoi(m[0]);
    add("doi", id, source, classifyDoi(id));
  }
  for (const m of s.matchAll(PATTERNS.pmcid)) add("pmcid", m[0].toUpperCase(), source);
  for (const m of s.matchAll(PATTERNS.nct)) add("nct", m[0].toUpperCase(), source);
  for (const m of s.matchAll(PATTERNS.chembl)) add("chembl", m[0].toUpperCase(), source);
  for (const m of s.matchAll(PATTERNS.drugbank)) add("drugbank", m[0].toUpperCase(), source);
  for (const m of s.matchAll(PATTERNS.geo)) add("geo", m[0].toUpperCase(), source);
  for (const m of s.matchAll(PATTERNS.sra)) add("sra", m[0].toUpperCase(), source);
  for (const m of s.matchAll(PATTERNS.bioproject)) add("bioproject", m[0].toUpperCase(), source);
  for (const m of s.matchAll(PATTERNS.biosample)) add("biosample", m[0].toUpperCase(), source);
  for (const m of s.matchAll(PATTERNS.rrid)) add("rrid", ("RRID:" + m[1]).toUpperCase(), source);
  for (const m of s.matchAll(PATTERNS.arxiv)) {
    const id = m[1] || m[2];
    if (id) add("arxiv", id, source);
  }
  // UniProt: keep a match only when "uniprot" appears NEAR it (same field, bounded window) —
  // a whole-field presence test would tag any co-located accession-shaped catalog/batch code in
  // an article merely ABOUT UniProt. Per-field + proximity kills both cross-field and far-token FPs.
  for (const m of s.matchAll(PATTERNS.uniprot)) {
    const idx = m.index ?? 0;
    const from = Math.max(0, idx - UNIPROT_CUE_WINDOW);
    const to = Math.min(s.length, idx + m[0].length + UNIPROT_CUE_WINDOW);
    if (/uniprot/i.test(s.slice(from, to))) add("uniprot", m[1].toUpperCase(), source);
  }
  for (const m of s.matchAll(PATTERNS.pmidCue)) add("pmid", m[1], source);
  for (const m of s.matchAll(PATTERNS.pubmedUrl)) add("pmid", m[1], source);
}

/**
 * Extract citation identifiers from a result's text fields.
 *
 * Pure, synchronous, and NEVER throws — on any internal error it returns whatever was collected.
 *
 * @param {string|{title?:string, content?:string, url?:string}} input
 * @returns {Array<{type:string, id:string, source:"url"|"text", subtype?:string}>} deduped citations
 */
function extractCitations(input) {
  const byKey = new Map(); // "type:id" -> citation object (dedup + source upgrade)
  const add = (type, id, source, subtype) => {
    const key = `${type}:${id}`;
    const existing = byKey.get(key);
    if (!existing) {
      const c = { type, id, source };
      if (subtype) c.subtype = subtype;
      byKey.set(key, c);
    } else if (existing.source !== "url" && source === "url") {
      existing.source = "url"; // url-derived (page identity) outranks text-derived
    }
  };
  try {
    if (typeof input === "string") {
      extractField(input, "text", add);
    } else if (input && typeof input === "object") {
      extractField(input.url, "url", add); // url first so url-derived ids win the source
      extractField(input.title, "text", add);
      extractField(input.content, "text", add);
    }
  } catch {
    /* fail-soft: return whatever was collected */
  }
  return [...byKey.values()];
}

module.exports = { PATTERNS, PREPRINT_DOI_PREFIXES, extractCitations, extractField, normalizeDoi, classifyDoi };
