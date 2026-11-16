"use strict";

const WATERMARK = "Produced by OpenClaw Research Intelligence — https://trevorobeyinc.com";

function parseCsvRows(csvContent, maxRows) {
  if (!csvContent) return [];
  const lines = csvContent.split("\n").filter((l) => l.trim());
  if (maxRows && lines.length > maxRows + 1) {
    return [lines[0], ...lines.slice(1, maxRows + 1)];
  }
  return lines;
}

// Rows after the header line. The citation index is the sealed release's tables.csv, whose header
// starts "citation_type" (the old "type" header check counted it as a citation; Tier 1 review).
function countCitations(csvContent) {
  if (!csvContent) return 0;
  const lines = csvContent.split("\n").filter((l) => l.trim());
  return /^(?:citation_type|type),/.test(lines[0] || "") ? lines.length - 1 : lines.length;
}

const formatId = "datarade";

function transform(workflowOutput, options = {}) {
  const tier = options.tier || "standard";
  const citationCount = workflowOutput.citationCount || countCitations(workflowOutput.citations);

  const priceRange = tier === "enterprise"
    ? "$9,950 - $24,950"
    : "$2,500 - $4,950";

  const listingFields = {
    title: `Biomedical Research Intelligence Pack — ${workflowOutput.templateId || "General"}`,
    // T1-9 (2026-11-14): the count is of CITED identifiers (the citation index), not verified ones;
    // no per-claim tracing exists; the role calls are unseeded model calls, so the pipeline is not
    // deterministic.
    description: `Citation-backed research intelligence citing ${citationCount} database identifiers (PMID, NCT, PubChem CID, UniProt, DOI), each checked against the records retrieved for the report. Produced by a 3-agent pipeline with an automated quality audit.`,
    data_categories: ["Healthcare", "Life Sciences", "Pharmacovigilance", "Drug Safety"],
    geographic_coverage: "Global",
    update_frequency: "On-demand",
    // T1-9: no research API is deployed; delivery is a manual download.
    delivery_method: "Download (manual delivery)",
    pricing: priceRange,
    tier,
    format: "Markdown report + CSV citation index + JSON metadata",
    citation_count: citationCount,
    quality_score: workflowOutput.qualityScore || null,
    provider: "Trevor Robey, INC.",
    contact: "trevor@trevorobeyinc.com",
    website: "https://trevorobeyinc.com"
  };

  const sampleLines = parseCsvRows(workflowOutput.citations, 10);
  const sampleCsv = sampleLines.join("\n");

  const productDescription = [
    `# ${listingFields.title}`,
    "",
    "## Overview",
    listingFields.description,
    "",
    "## What's Included",
    "- **Full Research Report**: Multi-section analysis with inline citations",
    `- **Citation Index CSV**: the ${citationCount} identifiers the report cites, each marked with whether it was found in the evidence retrieved for the report`,
    "- **Executive Summary**: Key findings and strategic implications",
    // Tier 1 review (2026-11-14): the packager writes these two only for premium and enterprise tiers.
    "- **Methodology Statement** (premium and enterprise tiers): Agent pipeline, data sources, quality metrics",
    "- **Schema Definition** (premium and enterprise tiers): Machine-readable field definitions",
    "",
    "## Data Quality",
    "- Automated quality audit with citation density scoring",
    "- 3-agent pipeline (scout → analyst → synthesizer)",
    // T1-9: aligned with T1-3 (marks at every mention) and T1-7 (the screen names what it could not screen).
    "- Citation-integrity gated: every cited identifier is checked against the evidence retrieved for the report, and one not found there is flagged [UNVERIFIED] at every mention; a report in which fewer than 75% of cited identifiers trace is not released. Cited DOIs, PMIDs and PMCIDs are put through a retraction screen; a retraction found stops the report, and any paper it could not screen is named in the report's integrity ledger",
    "",
    `## Pricing`,
    `- Research Intelligence Pack: $2,500 - $4,950 per report`,
    `- Standard packs: $2,500 - $4,950`,
    `- Custom / enterprise engagements: $9,950 - $24,950 (private offer)`,
    "",
    `## Contact`,
    "Trevor Robey | trevor@trevorobeyinc.com | https://trevorobeyinc.com",
    "",
    WATERMARK
  ].join("\n");

  return {
    files: [
      { name: "listing-fields.json", content: JSON.stringify(listingFields, null, 2) },
      { name: "sample-data.csv", content: sampleCsv },
      { name: "product-description.md", content: productDescription }
    ],
    metadata: { platform: "datarade", listingReady: true, tier }
  };
}

module.exports = { formatId, transform };
