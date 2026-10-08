"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { extractCitations, deduplicateCitations, countByType, crossCheckCitations, roleLabel } = require("../../openclaw-bridge/core/citation-extractor.js");

describe("citation-extractor", () => {
  describe("extractCitations", () => {
    it("extracts PMID citations", () => {
      const citations = extractCitations("See PMID: 12345678 and PMID:23456789 for details.");
      const pmids = citations.filter(c => c.type === "PMID");
      assert.equal(pmids.length, 2);
      assert.equal(pmids[0].id, "12345678");
      assert.equal(pmids[1].id, "23456789");
    });

    it("extracts a legitimate SHORT (sub-6-digit) historical PMID (e.g. PMID 1, a real 1975 paper)", () => {
      const pmids = extractCitations("An early method: PMID: 1. See also PMID: 54321.")
        .filter(c => c.type === "PMID").map(c => c.id);
      assert.deepEqual(pmids, ["1", "54321"], "short PMIDs were invisible under the old \\d{6,9} bound");
    });

    it("extracts a future 9- and 10-digit PMID (upper bound raised past the 8-digit present)", () => {
      const pmids = extractCitations("PMID: 123456789 and PMID: 1234567890")
        .filter(c => c.type === "PMID").map(c => c.id);
      assert.deepEqual(pmids, ["123456789", "1234567890"]);
    });

    it("DROPS an 11+ digit run rather than truncating it to a wrong 10-digit id", () => {
      // The old \d{6,9} captured a 9-digit PREFIX of a longer run — a different, possibly-real PMID.
      // The `(?!\d)` lookahead refuses any prefix of a longer digit run, so an over-long id is
      // dropped (honest) rather than mis-captured (dangerous).
      const pmids = extractCitations("PMID: 12345678901234").filter(c => c.type === "PMID").map(c => c.id);
      assert.deepEqual(pmids, [], "no truncated id leaks through");
    });

    it("stops a PMID at the first non-digit and keeps a following citation intact", () => {
      const pmids = extractCitations("PMID: 12345678v2, then PMID: 87654321.")
        .filter(c => c.type === "PMID").map(c => c.id);
      assert.deepEqual(pmids, ["12345678", "87654321"]);
    });

    it("extracts NCT identifiers", () => {
      const citations = extractCitations("Trial NCT00012345 is relevant.");
      assert.equal(citations.length, 1);
      assert.equal(citations[0].type, "NCT");
      assert.equal(citations[0].id, "NCT00012345");
    });

    it("extracts PubChem CID", () => {
      const citations = extractCitations("PubChem CID: 2244 is aspirin.");
      const cids = citations.filter(c => c.type === "PubChem CID");
      assert.equal(cids.length, 1);
      assert.equal(cids[0].id, "2244");
    });

    it("extracts ChEMBL, DrugBank, UniProt, and DOI", () => {
      const text = "CHEMBL25, DB00945, UniProt: P12345, doi: 10.1038/nature12373";
      const citations = extractCitations(text);
      const types = citations.map(c => c.type);
      assert.ok(types.includes("ChEMBL"));
      assert.ok(types.includes("DrugBank"));
      assert.ok(types.includes("UniProt"));
      assert.ok(types.includes("DOI"));
    });

    it("extracts real UniProt accessions in the forms reports use (6- and 10-character, UniProtKB: prefix, any-case label)", () => {
      const ids = (text) => extractCitations(text).filter(c => c.type === "UniProt").map(c => c.id);
      assert.deepEqual(ids("UniProt: P00533"), ["P00533"]);
      assert.deepEqual(ids("UniProt P00533"), ["P00533"]);
      assert.deepEqual(ids("uniprot Q9Y6K9"), ["Q9Y6K9"]);
      assert.deepEqual(ids("UniProt:A0A024R161"), ["A0A024R161"], "10-character accession");
      assert.deepEqual(ids("UniProtKB:O15111"), ["O15111"]);
      assert.deepEqual(ids("EGFR (UniProt P00533) and KRAS (UniProt P01116)."), ["P00533", "P01116"]);
    });

    it("does NOT read the words after the label as UniProt ids (2026-10-08: 'accessions' and 'citation' BLOCKED the first real run)", () => {
      // Verbatim shape from workflow-12c3ef8ba2021cf5d6a81516's report: the sanctioned honest-negative wording.
      // The old `UniProt[:\s]*([A-Z0-9]{6,10})` + `i` captured any 6-10 letter word, UniProt answered 400, the
      // re-resolver stamped it UNRESOLVED and the report was BLOCKED though nothing was fabricated.
      const honest = "Open Targets ENSG/UniProt accessions for EGFR, KRAS: [no verifiable ENSG/UniProt citation found in live data].";
      assert.deepEqual(extractCitations(honest), [], "an honest-negative sentence carries no identifiers at all");
      for (const text of ["- UniProt: accessions", "UniProt database entries are listed", "UniProt protein sequences",
        "UniProt reviewed", "OpenTargets/UniProt validation", "UniProt ENSG00000146648"]) {
        assert.deepEqual(extractCitations(text).filter(c => c.type === "UniProt"), [], `no UniProt id from: ${text}`);
      }
    });

    it("keeps UniProt matching on a token boundary: a prefix, a fragment or a lowercase accession is dropped, never mis-captured", () => {
      const ids = (text) => extractCitations(text).filter(c => c.type === "UniProt").map(c => c.id);
      assert.deepEqual(ids("UniProt: P00533X7"), [], "P00533 is only a prefix of P00533X7");
      assert.deepEqual(ids("UniProt: A0A024R1"), [], "an 8-character fragment is not an accession");
      assert.deepEqual(ids("UniProt: p00533"), [], "an accession is uppercase");
    });

    it("an honest-negative sentence cannot lower the grounded ratio (no phantom UniProt ids reach crossCheckCitations)", () => {
      const r = crossCheckCitations(
        "Evidence: PMID: 12345678. Open Targets ENSG/UniProt accessions: [no verifiable ENSG/UniProt citation found in live data].",
        ["12345678"]
      );
      assert.equal(r.total, 1, "only the real PMID counts as a citation");
      assert.equal(r.unverified_count, 0);
      assert.equal(r.verified_ratio, 1);
    });

    it("stops DOIs at trailing markdown/punctuation (no ]] or ; captured) and dupes collapse", () => {
      const text = "See doi: 10.3389/fphar.2026.1787936]] and doi: 10.54097/5hr7dp28]]; plus [[doi: 10.54097/5hr7dp28]] again and doi: 10.1016/j.ajpc.2023.100579]].";
      const dois = extractCitations(text).filter((c) => c.type === "DOI").map((c) => c.id);
      assert.ok(dois.includes("10.3389/fphar.2026.1787936"), "no trailing ]]");
      assert.ok(dois.includes("10.54097/5hr7dp28"), "no trailing ];");
      assert.ok(dois.includes("10.1016/j.ajpc.2023.100579"));
      const dedup = deduplicateCitations(extractCitations(text)).filter((c) => c.type === "DOI").map((c) => c.id);
      assert.equal(dedup.filter((d) => d === "10.54097/5hr7dp28").length, 1, "the two 5hr7dp28 mentions collapse to one clean id");
    });

    it("still extracts a clean DOI fully (internal dots/slashes preserved)", () => {
      const dois = extractCitations("doi: 10.1038/nature12373 and https://doi.org/10.1016/j.cell.2020.05.001").filter((c) => c.type === "DOI").map((c) => c.id);
      assert.ok(dois.includes("10.1038/nature12373"));
      assert.ok(dois.includes("10.1016/j.cell.2020.05.001"));
    });

    it("strips a trailing sentence period from a DOI while keeping internal dots", () => {
      const dois = extractCitations("Per doi: 10.1038/nature12373. And see doi: 10.1016/j.cell.2020.05.001.").filter((c) => c.type === "DOI").map((c) => c.id);
      assert.ok(dois.includes("10.1038/nature12373"), "trailing period stripped");
      assert.ok(dois.includes("10.1016/j.cell.2020.05.001"), "internal dots kept, trailing period stripped");
      assert.ok(!dois.some((d) => d.endsWith(".")), "no extracted DOI ends in a period");
    });

    it("strips markdown emphasis that closes a bold/italic span wrapping a parenthesized DOI (2026-09-22 smoke-run block)", () => {
      // Verbatim shape from workflow-68b21a99's report: the whole citation was bolded, so the
      // capture ended in ")**" and the re-resolver sent a literal ")**" to doi.org (404 → BLOCK).
      const text =
        "rest on the founding **Lynch et al., 2004 (doi: 10.1056/nejmoa040938)** finding; " +
        "see also *doi: 10.1038/nature12373* and ~~doi: 10.1016/j.cell.2020.05.001~~ and the plain doi: 10.1056/nejmoa040938 mention.";
      const dois = extractCitations(text).filter((c) => c.type === "DOI").map((c) => c.id);
      assert.ok(dois.includes("10.1056/nejmoa040938"), "bold-wrapped parenthesized DOI comes out clean");
      assert.ok(dois.includes("10.1038/nature12373"), "italic-wrapped DOI comes out clean");
      assert.ok(dois.includes("10.1016/j.cell.2020.05.001"), "strikethrough-wrapped DOI comes out clean");
      assert.ok(!dois.some((d) => /[*~)]$/.test(d)), "no extracted DOI ends in an emphasis marker or a stray paren");
      const dedup = deduplicateCitations(extractCitations(text)).filter((c) => c.id === "10.1056/nejmoa040938");
      assert.equal(dedup.length, 1, "the bolded and the plain mention collapse to ONE id, so the manifest never carries a dirty twin");
    });

    it("captures Elsevier/Lancet DOIs with BALANCED internal parens (not truncated at the first ')')", () => {
      const dois = extractCitations(
        "Wakefield doi: 10.1016/S0140-6736(97)11096-0 and Surgisphere https://doi.org/10.1016/S0140-6736(20)31180-6"
      ).filter((c) => c.type === "DOI").map((c) => c.id);
      assert.ok(dois.includes("10.1016/S0140-6736(97)11096-0"), "parenthesized DOI kept whole");
      assert.ok(dois.includes("10.1016/S0140-6736(20)31180-6"));
      assert.ok(!dois.some((d) => d === "10.1016/S0140-6736(97"), "not truncated at the paren");
    });

    it("trims an UNBALANCED trailing ')' from prose wrapping but keeps a balanced one", () => {
      const wrapped = extractCitations("(see doi: 10.1234/foo).").filter((c) => c.type === "DOI").map((c) => c.id);
      assert.deepEqual(wrapped, ["10.1234/foo"], "wrapping paren + period both trimmed");
      const parenDoi = extractCitations("(doi: 10.1016/S0140-6736(97)11096-0)").filter((c) => c.type === "DOI").map((c) => c.id);
      assert.deepEqual(parenDoi, ["10.1016/S0140-6736(97)11096-0"], "balanced internal parens survive, wrapper trimmed");
    });

    it("returns empty array for text with no citations", () => {
      assert.deepEqual(extractCitations("No citations here."), []);
    });
  });

  describe("deduplicateCitations", () => {
    it("removes duplicate citations by type:id", () => {
      const input = [
        { type: "PMID", id: "12345678" },
        { type: "PMID", id: "12345678" },
        { type: "NCT", id: "NCT00012345" }
      ];
      const result = deduplicateCitations(input);
      assert.equal(result.length, 2);
    });
  });

  describe("countByType", () => {
    it("counts citations by type", () => {
      const input = [
        { type: "PMID", id: "1" },
        { type: "PMID", id: "2" },
        { type: "NCT", id: "3" }
      ];
      const result = countByType(input);
      assert.equal(result.PMID, 2);
      assert.equal(result.NCT, 1);
    });
  });

  describe("roleLabel", () => {
    it("labels literature review roles", () => {
      assert.equal(roleLabel("literature_reviewer"), "Literature Review");
      assert.equal(roleLabel("scout_agent"), "Literature Review");
    });

    it("labels analysis roles", () => {
      assert.equal(roleLabel("safety_signal_detector"), "Deep Analysis");
      assert.equal(roleLabel("molecular_profiler"), "Deep Analysis");
    });

    it("labels synthesis roles", () => {
      assert.equal(roleLabel("report_generator"), "Integrated Synthesis");
      assert.equal(roleLabel("quality_auditor"), "Integrated Synthesis");
    });

    it("defaults to Research Output for unknown roles", () => {
      assert.equal(roleLabel("unknown_agent"), "Research Output");
      assert.equal(roleLabel(""), "Research Output");
    });
  });

  describe("crossCheckCitations", () => {
    it("splits report citations into verified (in fetched set) vs unverified (model-introduced)", () => {
      const report = "Evidence from PMID: 12345678 and trial NCT00012345; also see PMID: 99999999.";
      const result = crossCheckCitations(report, ["12345678", "NCT00012345"]);
      assert.equal(result.total, 3);
      assert.equal(result.verified_count, 2);
      assert.equal(result.unverified_count, 1);
      assert.equal(result.verified_ratio, 0.667);
      assert.equal(result.unverified[0].id, "99999999");
    });

    it("ratio 0 and empty unverified when the report has no citations", () => {
      const r = crossCheckCitations("No citations here.", ["12345678"]);
      assert.equal(r.total, 0);
      assert.equal(r.verified_ratio, 0);
      assert.deepEqual(r.unverified, []);
    });
  });
});
