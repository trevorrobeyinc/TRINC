/**
 * Unit tests for the citation grammar — the correctness spine of the citations[] field.
 * Adversarial fixtures target the two documented false-positive hazards (bare-integer PMIDs,
 * ambiguous "DB"/"dB"), DOI normalization, and the UniProt cue gate. No network required.
 * Run: `node --test test/citation-grammar.test.mjs`
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { extractCitations, normalizeDoi } = require("../src/citation-grammar.js");

/** Convenience: map extract() output to a set of "type:id" strings. */
const ids = (input) => new Set(extractCitations(input).map((c) => `${c.type}:${c.id}`));
const has = (input, typeId) => ids(input).has(typeId);

test("DOI: normalizes prefixes, lowercases, strips trailing prose punctuation", () => {
  assert.ok(has("See doi:10.1038/S41586-020-2649-2.", "doi:10.1038/s41586-020-2649-2"));
  assert.ok(has("https://doi.org/10.1000/xyz123", "doi:10.1000/xyz123"));
  assert.ok(has("(10.3389/fphar.2026.1787936))", "doi:10.3389/fphar.2026.1787936"));
  assert.ok(has("10.54097/5hr7dp28;", "doi:10.54097/5hr7dp28"));
  // internal dots survive; only trailing sentence punctuation is stripped
  assert.equal(normalizeDoi("HTTP://DX.DOI.ORG/10.5555/AbC.def;"), "10.5555/abc.def");
});

test("PMID: extracted ONLY with an explicit cue or a PubMed URL — never a bare integer", () => {
  assert.ok(has("PMID: 32707573", "pmid:32707573"));
  assert.ok(has("pmid31452104 in refs", "pmid:31452104"));
  assert.ok(has("https://pubmed.ncbi.nlm.nih.gov/28495875/", "pmid:28495875"));
  // classic path form actually returned by SearXNG's pubmed engine
  assert.ok(has("https://www.ncbi.nlm.nih.gov/pubmed/42156103", "pmid:42156103"));
  // The single biggest hazard: a bare number must NOT become a PMID.
  assert.equal(has("The cohort enrolled 32707573 patients", "pmid:32707573"), false);
  assert.equal(extractCitations("Trial had 12345 participants and 987654 events.").length, 0);
});

test("NCT: fixed 8-digit width", () => {
  assert.ok(has("Enrolled under NCT04280705.", "nct:NCT04280705"));
  assert.equal(extractCitations("NCT0428 is malformed").length, 0);
});

test("ChEMBL: uppercase prefix + digits; the prose word 'ChEMBL' is not an id", () => {
  assert.ok(has("aspirin is CHEMBL25", "chembl:CHEMBL25"));
  assert.ok(has("target CHEMBL210", "chembl:CHEMBL210"));
  assert.equal(extractCitations("queried the ChEMBL database v34").length, 0);
});

test("DrugBank: DB + exactly 5 digits; 'dB', 'Db2', short forms rejected", () => {
  assert.ok(has("aspirin = DB00945", "drugbank:DB00945"));
  assert.equal(has("the amp was 120 dB", "drugbank:DB00120"), false);
  assert.equal(extractCitations("running IBM Db2 and DB123").length, 0);
});

test("PMCID: PMC + digits", () => {
  assert.ok(has("full text at PMC1193645", "pmcid:PMC1193645"));
});

test("UniProt: only when a 'uniprot' cue is NEAR the candidate (proximity, not global presence)", () => {
  assert.ok(has("UniProt P0DTC2 (spike glycoprotein)", "uniprot:P0DTC2"));
  // Same-shaped token with no UniProt context must not be harvested.
  assert.equal(has("the code Q9Y6K9 appeared once", "uniprot:Q9Y6K9"), false);
  // Regression: an article ABOUT UniProt must not tag a FAR-AWAY accession-shaped catalog/batch
  // code as a citation just because the word 'uniprot' appears in the title.
  const aboutUniprot = {
    title: "UniProt: the universal protein knowledgebase (2026 update)",
    content:
      "This review discusses database curation practices at length across many paragraphs. " +
      "Much later, an unrelated reagent catalog number A1B2C3 was used, and batch Q5W6E7 too.",
    url: "https://example.com/review",
  };
  const set = ids(aboutUniprot);
  assert.equal(set.has("uniprot:A1B2C3"), false);
  assert.equal(set.has("uniprot:Q5W6E7"), false);
});

test("cue patterns do not bridge a field boundary (PMID cue in title, digits in content)", () => {
  // Regression: title 'See PMID' + content '12345 …' must NOT yield pmid:12345.
  assert.equal(has({ title: "See PMID", content: "12345 for details" }, "pmid:12345"), false);
  // …but a real cue+digits within one field still works.
  assert.ok(has({ content: "See PMID 12345 for details" }, "pmid:12345"));
});

test("accepts a result-like object and dedupes across fields", () => {
  const row = {
    title: "Encorafenib (CHEMBL3301612) in BRAF melanoma",
    content: "PMID: 30345906. See also NCT01909453.",
    url: "https://pubmed.ncbi.nlm.nih.gov/30345906/",
  };
  const set = ids(row);
  assert.ok(set.has("chembl:CHEMBL3301612"));
  assert.ok(set.has("nct:NCT01909453"));
  assert.ok(set.has("pmid:30345906"));
  // PMID appears via both the cue and the URL — deduped to one entry.
  assert.equal(extractCitations(row).filter((c) => c.type === "pmid").length, 1);
});

test("provenance: url-derived ids are source 'url', snippet-derived are 'text'", () => {
  const row = {
    title: "KRAS G12C inhibitor trial",
    content: "Registered as NCT03600883.",
    url: "https://pubmed.ncbi.nlm.nih.gov/39603412/",
  };
  const cites = extractCitations(row);
  assert.equal(cites.find((c) => c.type === "pmid").source, "url"); // from the URL (page identity)
  assert.equal(cites.find((c) => c.type === "nct").source, "text"); // from the snippet
});

test("preprint DOIs get subtype 'preprint'; journal DOIs do not", () => {
  const pp = extractCitations("preprint at https://doi.org/10.1101/2020.05.01.072066").find((x) => x.type === "doi");
  assert.equal(pp.subtype, "preprint");
  const j = extractCitations("doi:10.1056/nejmoa2204619").find((x) => x.type === "doi");
  assert.equal(j.subtype, undefined);
});

test("new biomedical id types: arXiv, GEO, SRA/BioProject/BioSample, RRID", () => {
  assert.ok(has("arXiv:2402.09476", "arxiv:2402.09476"));
  assert.ok(has("http://arxiv.org/abs/2606.17504v1", "arxiv:2606.17504"));
  assert.ok(has("dataset GSE185224 deposited in GEO", "geo:GSE185224"));
  assert.ok(has("platform GPL570 (Affymetrix)", "geo:GPL570")); // real 3-digit platform kept
  assert.ok(has("raw reads under SRR12345678", "sra:SRR12345678"));
  assert.ok(has("BioProject PRJNA633745", "bioproject:PRJNA633745"));
  assert.ok(has("sample SAMN12345678", "biosample:SAMN12345678"));
  assert.ok(has("antibody RRID:AB_2801307", "rrid:RRID:AB_2801307"));
  assert.ok(has("antibody rrid:AB_2801307 (lowercase cue)", "rrid:RRID:AB_2801307")); // case-insensitive prefix
});

test("new id types resist their common-token collisions (precision floors)", () => {
  // GNU license notices must NOT become GEO platform ids (1-digit GPL).
  assert.equal(has("released under the GPL2 license", "geo:GPL2"), false);
  assert.equal(has("licensed GPL3", "geo:GPL3"), false);
  // Real gene names must NOT become SRA accessions (SRA is always >= 6 digits).
  assert.equal(extractCitations("SRP54 mutations were found in SRP9").filter((c) => c.type === "sra").length, 0);
  assert.equal(extractCitations("GDS1 and SAMN1 and GSM9").length, 0); // sub-floor widths rejected (1-digit GEO, <5-digit BioSample)
  // arXiv over-long id is REJECTED (not silently truncated to a fabricated 5-digit id).
  assert.equal(extractCitations("arXiv:1801.123456").length, 0);
  assert.equal(has("https://arxiv.org/abs/1801.123456", "arxiv:1801.12345"), false);
});

test("malformed/edge ids are rejected or trimmed", () => {
  // too-short and too-long NCTs both rejected (fixed 8-digit width)
  assert.equal(extractCitations("almost NCT1234 and NCT123456789").filter((c) => c.type === "nct").length, 0);
  // DOI inside a parenthetical citation: trailing paren trimmed
  assert.ok(has("(see doi:10.1038/nature12373)", "doi:10.1038/nature12373"));
  // no-identifier text yields nothing
  assert.deepEqual(extractCitations("A general article about biology with no identifiers."), []);
});

test("never throws on odd input", () => {
  assert.deepEqual(extractCitations(null), []);
  assert.deepEqual(extractCitations(undefined), []);
  assert.deepEqual(extractCitations(12345), []);
  assert.deepEqual(extractCitations({}), []);
});
