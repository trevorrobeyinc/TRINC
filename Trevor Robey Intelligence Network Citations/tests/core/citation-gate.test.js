"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { verifyReportCitations, annotateUngrounded, collectFetchedIds } = require("../../openclaw-bridge/core/citation-gate.js");

function fakeReader(map) {
  return (p) => {
    if (Object.prototype.hasOwnProperty.call(map, p)) return map[p];
    throw new Error("ENOENT " + p);
  };
}

describe("citation-gate", () => {
  describe("verifyReportCitations", () => {
    it("passes when every cited id is grounded in the fetched set", () => {
      const read = fakeReader({
        m1: JSON.stringify({ fetched_citation_ids: ["12345678", "NCT01776424"] }),
        o1: "Per PMID: 12345678 and trial NCT01776424 the effect held."
      });
      const r = verifyReportCitations({
        subtaskResults: [{ metadata_path: "m1", output_path: "o1" }],
        minGroundedRatio: 0.5, readFile: read
      });
      assert.equal(r.cited, 2);
      assert.equal(r.grounded, 2);
      assert.equal(r.ungrounded, 0);
      assert.equal(r.pass, true);
    });

    it("FAILS when too many cited ids are ungrounded AND there is fetched ground truth", () => {
      const read = fakeReader({
        m1: JSON.stringify({ fetched_citation_ids: ["12345678"] }),
        o1: "Per PMID: 12345678, also PMID: 99999999, PMID: 88888888, and NCT01234567."
      });
      const r = verifyReportCitations({
        subtaskResults: [{ metadata_path: "m1", output_path: "o1" }],
        minGroundedRatio: 0.5, readFile: read
      });
      assert.equal(r.cited, 4);
      assert.equal(r.grounded, 1);
      assert.equal(r.pass, false); // 1/4 = 0.25 < 0.5
      assert.ok(r.ungrounded_list.some((c) => c.id === "99999999"));
    });

    it("does NOT fail when there is no fetched ground truth (cannot verify -> do not block)", () => {
      const read = fakeReader({
        m1: JSON.stringify({ fetched_citation_ids: [] }),
        o1: "Cites PMID: 99999999 with no fetched evidence behind it."
      });
      const r = verifyReportCitations({
        subtaskResults: [{ metadata_path: "m1", output_path: "o1" }],
        minGroundedRatio: 0.5, readFile: read
      });
      assert.equal(r.fetched_id_count, 0);
      assert.equal(r.pass, true);
    });

    it("passes a report with no citations", () => {
      const read = fakeReader({
        m1: JSON.stringify({ fetched_citation_ids: ["12345678"] }),
        o1: "No citations in this section."
      });
      const r = verifyReportCitations({
        subtaskResults: [{ metadata_path: "m1", output_path: "o1" }],
        minGroundedRatio: 0.5, readFile: read
      });
      assert.equal(r.cited, 0);
      assert.equal(r.pass, true);
    });
  });

  describe("annotateUngrounded", () => {
    it("marks ungrounded ids inline and appends a verification section", () => {
      const out = annotateUngrounded("See PMID: 99999999 for details.", [{ type: "PMID", id: "99999999" }]);
      assert.match(out, /99999999 \[UNVERIFIED\]/);
      assert.match(out, /Citation Verification/);
    });

    it("is a no-op when nothing is ungrounded", () => {
      assert.equal(annotateUngrounded("Clean text.", []), "Clean text.");
    });
  });

  describe("collectFetchedIds", () => {
    it("unions ids across subtasks, uppercases, and is fail-soft on unreadable sidecars", () => {
      const read = fakeReader({
        a: JSON.stringify({ fetched_citation_ids: ["nct01776424", "12345678"] }),
        b: JSON.stringify({ fetched_citation_ids: ["12345678", "CHEMBL25"] })
      });
      const ids = collectFetchedIds(
        [{ metadata_path: "a" }, { metadata_path: "b" }, { metadata_path: "missing" }],
        read
      );
      assert.deepEqual(ids.slice().sort(), ["12345678", "CHEMBL25", "NCT01776424"].sort());
    });
  });
});
