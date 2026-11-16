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
    // T1-9 (2026-11-14): a count of CITED identifiers, and an unseeded (not deterministic) pipeline.
    description: `Citation-backed research dataset citing ${citationCount} identifiers, each checked against the records retrieved for the report. 3-agent pipeline output with automated quality audit. ${WATERMARK}`,
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
    // Tier 1 review (2026-11-14): the citation index is the sealed release's tables.csv.
    "## Citation Index (data.csv)",
    "| Field | Type | Description |",
    "|-------|------|-------------|",
    "| citation_type | string | Identifier type as the engine names it (PMID, NCT, PubChem CID, UniProt, DOI, …) |",
    "| identifier | string | The identifier as cited |",
    "| source_task | string | The report section (agent task) that first cites it |",
    "| context_snippet | string | Text around the first mention |",
    "| grounded_in_run | string | yes: found in the evidence retrieved for the report; no: not found, and flagged [UNVERIFIED] in the report; unknown: no citation-gate record |",
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
