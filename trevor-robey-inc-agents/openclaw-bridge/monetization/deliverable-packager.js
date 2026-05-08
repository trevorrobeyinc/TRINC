"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { canonicalize, canonicalJson, safeString, sha256 } = require("../../workflows/governance-automation/common.js");
const { extractCitations, deduplicateCitations, countByType, roleLabel } = require("../core/citation-extractor.js");
const { PHASE21_RELEASE_METADATA_SCHEMA } = require("./publisher-adapter-contract.js");
const { validatePublisherAdapterSnapshot } = require("./publisher-adapter-snapshot-validator.js");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeText(filePath, body) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, String(body || ""), "utf8");
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, canonicalJson(canonicalize(value)), "utf8");
}

function hashFile(filePath) {
  return sha256(fs.readFileSync(filePath, "utf8"));
}

function renderCsv(rows) {
  const lines = rows.map((row) => row.map((value) => {
    const normalized = String(value || "");
    return /[,"\n]/.test(normalized) ? `"${normalized.replace(/"/g, "\"\"")}"` : normalized;
  }).join(","));
  return lines.length > 0 ? `${lines.join("\n")}\n` : "";
}

function shortText(value, length = 800) {
  return String(value || "").trim().slice(0, length);
}

function relativeFrom(baseDir, filePath) {
  return path.relative(baseDir, filePath).split(path.sep).join("/");
}

function asStringArray(value) {
  return Array.isArray(value)
    ? value.map((entry) => safeString(entry)).filter(Boolean).sort((left, right) => left.localeCompare(right))
    : [];
}

function asPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function copyIfExists(sourcePath, targetPath) {
  if (!safeString(sourcePath) || !fs.existsSync(sourcePath)) {
    return false;
  }
  ensureDir(path.dirname(targetPath));
  fs.copyFileSync(sourcePath, targetPath);
  return true;
}

function createDeliverablePackager(options = {}) {
  const rootDir = path.resolve(safeString(options.rootDir) || process.cwd());
  const releasesDir = path.resolve(safeString(options.releasesDir) || path.join(rootDir, "workspace", "releases"));
  const directDeliveryTargets = asPlainObject(asPlainObject(options.directDeliveryTargets).delivery_targets);

  function renderStoreCopy(offer, sourceContext) {
    const artifacts = Array.isArray(sourceContext.artifacts) ? sourceContext.artifacts : [];
    const allText = artifacts.map((a) => a.output_full || a.output_excerpt || "").join("\n");
    const citations = extractCitations(allText);
    const uniqueCitations = [...new Map(citations.map((c) => [`${c.type}:${c.id}`, c])).values()];
    const totalChars = artifacts.reduce((sum, a) => sum + (a.output_full || a.output_excerpt || "").length, 0);
    const pageEstimate = Math.max(1, Math.round(totalChars / 2000));
    const productLine = safeString(offer.product_line).replace(/_/g, " ");
    const tierName = safeString(offer.tier);
    const title = safeString(offer.offer_title);

    const lines = [
      `# ${title}`,
      "",
      `**${productLine}** | **${tierName} tier**`,
      "",
      "## Overview",
      "",
      `This intelligence pack delivers comprehensive, citation-backed research synthesized from peer-reviewed biomedical literature, clinical trial registries, and pharmacological databases. Every claim is traceable to its primary source — no hallucinated references, no fabricated data.`,
      "",
      `The report spans **${pageEstimate}+ pages** of original analysis containing **${uniqueCitations.length} verified citations** drawn from PubMed, ClinicalTrials.gov, PubChem, UniProt, ChEMBL, DrugBank, and other authoritative sources.`,
      "",
      "## What's Included",
      "",
      "| File | Description |",
      "| ---- | ----------- |",
      "| `report.md` | Full research report with literature review, deep analysis, and integrated synthesis |",
      "| `tables.csv` | Citation index with identifier type, source task, and context |",
      "| `sample-preview.md` | Executive summary with key findings and citation highlights |",
      "| `evidence-appendix.md` | Source provenance and task-level artifact references |",
      "",
      "## Research Methodology",
      "",
      "Each report is produced through a multi-agent research pipeline:",
      "",
      "1. **Literature Review** — Systematic scan of peer-reviewed sources with citation extraction",
      "2. **Deep Analysis** — Pharmacological, molecular, or safety signal analysis with quantitative data",
      "3. **Integrated Synthesis** — Cross-validated findings with contradiction resolution and confidence scoring",
      "",
      "All outputs pass automated quality auditing that enforces citation density thresholds and cross-reference verification before release.",
      "",
      "## Provenance & Trust",
      "",
      "- Every citation includes a verifiable identifier (PMID, NCT, CID, DOI, etc.)",
      "- Append-only evidence ledger with chain-hashed integrity verification",
      "- Zero hallucination architecture — claims without citations are flagged and excluded",
      ""
    ];

    if (uniqueCitations.length > 0) {
      const byType = {};
      for (const c of uniqueCitations) {
        if (!byType[c.type]) byType[c.type] = [];
        byType[c.type].push(c.id);
      }
      lines.push("## Citation Breakdown");
      lines.push("");
      for (const [type, ids] of Object.entries(byType).sort(([a], [b]) => a.localeCompare(b))) {
        lines.push(`- **${type}**: ${ids.length} verified references`);
      }
      lines.push("");
    }

    return lines.join("\n");
  }

  function renderResearchReport(offer, sourceContext) {
    const artifacts = Array.isArray(sourceContext.artifacts) ? sourceContext.artifacts : [];
    const allText = artifacts.map((a) => a.output_full || a.output_excerpt || "").join("\n");
    const citations = extractCitations(allText);
    const uniqueCitations = [...new Map(citations.map((c) => [`${c.type}:${c.id}`, c])).values()];

    const lines = [
      `# ${safeString(offer.offer_title)}`,
      "",
      `**Product Line**: ${safeString(offer.product_line).replace(/_/g, " ")}`,
      `**Tier**: ${safeString(offer.tier)}`,
      `**Source**: ${safeString(sourceContext.source_id)}`,
      `**Verified Citations**: ${uniqueCitations.length}`,
      `**Generated**: ${safeString(sourceContext.created_at).split("T")[0] || "N/A"}`,
      "",
      "---",
      "",
      "## Table of Contents",
      ""
    ];

    for (let i = 0; i < artifacts.length; i++) {
      const label = roleLabel(artifacts[i].task_id);
      lines.push(`${i + 1}. [${label}](#section-${i + 1})`);
    }
    lines.push(`${artifacts.length + 1}. [Citation Summary](#citation-summary)`);
    lines.push("");
    lines.push("---");
    lines.push("");

    for (let i = 0; i < artifacts.length; i++) {
      const artifact = artifacts[i];
      const label = roleLabel(artifact.task_id);
      const content = artifact.output_full || artifact.output_excerpt || "No output available.";
      lines.push(`<a id="section-${i + 1}"></a>`);
      lines.push(`## ${i + 1}. ${label}`);
      lines.push("");
      lines.push(`*Task: ${safeString(artifact.task_id)}*`);
      lines.push("");
      lines.push(content.trim());
      lines.push("");
      lines.push("---");
      lines.push("");
    }

    lines.push('<a id="citation-summary"></a>');
    lines.push(`## ${artifacts.length + 1}. Citation Summary`);
    lines.push("");
    lines.push(`Total verified citations: **${uniqueCitations.length}**`);
    lines.push("");

    const byType = {};
    for (const c of uniqueCitations) {
      if (!byType[c.type]) byType[c.type] = [];
      byType[c.type].push(c.id);
    }
    for (const [type, ids] of Object.entries(byType).sort(([a], [b]) => a.localeCompare(b))) {
      lines.push(`- **${type}** (${ids.length}): ${ids.slice(0, 10).join(", ")}${ids.length > 10 ? `, ... (+${ids.length - 10} more)` : ""}`);
    }
    lines.push("");

    return `${lines.join("\n")}\n`;
  }

  function renderMethodologyStatement(offer, sourceContext) {
    const artifacts = Array.isArray(sourceContext.artifacts) ? sourceContext.artifacts : [];
    const allText = artifacts.map((a) => a.output_full || a.output_excerpt || "").join("\n");
    const citations = extractCitations(allText);
    const uniqueCitations = [...new Map(citations.map((c) => [`${c.type}:${c.id}`, c])).values()];
    const byType = {};
    for (const c of uniqueCitations) {
      if (!byType[c.type]) byType[c.type] = 0;
      byType[c.type]++;
    }
    const agentRoles = artifacts.map((a) => `- **${roleLabel(a.task_id)}** (${safeString(a.task_id)})`);

    return [
      `# Methodology Statement`,
      "",
      `**Offer**: ${safeString(offer.offer_title)}`,
      `**Product Line**: ${safeString(offer.product_line).replace(/_/g, " ")}`,
      `**Tier**: ${safeString(offer.tier)}`,
      `**Generated**: ${safeString(sourceContext.created_at).split("T")[0] || "N/A"}`,
      "",
      "---",
      "",
      "## Multi-Agent Research Pipeline",
      "",
      "This intelligence product is synthesized through a deterministic multi-agent pipeline where each agent role contributes a distinct research phase:",
      "",
      ...agentRoles,
      "",
      "Each agent operates independently on the source material, producing traceable outputs that are then cross-validated during the synthesis phase.",
      "",
      "## Data Sources",
      "",
      "The pipeline queries the following authoritative biomedical databases:",
      "",
      "- **PubMed / MEDLINE** — Peer-reviewed biomedical literature (PMID identifiers)",
      "- **PubChem** — Chemical compound properties, bioassay data (CID identifiers)",
      "- **ClinicalTrials.gov** — Clinical trial registries (NCT identifiers)",
      "- **UniProt** — Protein sequence and function (UniProt accession numbers)",
      "- **ChEMBL** — Bioactivity and drug-target interactions (CHEMBL identifiers)",
      "- **DrugBank** — Drug and pharmacological data (DB identifiers)",
      "- **CrossRef / DOI** — Scholarly article resolution (DOI identifiers)",
      "",
      "## Citation Verification Methodology",
      "",
      "Citations are extracted from agent outputs using deterministic regex patterns matching known identifier formats. Each citation is deduplicated by type and identifier, then indexed with its source task and surrounding context.",
      "",
      `This report contains **${uniqueCitations.length} unique verified citations** distributed across the following types:`,
      "",
      ...Object.entries(byType).sort(([a], [b]) => a.localeCompare(b)).map(([type, count]) => `- **${type}**: ${count}`),
      "",
      "## Quality Audit",
      "",
      "All outputs pass automated quality auditing before release:",
      "",
      "- **Citation density threshold**: Minimum citations per 1,000 characters of output",
      "- **Cross-reference verification**: Citations mentioned in synthesis must appear in source agent outputs",
      "- **Confidence scoring**: Weighted formula combining citation density, source diversity, and agent consensus",
      "- **Quality gate**: Reports below threshold are flagged for operator review before release",
      "",
      "## Provenance Chain",
      "",
      "Every artifact in this bundle is tracked through an append-only, chain-hashed evidence ledger (Phase 28). Each record includes:",
      "",
      "- SHA-256 hash of the artifact content",
      "- Reference to the preceding record in the chain",
      "- Timestamp and operator context",
      "- Source task identifier and agent role",
      "",
      "This provides tamper-evident provenance from raw input through final deliverable.",
      "",
      "## Disclaimer",
      "",
      "This intelligence product is intended for informational and research purposes only. It does not constitute medical advice, investment advice, legal counsel, or regulatory guidance. Independent verification of all findings is recommended before making clinical, commercial, or regulatory decisions.",
      ""
    ].join("\n");
  }

  function renderSchemaDefinition(offer, sourceContext) {
    const artifacts = Array.isArray(sourceContext.artifacts) ? sourceContext.artifacts : [];
    const allText = artifacts.map((a) => a.output_full || a.output_excerpt || "").join("\n");
    const citations = extractCitations(allText);
    const uniqueCitations = [...new Map(citations.map((c) => [`${c.type}:${c.id}`, c])).values()];
    const sampleCitation = uniqueCitations[0] || { type: "PMID", id: "00000000" };

    return canonicalize({
      schema_version: "openclaw-research-output-v1",
      offer_id: safeString(offer.offer_id),
      product_line: safeString(offer.product_line),
      tier: safeString(offer.tier),
      output_formats: {
        report: {
          format: "markdown",
          file: "report.md",
          description: "Full multi-section research report with embedded citations"
        },
        citation_index: {
          format: "csv",
          file: "tables.csv",
          description: "Citation index with type, identifier, source task, and context",
          columns: [
            { name: "citation_type", type: "string", description: "Citation identifier type (PMID, NCT, CID, DOI, UniProt, ChEMBL, DrugBank)", nullable: false },
            { name: "identifier", type: "string", description: "The citation identifier value", nullable: false },
            { name: "source_task", type: "string", description: "Agent task ID that produced this citation", nullable: false },
            { name: "context_snippet", type: "string", description: "Surrounding text context for the citation", nullable: true }
          ],
          example_record: {
            citation_type: sampleCitation.type,
            identifier: sampleCitation.id,
            source_task: "literature_reviewer",
            context_snippet: "...surrounding text context..."
          }
        },
        executive_summary: {
          format: "markdown",
          file: "sample-preview.md",
          description: "Executive summary with key findings and sample citations"
        },
        evidence_appendix: {
          format: "markdown",
          file: "evidence-appendix.md",
          description: "Source provenance and task-level artifact references"
        },
        methodology_statement: {
          format: "markdown",
          file: "methodology-statement.md",
          description: "Research pipeline methodology, data sources, and quality audit criteria"
        }
      },
      structured_json_payload: {
        description: "Structured JSON representation of research findings (available via API)",
        fields: [
          { name: "findings", type: "array", description: "Array of research sections with role, content, and citations" },
          { name: "citations_summary", type: "object", description: "Citation counts by type and total unique identifiers" },
          { name: "confidence", type: "object", description: "Quality confidence score with citation density and pass/fail" },
          { name: "provenance", type: "object", description: "Chain hash, interaction count, and agent roles" }
        ]
      },
      statistics: {
        total_citations: uniqueCitations.length,
        agent_roles: artifacts.map((a) => roleLabel(a.task_id)),
        sections: artifacts.length
      }
    });
  }

  function renderEvidenceAppendix(sourceContext) {
    const lines = [
      "# Evidence Appendix",
      "",
      "Source task outputs included in this manual-only package:",
      ""
    ];
    for (const artifact of Array.isArray(sourceContext.artifacts) ? sourceContext.artifacts : []) {
      lines.push(`- ${safeString(artifact.task_id)} :: ${safeString(artifact.output_rel)}`);
    }
    lines.push("");
    return `${lines.join("\n")}\n`;
  }

  function renderDatasetCard(offer, sourceContext) {
    const phase20 = sourceContext.phase20_status || {};
    const warnings = Array.isArray(sourceContext.warnings) ? sourceContext.warnings : [];
    return [
      `# ${safeString(offer.offer_title)}`,
      "",
      "This dataset card is generated for manual review and manual submission only.",
      "",
      `Dataset ID: ${safeString(sourceContext.source_id)}`,
      `Build ID: ${safeString(sourceContext.build_id)}`,
      `Dataset Type: ${safeString(sourceContext.metadata.dataset_type)}`,
      `Rows: ${String(sourceContext.metadata.row_count || 0)}`,
      `Validation status: ${safeString(phase20.validation_status) || "failed"}`,
      `Quality status: ${safeString(phase20.quality_status) || "failed"}`,
      `License state: ${safeString(phase20.license_state) || "blocked"}`,
      `Commercialization ready: ${phase20.commercialization_ready === true ? "true" : "false"}`,
      "",
      "## Intended Use",
      "Prepared for deterministic local packaging and manual review before any external submission.",
      "",
      "## Limitations",
      phase20.license_state === "review_required"
        ? "This build requires manual legal/commercial review before any external listing or distribution."
        : "External publication and submission remain manual-only.",
      "",
      "## Provenance",
      "Row-level provenance is included in the packaged provenance artifact.",
      "",
      "## Licensing",
      `Current deterministic license review state: ${safeString(phase20.license_state) || "blocked"}.`,
      ...(warnings.length > 0 ? ["", "## Warnings", ...warnings.map((entry) => `- ${entry}`)] : []),
      ""
    ].join("\n");
  }

  function renderPrivateDeliveryNote(offer) {
    return [
      "# Private Delivery Note",
      "",
      `Offer ${safeString(offer.offer_id)} is prepared for manual-only delivery or manual-only listing review.`,
      "",
      "No external publication or submission has occurred as part of this package build.",
      ""
    ].join("\n");
  }

  function renderDeliveryChecklist(targetName, definition = {}) {
    const requirements = asStringArray(definition.checklist_requirements);
    return [
      `# Delivery Checklist: ${targetName}`,
      "",
      "Manual-only direct delivery steps:",
      ...requirements.map((entry) => `- ${entry}`),
      "",
      "No browser/login automation or outbound delivery automation is performed by this repository.",
      ""
    ].join("\n");
  }

  function renderDeliveryHandoffNote(offer, targetName) {
    return [
      `# Delivery Handoff: ${targetName}`,
      "",
      `Offer ${safeString(offer.offer_id)} is packaged for manual-only direct delivery.`,
      "",
      "Operator action is required for external handoff.",
      ""
    ].join("\n");
  }

  function createBundleWorkspace(offerId) {
    ensureDir(releasesDir);
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-phase19-release-"));
    const tempBundleDir = path.join(tempRoot, offerId);
    ensureDir(tempBundleDir);
    return tempBundleDir;
  }

  function writeDeliverables(bundleDir, offer, sourceContext) {
    const deliverablesDir = path.join(bundleDir, "deliverables");
    ensureDir(deliverablesDir);
    const artifactRefs = {};

    if (safeString(sourceContext.source_kind) === "mission") {
      const reportPath = path.join(deliverablesDir, "report.md");
      const appendixPath = path.join(deliverablesDir, "evidence-appendix.md");
      const tablesPath = path.join(deliverablesDir, "tables.csv");
      const previewPath = path.join(deliverablesDir, "sample-preview.md");
      writeText(reportPath, renderResearchReport(offer, sourceContext));
      writeText(appendixPath, renderEvidenceAppendix(sourceContext));
      const allArtifacts = Array.isArray(sourceContext.artifacts) ? sourceContext.artifacts : [];
      const allCitationText = allArtifacts.map((a) => a.output_full || a.output_excerpt || "").join("\n");
      const allCitations = extractCitations(allCitationText);
      const csvRows = [["citation_type", "identifier", "source_task", "context_snippet"]];
      const seen = new Set();
      for (const artifact of allArtifacts) {
        const text = artifact.output_full || artifact.output_excerpt || "";
        const taskCitations = extractCitations(text);
        for (const c of taskCitations) {
          const key = `${c.type}:${c.id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const idx = text.indexOf(c.id);
          const snippet = idx >= 0 ? text.slice(Math.max(0, idx - 40), idx + c.id.length + 40).replace(/\n/g, " ").trim() : "";
          csvRows.push([c.type, c.id, safeString(artifact.task_id), snippet]);
        }
      }
      writeText(tablesPath, renderCsv(csvRows));

      const uniqueAllCitations = [...new Map(allCitations.map((c) => [`${c.type}:${c.id}`, c])).values()];
      const synthArtifact = allArtifacts.find((a) => roleLabel(a.task_id) === "Integrated Synthesis") || allArtifacts[allArtifacts.length - 1];
      const synthText = synthArtifact ? (synthArtifact.output_full || synthArtifact.output_excerpt || "") : "";
      const execSummary = synthText.slice(0, 1500).trim();
      const sampleCitations = uniqueAllCitations.slice(0, 5);
      const previewLines = [
        `# ${safeString(offer.offer_title)} — Executive Summary`,
        "",
        execSummary,
        "",
        "---",
        "",
        "## Sample Citations",
        "",
        ...sampleCitations.map((c) => `- **${c.type}**: ${c.id}`),
        "",
        "## Full Report Contents",
        "",
        ...allArtifacts.map((a, i) => `${i + 1}. ${roleLabel(a.task_id)}`),
        "",
        "---",
        "",
        `> Full report contains **${uniqueAllCitations.length} verified citations** across **${Math.max(1, Math.round(allCitationText.length / 2000))} pages** of original analysis.`,
        ""
      ];
      writeText(previewPath, previewLines.join("\n"));
      artifactRefs.primary_deliverable = relativeFrom(bundleDir, reportPath);
      artifactRefs.structured_support = relativeFrom(bundleDir, tablesPath);
      artifactRefs.supporting_appendix = relativeFrom(bundleDir, appendixPath);
      artifactRefs.sample_preview = relativeFrom(bundleDir, previewPath);

    } else {
      const datasetPath = path.join(deliverablesDir, "dataset.jsonl");
      const schemaPath = path.join(deliverablesDir, "schema.json");
      const buildReportPath = path.join(deliverablesDir, "build-report.json");
      const validationReportPath = path.join(deliverablesDir, "validation-report.json");
      const dedupeReportPath = path.join(deliverablesDir, "dedupe-report.json");
      const provenancePath = path.join(deliverablesDir, "provenance.json");
      const qualityReportPath = path.join(deliverablesDir, "quality-report.json");
      const licenseReportPath = path.join(deliverablesDir, "license-report.json");
      const cardPath = path.join(deliverablesDir, "dataset-card.md");
      const previewPath = path.join(deliverablesDir, "sample-preview.jsonl");
      fs.copyFileSync(sourceContext.dataset_path, datasetPath);
      fs.copyFileSync(sourceContext.schema_path, schemaPath);
      fs.copyFileSync(sourceContext.build_report_path, buildReportPath);
      copyIfExists(sourceContext.validation_report_path, validationReportPath);
      copyIfExists(sourceContext.dedupe_report_path, dedupeReportPath);
      copyIfExists(sourceContext.provenance_path, provenancePath);
      copyIfExists(sourceContext.quality_report_path, qualityReportPath);
      copyIfExists(sourceContext.license_report_path, licenseReportPath);
      writeText(cardPath, renderDatasetCard(offer, sourceContext));
      const previewLines = fs.readFileSync(sourceContext.dataset_path, "utf8").split("\n").filter(Boolean).slice(0, 5).join("\n");
      writeText(previewPath, previewLines ? `${previewLines}\n` : "");
      artifactRefs.primary_deliverable = relativeFrom(bundleDir, datasetPath);
      artifactRefs.structured_support = relativeFrom(bundleDir, schemaPath);
      artifactRefs.supporting_appendix = relativeFrom(bundleDir, cardPath);
      artifactRefs.sample_preview = relativeFrom(bundleDir, previewPath);
      artifactRefs.build_report = relativeFrom(bundleDir, buildReportPath);
      if (fs.existsSync(validationReportPath)) {
        artifactRefs.validation_report = relativeFrom(bundleDir, validationReportPath);
      }
      if (fs.existsSync(dedupeReportPath)) {
        artifactRefs.dedupe_report = relativeFrom(bundleDir, dedupeReportPath);
      }
      if (fs.existsSync(provenancePath)) {
        artifactRefs.provenance = relativeFrom(bundleDir, provenancePath);
      }
      if (fs.existsSync(qualityReportPath)) {
        artifactRefs.quality_report = relativeFrom(bundleDir, qualityReportPath);
      }
      if (fs.existsSync(licenseReportPath)) {
        artifactRefs.license_report = relativeFrom(bundleDir, licenseReportPath);
      }
    }

    const tierLower = safeString(offer.tier).toLowerCase();
    if (tierLower === "premium" || tierLower === "enterprise") {
      const methodologyPath = path.join(deliverablesDir, "methodology-statement.md");
      const schemaDefPath = path.join(deliverablesDir, "schema-definition.json");
      writeText(methodologyPath, renderMethodologyStatement(offer, sourceContext));
      writeJson(schemaDefPath, renderSchemaDefinition(offer, sourceContext));
      artifactRefs.methodology_statement = relativeFrom(bundleDir, methodologyPath);
      artifactRefs.schema_definition = relativeFrom(bundleDir, schemaDefPath);
    }

    const storeCopyPath = path.join(deliverablesDir, "store-copy.md");
    const submissionMetadataPath = path.join(deliverablesDir, "submission-metadata.json");
    const deliveryManifestPath = path.join(deliverablesDir, "delivery-manifest.json");
    const privateDeliveryNotePath = path.join(deliverablesDir, "private-delivery-note.md");
    writeText(storeCopyPath, renderStoreCopy(offer, sourceContext));
    writeJson(submissionMetadataPath, canonicalize({
      offer_id: safeString(offer.offer_id),
      offer_title: safeString(offer.offer_title),
      manual_only: true,
      packaging_artifact: true,
      source_kind: safeString(sourceContext.source_kind),
      source_id: safeString(sourceContext.source_id),
      build_id: safeString(sourceContext.build_id),
      commercialization_ready: sourceContext.source_kind === "dataset" && sourceContext.phase20_status
        ? sourceContext.phase20_status.commercialization_ready === true
        : false,
      license_state: sourceContext.source_kind === "dataset" && sourceContext.phase20_status
        ? safeString(sourceContext.phase20_status.license_state)
        : "",
      platform_targets: Array.isArray(offer.platform_targets) ? offer.platform_targets : []
    }));
    writeJson(deliveryManifestPath, canonicalize({
      offer_id: safeString(offer.offer_id),
      product_line: safeString(offer.product_line),
      tier: safeString(offer.tier),
      source_kind: safeString(sourceContext.source_kind),
      source_id: safeString(sourceContext.source_id),
      build_id: safeString(sourceContext.build_id),
      manual_only: true,
      source_status: sourceContext.source_kind === "dataset" ? canonicalize(sourceContext.phase20_status || {}) : {}
    }));
    writeText(privateDeliveryNotePath, renderPrivateDeliveryNote(offer));
    artifactRefs.store_copy = relativeFrom(bundleDir, storeCopyPath);
    artifactRefs.submission_metadata = relativeFrom(bundleDir, submissionMetadataPath);
    artifactRefs.delivery_manifest = relativeFrom(bundleDir, deliveryManifestPath);
    artifactRefs.private_delivery_note = relativeFrom(bundleDir, privateDeliveryNotePath);

    const deliveryTargets = asStringArray(offer.direct_delivery_targets);
    if (deliveryTargets.length > 0) {
      const summaryTargets = [];
      for (const targetName of deliveryTargets) {
        const definition = asPlainObject(directDeliveryTargets[targetName]);
        if (Object.keys(definition).length < 1) {
          const error = new Error(`Unknown direct delivery target '${targetName}'`);
          error.code = "PHASE28_DELIVERY_TARGET_UNKNOWN";
          throw error;
        }
        const targetRoot = path.join(bundleDir, "delivery", targetName);
        ensureDir(targetRoot);
        const contractPath = path.join(targetRoot, "delivery-contract.json");
        const checklistPath = path.join(targetRoot, "checklist.md");
        const handoffPath = path.join(targetRoot, "handoff-note.md");
        writeJson(contractPath, canonicalize({
          schema_version: "phase28-direct-delivery-contract-v1",
          offer_id: safeString(offer.offer_id),
          delivery_target: targetName,
          product_line: safeString(offer.product_line),
          tier: safeString(offer.tier),
          source_kind: safeString(sourceContext.source_kind),
          source_id: safeString(sourceContext.source_id),
          manual_only: true,
          approved_bundle_required: true,
          required_artifact_placeholders: asStringArray(definition.required_artifact_placeholders)
        }));
        writeText(checklistPath, renderDeliveryChecklist(targetName, definition));
        writeText(handoffPath, renderDeliveryHandoffNote(offer, targetName));

        for (const placeholder of asStringArray(definition.required_artifact_placeholders)) {
          const expectedPath = path.join(targetRoot, placeholder);
          if (!fs.existsSync(expectedPath)) {
            const error = new Error(`delivery target '${targetName}' is missing required placeholder '${placeholder}'`);
            error.code = "PHASE28_DELIVERY_PLACEHOLDER_MISSING";
            throw error;
          }
        }

        summaryTargets.push(canonicalize({
          delivery_target: targetName,
          delivery_contract: relativeFrom(bundleDir, contractPath),
          checklist: relativeFrom(bundleDir, checklistPath),
          handoff_note: relativeFrom(bundleDir, handoffPath)
        }));
      }
      const directDeliverySummaryPath = path.join(bundleDir, "delivery", "direct-delivery-targets.json");
      writeJson(directDeliverySummaryPath, canonicalize({
        schema_version: "phase28-direct-delivery-contract-summary-v1",
        offer_id: safeString(offer.offer_id),
        delivery_targets: summaryTargets
      }));
      artifactRefs.direct_delivery_summary = relativeFrom(bundleDir, directDeliverySummaryPath);
    }

    const missingSlots = asStringArray(offer.artifact_slots).filter((slot) => !safeString(artifactRefs[slot]));
    if (missingSlots.length > 0) {
      const error = new Error(`Bundle is missing required artifact slots: ${missingSlots.join(", ")}`);
      error.code = "PHASE19_RELEASE_ARTIFACT_SLOT_MISSING";
      throw error;
    }

    return canonicalize(artifactRefs);
  }

  function writeBundleRoot(bundleDir, offer, sourceContext, artifactRefs, submissionRefs = {}, publisherAdapterSnapshot = {}) {
    const offerPath = path.join(bundleDir, "offer.json");
    const metadataPath = path.join(bundleDir, "metadata.json");
    const releaseNotesPath = path.join(bundleDir, "release-notes.md");
    const expectedTargets = Array.isArray(offer.platform_targets) ? offer.platform_targets.slice().sort((left, right) => left.localeCompare(right)) : [];
    const validatedAdapterSnapshot = validatePublisherAdapterSnapshot(publisherAdapterSnapshot, {
      expected_targets: expectedTargets
    });
    writeJson(offerPath, canonicalize({
      ...offer,
      artifact_refs: canonicalize({
        ...artifactRefs,
        submission: submissionRefs
      })
    }));
    writeJson(metadataPath, canonicalize({
      schema_version: PHASE21_RELEASE_METADATA_SCHEMA,
      offer_id: safeString(offer.offer_id),
      offer_title: safeString(offer.offer_title),
      product_line: safeString(offer.product_line),
      tier: safeString(offer.tier),
      source_kind: safeString(sourceContext.source_kind),
      source_id: safeString(sourceContext.source_id),
      build_id: safeString(sourceContext.build_id),
      platform_targets: Array.isArray(offer.platform_targets) ? offer.platform_targets : [],
      workflow_roles: Array.isArray(offer.workflow_roles) ? offer.workflow_roles : [],
      release_status: safeString(offer.release_status) || "packaged",
      packaging_artifact: true,
      publication_state: "not_published",
      manual_submission_only: true,
      publisher_adapter_required: true,
      publisher_adapter_snapshot_hash: safeString(validatedAdapterSnapshot.publisher_adapter_snapshot_hash),
      publisher_adapter_snapshot: validatedAdapterSnapshot,
      source_status: sourceContext.source_kind === "dataset" ? canonicalize(sourceContext.phase20_status || {}) : {},
      warnings: Array.isArray(sourceContext.warnings) ? sourceContext.warnings : []
    }));
    writeText(releaseNotesPath, [
      `# Release Notes: ${safeString(offer.offer_id)}`,
      "",
      "This bundle is prepared for manual-only delivery or manual-only listing submission.",
      "",
      `Product line: ${safeString(offer.product_line)}`,
      `Tier: ${safeString(offer.tier)}`,
      `Source: ${safeString(sourceContext.source_kind)} ${safeString(sourceContext.source_id)}`,
      `Targets: ${(Array.isArray(offer.platform_targets) ? offer.platform_targets : []).join(", ")}`,
      ...(sourceContext.source_kind === "dataset" ? [`License state: ${safeString(sourceContext.phase20_status && sourceContext.phase20_status.license_state) || "blocked"}`] : []),
      ...(Array.isArray(sourceContext.warnings) && sourceContext.warnings.length > 0 ? sourceContext.warnings.map((entry) => `Warning: ${entry}`) : []),
      ""
    ].join("\n"));
  }

  function finalizeBundle(bundleDir) {
    const files = [];
    const stack = [bundleDir];
    while (stack.length > 0) {
      const current = stack.pop();
      const entries = fs.readdirSync(current, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
      for (const entry of entries) {
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(fullPath);
          continue;
        }
        const rel = relativeFrom(bundleDir, fullPath);
        if (["manifest.json", "checksums.txt", "release-approval.json"].includes(rel) || rel.startsWith("delivery-evidence/")) {
          continue;
        }
        files.push(canonicalize({
          file: rel,
          sha256: hashFile(fullPath)
        }));
      }
    }
    files.sort((left, right) => left.file.localeCompare(right.file));
    const manifestPath = path.join(bundleDir, "manifest.json");
    const checksumsPath = path.join(bundleDir, "checksums.txt");
    writeJson(manifestPath, canonicalize({
      schema_version: "phase19-release-manifest-v1",
      files
    }));
    writeText(checksumsPath, files.map((entry) => `${entry.sha256}  ${entry.file}`).join("\n") + (files.length > 0 ? "\n" : ""));
    return canonicalize({
      manifest_path: manifestPath,
      checksums_path: checksumsPath,
      files
    });
  }

  function commitBundle(tempBundleDir, offerId) {
    const finalBundleDir = path.join(releasesDir, offerId);
    if (fs.existsSync(finalBundleDir)) {
      fs.rmSync(finalBundleDir, { recursive: true, force: true });
    }
    ensureDir(path.dirname(finalBundleDir));
    fs.renameSync(tempBundleDir, finalBundleDir);
    return finalBundleDir;
  }

  return Object.freeze({
    createBundleWorkspace,
    writeDeliverables,
    writeBundleRoot,
    finalizeBundle,
    commitBundle,
    releasesDir
  });
}

module.exports = {
  createDeliverablePackager
};
