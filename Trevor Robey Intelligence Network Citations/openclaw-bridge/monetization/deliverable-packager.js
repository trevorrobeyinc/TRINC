"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { canonicalize, canonicalJson, safeString, sha256 } = require("../../workflows/governance-automation/common.js");
const { extractCitations, deduplicateCitations, countByType, roleLabel } = require("../core/citation-extractor.js");
const { buildIntegrityReport } = require("./integrity-rating.js");
const { renderManifestMarkdown } = require("../core/reproducibility-manifest.js");
const { PHASE21_RELEASE_METADATA_SCHEMA } = require("./publisher-adapter-contract.js");
const { validatePublisherAdapterSnapshot } = require("./publisher-adapter-snapshot-validator.js");
const allowlist = require("../distribution/license-allowlist.js");

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

  // ── Citation-claim truth source ────────────────────────────────────────────────────────────
  // Customer-facing copy must report the REAL re-resolution outcome, never the raw extraction
  // tally. extractCitations()/deduplicateCitations() count identifiers FOUND IN PROSE by regex;
  // calling that number "verified" is an overclaim (a shipped bundle said "34 verified citations"
  // while its own manifest recorded 29 verified + 5 UNCHECKED). The real verdicts already travel
  // on sourceContext — workflow-engine.js sets source_context.citation_verification, whose
  // reproducibility_manifest.summary carries per-identifier VERIFIED / UNRESOLVED / UNCHECKED.
  //
  // { present:false } is a LEGITIMATE FAIL-SOFT STATE, not an error: per SYSTEM-REALITY.md §3 the
  // re-resolution pass is fail-soft and a report may ship with no manifest.
  function readResolutionSummary(sourceContext) {
    const cv = asPlainObject(asPlainObject(sourceContext).citation_verification);
    // `gated` separates TWO distinct absent-states that must not make the same claim:
    //   (a) gated:true  — the citation gate + retraction screen ran, but the fail-soft
    //                     re-resolution pass produced no manifest. Those gates ARE assertable.
    //   (b) gated:false — this bundle never went through the research path at all (dataset
    //                     bundles, hand-fed source contexts). renderStoreCopy is called for
    //                     EVERY bundle, so asserting (a)'s guarantees here would be a fresh
    //                     overclaim of exactly the class this module exists to prevent.
    const gated = Object.keys(cv).length > 0;
    const s = asPlainObject(asPlainObject(cv.reproducibility_manifest).summary);
    const counts = asPlainObject(s.counts);
    if (!Number.isFinite(counts.total) || counts.total < 1) return { present: false, gated, byType: {} };
    const num = (v) => (Number.isFinite(v) ? v : 0);
    return {
      present: true,
      gated: true,
      total: counts.total,
      verified: num(counts.verified),
      unresolved: num(counts.unresolved),
      unchecked: num(counts.unchecked),
      decision: safeString(s.delivery_decision),
      byType: asPlainObject(s.by_type)
    };
  }

  // The re-resolution CAPABILITY claim must never be softened to "grounding only" — the
  // per-identifier resolver is built, wired and verified (SYSTEM-REALITY.md §3 carries an explicit
  // copy-sweep warning that doing so is a false understatement). What varies per bundle is the
  // OUTCOME, which is read from the manifest instead of assumed. Claim strength therefore tracks
  // the same counts that produce delivery_decision: all-VERIFIED (DELIVER) reads at full strength,
  // anything else is stated with its real UNCHECKED / UNRESOLVED residue (DELIVER_WITH_FLAGS).
  function renderResolutionSentence(res) {
    if (!res.present) {
      if (!res.gated) {
        // No citation-verification record at all — claim neither gate. Identifiers are still
        // public and independently checkable, which is true of any bundle.
        return "Citations carry public identifiers (PMID, NCT, PubChem CID, DOI) that resolve in their issuing registries and can be checked directly. This bundle carries no citation-verification record, so no grounding, retraction-screen, or re-resolution outcome is asserted for it.";
      }
      // A per-bundle statement of fact, NOT the general softening SYSTEM-REALITY.md §3 forbids:
      // THIS bundle's gates ran but the fail-soft re-resolution pass produced no manifest.
      return "Every cited identifier is cross-checked against the source records actually retrieved at runtime, and cited DOIs and PMIDs are retraction-screened. A per-identifier re-resolution manifest is not included with this bundle.";
    }
    // Registries actually dispatched to, per citation-reresolver.js hostFor(). DrugBank is a
    // recognised identifier type but has NO resolver host, and the literal string is banned in
    // shipped content by the license allowlist — finalizeBundle would hard-fail the seal. Never
    // add it to this list.
    const registries = "PMID → NCBI E-utilities, DOI → Crossref with a doi.org fallback, "
      + "NCT → ClinicalTrials.gov, PubChem CID → PubChem, ChEMBL → ChEMBL, UniProt → UniProt, RxNorm → RxNav";
    if (res.decision === "BLOCK") {
      return `Every cited identifier is submitted at delivery for independent re-resolution against its issuing public registry (${registries}). `
        + `For this report the pass returned a BLOCKING result (${res.unresolved} of ${res.total} UNRESOLVED): this bundle is NOT cleared for delivery. `
        + "See the accompanying Reproducibility Manifest.";
    }
    const residue = [];
    if (res.unchecked > 0) residue.push(`${res.unchecked} returned no definitive answer and are recorded UNCHECKED`);
    if (res.unresolved > 0) residue.push(`${res.unresolved} did not resolve and are recorded UNRESOLVED`);
    // Full strength is gated on DELIVER, not merely on a clean residue: DELIVER is the only
    // decision that asserts "every identifier was re-resolved" (Q8 policy, doctrine-REQUIRED).
    const outcome = residue.length > 0
      ? `For this report ${res.verified} of ${res.total} resolved VERIFIED; ${residue.join("; ")}.`
      : res.decision === "DELIVER"
        ? `For this report all ${res.total} resolved VERIFIED.`
        : `For this report ${res.verified} of ${res.total} resolved VERIFIED (delivery decision: ${res.decision || "not recorded"}).`;
    return `Every cited identifier is submitted at delivery for independent re-resolution against its issuing public registry (${registries}). ${outcome} `
      + "Per-identifier results are recorded in the accompanying Reproducibility Manifest. Re-resolution confirms an "
      + "identifier resolves to a source record — it does not assess the scientific correctness of the source.";
  }

  // Per-type breakdown from the manifest when present; a plain cited count otherwise. Never
  // labels an extraction tally "verified".
  function renderTypeBreakdown(type, citedCount, res) {
    const t = asPlainObject(res.byType[type]);
    if (!res.present || !Number.isFinite(t.total)) return `- **${type}**: ${citedCount} cited`;
    const seg = [`${t.total} cited`, `${Number.isFinite(t.verified) ? t.verified : 0} VERIFIED`];
    if (Number.isFinite(t.unchecked) && t.unchecked > 0) seg.push(`${t.unchecked} UNCHECKED`);
    if (Number.isFinite(t.unresolved) && t.unresolved > 0) seg.push(`${t.unresolved} UNRESOLVED`);
    return `- **${type}**: ${seg.join(" · ")}`;
  }

  function renderStoreCopy(offer, sourceContext) {
    const artifacts = Array.isArray(sourceContext.artifacts) ? sourceContext.artifacts : [];
    const allText = artifacts.map((a) => a.output_full || a.output_excerpt || "").join("\n");
    const citations = extractCitations(allText);
    const uniqueCitations = deduplicateCitations(citations);
    const totalChars = artifacts.reduce((sum, a) => sum + (a.output_full || a.output_excerpt || "").length, 0);
    const pageEstimate = Math.max(1, Math.round(totalChars / 2000));
    const productLine = safeString(offer.product_line).replace(/_/g, " ");
    const tierName = safeString(offer.tier);
    const title = safeString(offer.offer_title);
    const resolution = readResolutionSummary(sourceContext);

    const lines = [
      `# ${title}`,
      "",
      `**${productLine}** | **${tierName} tier**`,
      "",
      "## Overview",
      "",
      `This intelligence pack delivers citation-backed research synthesized from peer-reviewed biomedical literature, clinical trial registries, and pharmacological databases. ${renderResolutionSentence(resolution)}`,
      "",
      resolution.present
        ? `The report spans **${pageEstimate}+ pages** of original analysis citing **${resolution.total} unique identifiers** (**${resolution.verified}** independently re-resolved VERIFIED) drawn from PubMed, ClinicalTrials.gov, PubChem, UniProt, ChEMBL, and other authoritative sources.`
        : `The report spans **${pageEstimate}+ pages** of original analysis citing **${uniqueCitations.length} unique identifiers** drawn from PubMed, ClinicalTrials.gov, PubChem, UniProt, ChEMBL, and other authoritative sources.`,
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
      "3. **Integrated Synthesis** — Cross-validated findings with contradiction resolution and citation-density scoring",
      "",
      "All outputs pass automated quality auditing that enforces citation density thresholds and cross-reference verification before release.",
      "",
      "## Provenance & Trust",
      "",
      "- Every citation includes a verifiable identifier (PMID, NCT, CID, DOI, etc.)",
      "- Append-only evidence ledger with chain-hashed integrity verification",
      // Retired 2026-07-13 (OFFERINGS.md, commit 7801443): the absolute "Zero hallucination
      // architecture — claims without citations are flagged and excluded" claim overstated twice
      // over. Ungrounded identifiers are NOT excluded: citation-gate.js annotateSubtaskOutputs
      // marks them [UNVERIFIED] inline and they SHIP ("honesty over completeness"). Do not
      // reintroduce an absolute no-hallucination claim here.
      // Gate-dependent: these two bullets describe the citation gate and the retraction screen.
      // A bundle with no citation-verification record never ran either, so claiming them there
      // would reintroduce the overclaim at a different line.
      ...(resolution.gated
        ? [
          "- **The Zero-Fabrication Guarantee** — every cited identifier is cross-checked at generation time against the evidence actually retrieved for this report; identifiers not found in that evidence are flagged `[UNVERIFIED]` inline and are never presented as fact, and a report below the grounded-citation floor does not ship",
          "- Cited DOIs and PMIDs are retraction-screened (Crossref for DOIs, PubMed for PMIDs, with a DOI→PMID cross-check); any retracted source blocks release"
        ]
        : ["- This bundle carries no citation-verification record: no grounding, retraction-screen, or re-resolution outcome is claimed for it"]),
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
      // When a manifest exists, drive the table off ITS types so the rows reconcile with the
      // total stated above. The manifest is built from the assembled report; `byType` here is
      // this module's own extraction over artifact text — different corpora, so a manifest type
      // missing from the extraction would otherwise be silently dropped from the table.
      const breakdownTypes = resolution.present
        ? Object.keys(resolution.byType).sort((a, b) => a.localeCompare(b))
        : Object.keys(byType).sort((a, b) => a.localeCompare(b));
      for (const type of breakdownTypes) {
        lines.push(renderTypeBreakdown(type, (byType[type] || []).length, resolution));
      }
      lines.push("");
    }

    return lines.join("\n");
  }

  function renderResearchReport(offer, sourceContext) {
    const artifacts = Array.isArray(sourceContext.artifacts) ? sourceContext.artifacts : [];
    const allText = artifacts.map((a) => a.output_full || a.output_excerpt || "").join("\n");
    const citations = extractCitations(allText);
    const uniqueCitations = deduplicateCitations(citations);
    const reportResolution = readResolutionSummary(sourceContext);

    const lines = [
      `# ${safeString(offer.offer_title)}`,
      "",
      `**Product Line**: ${safeString(offer.product_line).replace(/_/g, " ")}`,
      `**Tier**: ${safeString(offer.tier)}`,
      `**Source**: ${safeString(sourceContext.source_id)}`,
      // report.md is the PRIMARY deliverable. This header labelled the regex extraction tally
      // "Verified Citations" — the shipped bundle read 34 while its manifest said 29 VERIFIED.
      `**Citations**: ${reportResolution.present
        ? `${reportResolution.total} cited · ${reportResolution.verified} VERIFIED · ${reportResolution.unresolved} UNRESOLVED · ${reportResolution.unchecked} UNCHECKED at delivery`
        : `${uniqueCitations.length} cited identifiers`}`,
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
    // "cited", not "verified" — this is the regex extraction tally. The verified figure comes
    // from the re-resolution manifest and is only stated when that manifest exists.
    lines.push(`Total cited identifiers: **${uniqueCitations.length}**`);
    if (reportResolution.present) {
      lines.push("");
      lines.push(`Independently re-resolved at delivery: **${reportResolution.verified} VERIFIED** of ${reportResolution.total}`
        + `${reportResolution.unchecked > 0 ? ` · ${reportResolution.unchecked} UNCHECKED` : ""}`
        + `${reportResolution.unresolved > 0 ? ` · ${reportResolution.unresolved} UNRESOLVED` : ""}`);
    }
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
    const uniqueCitations = deduplicateCitations(citations);
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
      "- **ChEMBL** — Bioactivity and drug-target interactions (CHEMBL identifiers, cited by ID only)",
      "- **CrossRef / DOI** — Scholarly article resolution (DOI identifiers)",
      "",
      "## Citation Verification Methodology",
      "",
      "Citations are extracted from agent outputs using deterministic regex patterns matching known identifier formats. Each citation is deduplicated by type and identifier, then indexed with its source task and surrounding context.",
      "",
      `This report contains **${uniqueCitations.length} unique cited identifiers** distributed across the following types:`,
      "",
      ...Object.entries(byType).sort(([a], [b]) => a.localeCompare(b)).map(([type, count]) => `- **${type}**: ${count}`),
      "",
      "## Quality Audit",
      "",
      "All outputs pass automated quality auditing before release:",
      "",
      "- **Citation density threshold**: Minimum citations per 1,000 characters of output",
      "- **Cross-reference verification (grounding)**: every identifier cited in the report is checked against the source records actually retrieved for it — the truth-based gate, graded in the Citation Integrity ledger (grounded_ratio).",
      "- **Citation-density score**: a separate, shape-based heuristic — the fraction of content lines carrying a citation-shaped reference. It measures how citation-dense the writing is, NOT whether the identifiers were verified (that is the grounding gate above).",
      "- **Quality gate**: reports below the citation-density threshold are flagged for operator review before release.",
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
    const uniqueCitations = deduplicateCitations(citations);
    // Q37: parity with the AWS-DX path (aws-data-exchange-format-adapter.js). The PRIMARY manual-ZIP
    // path — which ships the highest-value SKUs — previously checked only citation TYPES here, so a
    // bare prose "DrugBank" mention or a DB##### id in the report body slipped through. assertShippable
    // adds the full-text scan (assertNoBannedContent over the report content) alongside the
    // citation-type check; fail-closed (throws LicenseComplianceError) so a non-compliant bundle
    // cannot ship. `allText` is the same artifact-output content report.md is assembled from.
    allowlist.assertShippable({ citations: uniqueCitations, text: allText });
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
            { name: "citation_type", type: "string", description: "Citation identifier type (PMID, NCT, CID, DOI, UniProt, ChEMBL)", nullable: false },
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
          { name: "citation_density", type: "object", description: "Citation-density score (a shape-based heuristic: fraction of content lines carrying a citation-shaped reference) and pass/fail. This is NOT identifier verification — see the Citation Integrity ledger (grounded_ratio) for grounding." },
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
      // Q37: license shipment gate FIRST on the PRIMARY research path (report.md — the highest-value
      // SKUs). This branch previously had NO DrugBank / ChEMBL-activity screen at all; only the dataset
      // branch's schema render did. Fail-closed FULL scan (citation types + the full report text, so a
      // bare prose "DrugBank" mention or a DB##### id is caught, not just typed citations) — a
      // non-compliant research bundle cannot ship. Runs before any deliverable is written. Mirrors the
      // AWS-DX path (aws-data-exchange-format-adapter.js).
      const licenseScanText = (Array.isArray(sourceContext.artifacts) ? sourceContext.artifacts : [])
        .map((a) => a.output_full || a.output_excerpt || "").join("\n");
      allowlist.assertShippable({
        citations: deduplicateCitations(extractCitations(licenseScanText)),
        text: licenseScanText
      });

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

      const uniqueAllCitations = deduplicateCitations(allCitations);
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
        `> Full report cites **${uniqueAllCitations.length} unique identifiers** across **${Math.max(1, Math.round(allCitationText.length / 2000))} pages** of original analysis.`,
        ""
      ];
      writeText(previewPath, previewLines.join("\n"));
      artifactRefs.primary_deliverable = relativeFrom(bundleDir, reportPath);
      artifactRefs.structured_support = relativeFrom(bundleDir, tablesPath);
      artifactRefs.supporting_appendix = relativeFrom(bundleDir, appendixPath);
      // Slice 3: the Citation Integrity & Provenance ledger — the deliverable's audit-trail
      // artifact, built deterministically from the citation gate's verification (the product spine).
      if (sourceContext.citation_verification) {
        const integrityPath = path.join(deliverablesDir, "citation-integrity.md");
        writeText(integrityPath, buildIntegrityReport(sourceContext.citation_verification, sourceContext.section_coverage).markdown);
        artifactRefs.citation_integrity = relativeFrom(bundleDir, integrityPath);
        // Reproducibility Manifest — per-citation live re-resolution result, shipped beside the
        // integrity ledger so a subscriber can re-run the listed URLs and reproduce the verdicts.
        const rm = sourceContext.citation_verification.reproducibility_manifest;
        if (rm && rm.summary) {
          const rmJsonPath = path.join(deliverablesDir, "reproducibility-manifest.json");
          const rmMdPath = path.join(deliverablesDir, "reproducibility-manifest.md");
          writeText(rmJsonPath, JSON.stringify(rm, null, 2));
          writeText(rmMdPath, renderManifestMarkdown(rm));
          artifactRefs.reproducibility_manifest = relativeFrom(bundleDir, rmMdPath);
        }
      }
      // Slice 3 v2: the structured kill-memo — prior terminated programs (graveyard) + the
      // protocol amendment-risk signal, rendered upstream from NCT-traced CT.gov records. A
      // cost-AVOIDANCE deliverable; only present when stopped trials were retrieved for the indication.
      if (sourceContext.graveyard_memo && safeString(sourceContext.graveyard_memo.markdown)) {
        const graveyardPath = path.join(deliverablesDir, "graveyard-memo.md");
        const amendmentMd = sourceContext.amendment_risk && safeString(sourceContext.amendment_risk.markdown)
          ? "\n" + sourceContext.amendment_risk.markdown : "";
        writeText(graveyardPath, sourceContext.graveyard_memo.markdown + amendmentMd);
        artifactRefs.graveyard_memo = relativeFrom(bundleDir, graveyardPath);
      }
      // Slice 5 (Q5): the Search-Coverage Ledger — the honest-zero deliverable, rendered
      // deterministically from the runtime per-search outcomes (no LLM). Present whenever real
      // searches ran; an all-zero run still ships it as the truthful "here is exactly what each
      // source returned, including the zeros" record that the never-hallucinate doctrine requires.
      if (sourceContext.search_coverage_ledger && safeString(sourceContext.search_coverage_ledger.markdown)) {
        const coveragePath = path.join(deliverablesDir, "search-coverage.md");
        writeText(coveragePath, sourceContext.search_coverage_ledger.markdown);
        artifactRefs.search_coverage = relativeFrom(bundleDir, coveragePath);
      }
      // Trial Design Benchmark Pack: the comparative Phase 3 structure matrix, rendered upstream
      // from NCT-traced CT.gov records (no LLM), plus its machine-readable CSV twin. Present only
      // when a cohort was actually retrieved — an empty cohort ships nothing rather than an empty
      // table. finalizeBundle walks the directory, so writing the files here is the whole
      // registration: both are hashed into manifest.json and sealed in checksums.txt automatically.
      if (sourceContext.design_benchmark && safeString(sourceContext.design_benchmark.markdown)) {
        const benchPath = path.join(deliverablesDir, "design-benchmark.md");
        writeText(benchPath, sourceContext.design_benchmark.markdown);
        artifactRefs.design_benchmark = relativeFrom(bundleDir, benchPath);
        if (safeString(sourceContext.design_benchmark.csv)) {
          const benchCsvPath = path.join(deliverablesDir, "design-benchmark.csv");
          writeText(benchCsvPath, sourceContext.design_benchmark.csv);
          artifactRefs.design_benchmark_csv = relativeFrom(bundleDir, benchCsvPath);
        }
      }
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
        // Q37: bundle-wide license scan on EVERY shipped file's content, at the seal choke point. This
        // catches DrugBank / DB##### content from ANY source — the report body, offer-derived headers
        // (offer_title comes from the user's mission description), submission packs, and dynamically
        // sourced deliverables — not just the raw artifacts the research-branch pre-check reads.
        // Fail-closed BEFORE checksums are sealed, so a non-compliant bundle can never be hashed into a
        // shippable manifest.
        const shippedContent = fs.readFileSync(fullPath, "utf8");
        allowlist.assertNoBannedContent(shippedContent);
        files.push(canonicalize({
          file: rel,
          sha256: sha256(shippedContent)
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
    try {
      fs.renameSync(tempBundleDir, finalBundleDir);
    } catch (error) {
      // The bundle workspace is created under os.tmpdir() (internal disk), while
      // releasesDir may live on a different filesystem/volume (e.g. the repo on an
      // external drive). rename(2) cannot move across devices and throws EXDEV.
      // Fall back to a recursive copy + remove so commit works regardless of where
      // the repo is mounted.
      if (error && error.code === "EXDEV") {
        // Cross-device: copy then remove. If the copy fails partway, clean up the partial
        // destination (so a half-written bundle is never mistaken for a complete one) and
        // keep the temp dir for diagnosis, then rethrow with context.
        try {
          fs.cpSync(tempBundleDir, finalBundleDir, { recursive: true });
        } catch (copyError) {
          try { fs.rmSync(finalBundleDir, { recursive: true, force: true }); } catch { /* best effort */ }
          const wrapped = new Error(`commitBundle cross-device copy failed for offer '${offerId}': ${copyError && copyError.message}`);
          wrapped.code = (copyError && copyError.code) || "COMMIT_BUNDLE_COPY_FAILED";
          wrapped.cause = copyError;
          throw wrapped;
        }
        fs.rmSync(tempBundleDir, { recursive: true, force: true });
      } else {
        throw error;
      }
    }
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
