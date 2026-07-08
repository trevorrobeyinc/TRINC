"use strict";

const WATERMARK = "Produced by OpenClaw Research Intelligence — https://trevorobeyinc.com";

function parseCsvPreview(csvContent, maxRows) {
  if (!csvContent) return "";
  const lines = csvContent.split("\n").filter((l) => l.trim());
  if (maxRows && lines.length > maxRows + 1) {
    return [lines[0], ...lines.slice(1, maxRows + 1)].join("\n");
  }
  return lines.join("\n");
}

const formatId = "data-and-sons";

function transform(workflowOutput, options = {}) {
  const templateId = workflowOutput.templateId || "biomedical-research";
  const citationCount = workflowOutput.citationCount || 0;

  const listing = {
    title: `Biomedical Research Intelligence: ${templateId}`,
    description: `Citation-backed research dataset with ${citationCount}+ verified identifiers. Deterministic 3-agent pipeline output with automated quality audit. ${WATERMARK}`,
    price: "$2,500",
    category: "Healthcare & Life Sciences",
    format: "CSV + Markdown + JSON",
    license: "CC-BY-NC-4.0",
    provider: "Trevor Robey, INC.",
    contact: "trevor@trevorobeyinc.com",
    website: "https://trevorobeyinc.com"
  };

  const dataDictionary = [
    `# Data Dictionary: ${templateId}`,
    "",
    "## Citation Index (data.csv)",
    "| Field | Type | Description |",
    "|-------|------|-------------|",
    "| type | string | Identifier type: PMID, NCT, CID, UniProt, ChEMBL, DOI |",
    "| id | string | Database identifier value |",
    "| context | string | Surrounding text where the citation appears |",
    "",
    "## Research Report (report.md)",
    "Multi-section markdown analysis with inline citations.",
    "Sections include: Executive Summary, Methodology, Findings, Evidence Assessment.",
    "",
    "## Sample Records",
    "```",
    parseCsvPreview(workflowOutput.citations, 5),
    "```",
    "",
    WATERMARK
  ].join("\n");

  const sampleCsv = parseCsvPreview(workflowOutput.citations, 5);

  return {
    files: [
      { name: "listing.json", content: JSON.stringify(listing, null, 2) },
      { name: "data-dictionary.md", content: dataDictionary },
      { name: "sample.csv", content: sampleCsv }
    ],
    metadata: { platform: "data-and-sons" }
  };
}

module.exports = { formatId, transform };
