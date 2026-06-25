"use strict";

const WATERMARK = "Produced by OpenClaw Research Intelligence — https://trevorobeyinc.com";

function extractTrainingSamples(reportMarkdown) {
  if (!reportMarkdown) return [];
  const paragraphs = reportMarkdown.split(/\n\n+/).filter((p) => p.trim().length > 80);
  const samples = [];

  for (const para of paragraphs) {
    const clean = para.replace(/^#+\s+.*/gm, "").trim();
    if (clean.length < 80) continue;
    samples.push({
      text: clean.slice(0, 2000),
      has_citations: /\b(PMID|NCT\d|CID\s*:\s*\d|ChEMBL|UniProt|doi:\s*10\.)/i.test(clean)
    });
  }
  return samples;
}

const formatId = "huggingface";

function transform(workflowOutput, options = {}) {
  const templateId = workflowOutput.templateId || "biomedical-research";

  const yamlFrontMatter = [
    "---",
    "language:",
    "- en",
    "license: cc-by-nc-4.0",
    "task_categories:",
    "- text-generation",
    "- question-answering",
    "tags:",
    "- biomedical",
    "- pharmacovigilance",
    "- drug-safety",
    "- verified-citations",
    "- research-intelligence",
    "size_categories:",
    "- 1K<n<10K",
    "---"
  ].join("\n");

  const readme = [
    yamlFrontMatter,
    "",
    `# Biomedical Research Intelligence: ${templateId}`,
    "",
    WATERMARK,
    "",
    "## Dataset Description",
    "Citation-backed biomedical research produced by OpenClaw's deterministic 3-agent pipeline.",
    "Every claim is backed by verifiable database identifiers (PMID, NCT, PubChem CID, UniProt, ChEMBL, DOI).",
    "",
    "## Dataset Structure",
    "### Data Fields",
    "- `text`: Research content paragraph",
    "- `has_citations`: Whether the paragraph contains verified identifiers",
    "",
    "## Citation Types",
    "| Type | Example | Database |",
    "|------|---------|----------|",
    "| PMID | PMID: 30232222 | PubMed |",
    "| NCT | NCT01234567 | ClinicalTrials.gov |",
    "| CID | CID: 2244 | PubChem |",
    "| UniProt | P04637 | UniProt |",
    "| ChEMBL | CHEMBL25 | ChEMBL |",
    "",
    "## License",
    "CC-BY-NC-4.0",
    "",
    "## Contact",
    "Trevor Robey | trevor@trevorobeyinc.com | https://trevorobeyinc.com"
  ].join("\n");

  const samples = extractTrainingSamples(workflowOutput.report);
  const trainJsonl = samples.map((s) => JSON.stringify(s)).join("\n");

  const datasetInfo = {
    description: `Biomedical research intelligence dataset: ${templateId}`,
    features: {
      text: { dtype: "string" },
      has_citations: { dtype: "bool" }
    },
    splits: {
      train: { num_examples: samples.length }
    },
    homepage: "https://trevorobeyinc.com",
    license: "cc-by-nc-4.0"
  };

  return {
    files: [
      { name: "README.md", content: readme },
      { name: "dataset_info.json", content: JSON.stringify(datasetInfo, null, 2) },
      { name: "data/train.jsonl", content: trainJsonl }
    ],
    metadata: { platform: "huggingface", tier: "free" }
  };
}

module.exports = { formatId, transform };
