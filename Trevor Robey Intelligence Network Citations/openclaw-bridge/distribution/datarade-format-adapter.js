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

function countCitations(csvContent) {
  if (!csvContent) return 0;
  return csvContent.split("\n").filter((l) => l.trim() && !l.startsWith("type")).length;
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
    description: `Citation-backed research intelligence with ${citationCount}+ verified database identifiers. Every claim traces to a primary source (PMID, NCT, PubChem CID, UniProt, ChEMBL, DOI). Produced by deterministic 3-agent pipeline with automated quality audit.`,
    data_categories: ["Healthcare", "Life Sciences", "Pharmacovigilance", "Drug Safety"],
    geographic_coverage: "Global",
    update_frequency: "On-demand",
    delivery_method: "API / Download",
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
    `- **Citation Index CSV**: ${citationCount}+ verified identifiers across 7 types`,
    "- **Executive Summary**: Key findings and strategic implications",
    "- **Methodology Statement**: Agent pipeline, data sources, quality metrics",
    "- **Schema Definition**: Machine-readable field definitions",
    "",
    "## Data Quality",
    "- Every factual claim backed by verifiable database identifiers",
    "- Automated quality audit with citation density scoring",
    "- Deterministic 3-agent pipeline (scout → analyst → synthesizer)",
    "- No AI hallucination risk: all identifiers resolve in their source databases",
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
