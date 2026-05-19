"use strict";

const { canonicalize, safeString } = require("../../../workflows/governance-automation/common.js");

function asPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function createManualPlaceholderAdapter(options = {}) {
  const platformTarget = safeString(options.platform_target || options.platformTarget);
  const adapterId = safeString(options.adapter_id || options.adapterId) || `phase21.manual.${platformTarget || "unknown"}`;
  const adapterVersion = safeString(options.adapter_version || options.adapterVersion) || "phase21-manual-v1";
  if (!platformTarget) {
    const error = new Error("manual placeholder adapter requires platform_target");
    error.code = "PHASE21_ADAPTER_PLATFORM_TARGET_REQUIRED";
    throw error;
  }

  function generateCopyBlocks(offer, sourceContext) {
    const artifacts = Array.isArray(sourceContext.artifacts) ? sourceContext.artifacts : [];
    const totalChars = artifacts.reduce((sum, a) => sum + (a.output_full || a.output_excerpt || "").length, 0);
    const pageEstimate = Math.max(1, Math.round(totalChars / 2000));
    const productLine = safeString(offer.product_line).replace(/_/g, " ");
    const tierName = safeString(offer.tier);

    const descriptionParts = [
      `Comprehensive, citation-backed biomedical intelligence synthesized from peer-reviewed literature, clinical trial registries, and pharmacological databases.`,
      "",
      `This ${productLine} (${tierName} tier) delivers ${pageEstimate}+ pages of original analysis produced through a multi-stage research pipeline: systematic literature review, deep pharmacological analysis, and integrated synthesis with cross-validation.`,
      "",
      `Every claim is traceable to its primary source — PubMed IDs, ClinicalTrials.gov identifiers, PubChem compound IDs, and DOIs are embedded throughout. No hallucinated references. No fabricated data.`,
      "",
      `Includes: full research report, citation index CSV, executive summary preview, and evidence provenance appendix. All outputs pass automated quality auditing with citation density verification before release.`
    ];

    return canonicalize({
      title: safeString(offer.offer_title),
      subtitle: `${productLine} — ${tierName} tier | Citation-backed biomedical intelligence`,
      description: descriptionParts.join("\n"),
      dataset_summary: safeString(sourceContext.metadata && sourceContext.metadata.dataset_type),
      sample_summary: `${pageEstimate}+ pages of verified research from ${safeString(sourceContext.source_kind)} ${safeString(sourceContext.source_id)}`,
      delivery_notes: "Digital delivery. Full research pack available immediately after purchase.",
      tier_name: tierName,
      tier_summary: `${safeString(offer.offer_title)} — Verified Biomedical Intelligence`,
      tier_description: `${productLine} (${tierName} tier) with traceable citations from PubMed, ClinicalTrials.gov, PubChem, UniProt, and ChEMBL.`
    });
  }

  function generatePlatformMetadataFile(emitText, emitJson, offer, sourceContext, copyBlocks) {
    if (platformTarget === "kaggle") {
      return emitJson("dataset-metadata.json", canonicalize({
        title: safeString(offer.offer_title),
        id: safeString(offer.offer_id),
        licenses: [{ name: "other" }],
        subtitle: copyBlocks.subtitle,
        description: copyBlocks.description
      }));
    }
    if (platformTarget === "hugging_face") {
      return emitText("dataset-card.md", [
        `# ${safeString(offer.offer_title)}`,
        "",
        copyBlocks.subtitle,
        "",
        copyBlocks.description,
        ""
      ].join("\n"));
    }
    if (platformTarget === "github_sponsors") {
      return emitText("tier-copy.md", [
        `# ${safeString(offer.offer_title)}`,
        "",
        copyBlocks.tier_description,
        "",
        copyBlocks.description,
        ""
      ].join("\n"));
    }
    return emitJson("listing-fields.json", canonicalize({
      title: safeString(offer.offer_title),
      description: copyBlocks.description,
      manual_only: true,
      source_kind: safeString(sourceContext.source_kind),
      source_id: safeString(sourceContext.source_id)
    }));
  }

  function generateArtifacts(input = {}) {
    const offer = asPlainObject(input.offer);
    const sourceContext = asPlainObject(input.source_context || input.sourceContext);
    const targetConfig = asPlainObject(input.target_config || input.targetConfig);
    if (targetConfig.manual_only !== true) {
      const error = new Error(`platform target '${platformTarget}' must remain manual_only`);
      error.code = "PHASE21_ADAPTER_MANUAL_ONLY_REQUIRED";
      throw error;
    }
    if (typeof input.emitJson !== "function" || typeof input.emitText !== "function") {
      const error = new Error("adapter context must provide emitJson and emitText");
      error.code = "PHASE21_ADAPTER_CONTEXT_INVALID";
      throw error;
    }

    const copyBlocks = generateCopyBlocks(offer, sourceContext);
    const copyBlocksFile = input.emitJson("copy-blocks.json", copyBlocks);
    const checklistFile = input.emitText("checklist.md", [
      `# ${platformTarget} Submission Checklist`,
      "",
      "This pack is for manual submission only.",
      "",
      ...(Array.isArray(targetConfig.checklist_requirements) && targetConfig.checklist_requirements.length > 0
        ? targetConfig.checklist_requirements.map((entry) => `- [ ] ${entry}`)
        : ["- [ ] Manual operator review completed"])
    ].join("\n") + "\n");
    const platformMetadataFile = generatePlatformMetadataFile(input.emitText, input.emitJson, offer, sourceContext, copyBlocks);
    return canonicalize({
      generated_files: [copyBlocksFile, checklistFile, platformMetadataFile].sort((left, right) => left.localeCompare(right)),
      refs: {
        checklist: checklistFile,
        copy_blocks: copyBlocksFile,
        platform_metadata: platformMetadataFile
      }
    });
  }

  return Object.freeze({
    adapter_id: adapterId,
    adapter_version: adapterVersion,
    generateArtifacts,
    platform_target: platformTarget
  });
}

module.exports = {
  createManualPlaceholderAdapter
};
