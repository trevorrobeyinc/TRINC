"use strict";

// Characterization tests for the Open Targets GraphQL adapter. Written 2026-07-24 BEFORE
// refactoring it, to pin current behavior (per /refactor: never restructure unverified code).
// They lock the contract the citation gate depends on: records must carry chemblId / pmid,
// because tool-prefetch's renderRecord turns exactly those fields into the "ChEMBL: …" /
// "PMID: …" lines that citation-extractor harvests into fetched_citation_ids.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { createOpenTargetsGraphql } = require("../../openclaw-bridge/mcp/open-targets-graphql/open-targets-graphql.js");

// Route each GraphQL call to a payload by inspecting the posted query text. Records every
// call so tests can assert on request count (cache behavior) and variables.
function mockGql(routes, { ok = true, status = 200 } = {}) {
  const calls = [];
  const fn = async (url, opts) => {
    const body = JSON.parse((opts && opts.body) || "{}");
    calls.push({ url, query: body.query, variables: body.variables });
    for (const [needle, payload] of routes) {
      if (body.query.includes(needle)) {
        return { ok, status, json: async () => payload };
      }
    }
    return { ok, status, json: async () => ({ data: null }) };
  };
  fn.calls = calls;
  return fn;
}

const SEARCH_TARGET = { data: { search: { hits: [{ id: "ENSG00000012048", entity: "target", name: "BRCA1", description: "DNA repair" }] } } };
const SEARCH_DISEASE = { data: { search: { hits: [{ id: "MONDO_0007254", entity: "disease", name: "breast cancer" }] } } };

const TARGET_DETAIL = { data: { target: {
  approvedSymbol: "BRCA1",
  approvedName: "BRCA1 DNA repair associated",
  drugAndClinicalCandidates: { count: 2, rows: [
    { maxClinicalStage: "PHASE_3", drug: { id: "CHEMBL1201585", name: "OLAPARIB", drugType: "Small molecule" } },
    { maxClinicalStage: "PHASE_1_2", drug: { id: "CHEMBL999", name: "STRADDLER", drugType: "Antibody" } }
  ] },
  associatedDiseases: { count: 77, rows: [{ score: 0.912345, disease: { id: "MONDO_0007254", name: "breast cancer" } }] },
  literatureOcurrences: { count: 5, rows: [{ pmid: "12345678", publicationDate: "2023-04-01" }] }
} } };

const DISEASE_DETAIL = { data: { disease: {
  name: "breast cancer",
  associatedTargets: { count: 40, rows: [{ score: 0.87, target: { id: "ENSG00000012048", approvedSymbol: "BRCA1" } }] },
  drugAndClinicalCandidates: { count: 300, rows: [
    { maxClinicalStage: "PHASE_2", drug: { id: "CHEMBL77305", name: "RUBITECAN", drugType: "Small molecule" } },
    { maxClinicalStage: "PHASE_2", drug: { id: "CHEMBL77305", name: "RUBITECAN duplicate", drugType: "Small molecule" } }
  ] }
} } };

const targetRoutes = [["entityNames:[\"target\"]", SEARCH_TARGET], ["drugAndClinicalCandidates", TARGET_DETAIL]];
const diseaseRoutes = [["entityNames:[\"disease\"]", SEARCH_DISEASE], ["associatedTargets", DISEASE_DETAIL]];

describe("open-targets-graphql — targetIntel", () => {
  it("emits chemblId-bearing drug records and pmid-bearing literature records (the grounded-citation contract)", async () => {
    const fetchImpl = mockGql(targetRoutes);
    const ot = createOpenTargetsGraphql({ fetchImpl });
    const recs = await ot.targetIntel({ target: "BRCA1", limit: 10 });

    const drugs = recs.filter((r) => r.chemblId);
    const lit = recs.filter((r) => r.pmid);
    assert.equal(drugs.length, 2);
    assert.equal(drugs[0].chemblId, "CHEMBL1201585");
    assert.equal(lit.length, 1);
    assert.equal(lit[0].pmid, "12345678");
    assert.equal(lit[0].year, "2023");
  });

  it("normalizes PHASE_3 -> '3' and PHASE_1_2 -> '1/2' (a straddling trial is not phase 1)", async () => {
    const ot = createOpenTargetsGraphql({ fetchImpl: mockGql(targetRoutes) });
    const recs = await ot.targetIntel({ target: "BRCA1" });
    const byId = Object.fromEntries(recs.filter((r) => r.chemblId).map((r) => [r.chemblId, r]));
    assert.equal(byId.CHEMBL1201585.phase, "3");
    assert.equal(byId.CHEMBL999.phase, "1/2");
  });

  it("emits a disease-association context record that carries NO citation identifier (EFO/MONDO ids are not cites)", async () => {
    const ot = createOpenTargetsGraphql({ fetchImpl: mockGql(targetRoutes) });
    const recs = await ot.targetIntel({ target: "BRCA1" });
    const assoc = recs.find((r) => /top disease associations/.test(r.title || ""));
    assert.ok(assoc, "expected an associations context record");
    assert.equal(assoc.chemblId, undefined);
    assert.equal(assoc.pmid, undefined);
    assert.match(assoc.description, /breast cancer \(score 0\.91/);
  });

  it("accepts the target_gene alias and caches by symbol+limit (second call makes no request)", async () => {
    const fetchImpl = mockGql(targetRoutes);
    const ot = createOpenTargetsGraphql({ fetchImpl });
    await ot.targetIntel({ target_gene: "BRCA1", limit: 5 });
    const after = fetchImpl.calls.length;
    await ot.targetIntel({ target_gene: "BRCA1", limit: 5 });
    assert.equal(fetchImpl.calls.length, after, "cached call must not re-request");
  });

  it("returns an honest zero for an empty symbol without making a request", async () => {
    const fetchImpl = mockGql(targetRoutes);
    const ot = createOpenTargetsGraphql({ fetchImpl });
    assert.deepEqual(await ot.targetIntel({ target: "" }), []);
    assert.equal(fetchImpl.calls.length, 0);
  });

  it("does NOT fall back to compound_name (a drug name must not drive a target lookup)", async () => {
    const fetchImpl = mockGql(targetRoutes);
    const ot = createOpenTargetsGraphql({ fetchImpl });
    assert.deepEqual(await ot.targetIntel({ compound_name: "aspirin" }), []);
    assert.equal(fetchImpl.calls.length, 0);
  });
});

describe("open-targets-graphql — diseaseIntel", () => {
  it("emits chemblId-bearing drug records and dedupes repeated drug ids", async () => {
    const ot = createOpenTargetsGraphql({ fetchImpl: mockGql(diseaseRoutes) });
    const recs = await ot.diseaseIntel({ indication: "breast cancer", limit: 10 });
    const drugs = recs.filter((r) => r.chemblId);
    assert.equal(drugs.length, 1, "duplicate CHEMBL77305 must collapse to one record");
    assert.equal(drugs[0].chemblId, "CHEMBL77305");
    assert.equal(drugs[0].phase, "2");
  });

  it("resolves the indication through every template alias", async () => {
    for (const key of ["indication", "disease", "disease_name", "disease_context", "therapeutic_area"]) {
      const ot = createOpenTargetsGraphql({ fetchImpl: mockGql(diseaseRoutes) });
      const recs = await ot.diseaseIntel({ [key]: "breast cancer" });
      assert.ok(recs.length > 0, `expected records when driven by '${key}'`);
    }
  });

  it("returns an honest zero when every alias is empty, without making a request", async () => {
    const fetchImpl = mockGql(diseaseRoutes);
    const ot = createOpenTargetsGraphql({ fetchImpl });
    const recs = await ot.diseaseIntel({ indication: "", disease_name: "", disease_context: "", therapeutic_area: "" });
    assert.deepEqual(recs, []);
    assert.equal(fetchImpl.calls.length, 0);
  });
});

describe("open-targets-graphql — fail-soft contract (a prefetch source must never break a run)", () => {
  it("returns [] when GraphQL replies 200 with an errors array", async () => {
    const fetchImpl = mockGql([["entityNames:[\"target\"]", { errors: [{ message: "Cannot query field 'knownDrugs'" }] }]]);
    const ot = createOpenTargetsGraphql({ fetchImpl });
    assert.deepEqual(await ot.targetIntel({ target: "BRCA1" }), []);
  });

  it("returns [] on an HTTP error rather than throwing", async () => {
    const fetchImpl = mockGql(targetRoutes, { ok: false, status: 400 });
    const ot = createOpenTargetsGraphql({ fetchImpl });
    assert.deepEqual(await ot.diseaseIntel({ indication: "breast cancer" }), []);
  });

  it("returns [] when the transport itself throws (network down / DNS failure)", async () => {
    // NB: passing fetchImpl:null does NOT disable fetching — it falls back to the global fetch,
    // which exists on Node 22 (same pattern as ctgov-supplemental.js). So the meaningful
    // fail-soft case is a transport that rejects, not an absent one.
    const fetchImpl = async () => { throw new Error("ENOTFOUND api.platform.opentargets.org"); };
    const ot = createOpenTargetsGraphql({ fetchImpl });
    assert.deepEqual(await ot.targetIntel({ target: "BRCA1" }), []);
    assert.deepEqual(await ot.diseaseIntel({ indication: "breast cancer" }), []);
  });

  it("health() reports ok:false instead of throwing when the endpoint is down", async () => {
    const ot = createOpenTargetsGraphql({ fetchImpl: mockGql([], { ok: false, status: 503 }) });
    const h = await ot.health();
    assert.equal(h.ok, false);
  });
});
