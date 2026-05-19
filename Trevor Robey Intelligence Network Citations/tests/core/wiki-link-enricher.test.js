"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { enrichWithWikiLinks } = require("../../openclaw-bridge/core/wiki-link-enricher.js");

describe("wiki-link-enricher", () => {
  it("wraps PMID, NCT, ChEMBL, CID, DrugBank, UniProt, DOI", () => {
    const text = [
      "## Findings",
      "See PMID: 30232222 and trial NCT01234567.",
      "Drug CHEMBL25 has CID: 2244 and DB00945. Target UniProt: P11712.",
      "Reference doi: 10.1056/NEJMoa1716078"
    ].join("\n");
    const { markdown, links } = enrichWithWikiLinks(text);
    assert.match(markdown, /\[\[PMID-30232222\|PMID: 30232222\]\]/);
    assert.match(markdown, /\[\[NCT01234567\]\]/);
    assert.match(markdown, /\[\[CHEMBL25\]\]/);
    assert.match(markdown, /\[\[CID-2244\|CID: 2244\]\]/);
    assert.match(markdown, /\[\[DB00945\]\]/);
    assert.match(markdown, /\[\[UniProt-P11712\|UniProt: P11712\]\]/);
    assert.match(markdown, /\[\[DOI-10\.1056_NEJMoa1716078\|doi: 10\.1056\/NEJMoa1716078\]\]/);
    assert.ok(links.length >= 7);
  });

  it("only links the first occurrence per heading section", () => {
    const text = [
      "## Section A",
      "Trial NCT01234567 first.",
      "Trial NCT01234567 second mention same section.",
      "## Section B",
      "Trial NCT01234567 third mention new section."
    ].join("\n");
    const { markdown, links } = enrichWithWikiLinks(text);
    const wrapped = markdown.match(/\[\[NCT01234567\]\]/g) || [];
    assert.equal(wrapped.length, 2, "first occurrence per section, two sections = two links");
    const link = links.find((l) => l.target === "NCT01234567");
    assert.equal(link.count, 2);
  });

  it("skips code fences", () => {
    const text = [
      "Outside PMID: 11111111 should link.",
      "```",
      "Inside fence PMID: 22222222 should NOT link.",
      "```",
      "Tail PMID: 33333333 should link."
    ].join("\n");
    const { markdown } = enrichWithWikiLinks(text);
    assert.match(markdown, /\[\[PMID-11111111\|PMID: 11111111\]\]/);
    assert.doesNotMatch(markdown, /\[\[PMID-22222222/);
    assert.match(markdown, /\[\[PMID-33333333\|PMID: 33333333\]\]/);
  });

  it("skips YAML frontmatter", () => {
    const text = [
      "---",
      "title: Test",
      "pmid_ref: PMID: 99999999",
      "---",
      "## Body",
      "PMID: 99999999 in body."
    ].join("\n");
    const { markdown } = enrichWithWikiLinks(text);
    const head = markdown.split("\n## Body")[0];
    assert.doesNotMatch(head, /\[\[PMID-99999999/);
    assert.match(markdown, /\[\[PMID-99999999\|PMID: 99999999\]\]/);
  });

  it("skips inline code, existing wiki-links, and markdown links", () => {
    const text = [
      "## Body",
      "Code `PMID: 11111111` should not link.",
      "Existing [[NCT01234567]] should not double-wrap.",
      "Markdown link [PMID 22222222](https://example.com) should not link the inner text.",
      "Plain PMID: 33333333 should link."
    ].join("\n");
    const { markdown } = enrichWithWikiLinks(text);
    assert.match(markdown, /`PMID: 11111111`/);
    assert.match(markdown, /\[\[NCT01234567\]\]/);
    const nctMatches = markdown.match(/\[\[NCT01234567\]\]/g) || [];
    assert.equal(nctMatches.length, 1);
    assert.match(markdown, /\[\[PMID-33333333\|PMID: 33333333\]\]/);
    assert.doesNotMatch(markdown, /\[\[PMID-22222222/);
  });

  it("links workflow input nouns (compound_name, indication, therapeutic_area)", () => {
    const text = [
      "## Findings",
      "Psilocybin shows efficacy in treatment-resistant depression."
    ].join("\n");
    const { markdown, links } = enrichWithWikiLinks(text, {
      workflowInputs: {
        compound_name: "psilocybin",
        indication: "treatment-resistant depression",
        therapeutic_area: "psychedelic therapy"
      }
    });
    assert.match(markdown, /\[\[psilocybin\]\]/);
    assert.match(markdown, /\[\[treatment-resistant-depression\|treatment-resistant depression\]\]/);
    assert.ok(links.find((l) => l.target === "psilocybin"));
  });

  it("is idempotent (re-enriching enriched output does not re-wrap)", () => {
    const original = "## Body\nSee PMID: 12345678 here.";
    const first = enrichWithWikiLinks(original).markdown;
    const second = enrichWithWikiLinks(first).markdown;
    assert.equal(first, second);
  });

  it("returns links sorted by descending count", () => {
    const text = [
      "## A",
      "Trial NCT00000001 once.",
      "## B",
      "Trial NCT00000001 again. Trial NCT00000002 here."
    ].join("\n");
    const { links } = enrichWithWikiLinks(text);
    assert.equal(links[0].target, "NCT00000001");
    assert.equal(links[0].count, 2);
    assert.equal(links[1].target, "NCT00000002");
    assert.equal(links[1].count, 1);
  });
});
