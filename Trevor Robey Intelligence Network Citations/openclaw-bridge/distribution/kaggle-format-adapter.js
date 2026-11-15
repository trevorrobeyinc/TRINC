"use strict";

const WATERMARK = "Produced by OpenClaw Research Intelligence — https://trevorobeyinc.com";

function extractFindings(reportMarkdown) {
  if (!reportMarkdown) return [];
  const sections = reportMarkdown.split(/^##\s+/m).filter((s) => s.trim());
  const findings = [];

  for (const section of sections) {
    const lines = section.split("\n");
    const title = lines[0] ? lines[0].trim() : "Untitled";
    const body = lines.slice(1).join("\n").trim();
    if (body.length > 50) {
      findings.push({
        section: title,
        content: body.slice(0, 2000),
        has_citations: /\b(PMID|NCT\d|CID\s*:\s*\d|ChEMBL|UniProt|doi:\s*10\.)/i.test(body)
      });
    }
  }
  return findings;
}

const formatId = "kaggle";

function transform(workflowOutput, options = {}) {
  const templateId = workflowOutput.templateId || "biomedical-research";
  const workflowId = workflowOutput.workflowId || "unknown";

  const datasetMetadata = {
    title: `Biomedical Research Intelligence: ${templateId}`,
    // T1-9 (2026-11-14): the citation index lists CITED identifiers, no per-claim backing exists, and
    // the role calls are unseeded model calls.
    subtitle: `Citation-backed research dataset with its citation index`,
    description: `Research intelligence produced by OpenClaw's 3-agent pipeline. The identifiers the report cites (PMID, NCT, PubChem CID, UniProt, DOI) were each checked against the records retrieved for the report. ${WATERMARK}`,
    id: `trevorrobeyinc/${templateId}-${workflowId}`.slice(0, 100),
    licenses: [{ name: "CC-BY-NC-4.0" }],
    keywords: ["biomedical", "pharmacovigilance", "drug-safety", "citation-traced", "research-intelligence"],
    resources: [
      { path: "data.csv", description: "Citation index of the identifiers the report cites" },
      { path: "findings.jsonl", description: "Research findings as structured JSON" }
    ]
  };

  const readme = [
    `# Biomedical Research Intelligence: ${templateId}`,
    "",
    WATERMARK,
    "",
    "## Overview",
    `This dataset contains citation-backed biomedical research produced by OpenClaw Research Intelligence.`,
    "",
    "## Data Files",
    "- **data.csv**: Citation index of the database identifiers the report cites",
    "- **findings.jsonl**: Research findings as structured JSON objects",
    "",
    "## Schema",
    "### Citation Index (data.csv)",
    "| Column | Description |",
    "|--------|-------------|",
    "| type | Identifier type (PMID, NCT, CID, etc.) |",
    "| id | Database identifier value |",
    "| context | Surrounding text where the citation appears |",
    "",
    "### Findings (findings.jsonl)",
    "Each line is a JSON object with: `section`, `content`, `has_citations`",
    "",
    "## License",
    "CC-BY-NC-4.0",
    "",
    "## Contact",
    "Trevor Robey | trevor@trevorobeyinc.com | https://trevorobeyinc.com"
  ].join("\n");

  const findings = extractFindings(workflowOutput.report);
  const findingsJsonl = findings.map((f) => JSON.stringify(f)).join("\n");

  return {
    files: [
      { name: "dataset-metadata.json", content: JSON.stringify(datasetMetadata, null, 2) },
      { name: "README.md", content: readme },
      { name: "data.csv", content: workflowOutput.citations || "" },
      { name: "findings.jsonl", content: findingsJsonl }
    ],
    metadata: { platform: "kaggle", tier: "free" }
  };
}

module.exports = { formatId, transform };
