"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  determineActionBucket,
  rankCommercializationDecisions
} = require("../../analytics/portfolio-intelligence/phase23-commercialization-decision-engine.js");

test("phase23 decision engine assigns stable action buckets", () => {
  assert.equal(determineActionBucket({
    active_count: 1,
    refresh_count: 0,
    retire_count: 0,
    retry_count: 0,
    success_count: 0,
    total_targets: 1
  }), "continue");
  assert.equal(determineActionBucket({
    active_count: 0,
    refresh_count: 0,
    retire_count: 0,
    retry_count: 1,
    success_count: 0,
    total_targets: 1
  }), "retry");
  assert.equal(determineActionBucket({
    active_count: 1,
    refresh_count: 0,
    retire_count: 0,
    retry_count: 1,
    success_count: 0,
    total_targets: 2
  }), "investigate");
  assert.equal(determineActionBucket({
    active_count: 0,
    refresh_count: 1,
    retire_count: 0,
    retry_count: 0,
    success_count: 0,
    total_targets: 1
  }), "refresh");
  assert.equal(determineActionBucket({
    active_count: 0,
    refresh_count: 0,
    retire_count: 1,
    retry_count: 0,
    success_count: 0,
    total_targets: 1
  }), "retire");
});

test("phase23 decision ranking is deterministic", () => {
  const input = {
    offers: [
      {
        offer_id: "offer-continue",
        offer_title: "Continue",
        product_line: "research_packs",
        submission_summary: {
          by_state: {
            submitted_pending_review: 1
          },
          total_targets: 1
        },
        delivery_summary: {
          by_state: {},
          total_targets: 0
        },
        tier: "standard"
      },
      {
        offer_id: "offer-retry",
        offer_title: "Retry",
        product_line: "enterprise_private_delivery",
        submission_summary: {
          by_state: {},
          total_targets: 0
        },
        delivery_summary: {
          by_state: {
            delivery_failed: 1
          },
          total_targets: 1
        },
        tier: "premium"
      }
    ]
  };

  const first = rankCommercializationDecisions(input);
  const second = rankCommercializationDecisions(input);
  assert.deepEqual(first, second);
  assert.equal(first.decisions.length, 2);
  assert.equal(first.decisions[0].action_bucket, "retry");
});
