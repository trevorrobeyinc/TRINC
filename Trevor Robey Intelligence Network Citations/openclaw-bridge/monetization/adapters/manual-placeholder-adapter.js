"use strict";

const { canonicalize, safeString } = require("../../../workflows/governance-automation/common.js");
const { verifiabilitySentence } = require("../verifiability-copy.js");

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
    // Tier 1 review (2026-11-14): a business-lane bundle (research_profile "business") is described by
    // the sources and identifiers it actually cites, as the packager's PROFILE_COPY does.
    const business = safeString(sourceContext.research_profile) === "business";
    const lane = business
      ? {
        intro: "Comprehensive, citation-backed business intelligence synthesized from public company filings, official economic statistics, scholarly literature, and archived web sources.",
        pipeline: "systematic source review, deep cost, market or competitive analysis, and integrated synthesis",
        kind: "business",
        title: "Business",
        registries: "SEC EDGAR filings, official statistics series, World Bank indicators, DOI-registered works and stored web-page snapshots"
      }
      : {
        intro: "Comprehensive, citation-backed biomedical intelligence synthesized from peer-reviewed literature, clinical trial registries, and pharmacological databases.",
        pipeline: "systematic literature review, deep pharmacological analysis, and integrated synthesis",
        kind: "biomedical",
        title: "Biomedical",
        registries: "PubMed, ClinicalTrials.gov, PubChem, UniProt and DOI-registered works"
      };

    const descriptionParts = [
      lane.intro,
      "",
      // T1-9 (2026-11-14): no cross-validation step exists.
      `This ${productLine} (${tierName} tier) delivers ${pageEstimate}+ pages of original analysis produced through a multi-stage research pipeline: ${lane.pipeline}.`,
      "",
      // Retired 2026-07-13 (OFFERINGS.md, commit 7801443): "No hallucinated references. No
      // fabricated data." was an absolute overclaim, and "every claim is traceable" overstated a
      // gate that admits an ungrounded residue below the floor. State the enforced behaviour —
      // decided by this bundle's own gate record (T1-9, monetization/verifiability-copy.js).
      verifiabilitySentence(sourceContext),
      "",
      safeString(sourceContext.source_kind) === "mission"
        ? `Includes: full research report, citation index CSV, executive summary preview, and evidence provenance appendix. Each workflow template runs a citation-density audit that the report must pass before release.`
        : "Includes the files listed in the bundle's manifest."
    ];

    return canonicalize({
      title: safeString(offer.offer_title),
      subtitle: `${productLine} — ${tierName} tier | Citation-backed ${lane.kind} intelligence`,
      description: descriptionParts.join("\n"),
      dataset_summary: safeString(sourceContext.metadata && sourceContext.metadata.dataset_type),
      sample_summary: `${pageEstimate}+ pages of citation-traced research from ${safeString(sourceContext.source_kind)} ${safeString(sourceContext.source_id)}`,
      // T1-9: delivery is manual (the order form), never instant.
      delivery_notes: "Manual delivery after purchase, by email or a secure download link.",
      tier_name: tierName,
      tier_summary: `${safeString(offer.offer_title)} — Citation-Traced ${lane.title} Intelligence`,
      tier_description: `${productLine} (${tierName} tier) with traceable citations to ${lane.registries}.`
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
