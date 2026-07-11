"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  verifyReportCitations, annotateUngrounded, collectFetchedIds, DEFAULT_MIN_GROUNDED_RATIO
} = require("../../openclaw-bridge/core/citation-gate.js");

function fakeReader(map) {
  return (p) => {
    if (Object.prototype.hasOwnProperty.call(map, p)) return map[p];
    throw new Error("ENOENT " + p);
  };
}

describe("citation-gate", () => {
  describe("verifyReportCitations", () => {
    it("PASSES when every cited id is grounded in the fetched set", () => {
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
      assert.equal(r.verdict, "PASS");
    });

    it("verdict UNVERIFIED when too many cited ids are ungrounded AND there is fetched ground truth", () => {
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
      assert.equal(r.verdict, "UNVERIFIED");
      assert.ok(r.ungrounded_list.some((c) => c.id === "99999999"));
    });

    // Q1 doctrine (2026-07-10): zero fetched evidence must NOT auto-pass — "cannot verify" is a
    // recorded, non-shippable verdict, not a silent true.
    it("verdict INSUFFICIENT_EVIDENCE (non-shippable) when NO ground truth was fetched", () => {
      const read = fakeReader({
        m1: JSON.stringify({ fetched_citation_ids: [] }),
        o1: "Cites PMID: 99999999 with no fetched evidence behind it."
      });
      const r = verifyReportCitations({
        subtaskResults: [{ metadata_path: "m1", output_path: "o1" }],
        minGroundedRatio: 0.5, readFile: read
      });
      assert.equal(r.fetched_id_count, 0);
      assert.equal(r.pass, false);
      assert.equal(r.verdict, "INSUFFICIENT_EVIDENCE");
    });

    // Explicit opt-out: a template that declares evidence optional may pass with zero evidence.
    it("evidenceRequired:false lets a zero-evidence run PASS (opt-out path)", () => {
      const read = fakeReader({
        m1: JSON.stringify({ fetched_citation_ids: [] }),
        o1: "A narrative deliverable that legitimately needs no fetched evidence."
      });
      const r = verifyReportCitations({
        subtaskResults: [{ metadata_path: "m1", output_path: "o1" }],
        minGroundedRatio: 0.5, evidenceRequired: false, readFile: read
      });
      assert.equal(r.pass, true);
      assert.equal(r.verdict, "PASS");
    });

    // Q1 doctrine: evidence fetched but the report grounds nothing → NO_CITATIONS, non-shippable.
    it("verdict NO_CITATIONS (non-shippable) when evidence exists but the report cites nothing", () => {
      const read = fakeReader({
        m1: JSON.stringify({ fetched_citation_ids: ["12345678"] }),
        o1: "No citations in this section."
      });
      const r = verifyReportCitations({
        subtaskResults: [{ metadata_path: "m1", output_path: "o1" }],
        minGroundedRatio: 0.5, readFile: read
      });
      assert.equal(r.cited, 0);
      assert.equal(r.pass, false);
      assert.equal(r.verdict, "NO_CITATIONS");
    });
  });

  // Q7: the grounded floor is ONE config-owned value, and the fail-closed fallback is strict, not lax.
  describe("minGroundedCitationRatio floor (Q7)", () => {
    it("exports a strict fail-closed default of 0.75 (the B-grade floor)", () => {
      assert.equal(DEFAULT_MIN_GROUNDED_RATIO, 0.75);
    });

    it("config/agent-config.json pins the production floor to 0.75", () => {
      const cfg = JSON.parse(fs.readFileSync(
        path.join(__dirname, "..", "..", "config", "agent-config.json"), "utf8"));
      assert.equal(cfg.minGroundedCitationRatio, 0.75);
    });

    it("uses the strict default when no ratio is supplied (never a lax fallback)", () => {
      const read = fakeReader({
        m1: JSON.stringify({ fetched_citation_ids: ["12345678", "22222222", "33333333"] }),
        // 2 of 3 cited ids grounded = 0.667 — below the 0.75 default, so this must NOT pass.
        o1: "Per PMID: 12345678 and PMID: 22222222, but also PMID: 99999999."
      });
      const r = verifyReportCitations({
        subtaskResults: [{ metadata_path: "m1", output_path: "o1" }], readFile: read
      });
      assert.equal(r.min_grounded_ratio, 0.75);
      assert.equal(r.pass, false);
      assert.equal(r.verdict, "UNVERIFIED");
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
