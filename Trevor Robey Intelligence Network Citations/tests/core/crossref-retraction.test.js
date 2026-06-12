"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { createCrossrefRetraction } = require("../../openclaw-bridge/mcp/crossref-retraction/crossref-retraction.js");
const { checkRetractions } = require("../../openclaw-bridge/core/citation-gate.js");

// Route the mock by which DOI substring is in the URL.
function fetchReturning(map) {
  return async (url) => {
    for (const key of Object.keys(map)) {
      if (url.includes(encodeURIComponent(key)) || url.includes(key)) {
        const v = map[key];
        if (v.__status) return { ok: false, status: v.__status, json: async () => ({}) };
        return { ok: true, status: 200, json: async () => ({ message: v }) };
      }
    }
    return { ok: true, status: 200, json: async () => ({ message: {} }) };
  };
}

describe("crossref-retraction — checkDoi", () => {
  it("flags retracted via relation.is-retracted-by", async () => {
    const cr = createCrossrefRetraction({ fetchImpl: fetchReturning({
      "10.1/retracted": { relation: { "is-retracted-by": [{ id: "10.1/notice" }] }, title: ["Bad paper"] }
    }) });
    const r = await cr.checkDoi("10.1/retracted");
    assert.equal(r.retracted, true);
    assert.equal(r.checked, true);
  });

  it("flags retracted via update-to type retraction", async () => {
    const cr = createCrossrefRetraction({ fetchImpl: fetchReturning({
      "10.2/x": { "update-to": [{ type: "retraction", id: "10.2/notice" }] }
    }) });
    assert.equal((await cr.checkDoi("10.2/x")).retracted, true);
  });

  it("clean work → not retracted, checked:true", async () => {
    const cr = createCrossrefRetraction({ fetchImpl: fetchReturning({
      "10.3/ok": { title: ["Good paper"], relation: {} }
    }) });
    const r = await cr.checkDoi("10.3/ok");
    assert.equal(r.retracted, false);
    assert.equal(r.checked, true);
  });

  it("404 → not retracted but checked (definitive 'not in Crossref')", async () => {
    const cr = createCrossrefRetraction({ fetchImpl: fetchReturning({ "10.4/missing": { __status: 404 } }) });
    const r = await cr.checkDoi("10.4/missing");
    assert.equal(r.retracted, false);
    assert.equal(r.checked, true);
  });

  it("network error → fail-soft (checked:false, retracted:false)", async () => {
    const cr = createCrossrefRetraction({ fetchImpl: async () => { throw new Error("ECONNRESET"); } });
    const r = await cr.checkDoi("10.5/err");
    assert.equal(r.retracted, false);
    assert.equal(r.checked, false);
  });
});

describe("citation-gate — checkRetractions", () => {
  it("extracts the report's DOIs and returns the retracted ones", async () => {
    const report = "Evidence: doi: 10.1016/j.example.2020.01.001 and doi: 10.1038/nature12373.";
    const checkDois = async (dois) => dois.map((d) => ({ doi: d, retracted: d === "10.1016/j.example.2020.01.001", checked: true }));
    const out = await checkRetractions(report, checkDois);
    assert.equal(out.checked, true);
    assert.deepEqual(out.retracted, ["10.1016/j.example.2020.01.001"]);
    assert.equal(out.dois_checked, 2);
  });

  it("no checker → not checked, no retractions (fail-soft)", async () => {
    const out = await checkRetractions("doi: 10.1038/nature12373", null);
    assert.equal(out.checked, false);
    assert.deepEqual(out.retracted, []);
  });

  it("report with no DOIs → checked, empty", async () => {
    const out = await checkRetractions("No citations here.", async () => []);
    assert.equal(out.checked, true);
    assert.deepEqual(out.retracted, []);
  });
});
