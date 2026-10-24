"use strict";

/**
 * Paths, constants and environment for the trinc-content MCP server.
 *
 * Everything this server reads lives in the business monorepo. Nothing is hardcoded to a
 * checkout location that only exists on one machine: TRINC_CONTENT_REPO overrides the root,
 * which is also what lets the tests point at a fixture.
 *
 * @module config
 */

const path = require("node:path");

const DEFAULT_REPO = "/Users/myhome/TRINC";
const BUSINESS_DIR = "Trevor Robey Intelligence Network Citations";

function repoRoot() {
  return process.env.TRINC_CONTENT_REPO || DEFAULT_REPO;
}

function businessRoot() {
  return path.join(repoRoot(), BUSINESS_DIR);
}

function paths() {
  const business = businessRoot();
  return {
    repo: repoRoot(),
    business,
    platformTargets: path.join(business, "config", "platform-targets.json"),
    personalBrand: path.join(business, "01-brand-system", "personal-brand.md"),
    brandSystem: path.join(business, "01-brand-system", "brand-system.md"),
    offerings: path.join(business, "OFFERINGS.md"),
    revenuePlaybook: path.join(business, "REVENUE_PLAYBOOK.md"),
    releases: path.join(business, "workspace", "releases"),
    workflows: path.join(business, "workspace", "workflows"),
    // Generated drafts join the existing collateral tree rather than starting a second one.
    drafts: path.join(business, "workspace", "collateral", "social"),
    awsListing: path.join(business, "03-platforms", "aws-data-exchange")
  };
}

/**
 * Verbatim, from REVENUE_PLAYBOOK.md:22 and the repo CLAUDE.md. Required on customer-facing
 * material by Cal. Bus. & Prof. Code §17910.5(a). A longer variant exists in AGENTS.md that
 * appends "INC = Intelligence Network Citations."; the short form is the canonical one and is
 * pinned here so no tool emits whichever it happens to find first.
 */
const ENTITY_DISCLOSURE =
  "Trevor Robey, INC. is the wordmark of Trevor Robey Intelligence Network Citations LLC, " +
  "a California limited liability company.";

const COMPANY_TAGLINE = "Every claim, sourced. Every risk, named. In days, not weeks.";
const FOUNDER_LOCKUP =
  "Truth Seeker, Receipt Keeper. — Real data beats sweet hallucination. You decide.";

/**
 * Claims this business formally retired. Emitting one is a defect, not a style nit: each was
 * removed from OFFERINGS.md because it overstated what the pipeline actually enforces, and the
 * whole product is the claim that our claims are checkable.
 */
const RETIRED_CLAIMS = [
  { pattern: /zero\s+hallucinations?/i, retired: "OFFERINGS.md 2026-07-13 (commit 7801443)",
    instead: "State the enforced behaviour: identifiers are cross-checked against retrieved evidence and flagged [UNVERIFIED] when absent." },
  { pattern: /no\s+hallucinated\s+references/i, retired: "deliverable-packager.js 2026-09-19",
    instead: "Same — describe the gate, not an absolute." },
  { pattern: /no\s+fabricated\s+data/i, retired: "deliverable-packager.js 2026-09-19",
    instead: "Same — describe the gate, not an absolute." },
  { pattern: /on\s+any\s+topic/i, retired: "REVENUE_PLAYBOOK.md:150 (flagged, open)",
    instead: "Name the actual domain: biomedical due diligence." },
  { pattern: /\b100%\s+accura(te|cy)/i, retired: "never supportable",
    instead: "Cite the measured grounded-citation ratio instead." },
  { pattern: /\bguarantee[ds]?\s+(?:results|outcomes|returns)/i, retired: "never supportable",
    instead: "The Citation-Audit SLA is the only guarantee this business makes." }
];

/**
 * Metric vocabulary this business cannot substantiate. PLUGIN-BINDINGS.md records
 * `~~marketing analytics`, `~~marketing automation` and `~~email marketing` as explicitly
 * UNBOUND — there is no analytics tool anywhere in the stack — so any reach or engagement
 * figure in a draft was invented.
 */
const UNBOUNDED_METRICS = [
  "followers", "subscribers", "impressions", "engagement rate", "click-through",
  "conversion rate", "reach", "views", "likes", "shares", "trending"
];

/**
 * Publishing is opt-in per platform via TRINC_CONTENT_PUBLISH (comma-separated channel names).
 * Layer 2 of the five-layer pin: even with a credential present, a channel the operator has
 * not named here cannot publish.
 */
function publishAllowlist() {
  return String(process.env.TRINC_CONTENT_PUBLISH || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/** Keychain service name holding a channel's credential. Claude never reads or writes these. */
function keychainService(channel) {
  return `trinc-content-${channel}`;
}

const CHANNELS = ["youtube", "tiktok", "instagram", "facebook_page"];
const SURFACES = CHANNELS.concat(["aws_data_exchange"]);

module.exports = {
  BUSINESS_DIR,
  CHANNELS,
  COMPANY_TAGLINE,
  ENTITY_DISCLOSURE,
  FOUNDER_LOCKUP,
  RETIRED_CLAIMS,
  SURFACES,
  UNBOUNDED_METRICS,
  businessRoot,
  keychainService,
  paths,
  publishAllowlist,
  repoRoot
};
