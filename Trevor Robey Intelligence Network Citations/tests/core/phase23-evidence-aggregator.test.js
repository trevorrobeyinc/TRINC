"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { createPhase23EvidenceAggregator } = require("../../analytics/portfolio-intelligence/phase23-evidence-aggregator.js");
const {
  createPhase23FixtureRoot,
  exportOffer,
  generateApprovedOffer
} = require("../helpers/phase23-fixtures.js");

test("phase23 evidence aggregator is deterministic for approved exported offers", async () => {
  const fixtureRoot = await createPhase23FixtureRoot("openclaw-phase23-core-");
  const offerId = generateApprovedOffer(fixtureRoot, {
    missionId: "mission-phase23-core",
    productLine: "research_packs",
    targets: "datarade"
  });
  exportOffer(fixtureRoot, offerId);

  const aggregator = createPhase23EvidenceAggregator({ rootDir: fixtureRoot });
  const first = aggregator.buildPortfolioEvidenceSnapshot({ asOfIso: "2026-03-22T23:00:00.000Z" });
  const second = aggregator.buildPortfolioEvidenceSnapshot({ asOfIso: "2026-03-22T23:00:00.000Z" });

  assert.deepEqual(first, second);
  assert.equal(first.noOp, false);
  assert.equal(first.summary.offers_total, 1);
});

test("phase23 evidence aggregator returns deterministic no-op when no approved offers exist", async () => {
  const fixtureRoot = await createPhase23FixtureRoot("openclaw-phase23-empty-");
  const aggregator = createPhase23EvidenceAggregator({ rootDir: fixtureRoot });

  const first = aggregator.buildPortfolioEvidenceSnapshot({ asOfIso: "2026-03-22T23:00:00.000Z" });
  const second = aggregator.buildPortfolioEvidenceSnapshot({ asOfIso: "2026-03-22T23:00:00.000Z" });

  assert.deepEqual(first, second);
  assert.equal(first.noOp, true);
  assert.equal(first.summary.offers_total, 0);
});

test("phase23 evidence aggregator fails closed when an evidence index is missing", async () => {
  const fixtureRoot = await createPhase23FixtureRoot("openclaw-phase23-missing-index-");
  const offerId = generateApprovedOffer(fixtureRoot, {
    missionId: "mission-phase23-missing-index",
    productLine: "research_packs",
    targets: "datarade"
  });
  exportOffer(fixtureRoot, offerId);

  fs.unlinkSync(path.join(
    fixtureRoot,
    "workspace",
    "releases",
    "index",
    "submission-evidence-index.json"
  ));

  const aggregator = createPhase23EvidenceAggregator({ rootDir: fixtureRoot });
  assert.throws(
    () => aggregator.buildPortfolioEvidenceSnapshot({ asOfIso: "2026-03-22T23:00:00.000Z" }),
    /PHASE23_SUBMISSION_INDEX_REQUIRED|submission-evidence-index\.json is required/i
  );
});

test("phase23 evidence aggregator fails closed when delivery evidence index is missing for delivery offers", async () => {
  const fixtureRoot = await createPhase23FixtureRoot("openclaw-phase23-missing-delivery-index-");
  const offerId = generateApprovedOffer(fixtureRoot, {
    deliveryTargets: "manual_secure_transfer",
    missionId: "mission-phase23-missing-delivery-index",
    productLine: "enterprise_private_delivery",
    targets: "aws_data_exchange",
    tier: "premium"
  });
  exportOffer(fixtureRoot, offerId);

  fs.unlinkSync(path.join(
    fixtureRoot,
    "workspace",
    "releases",
    "index",
    "delivery-evidence-index.json"
  ));

  const aggregator = createPhase23EvidenceAggregator({ rootDir: fixtureRoot });
  assert.throws(
    () => aggregator.buildPortfolioEvidenceSnapshot({ asOfIso: "2026-03-22T23:00:00.000Z" }),
    /PHASE23_DELIVERY_INDEX_REQUIRED|delivery-evidence-index\.json is required/i
  );
});
