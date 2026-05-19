"use strict";

const { canonicalize, safeString } = require("../../workflows/governance-automation/common.js");

const PHASE23_COMMERCIALIZATION_DECISIONS_SCHEMA = "phase23-commercialization-decision-report-v1";
const ACTION_BUCKETS = Object.freeze(["continue", "retry", "refresh", "retire", "investigate"]);

const ACTION_PRIORITY = Object.freeze({
  investigate: 1,
  retry: 2,
  refresh: 3,
  continue: 4,
  retire: 5
});

function asPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function getStateCount(summary, state) {
  return Number(asPlainObject(summary.by_state)[state] || 0);
}

function computeOfferStateSummary(offer = {}) {
  const submissionSummary = asPlainObject(offer.submission_summary);
  const deliverySummary = asPlainObject(offer.delivery_summary);

  const readyCount =
    getStateCount(submissionSummary, "ready_for_manual_submission") +
    getStateCount(deliverySummary, "ready_for_manual_delivery");
  const activeCount =
    readyCount +
    getStateCount(submissionSummary, "submitted_pending_review") +
    getStateCount(deliverySummary, "delivery_in_progress");
  const successCount =
    getStateCount(submissionSummary, "published_confirmed") +
    getStateCount(deliverySummary, "delivery_completed");
  const retryCount =
    getStateCount(submissionSummary, "rejected") +
    getStateCount(deliverySummary, "delivery_failed") +
    getStateCount(deliverySummary, "needs_redelivery");
  const refreshCount = getStateCount(submissionSummary, "needs_revision");
  const retireCount =
    getStateCount(submissionSummary, "withdrawn") +
    getStateCount(deliverySummary, "withdrawn");
  const totalTargets =
    Number(submissionSummary.total_targets || 0) +
    Number(deliverySummary.total_targets || 0);

  return canonicalize({
    active_count: activeCount,
    ready_count: readyCount,
    refresh_count: refreshCount,
    retire_count: retireCount,
    retry_count: retryCount,
    success_count: successCount,
    total_targets: totalTargets
  });
}

function determineActionBucket(stateSummary = {}) {
  const summary = asPlainObject(stateSummary);
  const totalTargets = Number(summary.total_targets || 0);
  const successCount = Number(summary.success_count || 0);
  const activeCount = Number(summary.active_count || 0);
  const retryCount = Number(summary.retry_count || 0);
  const refreshCount = Number(summary.refresh_count || 0);
  const retireCount = Number(summary.retire_count || 0);

  if (totalTargets === 0) {
    return "investigate";
  }
  if (refreshCount > 0) {
    return "refresh";
  }
  if (retireCount === totalTargets) {
    return "retire";
  }
  if (retryCount > 0 && (successCount > 0 || activeCount > 0)) {
    return "investigate";
  }
  if (retryCount > 0) {
    return "retry";
  }
  if (successCount > 0 || activeCount > 0) {
    return "continue";
  }
  return "investigate";
}

function computeHealthScore(stateSummary = {}) {
  const summary = asPlainObject(stateSummary);
  const rawScore =
    50 +
    (Number(summary.success_count || 0) * 18) +
    (Number(summary.active_count || 0) * 6) -
    (Number(summary.retry_count || 0) * 14) -
    (Number(summary.refresh_count || 0) * 12) -
    (Number(summary.retire_count || 0) * 10);

  return Math.max(0, Math.min(100, Math.round(rawScore)));
}

function buildReasonCodes(actionBucket, stateSummary = {}) {
  const summary = asPlainObject(stateSummary);
  const reasons = [];
  if (Number(summary.total_targets || 0) === 0) {
    reasons.push("no_targets_detected");
  }
  if (Number(summary.refresh_count || 0) > 0) {
    reasons.push("refresh_required");
  }
  if (Number(summary.retry_count || 0) > 0) {
    reasons.push("retryable_failure_detected");
  }
  if (Number(summary.success_count || 0) > 0) {
    reasons.push("successful_distribution_present");
  }
  if (Number(summary.active_count || 0) > 0) {
    reasons.push("active_distribution_present");
  }
  if (Number(summary.retire_count || 0) === Number(summary.total_targets || 0) && Number(summary.total_targets || 0) > 0) {
    reasons.push("all_targets_withdrawn");
  }
  if (actionBucket === "investigate" && Number(summary.retry_count || 0) > 0 && (Number(summary.success_count || 0) > 0 || Number(summary.active_count || 0) > 0)) {
    reasons.push("mixed_success_and_retry_signals");
  }
  if (actionBucket === "investigate" && reasons.length === 0) {
    reasons.push("manual_review_required");
  }
  return reasons.sort((left, right) => left.localeCompare(right));
}

function rankCommercializationDecisions(input = {}) {
  const offers = asArray(input.offers);
  const decisions = offers.map((offer) => {
    const normalizedOffer = asPlainObject(offer);
    const stateSummary = computeOfferStateSummary(normalizedOffer);
    const actionBucket = determineActionBucket(stateSummary);
    const healthScore = computeHealthScore(stateSummary);
    return canonicalize({
      action_bucket: actionBucket,
      action_priority: ACTION_PRIORITY[actionBucket],
      approved_bundle_hash: safeString(normalizedOffer.approved_bundle_hash),
      build_id: safeString(normalizedOffer.build_id),
      delivery_targets: asArray(normalizedOffer.delivery_targets),
      health_score: healthScore,
      offer_id: safeString(normalizedOffer.offer_id),
      offer_title: safeString(normalizedOffer.offer_title),
      product_line: safeString(normalizedOffer.product_line),
      reason_codes: buildReasonCodes(actionBucket, stateSummary),
      release_status: safeString(normalizedOffer.release_status),
      source_id: safeString(normalizedOffer.source_id),
      source_kind: safeString(normalizedOffer.source_kind),
      state_summary: stateSummary,
      submission_targets: asArray(normalizedOffer.submission_targets),
      tier: safeString(normalizedOffer.tier)
    });
  });

  decisions.sort((left, right) => {
    const byPriority = Number(left.action_priority || 0) - Number(right.action_priority || 0);
    if (byPriority !== 0) {
      return byPriority;
    }
    const byHealth = Number(left.health_score || 0) - Number(right.health_score || 0);
    if (byHealth !== 0) {
      return byHealth;
    }
    return safeString(left.offer_id).localeCompare(safeString(right.offer_id));
  });

  return canonicalize({
    decisions: decisions.map((decision, index) => ({
      ...decision,
      priority_rank: index + 1
    })),
    ok: true,
    schema_version: PHASE23_COMMERCIALIZATION_DECISIONS_SCHEMA
  });
}

module.exports = {
  ACTION_BUCKETS,
  PHASE23_COMMERCIALIZATION_DECISIONS_SCHEMA,
  computeHealthScore,
  computeOfferStateSummary,
  determineActionBucket,
  rankCommercializationDecisions
};
