"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const { createPhase23EvidenceAggregator } = require("../../analytics/portfolio-intelligence/phase23-evidence-aggregator.js");
const { createPhase23ReportBuilder } = require("../../analytics/portfolio-intelligence/phase23-report-builder.js");
const {
  createPhase23FixtureRoot,
  exportOffer,
  generateApprovedOffer,
  recordDeliveryOutcome,
  recordSubmissionOutcome
} = require("../helpers/phase23-fixtures.js");

function hashFile(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

test("phase23 integration builds stable commercialization decisions for a mixed portfolio", async () => {
  const fixtureRoot = await createPhase23FixtureRoot("openclaw-phase23-integration-");

  const continueOffer = generateApprovedOffer(fixtureRoot, {
    missionId: "mission-phase23-continue",
    productLine: "research_packs",
    targets: "datarade"
  });
  exportOffer(fixtureRoot, continueOffer);
  recordSubmissionOutcome(fixtureRoot, {
    idempotencyKey: "phase23-continue-1",
    notes: "active review",
    offerId: continueOffer,
    outcomeState: "submitted_pending_review",
    platformTarget: "datarade"
  });

  const retryOffer = generateApprovedOffer(fixtureRoot, {
    deliveryTargets: "manual_secure_transfer",
    missionId: "mission-phase23-retry",
    productLine: "enterprise_private_delivery",
    targets: "aws_data_exchange",
    tier: "premium"
  });
  exportOffer(fixtureRoot, retryOffer);
  recordSubmissionOutcome(fixtureRoot, {
    idempotencyKey: "phase23-retry-0",
    notes: "listing intentionally withdrawn",
    offerId: retryOffer,
    outcomeState: "withdrawn",
    platformTarget: "aws_data_exchange"
  });
  recordDeliveryOutcome(fixtureRoot, {
    deliveryTarget: "manual_secure_transfer",
    idempotencyKey: "phase23-retry-1",
    notes: "handoff started",
    offerId: retryOffer,
    outcomeState: "delivery_in_progress"
  });
  recordDeliveryOutcome(fixtureRoot, {
    deliveryTarget: "manual_secure_transfer",
    idempotencyKey: "phase23-retry-2",
    notes: "handoff failed",
    offerId: retryOffer,
    outcomeState: "delivery_failed"
  });

  const refreshOffer = generateApprovedOffer(fixtureRoot, {
    missionId: "mission-phase23-refresh",
    productLine: "research_packs",
    targets: "datarade"
  });
  exportOffer(fixtureRoot, refreshOffer);
  recordSubmissionOutcome(fixtureRoot, {
    idempotencyKey: "phase23-refresh-1",
    notes: "submitted once",
    offerId: refreshOffer,
    outcomeState: "submitted_pending_review",
    platformTarget: "datarade"
  });
  recordSubmissionOutcome(fixtureRoot, {
    idempotencyKey: "phase23-refresh-2",
    notes: "needs revision",
    offerId: refreshOffer,
    outcomeState: "needs_revision",
    platformTarget: "datarade"
  });

  const retireOffer = generateApprovedOffer(fixtureRoot, {
    missionId: "mission-phase23-retire",
    productLine: "research_packs",
    targets: "datarade"
  });
  exportOffer(fixtureRoot, retireOffer);
  recordSubmissionOutcome(fixtureRoot, {
    idempotencyKey: "phase23-retire-1",
    notes: "retired intentionally",
    offerId: retireOffer,
    outcomeState: "withdrawn",
    platformTarget: "datarade"
  });

  const investigateOffer = generateApprovedOffer(fixtureRoot, {
    deliveryTargets: "manual_secure_transfer",
    missionId: "mission-phase23-investigate",
    productLine: "enterprise_private_delivery",
    targets: "aws_data_exchange",
    tier: "premium"
  });
  exportOffer(fixtureRoot, investigateOffer);
  recordSubmissionOutcome(fixtureRoot, {
    idempotencyKey: "phase23-investigate-1",
    notes: "published successfully",
    offerId: investigateOffer,
    outcomeState: "submitted_pending_review",
    platformTarget: "aws_data_exchange"
  });
  recordSubmissionOutcome(fixtureRoot, {
    idempotencyKey: "phase23-investigate-2",
    notes: "published successfully",
    offerId: investigateOffer,
    outcomeState: "published_confirmed",
    platformTarget: "aws_data_exchange"
  });
  recordDeliveryOutcome(fixtureRoot, {
    deliveryTarget: "manual_secure_transfer",
    idempotencyKey: "phase23-investigate-3",
    notes: "handoff started",
    offerId: investigateOffer,
    outcomeState: "delivery_in_progress"
  });
  recordDeliveryOutcome(fixtureRoot, {
    deliveryTarget: "manual_secure_transfer",
    idempotencyKey: "phase23-investigate-4",
    notes: "needs retry",
    offerId: investigateOffer,
    outcomeState: "needs_redelivery"
  });

  const builder = createPhase23ReportBuilder({
    evidenceAggregator: createPhase23EvidenceAggregator({ rootDir: fixtureRoot }),
    outDir: path.join(fixtureRoot, "audit", "evidence", "phase23")
  });

  const first = await builder.buildPhase23PortfolioReport({ asOfIso: "2026-03-22T23:00:00.000Z" });
  const second = await builder.buildPhase23PortfolioReport({ asOfIso: "2026-03-22T23:00:00.000Z" });
  assert.deepEqual(first, second);

  const decisionsByOffer = Object.fromEntries(first.decisions.decisions.map((decision) => [decision.offer_id, decision.action_bucket]));
  assert.equal(decisionsByOffer[continueOffer], "continue");
  assert.equal(decisionsByOffer[retryOffer], "retry");
  assert.equal(decisionsByOffer[refreshOffer], "refresh");
  assert.equal(decisionsByOffer[retireOffer], "retire");
  assert.equal(decisionsByOffer[investigateOffer], "investigate");

  const written = await builder.writePhase23Artifacts({ asOfIso: "2026-03-22T23:00:00.000Z" });
  assert.equal(written.ok, true);

  const outDir = path.join(fixtureRoot, "audit", "evidence", "phase23");
  const firstHashes = {};
  for (const name of written.files) {
    firstHashes[name] = hashFile(path.join(outDir, name));
  }

  const writtenAgain = await builder.writePhase23Artifacts({ asOfIso: "2026-03-22T23:00:00.000Z" });
  const secondHashes = {};
  for (const name of writtenAgain.files) {
    secondHashes[name] = hashFile(path.join(outDir, name));
  }
  assert.deepEqual(firstHashes, secondHashes);
});
