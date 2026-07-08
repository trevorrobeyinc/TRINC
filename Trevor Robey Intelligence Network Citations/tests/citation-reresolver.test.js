"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { createCitationReresolver } = require("../openclaw-bridge/mcp/citation-reresolver/citation-reresolver.js");

const NOW = () => "2026-06-19T00:00:00Z";

function mockFetch(routes, counter) {
  return async (url) => {
    if (counter) counter.n += 1;
    for (const r of routes) {
      if (url.includes(r.match)) {
        if (r.throw) throw new Error("network down");
        if (r.abort) { const e = new Error("aborted"); e.name = "AbortError"; throw e; }
        return { status: r.status, json: async () => r.body, text: async () => JSON.stringify(r.body) };
      }
    }
    throw new Error("no mock route for " + url);
  };
}
function rr(routes, counter) {
  return createCitationReresolver({ fetchImpl: mockFetch(routes, counter), nowIso: NOW });
}

test("PMID: real id with docsum -> VERIFIED", async () => {
  const r = await rr([{ match: "esummary", status: 200, body: { result: { "11850928": { uid: "11850928", title: "X" } } } }]).resolveOne({ type: "PMID", id: "11850928" });
  assert.equal(r.status, "VERIFIED");
});
test("PMID: nonexistent id returns 200+error -> UNRESOLVED (200 not trusted)", async () => {
  const r = await rr([{ match: "esummary", status: 200, body: { result: { "999999999": { uid: "999999999", error: "cannot get document summary" } } } }]).resolveOne({ type: "PMID", id: "999999999" });
  assert.equal(r.status, "UNRESOLVED");
  assert.equal(r.evidence.reason, "cannot_get_document_summary");
});
test("PMID: network error -> UNCHECKED", async () => {
  const r = await rr([{ match: "esummary", throw: true }]).resolveOne({ type: "PMID", id: "11850928" });
  assert.equal(r.status, "UNCHECKED");
  assert.equal(r.evidence.reason, "network_error");
});
test("PMID: timeout/abort -> UNCHECKED timeout", async () => {
  const r = await rr([{ match: "esummary", abort: true }]).resolveOne({ type: "PMID", id: "11850928" });
  assert.equal(r.status, "UNCHECKED");
  assert.equal(r.evidence.reason, "timeout");
});

test("PubChem: full-record match -> VERIFIED", async () => {
  const r = await rr([{ match: "pubchem", status: 200, body: { PC_Compounds: [{ id: { id: { cid: 2244 } } }] } }]).resolveOne({ type: "PubChem CID", id: "2244" });
  assert.equal(r.status, "VERIFIED");
});
test("PubChem: 404 NotFound -> UNRESOLVED", async () => {
  const r = await rr([{ match: "pubchem", status: 404, body: { Fault: { Code: "PUGREST.NotFound" } } }]).resolveOne({ type: "PubChem CID", id: "999999999" });
  assert.equal(r.status, "UNRESOLVED");
});
test("PubChem: 200 echo WITHOUT full record (trap) -> UNCHECKED, never falsely VERIFIED", async () => {
  const r = await rr([{ match: "pubchem", status: 200, body: { IdentifierList: { CID: [999999999] } } }]).resolveOne({ type: "PubChem CID", id: "999999999" });
  assert.equal(r.status, "UNCHECKED");
});

test("RxNorm: 200 status Active -> VERIFIED", async () => {
  const r = await rr([{ match: "rxnav", status: 200, body: { rxcuiStatusHistory: { metaData: { status: "Active" } } } }]).resolveOne({ type: "RxNorm", id: "161" });
  assert.equal(r.status, "VERIFIED");
});
test("RxNorm: 200 status UNKNOWN (200 not trusted) -> UNRESOLVED", async () => {
  const r = await rr([{ match: "rxnav", status: 200, body: { rxcuiStatusHistory: { metaData: { status: "UNKNOWN" } } } }]).resolveOne({ type: "RxNorm", id: "99999999" });
  assert.equal(r.status, "UNRESOLVED");
});

test("UniProt: active entry -> VERIFIED", async () => {
  const r = await rr([{ match: "uniprot", status: 200, body: { primaryAccession: "P05067", entryType: "UniProtKB reviewed (Swiss-Prot)" } }]).resolveOne({ type: "UniProt", id: "P05067" });
  assert.equal(r.status, "VERIFIED");
});
test("UniProt: 200 Inactive/DELETED (200 not trusted) -> UNRESOLVED", async () => {
  const r = await rr([{ match: "uniprot", status: 200, body: { primaryAccession: "P00000", entryType: "Inactive", inactiveReason: { inactiveReasonType: "DELETED" } } }]).resolveOne({ type: "UniProt", id: "P00000" });
  assert.equal(r.status, "UNRESOLVED");
});

test("DOI: crossref work-agency -> VERIFIED primary", async () => {
  const r = await rr([{ match: "crossref.org", status: 200, body: { status: "ok", "message-type": "work-agency" } }]).resolveOne({ type: "DOI", id: "10.1038/nature12373" });
  assert.equal(r.status, "VERIFIED");
  assert.equal(r.resolver_type, "primary");
});
test("DOI: crossref 404 -> doi.org HEAD 200 -> VERIFIED fallback", async () => {
  const r = await rr([
    { match: "crossref.org", status: 404, body: {} },
    { match: "doi.org", status: 200, body: {} },
  ]).resolveOne({ type: "DOI", id: "10.5281/zenodo.123" });
  assert.equal(r.status, "VERIFIED");
  assert.equal(r.resolver_type, "fallback");
});
test("DOI: crossref 404 -> doi.org 404 -> UNRESOLVED", async () => {
  const r = await rr([
    { match: "crossref.org", status: 404, body: {} },
    { match: "doi.org", status: 404, body: {} },
  ]).resolveOne({ type: "DOI", id: "10.1038/this-does-not-exist" });
  assert.equal(r.status, "UNRESOLVED");
});

test("NCT: id echo match -> VERIFIED", async () => {
  const r = await rr([{ match: "clinicaltrials.gov", status: 200, body: { protocolSection: { identificationModule: { nctId: "NCT00000102" } } } }]).resolveOne({ type: "NCT", id: "NCT00000102" });
  assert.equal(r.status, "VERIFIED");
});
test("NCT: 404 -> UNRESOLVED", async () => {
  const r = await rr([{ match: "clinicaltrials.gov", status: 404, body: {} }]).resolveOne({ type: "NCT", id: "NCT99999999" });
  assert.equal(r.status, "UNRESOLVED");
});

test("ChEMBL: id echo match -> VERIFIED (id only)", async () => {
  const r = await rr([{ match: "chembl", status: 200, body: { molecule_chembl_id: "CHEMBL25" } }]).resolveOne({ type: "ChEMBL", id: "CHEMBL25" });
  assert.equal(r.status, "VERIFIED");
  assert.deepEqual(Object.keys(r.evidence), ["molecule_chembl_id"]); // no data values harvested
});
test("ChEMBL: 404 -> UNRESOLVED", async () => {
  const r = await rr([{ match: "chembl", status: 404, body: {} }]).resolveOne({ type: "ChEMBL", id: "CHEMBL00000" });
  assert.equal(r.status, "UNRESOLVED");
});

test("DrugBank: no live resolver -> UNCHECKED no_resolver (no fetch call)", async () => {
  const counter = { n: 0 };
  const r = await rr([], counter).resolveOne({ type: "DrugBank", id: "DB00945" });
  assert.equal(r.status, "UNCHECKED");
  assert.equal(r.evidence.reason, "no_resolver");
  assert.equal(counter.n, 0);
});

test("cache: a duplicate citation is resolved once per run", async () => {
  const counter = { n: 0 };
  const resolver = rr([{ match: "esummary", status: 200, body: { result: { "11850928": { uid: "11850928" } } } }], counter);
  await resolver.resolveOne({ type: "PMID", id: "11850928" });
  await resolver.resolveOne({ type: "PMID", id: "11850928" });
  assert.equal(counter.n, 1);
});

test("resolveAll: dedups and returns a result per unique citation", async () => {
  const out = await rr([{ match: "esummary", status: 200, body: { result: { "1": { uid: "1" } } } }])
    .resolveAll([{ type: "PMID", id: "1" }, { type: "PMID", id: "1" }, { type: "PMID", id: "1" }]);
  assert.equal(out.length, 1);
  assert.equal(out[0].status, "VERIFIED");
});
