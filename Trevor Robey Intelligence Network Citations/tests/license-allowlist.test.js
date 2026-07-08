"use strict";

const test = require("node:test");
const assert = require("node:assert");
const g = require("../openclaw-bridge/distribution/license-allowlist.js");

test("blocks a DrugBank citation type (fail closed)", () => {
  assert.throws(
    () => g.assertShippable({ citations: [{ type: "DrugBank", id: "DB00945" }] }),
    g.LicenseComplianceError
  );
});

test("blocks a DrugBank id appearing in shipped text", () => {
  assert.throws(
    () => g.assertShippable({ text: "Mechanism per DB00945 in the dossier." }),
    g.LicenseComplianceError
  );
});

test("blocks DrugBank appearing in a shipped schema enum", () => {
  assert.throws(
    () => g.assertShippableSchema({
      properties: { citations: { items: { properties: { type: { enum: ["PMID", "DrugBank"] } } } } }
    }),
    g.LicenseComplianceError
  );
});

test("blocks a ChEMBL data/activity column (ShareAlike)", () => {
  assert.throws(
    () => g.assertShippableSchema({ properties: { chembl_activity_ic50: { type: "number" } } }),
    g.LicenseComplianceError
  );
});

test("allows a clean public-domain schema with ChEMBL used only as an identifier", () => {
  assert.doesNotThrow(() => g.assertShippable({
    schema: {
      properties: {
        citations: { items: { properties: { type: { enum: ["PMID", "NCT", "CID", "UniProt", "ChEMBL", "DOI"] } } } },
        chembl_id: { type: "string" }
      }
    },
    citations: [{ type: "ChEMBL", id: "CHEMBL25" }, { type: "PMID", id: "12345678" }],
    text: "Grounded in CHEMBL25 and PMID 12345678; no banned sources."
  }));
});
