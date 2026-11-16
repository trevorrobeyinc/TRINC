"use strict";

// Social-channel sibling of manual-placeholder-adapter.js.
//
// Same phase21 adapter contract, different copy shape. The marketplace adapter emits
// listing-shaped blocks (title / subtitle / description / dataset_summary / tier_*); a social
// post needs a hook, a spoken script, a caption and hashtags instead, so this is a sibling
// generator rather than a fork of that one.
//
// TWO RULES DRIVE EVERY DECISION HERE, and both are business invariants, not style choices:
//
//   1. NEVER STATE A FIGURE THIS ADAPTER CANNOT DERIVE. A release bundle's source_context is
//      thin in practice (verified 2026-09-19: offer.json carries an EMPTY source_context on
//      every shipped release), so almost no per-report number is available at adapter time.
//      Rather than invent one — the exact failure mode this business sells against — the copy
//      carries explicit [VERIFY:n] slots and a machine-readable `claim_slots` list naming the
//      file in the bundle each number must be read from. An unfilled slot is visible in the
//      draft; a fabricated number would not be.
//
//   2. COMPANY VOICE AND FOUNDER VOICE DO NOT MIX. 01-brand-system/personal-brand.md carries a
//      "do not mix" table: the company speaks the business tagline, Trevor-the-person speaks the
//      founder lockup. Each channel declares `trinc_voice` in config/platform-targets.json and
//      this adapter reads it — it never guesses from the channel name.
//
// No LLM runs here. Everything is rendered deterministically from the offer and the target
// config, so the same inputs always produce the same bytes and the phase21 snapshot hash is
// stable.
//
// Restricted globals (Date.now, new Date, Math.random, randomUUID) are forbidden under
// openclaw-bridge/ and none are used.

const { canonicalize, safeString } = require("../../../workflows/governance-automation/common.js");
const { verifiabilitySentence } = require("../verifiability-copy.js");

// Verbatim, from REVENUE_PLAYBOOK.md:22 and the repo CLAUDE.md. Cal. Bus. & Prof. Code
// §17910.5(a) is why this is required on customer-facing material, so it is a constant here
// and must never be paraphrased or shortened to fit a caption.
const ENTITY_DISCLOSURE =
  "Trevor Robey, INC. is the wordmark of Trevor Robey Intelligence Network Citations LLC, " +
  "a California limited liability company.";

// The tagline, verbatim from OFFERINGS.md:3 (operator decision 2026-11-15; tests/core/brand-tagline-canon
// pins it, here and in the trinc-content MCP). T1-9 (2026-11-14) dropped "Every claim, sourced." from the
// generated copy, because no sentence-level support check exists, so it was false as worded. What
// "Every citation, checked." rests on, and where it stops, is SYSTEM-REALITY.md's tagline row: every
// identifier the extractor reads is checked against the evidence retrieved and re-resolved at its
// registry; only DOIs and PMIDs are also retraction-screened; a form the extractor does not read is not
// checked.
const COMPANY_TAGLINE = "Every citation, checked. Every risk, named. In days, not weeks.";
const FOUNDER_LOCKUP = "Truth Seeker, Receipt Keeper. — Real data beats sweet hallucination. You decide.";

// Deliberately small and stable. Trend-chasing tags would be invention of a different kind,
// and this business has no social analytics binding to tell us which tags work.
const HASHTAGS = ["#biotech", "#clinicaltrials", "#duediligence", "#drugdevelopment"];

function asPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function estimatePages(sourceContext) {
  const artifacts = Array.isArray(sourceContext.artifacts) ? sourceContext.artifacts : [];
  const totalChars = artifacts.reduce(
    (sum, artifact) => sum + (artifact.output_full || artifact.output_excerpt || "").length,
    0
  );
  return totalChars > 0 ? Math.max(1, Math.round(totalChars / 2000)) : 0;
}

// The numbers a post WANTS, each mapped to the file in this bundle that actually holds it.
// Rendered into the copy as [VERIFY:n] and into post-fields.json as `claim_slots`, so the
// operator fills them from the bundle instead of from memory.
function buildClaimSlots(pageEstimate) {
  const slots = [
    {
      id: 1,
      wants: "number of cited identifiers that resolved to a real source record",
      read_from: "deliverables/citation-integrity.md",
      note: "Use the VERIFIED count, not the total cited. The difference is the point."
    },
    {
      id: 2,
      wants: "number of prior terminated/withdrawn/suspended trials in this indication",
      read_from: "deliverables/graveyard-memo.md",
      note: "The memo states its own census size; quote that, not an impression of it."
    },
    {
      id: 3,
      wants: "any source that returned an honest zero",
      read_from: "deliverables/search-coverage.md",
      note: "A zero-result source is a finding worth posting, and separates us from tools that "
        + "quietly return nothing. Do not confuse it with a failed/unreachable source."
    }
  ];
  if (pageEstimate === 0) {
    slots.push({
      id: 4,
      wants: "report length in pages",
      read_from: "deliverables/report.md",
      note: "No artifact text reached this adapter, so length could not be derived. Count it or "
        + "drop the claim — do not estimate."
    });
  }
  return slots;
}

function buildCopyBlocks(platformTarget, voice, offer, sourceContext) {
  const title = safeString(offer.offer_title);
  const productLine = safeString(offer.product_line).replace(/_/g, " ");
  const tierName = safeString(offer.tier);
  const pageEstimate = estimatePages(sourceContext);
  const isFounderVoice = voice === "founder";

  // Length is stated only when it was actually derived from artifact text.
  const lengthClause = pageEstimate > 0
    ? `${pageEstimate}+ pages`
    : "[VERIFY:4] pages";

  const hook = isFounderVoice
    ? `Most people never ask what happened to the drugs that failed. I went and looked.`
    : `${title} — the identifiers it cites are public records you can open yourself.`;

  const script = [
    `[HOOK] ${hook}`,
    "",
    // No article before productLine: the configured product lines are plural nouns
    // ("biomedical research packs"), so "a biomedical research packs" is ungrammatical.
    `[BEAT 1] ${lengthClause} of analysis — ${productLine}, ${tierName} tier.`,
    `[BEAT 2] [VERIFY:1] of the identifiers cited in it were checked back against the source `
      + `record they claim to come from. The ones that did not check out are flagged in the `
      + `document itself rather than quietly dropped.`,
    `[BEAT 3] It also names [VERIFY:2] prior programs in this indication that were terminated, `
      + `withdrawn or suspended — with the sponsor's own stated reason, or an explicit "none `
      + `stated" where the sponsor gave none.`,
    `[BEAT 4] And where a source returned nothing, it says so: [VERIFY:3].`,
    "",
    `[CLOSE] ${isFounderVoice ? FOUNDER_LOCKUP : COMPANY_TAGLINE}`,
    "",
    `[ON SCREEN] Repeat every identifier you say out loud as on-screen text, so a viewer can `
      + `pause and check it.`
  ].join("\n");

  const caption = isFounderVoice
    ? `${hook}\n\n${lengthClause}, [VERIFY:1] identifiers checked back to source, `
      + `[VERIFY:2] failed programs named with the sponsor's own stop reason.\n\n${FOUNDER_LOCKUP}`
    : `${title}\n\n${lengthClause} of citation-traced analysis. `
      + `[VERIFY:1] cited identifiers checked against the source records actually retrieved.`
      + `\n\n${COMPANY_TAGLINE}`;

  // T1-9 (2026-11-14): the gate and retraction sentence is decided by this bundle's own gate record
  // (monetization/verifiability-copy.js), and the file list names only what this bundle carries.
  const ctx = asPlainObject(sourceContext);
  // Tier 1 review (2026-11-14): a dataset-sourced bundle carries the dataset files, not the report, the
  // ledger or the citation index (deliverable-packager.js writeDeliverables, dataset branch).
  const isMission = safeString(ctx.source_kind) === "mission";
  const inBundle = isMission
    ? [
      "the full report",
      ...(Object.keys(asPlainObject(ctx.citation_verification)).length > 0 ? ["a citation-integrity ledger"] : []),
      ...(asPlainObject(ctx.graveyard_memo).markdown ? ["a graveyard memo of prior failed programs in the indication"] : []),
      ...(asPlainObject(ctx.search_coverage_ledger).markdown
        ? ["a search-coverage ledger that records what each source returned including the sources that returned nothing"]
        : []),
      "and a citation index"
    ]
    : ["the dataset rows", "its schema", "and a dataset card"];
  const description = [
    title,
    "",
    `${productLine}, ${tierName} tier. ${lengthClause} of analysis. ${verifiabilitySentence(ctx)}`,
    "",
    `In the bundle: ${inBundle.join(", ")}.`,
    "",
    ENTITY_DISCLOSURE
  ].join("\n");

  const thumbnailBrief = [
    `Background #0a0a0f, accent #4a90d9, IBM Plex. No stock photography, no gradients, no `
      + `rounded corners on data elements.`,
    `Foreground: one stat tile carrying [VERIFY:1], rendered through the viz-studio bridge `
      + `(viz_stat_tiles) so it matches the report's own visual language.`,
    `Do not set a number in the thumbnail that is not also stated in the post body with its source.`
  ].join("\n");

  return canonicalize({
    caption,
    description,
    disclosure: ENTITY_DISCLOSURE,
    hashtags: HASHTAGS.join(" "),
    hook,
    script,
    thumbnail_brief: thumbnailBrief,
    title,
    voice
  });
}

function createSocialContentAdapter(options = {}) {
  const platformTarget = safeString(options.platform_target || options.platformTarget);
  const adapterId = safeString(options.adapter_id || options.adapterId)
    || `phase21.social.${platformTarget || "unknown"}`;
  const adapterVersion = safeString(options.adapter_version || options.adapterVersion)
    || "phase21-social-v1";
  if (!platformTarget) {
    const error = new Error("social content adapter requires platform_target");
    error.code = "PHASE21_ADAPTER_PLATFORM_TARGET_REQUIRED";
    throw error;
  }

  function generateArtifacts(input = {}) {
    const offer = asPlainObject(input.offer);
    const sourceContext = asPlainObject(input.source_context || input.sourceContext);
    const targetConfig = asPlainObject(input.target_config || input.targetConfig);

    // Same fail-closed check the marketplace adapter makes. offer-schema.js already refuses a
    // platform target whose manual_only is not true, so reaching here with anything else means
    // the config was bypassed rather than edited.
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

    // The channel declares its own voice; this adapter never infers it from the channel name.
    const voice = safeString(targetConfig.trinc_voice);
    if (voice !== "founder" && voice !== "company") {
      const error = new Error(
        `platform target '${platformTarget}' must declare trinc_voice as 'founder' or 'company'`
      );
      error.code = "PHASE21_ADAPTER_VOICE_REQUIRED";
      throw error;
    }

    const copyBlocks = buildCopyBlocks(platformTarget, voice, offer, sourceContext);

    // Every block this channel declared it needs must exist and be non-empty. A channel that
    // asks for a `script` and silently gets none would ship an empty post.
    const required = Array.isArray(targetConfig.copy_block_requirements)
      ? targetConfig.copy_block_requirements
      : [];
    const missing = required.filter((key) => !safeString(copyBlocks[key]));
    if (missing.length > 0) {
      const error = new Error(
        `social copy blocks missing required field(s) for '${platformTarget}': ${missing.join(", ")}`
      );
      error.code = "PHASE21_ADAPTER_COPY_BLOCK_MISSING";
      throw error;
    }

    const claimSlots = buildClaimSlots(estimatePages(sourceContext));

    const copyBlocksFile = input.emitJson("copy-blocks.json", copyBlocks);
    const postFieldsFile = input.emitJson("post-fields.json", canonicalize({
      channel: platformTarget,
      voice,
      manual_only: true,
      offer_id: safeString(offer.offer_id),
      source_kind: safeString(sourceContext.source_kind),
      source_id: safeString(sourceContext.source_id),
      claim_slots: claimSlots,
      unfilled_claim_slot_count: claimSlots.length
    }));
    const checklistFile = input.emitText("checklist.md", [
      `# ${platformTarget} post checklist`,
      "",
      `Voice: **${voice}**. This pack drafts a post. It does not publish one.`,
      "",
      "## Fill these before posting",
      "",
      ...claimSlots.map((slot) => `- [ ] \`[VERIFY:${slot.id}]\` — ${slot.wants}. `
        + `Read it from \`${slot.read_from}\`. ${slot.note}`),
      "",
      "## Then confirm",
      "",
      ...(Array.isArray(targetConfig.checklist_requirements)
        && targetConfig.checklist_requirements.length > 0
        ? targetConfig.checklist_requirements.map((entry) => `- [ ] ${entry}`)
        : ["- [ ] Manual operator review completed"]),
      "",
      "## Disclosure (verbatim, do not paraphrase)",
      "",
      `> ${ENTITY_DISCLOSURE}`,
      ""
    ].join("\n"));

    return canonicalize({
      generated_files: [copyBlocksFile, postFieldsFile, checklistFile]
        .sort((left, right) => left.localeCompare(right)),
      refs: {
        checklist: checklistFile,
        copy_blocks: copyBlocksFile,
        platform_metadata: postFieldsFile
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
  ENTITY_DISCLOSURE,
  COMPANY_TAGLINE,
  FOUNDER_LOCKUP,
  createSocialContentAdapter
};
