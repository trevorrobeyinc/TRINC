"use strict";

const timeProvider = require("../core/time-provider.js");
const allowlist = require("./license-allowlist.js");

const formatId = "aws-data-exchange";

function transform(workflowOutput, options = {}) {
  const templateId = workflowOutput.templateId || "biomedical-research";
  const workflowId = workflowOutput.workflowId || "unknown";
  const now = timeProvider.nowIso();

  const productDescription = [
    `# Biomedical Research Intelligence: ${templateId}`,
    "",
    // T1-9 (2026-11-14): only what this bundle and this adapter actually do. transform() writes one
    // JSON file and uploads nothing; no per-claim, chain-hashed or cryptographic-provenance record exists.
    "## Product Overview",
    "Citation-backed biomedical research intelligence prepared for AWS Data Exchange.",
    "Every identifier the report cites was checked against the records retrieved for it, and any not found there is flagged [UNVERIFIED] in the report.",
    "",
    "## Data Files",
    "- data/research-output.json: the research report (Markdown), its citation index (the release's tables.csv, as CSV text) and the workflow, template and offer ids",
    "- schema.json and revision-metadata.json describe them",
    "- Prepared locally for a manual upload; nothing is uploaded automatically",
    "- Update frequency: on demand",
    "",
    "## Compliance",
    "- All data sourced from public databases (PubMed, ClinicalTrials.gov, PubChem, etc.)",
    "",
    "## Pricing",
    "- Subscription pricing is set per listing offer (monthly / annual auto-renew).",
    "- Private offers available for enterprise and custom engagements.",
    "",
    "## Provider",
    "Trevor Robey, INC. | trevor@trevorobeyinc.com | https://trevorobeyinc.com"
  ].join("\n");

  const revisionMetadata = {
    revision_id: `rev-${workflowId}`,
    created_at: now,
    schema_version: "1.0",
    template_id: templateId,
    workflow_id: workflowId,
    citation_count: workflowOutput.citationCount || 0,
    quality_score: workflowOutput.qualityScore || null
  };

  const schema = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    title: `Biomedical Research: ${templateId}`,
    type: "object",
    properties: {
      report: { type: "string", description: "Full research report in markdown" },
      // Tier 1 review (2026-11-14): the field holds the sealed release's tables.csv as CSV text, so the
      // schema says so (it described an array of {type,id,context} objects the file never held).
      citations: {
        type: "string",
        contentMediaType: "text/csv",
        description: "The release's citation index (tables.csv) as CSV text. Columns: citation_type, identifier, "
          + "source_task, context_snippet, grounded_in_run (yes: found in the evidence retrieved for the report; "
          + "no: not found, and flagged [UNVERIFIED] in the report; unknown: no citation-gate record)."
      },
      metadata: {
        type: "object",
        properties: {
          workflow_id: { type: "string" },
          template_id: { type: "string" },
          offer_id: { type: "string" }
        }
      }
    }
  };

  // Ids only: never the unsealed workflow.json, which carries local paths, run inputs and every step's
  // result (Tier 1 review, 2026-11-14).
  const dataContent = JSON.stringify({
    report: workflowOutput.report || "",
    citations: workflowOutput.citations || "",
    metadata: {
      workflow_id: workflowId,
      template_id: templateId,
      offer_id: String(workflowOutput.offerId || "")
    }
  }, null, 2);

  // License pre-flight (fail closed): no DrugBank, and no ChEMBL data/activity values, may ship.
  allowlist.assertShippable({ schema, citations: workflowOutput.citations, text: workflowOutput.report });

  return {
    files: [
      { name: "product-description.md", content: productDescription },
      { name: "revision-metadata.json", content: JSON.stringify(revisionMetadata, null, 2) },
      { name: "schema.json", content: JSON.stringify(schema, null, 2) },
      { name: "data/research-output.json", content: dataContent }
    ],
    metadata: { platform: "aws-data-exchange", requiresProviderAccount: true }
  };
}

module.exports = { formatId, transform };
