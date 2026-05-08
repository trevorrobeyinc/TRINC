"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const { nowIso } = require("../../openclaw-bridge/core/time-provider.js");
const { canonicalize } = require("../../workflows/governance-automation/common.js");
const {
  PHASE23_COMMERCIALIZATION_DECISIONS_SCHEMA,
  rankCommercializationDecisions
} = require("./phase23-commercialization-decision-engine.js");
const {
  PHASE23_PORTFOLIO_EVIDENCE_SCHEMA
} = require("./phase23-evidence-aggregator.js");

const PHASE23_PORTFOLIO_SUMMARY_SCHEMA = "phase23-portfolio-summary-v1";

function canonicalJson(value) {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function ensureDependencies(evidenceAggregator) {
  if (!evidenceAggregator || typeof evidenceAggregator.buildPortfolioEvidenceSnapshot !== "function") {
    const error = new Error("phase23 report builder requires evidenceAggregator.buildPortfolioEvidenceSnapshot");
    error.code = "PHASE23_REPORT_CONFIG_INVALID";
    throw error;
  }
}

function buildDecisionCounts(decisions) {
  const counts = {
    continue: 0,
    investigate: 0,
    refresh: 0,
    retire: 0,
    retry: 0
  };
  for (const decision of asArray(decisions)) {
    const bucket = String(decision && decision.action_bucket || "");
    if (Object.prototype.hasOwnProperty.call(counts, bucket)) {
      counts[bucket] += 1;
    }
  }
  return canonicalize(counts);
}

function buildProductLineCounts(decisions) {
  const counts = {};
  for (const decision of asArray(decisions)) {
    const productLine = String(decision && decision.product_line || "");
    if (!productLine) {
      continue;
    }
    counts[productLine] = Number(counts[productLine] || 0) + 1;
  }
  return canonicalize(counts);
}

function buildPhase23Markdown(input = {}) {
  const asOfIso = String(input.asOfIso || "");
  const summary = input.summary && typeof input.summary === "object" ? input.summary : {};
  const decisions = asArray(input.decisions);

  const lines = [
    "# Phase 23 Portfolio Intelligence Report",
    "",
    `Generated At: ${asOfIso}`,
    "",
    "## Portfolio Summary",
    `- Offers analyzed: ${Number(summary.offers_total || 0)}`,
    `- Continue: ${Number(summary.decision_counts && summary.decision_counts.continue || 0)}`,
    `- Retry: ${Number(summary.decision_counts && summary.decision_counts.retry || 0)}`,
    `- Refresh: ${Number(summary.decision_counts && summary.decision_counts.refresh || 0)}`,
    `- Retire: ${Number(summary.decision_counts && summary.decision_counts.retire || 0)}`,
    `- Investigate: ${Number(summary.decision_counts && summary.decision_counts.investigate || 0)}`,
    `- Submission targets tracked: ${Number(summary.submission_targets_total || 0)}`,
    `- Delivery targets tracked: ${Number(summary.delivery_targets_total || 0)}`,
    "",
    "## Ranked Decisions",
    "| Rank | Offer | Bucket | Health | Product Line | Tier | Reasons |",
    "| ---: | --- | --- | ---: | --- | --- | --- |"
  ];

  if (decisions.length === 0) {
    lines.push("| 0 | (no approved offers) | investigate | 0 | n/a | n/a | no_targets_detected |");
  } else {
    for (const decision of decisions) {
      lines.push(`| ${Number(decision.priority_rank || 0)} | ${String(decision.offer_id || "")} | ${String(decision.action_bucket || "")} | ${Number(decision.health_score || 0)} | ${String(decision.product_line || "")} | ${String(decision.tier || "")} | ${asArray(decision.reason_codes).join(", ")} |`);
    }
  }

  lines.push(
    "",
    "## Governance Boundaries",
    "- Phase 23 is read-only decision support built from local release and evidence stores.",
    "- Missing or malformed submission/delivery indexes fail closed instead of inferring commercialization success.",
    "- No automated browser flows, credentialed session flows, delivery execution, or outbound submission are introduced.",
    ""
  );

  return `${lines.join("\n")}\n`;
}

function createPhase23ReportBuilder(options = {}) {
  const evidenceAggregator = options.evidenceAggregator;
  const timeProvider = options.timeProvider && typeof options.timeProvider.nowIso === "function"
    ? options.timeProvider
    : { nowIso };
  const defaultOutDir = path.resolve(options.outDir || path.join(process.cwd(), "audit", "evidence", "phase23"));

  ensureDependencies(evidenceAggregator);

  async function buildPhase23PortfolioReport(input = {}) {
    const asOfIso = typeof input.asOfIso === "string" && input.asOfIso.trim() ? input.asOfIso.trim() : String(timeProvider.nowIso());
    const snapshot = await Promise.resolve(evidenceAggregator.buildPortfolioEvidenceSnapshot({ asOfIso }));
    const decisionResult = rankCommercializationDecisions({ offers: snapshot.offers });
    const decisionCounts = buildDecisionCounts(decisionResult.decisions);

    const summary = canonicalize({
      decision_counts: decisionCounts,
      delivery_targets_total: Number(snapshot.summary && snapshot.summary.delivery_targets_total || 0),
      generated_at: asOfIso,
      no_op: snapshot.noOp === true,
      offers_total: Number(snapshot.summary && snapshot.summary.offers_total || 0),
      product_line_counts: buildProductLineCounts(decisionResult.decisions),
      schema_version: PHASE23_PORTFOLIO_SUMMARY_SCHEMA,
      submission_targets_total: Number(snapshot.summary && snapshot.summary.submission_targets_total || 0)
    });

    return canonicalize({
      asOfIso,
      decisions: canonicalize({
        decisions: decisionResult.decisions,
        generated_at: asOfIso,
        no_op: snapshot.noOp === true,
        schema_version: PHASE23_COMMERCIALIZATION_DECISIONS_SCHEMA
      }),
      markdown: buildPhase23Markdown({
        asOfIso,
        decisions: decisionResult.decisions,
        summary
      }),
      noOp: snapshot.noOp === true,
      ok: true,
      snapshot: canonicalize({
        ...snapshot,
        schema_version: PHASE23_PORTFOLIO_EVIDENCE_SCHEMA
      }),
      summary
    });
  }

  async function writePhase23Artifacts(input = {}) {
    const outDir = path.resolve(input.outDir || defaultOutDir);
    const report = await buildPhase23PortfolioReport({ asOfIso: input.asOfIso });
    await fs.mkdir(outDir, { recursive: true });

    const files = {
      "commercialization-decisions.json": canonicalJson(report.decisions),
      "phase23-portfolio-report.md": report.markdown,
      "portfolio-evidence-snapshot.json": canonicalJson(report.snapshot),
      "portfolio-evidence-summary.json": canonicalJson(report.summary)
    };

    const manifestEntries = [];
    for (const [name, body] of Object.entries(files)) {
      const filePath = path.join(outDir, name);
      await fs.writeFile(filePath, body, "utf8");
      manifestEntries.push({
        file: name,
        sha256: sha256(body)
      });
    }

    const manifest = canonicalJson({
      files: manifestEntries.sort((left, right) => left.file.localeCompare(right.file)),
      generated_at: report.asOfIso,
      no_op: report.noOp === true
    });
    await fs.writeFile(path.join(outDir, "report-hash-manifest.json"), manifest, "utf8");

    return canonicalize({
      files: [...Object.keys(files), "report-hash-manifest.json"].sort(),
      no_op: report.noOp === true,
      offer_count: Number(report.summary.offers_total || 0),
      ok: true,
      out_dir: outDir
    });
  }

  return Object.freeze({
    buildPhase23PortfolioReport,
    writePhase23Artifacts
  });
}

module.exports = {
  PHASE23_PORTFOLIO_SUMMARY_SCHEMA,
  buildPhase23Markdown,
  createPhase23ReportBuilder
};
