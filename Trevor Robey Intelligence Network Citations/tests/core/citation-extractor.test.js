"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  extractCitations, extractCitationSpans, deduplicateCitations, countByType, crossCheckCitations, roleLabel
} = require("../../openclaw-bridge/core/citation-extractor.js");

const ids = (text, type) => extractCitations(text).filter((c) => !type || c.type === type).map((c) => c.id);
const one = (text) => deduplicateCitations(extractCitations(text));

// T1-4 (2026-11-14): every written form of a PMID, NCT or DOI is read.
describe("citation-extractor — every written form (T1-4)", () => {
  it("PubMed record links yield the PMID (both hosts, with or without www.)", () => {
    assert.deepEqual(one("See https://pubmed.ncbi.nlm.nih.gov/12345678/ for the trial."), [{ type: "PMID", id: "12345678" }]);
    assert.deepEqual(one("Archived at https://www.ncbi.nlm.nih.gov/pubmed/23456789."), [{ type: "PMID", id: "23456789" }]);
    assert.deepEqual(one("ncbi.nlm.nih.gov/pubmed/34567890"), [{ type: "PMID", id: "34567890" }]);
  });

  it("a 'PubMed ID' or 'PubMed:' label yields the PMID; a bare 'PubMed 2019' does not", () => {
    assert.deepEqual(one("PubMed ID: 12345678"), [{ type: "PMID", id: "12345678" }]);
    assert.deepEqual(one("(PubMed ID 12345678)"), [{ type: "PMID", id: "12345678" }]);
    assert.deepEqual(one("PubMed: 12345678"), [{ type: "PMID", id: "12345678" }]);
    assert.deepEqual(ids("We searched PubMed 2019 to 2024.", "PMID"), []);
  });

  it("every item of a PMID or PMIDs list is read", () => {
    assert.deepEqual(ids("PMIDs: 12345678, 23456789", "PMID"), ["12345678", "23456789"]);
    assert.deepEqual(ids("(PMID: 12345678; 23456789; 34567890)", "PMID"), ["12345678", "23456789", "34567890"]);
    assert.deepEqual(ids("PMID 12345678,23456789.", "PMID"), ["12345678", "23456789"]);
  });

  it("a list stops at prose: a percentage, a decimal or a number followed by a word is not a PMID", () => {
    assert.deepEqual(ids("PMID: 12345678, 95% CI 1.2-3.4", "PMID"), ["12345678"]);
    assert.deepEqual(ids("PMID: 12345678, 2.5 mg twice daily", "PMID"), ["12345678"]);
    assert.deepEqual(ids("PMID: 12345678, 10 patients withdrew", "PMID"), ["12345678"]);
  });

  it("a list that already carries the engine's marks is still read in full", () => {
    assert.deepEqual(ids("PMIDs: 12345678 [UNVERIFIED], 23456789", "PMID"), ["12345678", "23456789"]);
    assert.deepEqual(
      ids("PMID: 12345678 [ATTRIBUTION MISMATCH: registry lists Feldman et al., 2022], 23456789", "PMID"),
      ["12345678", "23456789"], "the year inside a mark is never read as a PMID");
  });

  it("a PMID is never 0: the manifest's own 'retracted PMIDs: 0' is not a citation", () => {
    assert.deepEqual(ids("Retraction screen: checked; retracted DOIs: 0; retracted PMIDs: 0.", "PMID"), []);
    assert.deepEqual(ids("PMID: 0", "PMID"), []);
  });

  it("bare cells under a PMID or PMIDs column header are read; any other header yields nothing", () => {
    const table = [
      "| Study | PMID | n |",
      "|---|---|---|",
      "| Smith 2020 | 12345678 | 412 |",
      "| Jones 2021 | 23456789 [UNVERIFIED] | 88 |",
      "| Lee 2022 | — | 120 |"
    ].join("\n");
    assert.deepEqual(ids(table, "PMID"), ["12345678", "23456789"]);
    const plural = "| **PMIDs** |\n|:---:|\n| 34567890; 45678901 |";
    assert.deepEqual(ids(plural, "PMID"), ["34567890", "45678901"]);
    const other = "| Study | Enrolled |\n|---|---|\n| Smith 2020 | 12345678 |\n| Jones 2021 | 412 |";
    assert.deepEqual(ids(other), [], "a numeric column under another header is not a PMID column");
    assert.deepEqual(ids("12345678 patients were screened across 412 sites."), [], "bare numbers in prose are never read");
  });

  it("the references-table fixture (offer-3dec35098e8e47e2d0a72012 report.md:394-407) yields its 10 PMIDs and 10 DOIs", () => {
    const text = fs.readFileSync(path.join(__dirname, "..", "fixtures", "references-table-excerpt.md"), "utf8");
    const got = deduplicateCitations(extractCitations(text)).map((c) => `${c.type}:${c.id}`).sort();
    const want = [
      "PMID:42529322", "PMID:42529345", "PMID:42529281", "PMID:42530663", "PMID:42497392",
      "PMID:42497394", "PMID:42151668", "PMID:42503861", "PMID:42506599", "PMID:42530845",
      "DOI:10.1016/j.jtocrr.2026.101029", "DOI:10.1016/j.jtocrr.2026.101036", "DOI:10.3389/fimmu.2026.1791664",
      "DOI:10.1007/s10585-026-10417-x", "DOI:10.1097/ppo.0000000000000842", "DOI:10.1097/ppo.0000000000000838",
      "DOI:10.1007/s40265-026-02331-z", "DOI:10.1002/ijc.70673", "DOI:10.3390/vaccines14070562",
      "DOI:10.1245/s10434-026-20310-2"
    ].sort();
    assert.deepEqual(got, want);
  });

  it("an NCT number with a space or hyphen is read and normalized; a longer run is dropped, never cut", () => {
    assert.deepEqual(one("trial NCT 01234567 and NCT-02345678"), [{ type: "NCT", id: "NCT01234567" }, { type: "NCT", id: "NCT02345678" }]);
    assert.deepEqual(one("nct03456789"), [{ type: "NCT", id: "NCT03456789" }]);
    assert.deepEqual(ids("NCT012345678"), [], "NCT012345678 is not NCT01234567");
  });

  it("a DOI is read bare, behind doi.org in every spelling, and inside a publisher URL", () => {
    for (const text of [
      "10.1234/abc.567",
      "doi: 10.1234/abc.567",
      "doi10.1234/abc.567",
      "https://doi.org/10.1234/abc.567",
      "http://dx.doi.org/10.1234/abc.567",
      "https://www.doi.org/10.1234/abc.567",
      "doi.org/10.1234/abc.567",
      "https://onlinelibrary.wiley.com/doi/10.1234/abc.567",
      "[Smith 2020](https://doi.org/10.1234/abc.567)"
    ]) {
      assert.deepEqual(one(text), [{ type: "DOI", id: "10.1234/abc.567" }], text);
    }
  });

  it("https://doi.org/, dx.doi.org/ and a bare mention of one DOI de-duplicate to one", () => {
    const text = "https://doi.org/10.1234/xyz, dx.doi.org/10.1234/xyz and 10.1234/xyz";
    assert.equal(extractCitations(text).length, 3, "three mentions");
    assert.deepEqual(one(text), [{ type: "DOI", id: "10.1234/xyz" }]);
  });

  it("DOIs de-duplicate case-insensitively, keeping the first mention as written", () => {
    assert.deepEqual(one("doi: 10.1056/NEJMoa1911303 and 10.1056/nejmoa1911303"), [{ type: "DOI", id: "10.1056/NEJMoa1911303" }]);
  });

  it("a ?query or #fragment is cut from a DOI captured inside a URL", () => {
    assert.deepEqual(one("https://www.publisher.example/doi/10.1234/abc.567?utm_source=x&utm_medium=y"), [{ type: "DOI", id: "10.1234/abc.567" }]);
    assert.deepEqual(one("https://doi.org/10.1234/abc.567#sec-2"), [{ type: "DOI", id: "10.1234/abc.567" }]);
  });

  it("version strings, gene ids, decimals and prose numbers are not identifiers", () => {
    assert.deepEqual(extractCitations("Upgrade to v10.1234/x now"), []);
    assert.deepEqual(extractCitations("ENSG00000157764 (BRAF)"), []);
    assert.deepEqual(extractCitations("Phase 10.5 of the build"), []);
    assert.deepEqual(extractCitations("1.10.1234/x is a path"), []);
    assert.deepEqual(extractCitations("Enrollment reached 12345678 across 30 sites in 2019."), []);
  });

  it("the digits of an NCT id or a DOI suffix never become a PMID", () => {
    assert.deepEqual(ids("NCT01234567 and doi: 10.1371/journal.pone.0123456", "PMID"), []);
  });

  it("the wiki-link target half is not read; its alias half is", () => {
    const text = "See [[DOI-10.3389_fonc.2024.1422160|doi: 10.3389/fonc.2024.1422160]] and [[PMID-42529345|PMID: 42529345]].";
    assert.deepEqual(one(text).map((c) => `${c.type}:${c.id}`).sort(), ["DOI:10.3389/fonc.2024.1422160", "PMID:42529345"]);
  });

  it("CID needs an uppercase CID on a word boundary: 'amino acid 614' and 'acid 2019' are not CIDs", () => {
    assert.deepEqual(ids("the amino acid 614 substitution", "PubChem CID"), []);
    assert.deepEqual(ids("folic acid 2019 guidance", "PubChem CID"), []);
    assert.deepEqual(ids("PubChem CID: 2244 and CID 5090", "PubChem CID"), ["2244", "5090"]);
    assert.deepEqual(ids("CID: 1234567890123", "PubChem CID"), [], "a 13-digit run is dropped, never cut to 12");
  });

  it("extractCitationSpans gives each mention's position; the slice is the id as written", () => {
    const text = "Per PMID: 12345678, trial NCT 01234567 and (doi: 10.1016/S0140-6736(97)11096-0).";
    const spans = extractCitationSpans(text);
    for (const s of spans) {
      const written = text.slice(s.start, s.end);
      if (s.type === "NCT") assert.equal(written.replace(/[ -]/g, "").toUpperCase(), s.id);
      else assert.equal(written, s.id);
    }
    const doi = spans.find((s) => s.type === "DOI");
    assert.equal(doi.id, "10.1016/S0140-6736(97)11096-0", "the wrapping ')' and '.' fall outside the span");
    assert.equal(text[doi.end], ")");
  });

  it("a DOI's span ends before a trimmed trailing period, and a PMID's covers only its digits", () => {
    const text = "Per doi: 10.1038/nature12373. And PMID: 12345678.";
    const [pmid] = extractCitationSpans(text).filter((s) => s.type === "PMID");
    const [doi] = extractCitationSpans(text).filter((s) => s.type === "DOI");
    assert.deepEqual([text.slice(doi.start, doi.end), text[doi.end]], ["10.1038/nature12373", "."]);
    assert.deepEqual([text.slice(pmid.start, pmid.end), text[pmid.end]], ["12345678", "."]);
  });
});

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

    // T1-5: with knownKeys, type and number must both match.
    it("with knownKeys, matches on TYPE:ID and reports grounding_match", () => {
      const report = "Aspirin CID: 2244, cited as PMID: 2244 too, and trial NCT00012345.";
      const typed = crossCheckCitations(report, ["2244", "NCT00012345"], { knownKeys: ["PUBCHEM CID:2244", "NCT:NCT00012345"] });
      assert.equal(typed.grounding_match, "type_and_id");
      assert.equal(typed.verified_count, 2);
      assert.deepEqual(typed.unverified, [{ type: "PMID", id: "2244" }]);
      const untyped = crossCheckCitations(report, ["2244", "NCT00012345"]);
      assert.equal(untyped.grounding_match, "id_only");
      assert.equal(untyped.verified_count, 3, "id-only matching cannot tell the PMID from the CID");
    });

    it("ratio 0 and empty unverified when the report has no citations", () => {
      const r = crossCheckCitations("No citations here.", ["12345678"]);
      assert.equal(r.total, 0);
      assert.equal(r.verified_ratio, 0);
      assert.deepEqual(r.unverified, []);
    });
  });
});
