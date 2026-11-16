"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  verifyReportCitations, annotateUngrounded, annotateSubtaskOutputs, countUnmarkedUntraced, collectFetchedIds,
  collectFetchedKeys, checkRetractions, DEFAULT_MIN_GROUNDED_RATIO, resolveConfiguredGroundedFloor, meetsGroundedFloor
} = require("../../openclaw-bridge/core/citation-gate.js");
const { crossCheckCitations } = require("../../openclaw-bridge/core/citation-extractor.js");

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

    // T1-1 (critic #3): a section the gate cannot read is a failure, never an empty section.
    it("verdict SECTION_UNREADABLE (non-shippable) when a section cannot be read", () => {
      const read = fakeReader({
        m1: JSON.stringify({ fetched_citation_ids: ["12345678"] }),
        o1: "Per PMID: 12345678.",
        m2: JSON.stringify({ fetched_citation_ids: [] })
        // o2 is missing: unreadable
      });
      const r = verifyReportCitations({
        subtaskResults: [{ task_id: "t1", metadata_path: "m1", output_path: "o1" }, { task_id: "t2", metadata_path: "m2", output_path: "o2" }],
        minGroundedRatio: 0.5, readFile: read
      });
      assert.equal(r.pass, false);
      assert.equal(r.verdict, "SECTION_UNREADABLE");
      assert.deepEqual(r.unreadable_sections, ["t2"]);
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

    // T2-17 (2026-11-16): the newly read spellings are counted and marked like any other mention.
    it("T2-17: an untraced PMID behind a bold label, and the last item of an 'and' list, are marked", () => {
      const out = annotateUngrounded(
        "**PMID:** 99999999 opened; later (PMIDs: 12345678, 23456789 and 99999998).",
        [{ type: "PMID", id: "99999999" }, { type: "PMID", id: "99999998" }]
      );
      assert.equal(body(out), "**PMID:** 99999999 [UNVERIFIED] opened; later (PMIDs: 12345678, 23456789 and 99999998 [UNVERIFIED]).");
    });

    it("T2-17: a DOI in a publisher URL is counted once, as the real DOI, and marked after the whole URL", () => {
      const text = "Full text: https://www.frontiersin.org/articles/10.3389/fphar.2021.123456/full.";
      const x = crossCheckCitations(text, []);
      assert.deepEqual(x.unverified, [{ type: "DOI", id: "10.3389/fphar.2021.123456" }]);
      assert.equal(body(annotateUngrounded(text, x.unverified)), "Full text: https://www.frontiersin.org/articles/10.3389/fphar.2021.123456/full [UNVERIFIED].");
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

    // T2-20 (2026-11-16), review marks:3: the review's seven constructs. In each the mark goes after the
    // construct (which is left exactly as written, so it still renders), a second pass changes
    // nothing, and the old placement INSIDE the construct no longer passes the fail-closed re-read.
    describe("T2-20: a mark never lands inside a construct", () => {
      const DOI = { type: "DOI", id: "10.1234/abc" };
      const DOI_KEY = new Set(["DOI:10.1234/ABC"]);
      const cases = [
        ["a link whose text is a bracketed number",
          "See [[1]](https://doi.org/10.1234/abc).",
          "See [[1]](https://doi.org/10.1234/abc) [UNVERIFIED].",
          "See [[1]](https://doi.org/10.1234/abc [UNVERIFIED])."],
        ["a link whose text holds a bracket",
          "See [Smith [2019]](https://doi.org/10.1234/abc).",
          "See [Smith [2019]](https://doi.org/10.1234/abc) [UNVERIFIED].",
          "See [Smith [2019]](https://doi.org/10.1234/abc [UNVERIFIED])."],
        ["an angle-bracket autolink",
          "See <https://doi.org/10.1234/abc>.",
          "See <https://doi.org/10.1234/abc> [UNVERIFIED].",
          "See <https://doi.org/10.1234/abc [UNVERIFIED]>."],
        ["an HTML attribute",
          'See <a href="https://doi.org/10.1234/abc">Smith</a>.',
          'See <a href="https://doi.org/10.1234/abc">Smith</a> [UNVERIFIED].',
          'See <a href="https://doi.org/10.1234/abc [UNVERIFIED]">Smith</a>.'],
        ["a link title holding a parenthesis",
          'See [Smith](https://doi.org/10.1234/abc "Smith :)").',
          'See [Smith](https://doi.org/10.1234/abc "Smith :)") [UNVERIFIED].',
          'See [Smith](https://doi.org/10.1234/abc "Smith :) [UNVERIFIED]").'],
        ["a scheme-less URL with a query",
          "See www.doi.org/10.1234/abc?utm_source=x today.",
          "See www.doi.org/10.1234/abc?utm_source=x [UNVERIFIED] today.",
          "See www.doi.org/10.1234/abc [UNVERIFIED]?utm_source=x today."]
      ];
      for (const [name, written, expected, inside] of cases) {
        it(`${name}: marked after it, once, and a mark inside it is refused`, () => {
          const out = annotateUngrounded(written, [DOI]);
          assert.equal(body(out), expected);
          assert.equal(annotateUngrounded(out, [DOI]), out, "a second pass changes nothing");
          assert.equal(countUnmarkedUntraced(out, DOI_KEY), 0);
          assert.equal(countUnmarkedUntraced(inside, DOI_KEY), 1, "the old placement fails the re-read");
        });
      }

      it("a scheme-less PubMed URL keeps its trailing slash", () => {
        const pmid = { type: "PMID", id: "12345678" };
        const key = new Set(["PMID:12345678"]);
        const out = annotateUngrounded("Record: pubmed.ncbi.nlm.nih.gov/12345678/ (abstract).", [pmid]);
        assert.equal(body(out), "Record: pubmed.ncbi.nlm.nih.gov/12345678/ [UNVERIFIED] (abstract).");
        assert.equal(annotateUngrounded(out, [pmid]), out);
        assert.equal(countUnmarkedUntraced("Record: pubmed.ncbi.nlm.nih.gov/12345678 [UNVERIFIED]/ (abstract).", key), 1);
      });

      it("a reference definition stays valid: each use of its label is marked instead", () => {
        const written = "As shown before [1], and by [Smith et al.][1] and [1][].\n\n[1]: https://doi.org/10.1234/abc";
        const out = annotateUngrounded(written, [DOI]);
        assert.equal(body(out), "As shown before [1] [UNVERIFIED], and by [Smith et al.][1] [UNVERIFIED] and [1][] [UNVERIFIED].\n\n[1]: https://doi.org/10.1234/abc");
        assert.equal(annotateUngrounded(out, [DOI]), out, "a second pass changes nothing");
        assert.equal(countUnmarkedUntraced(out, DOI_KEY), 0);
        // The old placement ended the definition and left every use unmarked.
        assert.equal(countUnmarkedUntraced(`${written} [UNVERIFIED]`, DOI_KEY), 1);
      });

      it("a definition no text uses is marked where it ends; other labels and inline links are not uses", () => {
        const out = annotateUngrounded("Unrelated [2] and [9](https://example.org/x).\n\n[9]: https://doi.org/10.1234/abc", [DOI]);
        assert.equal(body(out), "Unrelated [2] and [9](https://example.org/x).\n\n[9]: https://doi.org/10.1234/abc [UNVERIFIED]");
        assert.equal(annotateUngrounded(out, [DOI]), out);
        assert.equal(countUnmarkedUntraced(out, DOI_KEY), 0);
      });
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

  // Tier 1 review F1 (2026-11-14): a synthesizer or report_generator section is saved AFTER the vault
  // enricher links its first labelled PMID ("PMID: [[PMID-a|PMID: a]], b"). Every later list item must
  // still reach the gate, the retraction screen and the marks. These tests run the real enricher.
  describe("an enriched PMID list reaches the gate, the screen and the marks (review F1)", () => {
    const { enrichWithWikiLinks } = require("../../openclaw-bridge/core/wiki-link-enricher.js");
    const written = "Two randomized trials (PMID: 31111111, 32222222) reported a survival benefit.";
    const enriched = enrichWithWikiLinks(written).markdown;

    it("the gate counts both PMIDs, so an untraced later item fails a report it used to pass", () => {
      const read = fakeReader({ m1: JSON.stringify({ fetched_citation_ids: ["31111111"] }), o1: enriched });
      const r = verifyReportCitations({ subtaskResults: [{ metadata_path: "m1", output_path: "o1" }], minGroundedRatio: 0.75, readFile: read });
      assert.equal(r.cited, 2);
      assert.equal(r.grounded, 1);
      assert.deepEqual(r.ungrounded_list, [{ type: "PMID", id: "32222222" }]);
      assert.equal(r.verdict, "UNVERIFIED");
    });

    it("the retraction screen is handed both PMIDs and blocks on the later one", async () => {
      const seen = [];
      const checkPmids = async (pmids) => {
        seen.push(...pmids);
        return pmids.map((pmid) => ({ pmid, retracted: pmid === "32222222", is_notice: false, checked: true }));
      };
      const out = await checkRetractions(enriched, null, checkPmids);
      assert.deepEqual(seen, ["31111111", "32222222"]);
      assert.deepEqual(out.retracted_pmids, ["32222222"]);
    });

    it("the untraced later item is marked in place, and the section passes the fail-closed re-read", () => {
      const files = { o1: enriched };
      const r = annotateSubtaskOutputs([{ task_id: "synth", output_path: "o1" }], ["31111111"], {
        readFile: (p) => files[p],
        writeFile: (p, text) => { files[p] = text; }
      });
      assert.deepEqual(r.failed, []);
      assert.match(files.o1, /PMID: \[\[PMID-31111111\|PMID: 31111111\]\], 32222222 \[UNVERIFIED\]\) reported/);
      assert.equal(annotateUngrounded(files.o1, [{ type: "PMID", id: "32222222" }]), files.o1, "a second pass changes nothing");
    });
  });

  // Tier 1 review (2026-11-14): only the engine's own appended block is exempt from marks.
  describe("a verification block the model wrote is not the engine's (review)", () => {
    const modelBlock = "Findings (PMID: 12345678).\n\n## ⚠️ Citation Verification\n\nAll sources were checked.\n\n- PMID: 23456789\n";

    it("its ids are marked like any mention, and the engine still appends its own list", () => {
      const out = annotateUngrounded(modelBlock, [{ type: "PMID", id: "23456789" }]);
      assert.match(out, /- PMID: 23456789 \[UNVERIFIED\]\n/, "the model's bullet is a mention, so it is marked");
      assert.match(out, /The following cited identifiers were NOT found[^\n]*\n\n- PMID: 23456789\n$/, "the engine's own list is appended");
      assert.equal(countUnmarkedUntraced(out, new Set(["PMID:23456789"])), 0);
      assert.equal(annotateUngrounded(out, [{ type: "PMID", id: "23456789" }]), out, "a second pass changes nothing");
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
