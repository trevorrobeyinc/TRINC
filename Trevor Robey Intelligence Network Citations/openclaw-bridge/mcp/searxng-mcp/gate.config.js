"use strict";

/**
 * v1 pipeline configuration for the SearXNG citation gate (spec §3, verbatim).
 *
 * Governing philosophy: FAIL-CLOSED ONLY AT ZERO. A step refuses to synthesize only when zero
 * distinct resolvable primary sources survive grading. Sparse-but-real evidence ships with a
 * visible coverage tier — never dropped, never fabricated.
 *
 * DO NOT raise `min_distinct_sources` above 1 or add a breadth floor — explicitly rejected,
 * because sparse fields ARE the Failed Trial Archaeology finding.
 *
 * @module searxng-mcp/gate.config
 */

module.exports = {
  fail_closed: true,
  min_distinct_sources: 1, // global, ALL step types (v1)
  breadth_retries: 1, // one automatic query reformulation on THIN breadth steps
  depth_retries: 0, // depth steps never retry
  thin_threshold: 2, // THIN = distinct A/B/C count < 2  (0 or 1)
  rerank: false, // stays OFF in v1
  topic_default: "science",

  // Grade-C allowlist — hosts whose URL is itself a resolvable primary/authoritative source.
  // Subdomains match. LOAD-BEARING for Failed Trial Archaeology / Investor Pre-Mortem: a domain
  // wrongly ABSENT here = a real primary source silently downgraded to D and dropped. Extend
  // deliberately against domains that actually appear in real source sets.
  primary_source_domains: [
    "ncbi.nlm.nih.gov",
    "clinicaltrials.gov",
    "fda.gov",
    "accessdata.fda.gov",
    "ema.europa.eu",
    "who.int",
    "cdc.gov",
    "europepmc.org",
    "sec.gov", // EDGAR
    "patents.google.com",
    "patentscope.wipo.int",
    "ebi.ac.uk",
    "doi.org", // DOI resolver → publisher primary
    // --- extended 2026-07-07: additional top-tier primary/authoritative sources ---
    // broader US gov / library (covers dailymed, medlineplus, pubmed subdomains via subdomain match)
    "nih.gov",
    "nlm.nih.gov",
    "medlineplus.gov",
    // national + international clinical-trial registries (each record is a resolvable primary source)
    "clinicaltrialsregister.eu", // EU CTR / EudraCT
    "euclinicaltrials.eu", // EU CTIS
    "isrctn.com",
    "anzctr.org.au",
    "chictr.org.cn",
    "umin.ac.jp",
    "ctri.nic.in",
    // major medicines regulators (labels / assessment reports)
    "mhra.gov.uk",
    "tga.gov.au",
    "pmda.go.jp",
    "canada.ca", // Health Canada (health-products; broad but authoritative gov domain)
    // authoritative guidelines / evidence synthesis
    "nice.org.uk",
    "cochranelibrary.com",
    // primary bio-data repositories + DOI/registry metadata
    "crossref.org",
    "uniprot.org",
    "rcsb.org", // Protein Data Bank
    "ensembl.org",
    "genome.gov",
  ],
};
