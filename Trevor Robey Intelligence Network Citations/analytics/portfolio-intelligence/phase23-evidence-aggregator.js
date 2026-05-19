"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { nowIso } = require("../../openclaw-bridge/core/time-provider.js");
const { createReleaseApprovalManager } = require("../../openclaw-bridge/monetization/release-approval-manager.js");
const {
  PHASE22_EVIDENCE_INDEX_SCHEMA,
  SUBMISSION_STATES
} = require("../../openclaw-bridge/monetization/submission-evidence-schema.js");
const {
  PHASE28_EVIDENCE_INDEX_SCHEMA,
  DELIVERY_STATES
} = require("../../openclaw-bridge/monetization/delivery-evidence-schema.js");
const { canonicalize, safeString } = require("../../workflows/governance-automation/common.js");

const PHASE23_PORTFOLIO_EVIDENCE_SCHEMA = "phase23-portfolio-evidence-snapshot-v1";

function asPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function validateSha(value, code, fieldName) {
  const normalized = safeString(value).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    const error = new Error(`${fieldName} must be a lowercase sha256 digest`);
    error.code = code;
    throw error;
  }
  return normalized;
}

function normalizeNonNegativeInt(value, code, fieldName) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    const error = new Error(`${fieldName} must be a non-negative integer`);
    error.code = code;
    throw error;
  }
  return parsed;
}

function normalizeTargetStateEntry(entry, targetKey, allowedStates, codePrefix) {
  const item = asPlainObject(entry);
  const target = safeString(item[targetKey]);
  if (!target) {
    const error = new Error(`${targetKey} is required`);
    error.code = `${codePrefix}_TARGET_REQUIRED`;
    throw error;
  }
  const eligible = item.eligible_for_recording === true;
  const currentState = safeString(item.current_state);
  if (eligible && !allowedStates.includes(currentState)) {
    const error = new Error(`${targetKey} '${target}' has invalid current_state '${currentState || "(empty)"}'`);
    error.code = `${codePrefix}_STATE_INVALID`;
    throw error;
  }
  if (!eligible && currentState) {
    const error = new Error(`${targetKey} '${target}' must not declare current_state when ineligible`);
    error.code = `${codePrefix}_STATE_INELIGIBLE`;
    throw error;
  }

  return canonicalize({
    [targetKey]: target,
    eligible_for_recording: eligible,
    current_state: currentState,
    latest_event_hash: safeString(item.latest_event_hash),
    latest_sequence: normalizeNonNegativeInt(item.latest_sequence || 0, `${codePrefix}_LATEST_SEQUENCE_INVALID`, `${targetKey} latest_sequence`)
  });
}

function normalizeIndexOfferEntry(entry, options) {
  const item = asPlainObject(entry);
  const offerId = safeString(item.offer_id);
  if (!offerId) {
    const error = new Error("offer_id is required in evidence index");
    error.code = `${options.codePrefix}_OFFER_ID_REQUIRED`;
    throw error;
  }
  const targetEntries = asArray(item[options.targetsKey]).map((targetEntry) => normalizeTargetStateEntry(
    targetEntry,
    options.targetKey,
    options.allowedStates,
    options.codePrefix
  ));
  targetEntries.sort((left, right) => safeString(left[options.targetKey]).localeCompare(safeString(right[options.targetKey])));

  return canonicalize({
    offer_id: offerId,
    approved_bundle_hash: validateSha(
      item.approved_bundle_hash,
      `${options.codePrefix}_BUNDLE_HASH_INVALID`,
      "approved_bundle_hash"
    ),
    export_event_count: normalizeNonNegativeInt(
      item.export_event_count || 0,
      `${options.codePrefix}_EXPORT_EVENT_COUNT_INVALID`,
      "export_event_count"
    ),
    evidence_event_count: normalizeNonNegativeInt(
      item.evidence_event_count || 0,
      `${options.codePrefix}_EVIDENCE_EVENT_COUNT_INVALID`,
      "evidence_event_count"
    ),
    [options.targetsKey]: targetEntries
  });
}

function normalizeIndex(index, options) {
  const source = asPlainObject(index);
  if (safeString(source.schema_version) !== options.schemaVersion) {
    const error = new Error(`${options.label} schema_version must be ${options.schemaVersion}`);
    error.code = `${options.codePrefix}_SCHEMA_INVALID`;
    throw error;
  }
  const offers = asArray(source.offers).map((entry) => normalizeIndexOfferEntry(entry, options));
  offers.sort((left, right) => left.offer_id.localeCompare(right.offer_id));

  const seen = new Set();
  for (const offer of offers) {
    if (seen.has(offer.offer_id)) {
      const error = new Error(`${options.label} contains duplicate offer_id '${offer.offer_id}'`);
      error.code = `${options.codePrefix}_OFFER_DUPLICATE`;
      throw error;
    }
    seen.add(offer.offer_id);
  }

  return canonicalize({
    generated_at: safeString(source.generated_at),
    offers,
    schema_version: source.schema_version
  });
}

function buildOfferMap(offers) {
  const out = new Map();
  for (const offer of asArray(offers)) {
    out.set(safeString(offer.offer_id), canonicalize(offer));
  }
  return out;
}

function summarizeStates(entries, stateKey) {
  const byState = {};
  let eligibleTargets = 0;
  for (const entry of asArray(entries)) {
    if (entry.eligible_for_recording === true) {
      eligibleTargets += 1;
    }
    const state = safeString(entry[stateKey]);
    if (!state) {
      continue;
    }
    byState[state] = Number(byState[state] || 0) + 1;
  }

  return canonicalize({
    by_state: byState,
    eligible_targets: eligibleTargets,
    total_targets: asArray(entries).length
  });
}

function createEmptyPortfolioSummary() {
  return canonicalize({
    delivery_targets_total: 0,
    eligible_delivery_targets: 0,
    eligible_submission_targets: 0,
    offers_total: 0,
    submission_targets_total: 0,
    by_delivery_state: {},
    by_submission_state: {}
  });
}

function listOfferIds(releasesDir) {
  if (!fs.existsSync(releasesDir)) {
    return [];
  }
  return fs.readdirSync(releasesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => safeString(entry.name))
    .filter((offerId) => offerId && offerId !== "index")
    .filter((offerId) => /^[A-Za-z0-9._-]+$/.test(offerId))
    .filter((offerId) => {
      const offerDir = path.join(releasesDir, offerId);
      const offerPath = path.join(offerDir, "offer.json");
      const approvalPath = path.join(offerDir, "release-approval.json");
      if (!fs.existsSync(offerPath) || !fs.existsSync(approvalPath)) {
        return false;
      }
      try {
        const offer = readJson(offerPath);
        return safeString(offer.offer_id) === offerId;
      } catch {
        return false;
      }
    })
    .sort((left, right) => left.localeCompare(right));
}

function compareSortedStrings(actualValues, expectedValues) {
  return JSON.stringify(actualValues.slice().sort()) === JSON.stringify(expectedValues.slice().sort());
}

function offerHasDeliveryTargets(releasesDir, offerId) {
  const offer = readJson(path.join(releasesDir, offerId, "offer.json"));
  return asArray(offer.direct_delivery_targets).map((entry) => safeString(entry)).filter(Boolean).length > 0;
}

function createPhase23EvidenceAggregator(options = {}) {
  const rootDir = path.resolve(safeString(options.rootDir) || process.cwd());
  const releasesDir = path.resolve(safeString(options.releasesDir) || path.join(rootDir, "workspace", "releases"));
  const timeProvider = options.timeProvider && typeof options.timeProvider.nowIso === "function"
    ? options.timeProvider
    : { nowIso };
  const releaseApprovalManager = options.releaseApprovalManager || createReleaseApprovalManager({
    platformTargets: readJson(path.join(rootDir, "config", "platform-targets.json")),
    releasesDir
  });

  const submissionIndexPath = path.join(releasesDir, "index", "submission-evidence-index.json");
  const deliveryIndexPath = path.join(releasesDir, "index", "delivery-evidence-index.json");

  function readRequiredIndexes(offerIds) {
    if (offerIds.length === 0) {
      return null;
    }
    const requiresDeliveryIndex = offerIds.some((offerId) => offerHasDeliveryTargets(releasesDir, offerId));
    if (!fs.existsSync(submissionIndexPath)) {
      const error = new Error("submission-evidence-index.json is required when approved offers exist");
      error.code = "PHASE23_SUBMISSION_INDEX_REQUIRED";
      throw error;
    }
    if (requiresDeliveryIndex && !fs.existsSync(deliveryIndexPath)) {
      const error = new Error("delivery-evidence-index.json is required when approved offers exist");
      error.code = "PHASE23_DELIVERY_INDEX_REQUIRED";
      throw error;
    }

    const submissionIndex = normalizeIndex(readJson(submissionIndexPath), {
      allowedStates: SUBMISSION_STATES,
      codePrefix: "PHASE23_SUBMISSION_INDEX",
      label: "submission evidence index",
      schemaVersion: PHASE22_EVIDENCE_INDEX_SCHEMA,
      targetKey: "platform_target",
      targetsKey: "platform_targets"
    });
    const deliveryIndex = requiresDeliveryIndex
      ? normalizeIndex(readJson(deliveryIndexPath), {
          allowedStates: DELIVERY_STATES,
          codePrefix: "PHASE23_DELIVERY_INDEX",
          label: "delivery evidence index",
          schemaVersion: PHASE28_EVIDENCE_INDEX_SCHEMA,
          targetKey: "delivery_target",
          targetsKey: "delivery_targets"
        })
      : canonicalize({
          generated_at: "",
          offers: [],
          schema_version: PHASE28_EVIDENCE_INDEX_SCHEMA
        });

    return {
      deliveryIndex,
      deliveryMap: buildOfferMap(deliveryIndex.offers),
      requiresDeliveryIndex,
      submissionIndex,
      submissionMap: buildOfferMap(submissionIndex.offers)
    };
  }

  function buildOfferSnapshot(offerId, indexes) {
    const validated = releaseApprovalManager.validateApprovedRelease(offerId);
    const offer = readJson(path.join(releasesDir, offerId, "offer.json"));
    const approvedBundleHash = validateSha(
      validated && validated.approval && validated.approval.hash_of_release_bundle,
      "PHASE23_APPROVED_BUNDLE_HASH_INVALID",
      "release approval hash_of_release_bundle"
    );

    const submissionIndexOffer = indexes.submissionMap.get(offerId);
    if (!submissionIndexOffer) {
      const error = new Error(`submission evidence index is missing offer '${offerId}'`);
      error.code = "PHASE23_SUBMISSION_INDEX_OFFER_MISSING";
      throw error;
    }
    if (safeString(submissionIndexOffer.approved_bundle_hash) !== approvedBundleHash) {
      const error = new Error(`submission evidence index hash mismatch for offer '${offerId}'`);
      error.code = "PHASE23_SUBMISSION_INDEX_HASH_MISMATCH";
      throw error;
    }

    const approvedPlatformTargets = asArray(validated.approval && validated.approval.approved_platform_targets)
      .map((entry) => safeString(entry))
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right));
    const indexedPlatformTargets = asArray(submissionIndexOffer.platform_targets)
      .map((entry) => safeString(entry.platform_target))
      .sort((left, right) => left.localeCompare(right));
    if (!compareSortedStrings(approvedPlatformTargets, indexedPlatformTargets)) {
      const error = new Error(`submission evidence index targets do not match approved platform targets for offer '${offerId}'`);
      error.code = "PHASE23_SUBMISSION_INDEX_TARGET_MISMATCH";
      throw error;
    }

    const directDeliveryTargets = asArray(offer.direct_delivery_targets)
      .map((entry) => safeString(entry))
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right));
    const submissionTargets = asArray(submissionIndexOffer.platform_targets);
    const deliveryIndexOffer = indexes.deliveryMap.get(offerId);
    let deliveryTargets = [];

    if (directDeliveryTargets.length > 0) {
      if (!deliveryIndexOffer) {
        const error = new Error(`delivery evidence index is missing offer '${offerId}'`);
        error.code = "PHASE23_DELIVERY_INDEX_OFFER_MISSING";
        throw error;
      }
      if (safeString(deliveryIndexOffer.approved_bundle_hash) !== approvedBundleHash) {
        const error = new Error(`delivery evidence index hash mismatch for offer '${offerId}'`);
        error.code = "PHASE23_DELIVERY_INDEX_HASH_MISMATCH";
        throw error;
      }
      const indexedDeliveryTargets = asArray(deliveryIndexOffer.delivery_targets)
        .map((entry) => safeString(entry.delivery_target))
        .sort((left, right) => left.localeCompare(right));
      if (!compareSortedStrings(directDeliveryTargets, indexedDeliveryTargets)) {
        const error = new Error(`delivery evidence index targets do not match packaged delivery targets for offer '${offerId}'`);
        error.code = "PHASE23_DELIVERY_INDEX_TARGET_MISMATCH";
        throw error;
      }
      deliveryTargets = asArray(deliveryIndexOffer.delivery_targets);
    } else if (deliveryIndexOffer) {
      if (safeString(deliveryIndexOffer.approved_bundle_hash) !== approvedBundleHash) {
        const error = new Error(`delivery evidence index hash mismatch for offer '${offerId}'`);
        error.code = "PHASE23_DELIVERY_INDEX_HASH_MISMATCH";
        throw error;
      }
      const indexedDeliveryTargets = asArray(deliveryIndexOffer.delivery_targets)
        .map((entry) => safeString(entry.delivery_target))
        .sort((left, right) => left.localeCompare(right));
      if (!compareSortedStrings(directDeliveryTargets, indexedDeliveryTargets)) {
        const error = new Error(`delivery evidence index targets do not match packaged delivery targets for offer '${offerId}'`);
        error.code = "PHASE23_DELIVERY_INDEX_TARGET_MISMATCH";
        throw error;
      }
    }

    return canonicalize({
      approved_at: safeString(validated.approval && validated.approval.approved_at),
      approved_bundle_hash: approvedBundleHash,
      approved_platform_targets: approvedPlatformTargets,
      build_id: safeString(offer.build_id),
      delivery_summary: summarizeStates(deliveryTargets, "current_state"),
      delivery_targets: deliveryTargets,
      direct_delivery_targets: directDeliveryTargets,
      offer_id: safeString(offer.offer_id),
      offer_title: safeString(offer.offer_title),
      product_line: safeString(offer.product_line),
      release_status: safeString(offer.release_status),
      source_id: safeString(offer.source_id),
      source_kind: safeString(offer.source_kind),
      submission_summary: summarizeStates(submissionTargets, "current_state"),
      submission_targets: submissionTargets,
      tier: safeString(offer.tier)
    });
  }

  function buildPortfolioSummary(offers) {
    const summary = createEmptyPortfolioSummary();
    summary.offers_total = offers.length;

    for (const offer of offers) {
      const submissionSummary = asPlainObject(offer.submission_summary);
      const deliverySummary = asPlainObject(offer.delivery_summary);
      summary.submission_targets_total += Number(submissionSummary.total_targets || 0);
      summary.delivery_targets_total += Number(deliverySummary.total_targets || 0);
      summary.eligible_submission_targets += Number(submissionSummary.eligible_targets || 0);
      summary.eligible_delivery_targets += Number(deliverySummary.eligible_targets || 0);

      for (const [state, count] of Object.entries(asPlainObject(submissionSummary.by_state))) {
        summary.by_submission_state[state] = Number(summary.by_submission_state[state] || 0) + Number(count || 0);
      }
      for (const [state, count] of Object.entries(asPlainObject(deliverySummary.by_state))) {
        summary.by_delivery_state[state] = Number(summary.by_delivery_state[state] || 0) + Number(count || 0);
      }
    }

    return canonicalize(summary);
  }

  function buildPortfolioEvidenceSnapshot(input = {}) {
    const asOfIso = safeString(input.asOfIso) || safeString(timeProvider.nowIso());
    const offerIds = listOfferIds(releasesDir);

    if (offerIds.length === 0) {
      return canonicalize({
        authoritative_sources: {
          delivery_evidence_index: "workspace/releases/index/delivery-evidence-index.json",
          releases_dir: "workspace/releases",
          submission_evidence_index: "workspace/releases/index/submission-evidence-index.json"
        },
        generated_at: asOfIso,
        noOp: true,
        offers: [],
        ok: true,
        schema_version: PHASE23_PORTFOLIO_EVIDENCE_SCHEMA,
        summary: createEmptyPortfolioSummary()
      });
    }

    const indexes = readRequiredIndexes(offerIds);
    const offers = offerIds.map((offerId) => buildOfferSnapshot(offerId, indexes));

    return canonicalize({
      authoritative_sources: {
        delivery_evidence_index: "workspace/releases/index/delivery-evidence-index.json",
        releases_dir: "workspace/releases",
        submission_evidence_index: "workspace/releases/index/submission-evidence-index.json"
      },
      generated_at: asOfIso,
      noOp: false,
      offers,
      ok: true,
      schema_version: PHASE23_PORTFOLIO_EVIDENCE_SCHEMA,
      summary: buildPortfolioSummary(offers)
    });
  }

  return Object.freeze({
    buildPortfolioEvidenceSnapshot
  });
}

module.exports = {
  PHASE23_PORTFOLIO_EVIDENCE_SCHEMA,
  createPhase23EvidenceAggregator
};
