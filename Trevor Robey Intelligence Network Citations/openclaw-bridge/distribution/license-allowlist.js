"use strict";

// License/compliance allowlist guard for SHIPPED artifacts (ADX, marketplaces, deliverables).
//
// HARD CONSTRAINTS (do not relax — these protect the moat and avoid unlicensed redistribution):
//  - DrugBank is EXCLUDED entirely (no commercial license held). It must never appear in any
//    shipped artifact — not as a citation type, a schema column, a description, or a DB##### id.
//  - ChEMBL (CC-BY-SA 3.0, ShareAlike) may appear ONLY as an identifier/ID (a factual pointer,
//    e.g. CHEMBL25). Its data/ACTIVITY VALUES (IC50/EC50/Ki/pChEMBL/etc.) must NOT be redistributed
//    in a paid product, or ShareAlike would force the derived data to be freely redistributable.
//
// Every assert FAILS CLOSED (throws) so a non-compliant bundle cannot ship.

class LicenseComplianceError extends Error {
  constructor(message) {
    super(message);
    this.name = "LicenseComplianceError";
  }
}

// Sources whose data may NOT be shipped at all.
const BANNED_SOURCES = ["DrugBank"];
// DrugBank accession id pattern (e.g. DB00945).
const DRUGBANK_ID = /\bDB\d{5,7}\b/;
// Column-name heuristics: a ChEMBL DATA/ACTIVITY value column (banned) vs a ChEMBL IDENTIFIER column (allowed).
const CHEMBL_HINT = /chembl/i;
const ACTIVITY_HINT = /(activity|bioactivity|ic50|ec50|\bki\b|\bkd\b|potency|assay|pchembl|standard_value)/i;
const ID_HINT = /(^id$|_id\b|identifier|accession|chembl_id)/i;

function assertNoBannedCitationTypes(citations) {
  for (const c of citations || []) {
    const name = String(c == null ? "" : (c.type != null ? c.type : c));
    if (BANNED_SOURCES.some((b) => name.toLowerCase() === b.toLowerCase())) {
      throw new LicenseComplianceError(
        `Banned source "${name}" in shipped citation types — no license to redistribute.`
      );
    }
  }
}

function assertNoBannedContent(content) {
  const s = typeof content === "string" ? content : JSON.stringify(content || "");
  if (/drugbank/i.test(s) || DRUGBANK_ID.test(s)) {
    throw new LicenseComplianceError(
      "DrugBank reference/identifier found in shipped content — no license to redistribute."
    );
  }
}

function collectPropertyNames(node, acc) {
  acc = acc || [];
  if (!node || typeof node !== "object") return acc;
  if (node.properties && typeof node.properties === "object") {
    for (const key of Object.keys(node.properties)) {
      acc.push(key);
      collectPropertyNames(node.properties[key], acc);
    }
  }
  if (node.items) collectPropertyNames(node.items, acc);
  return acc;
}

function assertShippableSchema(schema) {
  const s = typeof schema === "string" ? schema : JSON.stringify(schema || {});
  if (/drugbank/i.test(s)) {
    throw new LicenseComplianceError("DrugBank appears in shipped schema — no license to redistribute.");
  }
  for (const name of collectPropertyNames(schema)) {
    if (CHEMBL_HINT.test(name) && ACTIVITY_HINT.test(name) && !ID_HINT.test(name)) {
      throw new LicenseComplianceError(
        `ChEMBL data/activity column "${name}" cannot ship — CC-BY-SA ShareAlike: cite ChEMBL IDs only, do not redistribute values.`
      );
    }
  }
}

// One-call shipment gate. Pass any subset of { schema, citations, text }; throws on the first violation.
function assertShippable(bundle) {
  bundle = bundle || {};
  if (bundle.schema !== undefined) assertShippableSchema(bundle.schema);
  if (Array.isArray(bundle.citations)) assertNoBannedCitationTypes(bundle.citations);
  else if (bundle.citations !== undefined) assertNoBannedContent(bundle.citations);
  if (bundle.text !== undefined) assertNoBannedContent(bundle.text);
}

module.exports = {
  LicenseComplianceError,
  BANNED_SOURCES,
  assertShippable,
  assertShippableSchema,
  assertNoBannedCitationTypes,
  assertNoBannedContent,
};
