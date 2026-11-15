"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  verifyReportCitations, annotateUngrounded, annotateSubtaskOutputs, countUnmarkedUntraced, collectFetchedIds,
  collectFetchedKeys, checkRetractions, DEFAULT_MIN_GROUNDED_RATIO, resolveConfiguredGroundedFloor, meetsGroundedFloor
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

    // T1-6: a floor of 0, a negative one or one above 1 cannot be meant; each is treated as absent.
    for (const bad of [0, -1, 1.5, Number.NaN]) {
      it(`a gate floor of ${bad} resolves to the strict 0.75`, () => {
        const read = fakeReader({
          m1: JSON.stringify({ fetched_citation_ids: ["12345678", "22222222", "33333333"] }),
          o1: "Per PMID: 12345678 and PMID: 22222222, but also PMID: 99999999."
        });
        const r = verifyReportCitations({
          subtaskResults: [{ metadata_path: "m1", output_path: "o1" }], minGroundedRatio: bad, readFile: read
        });
        assert.equal(r.min_grounded_ratio, 0.75);
        assert.equal(r.verdict, "UNVERIFIED", "2 of 3 grounded is below 0.75");
      });
    }

    // T1-6: PASS is decided on integers. 752 of 1003 is 0.74975, which displays as 0.75.
    it("752 grounded of 1003 cited is UNVERIFIED although its ratio displays as 0.75", () => {
      const ids = Array.from({ length: 1003 }, (_, i) => String(10000001 + i));
      const read = fakeReader({
        m1: JSON.stringify({ fetched_citation_ids: ids.slice(0, 752) }),
        o1: ids.map((id) => `PMID: ${id}`).join("; ")
      });
      const r = verifyReportCitations({ subtaskResults: [{ metadata_path: "m1", output_path: "o1" }], readFile: read });
      assert.equal(r.cited, 1003);
      assert.equal(r.grounded, 752);
      assert.equal(r.grounded_ratio, 0.75, "the rounded ratio is kept for display");
      assert.equal(r.pass, false);
      assert.equal(r.verdict, "UNVERIFIED");
    });

    it("meetsGroundedFloor compares exactly at the boundary", () => {
      assert.equal(meetsGroundedFloor(750, 1000, 0.75), true);
      assert.equal(meetsGroundedFloor(749, 1000, 0.75), false);
      assert.equal(meetsGroundedFloor(3, 4, 0.75), true);
      assert.equal(meetsGroundedFloor(752, 1003, 0.75), false);
      assert.equal(meetsGroundedFloor(0, 0, 0.75), false, "nothing cited never meets a floor");
    });
  });

  // T1-6: configuration can tighten the floor, never loosen or switch it off.
  describe("resolveConfiguredGroundedFloor (T1-6)", () => {
    for (const bad of [undefined, null, "", false, 0, 0.5, 0.7499, -1, 1.5, "0.9", Number.NaN, Infinity]) {
      it(`rejects ${typeof bad === "string" ? JSON.stringify(bad) : String(bad)} and falls back to 0.75`, () => {
        const f = resolveConfiguredGroundedFloor(bad);
        assert.equal(f.value, 0.75);
        assert.equal(f.accepted, false);
        assert.ok("rejected" in f, "the rejected value is reported for the warning");
      });
    }
    for (const good of [0.75, 0.9, 1]) {
      it(`accepts ${good}`, () => {
        assert.deepEqual(resolveConfiguredGroundedFloor(good), { value: good, accepted: true });
      });
    }
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

  // T1-3: [UNVERIFIED] at every mention, anchored to the extractor's spans, after a whole link.
  describe("[UNVERIFIED] at every mention (T1-3)", () => {
    const marks = (s) => s.split("[UNVERIFIED]").length - 1;
    const body = (s) => s.split("\n\n## ⚠️ Citation Verification")[0];

    it("an untraced id cited twice in one section gets two marks", () => {
      const out = annotateUngrounded("First PMID: 12345678. Later, again (PMID: 12345678).", [{ type: "PMID", id: "12345678" }]);
      assert.equal(marks(body(out)), 2);
      assert.equal(body(out), "First PMID: 12345678 [UNVERIFIED]. Later, again (PMID: 12345678 [UNVERIFIED]).");
    });

    it("an untraced PMID is marked, never the same digits inside an earlier CID", () => {
      const out = annotateUngrounded("Compound CID 112345678 binds; see PMID: 12345678.", [{ type: "PMID", id: "12345678" }]);
      assert.equal(body(out), "Compound CID 112345678 binds; see PMID: 12345678 [UNVERIFIED].");
    });

    it("an untraced 'PMID: 5' leaves 'Phase 5' untouched", () => {
      const out = annotateUngrounded("In Phase 5 trials (PMID: 5) the effect held.", [{ type: "PMID", id: "5" }]);
      assert.equal(body(out), "In Phase 5 trials (PMID: 5 [UNVERIFIED]) the effect held.");
    });

    it("an upper-case EUROSTAT id is marked although its id is stored lower-cased", () => {
      const out = annotateUngrounded("Prices per EUROSTAT: NRG_PC_205.", [{ type: "EUROSTAT", id: "nrg_pc_205" }]);
      assert.equal(body(out), "Prices per EUROSTAT: NRG_PC_205 [UNVERIFIED].");
    });

    it("a doi.org markdown link and a wiki-link each get exactly one mark, after the link", () => {
      const doi = { type: "DOI", id: "10.3389/fonc.2024.1422160" };
      const md = annotateUngrounded("Pooled (see [Luo 2024](https://doi.org/10.3389/fonc.2024.1422160)).", [doi]);
      assert.equal(body(md), "Pooled (see [Luo 2024](https://doi.org/10.3389/fonc.2024.1422160) [UNVERIFIED]).");
      const wiki = annotateUngrounded("Cohort (doi: [[DOI-10.3389_fonc.2024.1422160|doi: 10.3389/fonc.2024.1422160]]).", [doi]);
      assert.equal(body(wiki), "Cohort (doi: [[DOI-10.3389_fonc.2024.1422160|doi: 10.3389/fonc.2024.1422160]] [UNVERIFIED]).");
    });

    it("a Lancet DOI with balanced parens inside a markdown link is marked after the whole link", () => {
      const out = annotateUngrounded("See [Wakefield](https://doi.org/10.1016/S0140-6736(97)11096-0).",
        [{ type: "DOI", id: "10.1016/S0140-6736(97)11096-0" }]);
      assert.equal(body(out), "See [Wakefield](https://doi.org/10.1016/S0140-6736(97)11096-0) [UNVERIFIED].");
    });

    it("annotating twice is a no-op", () => {
      const list = [{ type: "PMID", id: "12345678" }, { type: "DOI", id: "10.1234/abc.567" }];
      const once = annotateUngrounded("PMID: 12345678 and [x](https://doi.org/10.1234/abc.567); PMIDs: 12345678, 23456789.", list);
      assert.equal(annotateUngrounded(once, list), once);
      assert.equal(countUnmarkedUntraced(once, new Set(["PMID:12345678", "DOI:10.1234/ABC.567"])), 0);
    });

    it("a mention already carrying an attribution mark gets the [UNVERIFIED] mark too, once", () => {
      const text = "Smith et al. (PMID: 12345678 [ATTRIBUTION MISMATCH: registry lists Jones, 2019]).";
      const out = annotateUngrounded(text, [{ type: "PMID", id: "12345678" }]);
      assert.equal(body(out), "Smith et al. (PMID: 12345678 [UNVERIFIED] [ATTRIBUTION MISMATCH: registry lists Jones, 2019]).");
      assert.equal(annotateUngrounded(out, [{ type: "PMID", id: "12345678" }]), out);
    });

    it("the sealed offer-7e373eb2de36a7a2e73e7c1c excerpt: 2 of 4 mentions were marked; now 4 of 4, none inside a wiki-link", () => {
      const sealed = fs.readFileSync(path.join(__dirname, "..", "fixtures", "unverified-marks-excerpt.md"), "utf8");
      const doi = "10.3389/fonc.2024.1422160";
      assert.equal(marks(sealed), 2, "the old annotator marked 2 of the DOI's 4 in-text mentions");
      assert.ok(sealed.includes("1422160 [UNVERIFIED]]]"), "one old mark sat inside the wiki-link's brackets");
      // Undo the old marks to get the sections as the model wrote them, then annotate them again.
      const written = sealed.split(" [UNVERIFIED]").join("");
      const out = annotateUngrounded(written, [{ type: "DOI", id: doi }]);
      assert.equal(marks(out), 4, "every in-text mention is marked; the appended list is not");
      assert.ok(!out.includes("[UNVERIFIED]]]"), "no mark inside a wiki-link");
      assert.equal((out.match(/1422160\]\] \[UNVERIFIED\]/g) || []).length, 2, "both wiki-link mentions are marked after the link");
      assert.match(out, /- DOI: 10\.3389\/fonc\.2024\.1422160\n/, "the appended list keeps its unmarked entry");
      assert.equal(countUnmarkedUntraced(out, new Set([`DOI:${doi.toUpperCase()}`])), 0);
    });

    it("a section whose marks cannot be written is returned in `failed` (no longer swallowed)", () => {
      const files = { o1: "See PMID: 12345678.", o2: "See PMID: 23456789." };
      const r = annotateSubtaskOutputs([{ task_id: "t1", output_path: "o1" }, { task_id: "t2", output_path: "o2" }], ["23456789"], {
        readFile: (p) => files[p],
        writeFile: (p) => { if (p === "o1") throw new Error("EACCES"); }
      });
      assert.deepEqual(r.failed, ["t1"]);
      assert.equal(r.annotated, 0);
    });

    it("a write that silently loses the marks is caught by the re-read", () => {
      const files = { o1: "See PMID: 12345678." };
      const r = annotateSubtaskOutputs([{ task_id: "t1", output_path: "o1" }], [], {
        readFile: (p) => files[p],
        writeFile: () => { /* claims success, writes nothing */ }
      });
      assert.deepEqual(r.failed, ["t1"]);
    });
  });

  // T1-4: forms the extractor never read before now reach the gate and the retraction screen.
  describe("every written form reaches the gate (T1-4)", () => {
    it("a paper cited only as a PubMed URL and never retrieved is now ungrounded (it used to be invisible)", () => {
      const read = fakeReader({
        m1: JSON.stringify({ fetched_citation_ids: ["NCT01111111"] }),
        o1: "Trial NCT01111111 showed benefit (https://pubmed.ncbi.nlm.nih.gov/23456789/)."
      });
      const r = verifyReportCitations({ subtaskResults: [{ metadata_path: "m1", output_path: "o1" }], minGroundedRatio: 0.5, readFile: read });
      assert.equal(r.cited, 2);
      assert.equal(r.ungrounded, 1);
      assert.deepEqual(r.ungrounded_list, [{ type: "PMID", id: "23456789" }]);
    });

    it("checkRetractions hands a bare DOI to the Crossref screen, once per DOI whatever its case", async () => {
      const seen = [];
      const checkDois = async (batch) => { seen.push(...batch); return batch.map((doi) => ({ doi, checked: true, retracted: false })); };
      const r = await checkRetractions("Primary source 10.1056/NEJMoa1911303; also https://doi.org/10.1056/nejmoa1911303.", checkDois);
      assert.deepEqual(seen, ["10.1056/NEJMoa1911303"]);
      assert.equal(r.dois_cited, 1);
      assert.equal(r.checked, true);
    });
  });

  // T1-5: a cited id is grounded only by a retrieved record of the same identifier type.
  describe("grounding by type as well as number (T1-5)", () => {
    const typed = JSON.stringify({ fetched_citation_ids: ["2244"], fetched_citation_keys: ["PUBCHEM CID:2244"] });
    const untyped = JSON.stringify({ fetched_citation_ids: ["2244"] });
    const run = (meta, text) => verifyReportCitations({
      subtaskResults: [{ metadata_path: "m1", output_path: "o1" }], readFile: fakeReader({ m1: meta, o1: text })
    });

    it("a retrieved PubChem CID 2244 does not ground a written 'PMID: 2244'", () => {
      const r = run(typed, "Aspirin's effect is reported in PMID: 2244.");
      assert.equal(r.grounding_match, "type_and_id");
      assert.equal(r.grounded, 0);
      assert.deepEqual(r.ungrounded_list, [{ type: "PMID", id: "2244" }]);
      assert.equal(r.verdict, "UNVERIFIED");
    });

    it("the same evidence record without keys (an older run) falls back to id-only and says so", () => {
      const r = run(untyped, "Aspirin's effect is reported in PMID: 2244.");
      assert.equal(r.grounding_match, "id_only");
      assert.equal(r.grounded, 1);
      assert.equal(r.verdict, "PASS");
    });

    it("'CID: 2244' is grounded by the retrieved PubChem CID 2244", () => {
      const r = run(typed, "Aspirin is CID: 2244.");
      assert.equal(r.grounding_match, "type_and_id");
      assert.equal(r.grounded, 1);
      assert.equal(r.verdict, "PASS");
    });

    it("one untyped sidecar puts the whole report on id-only matching (never two rules in one report)", () => {
      const read = fakeReader({
        m1: typed, o1: "Aspirin is CID: 2244.",
        m2: JSON.stringify({ fetched_citation_ids: ["12345678"] }), o2: "See PMID: 12345678."
      });
      const subtaskResults = [{ metadata_path: "m1", output_path: "o1" }, { metadata_path: "m2", output_path: "o2" }];
      assert.equal(collectFetchedKeys(subtaskResults, read), null);
      assert.equal(verifyReportCitations({ subtaskResults, readFile: read }).grounding_match, "id_only");
    });

    it("collectFetchedKeys unions and upper-cases the keys; an unreadable sidecar contributes nothing", () => {
      const read = fakeReader({
        a: JSON.stringify({ fetched_citation_ids: ["2244"], fetched_citation_keys: ["PubChem CID:2244"] }),
        b: JSON.stringify({ fetched_citation_ids: ["nct01776424"], fetched_citation_keys: ["nct:nct01776424", "PUBCHEM CID:2244"] })
      });
      const keys = collectFetchedKeys([{ metadata_path: "a" }, { metadata_path: "b" }, { metadata_path: "missing" }], read);
      assert.deepEqual(keys.slice().sort(), ["NCT:NCT01776424", "PUBCHEM CID:2244"]);
    });

    it("the in-place annotation judges a section by the same typed rule the gate counted with", () => {
      const files = { o1: "Aspirin is CID: 2244; see also PMID: 2244." };
      const io = { readFile: (p) => files[p], writeFile: (p, t) => { files[p] = t; } };
      annotateSubtaskOutputs([{ output_path: "o1" }], ["2244"], { fetchedKeys: ["PUBCHEM CID:2244"], ...io });
      assert.match(files.o1, /- PMID: 2244\n/, "the untraced PMID is listed");
      assert.doesNotMatch(files.o1, /- PubChem CID: 2244/, "the grounded CID is not");
      const untyped = { o1: "Aspirin is CID: 2244; see also PMID: 2244." };
      annotateSubtaskOutputs([{ output_path: "o1" }], ["2244"], { readFile: (p) => untyped[p], writeFile: (p, t) => { untyped[p] = t; } });
      assert.equal(untyped.o1, "Aspirin is CID: 2244; see also PMID: 2244.", "id-only: nothing is untraced");
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
