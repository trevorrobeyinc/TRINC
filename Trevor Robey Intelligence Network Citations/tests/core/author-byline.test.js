"use strict";

// Root-cause fix for the 2026-11-04 attribution findings: run #7 (workflow-e5947dccdce0e06fde1884b5)
// credited 6 of the 7 papers in its reference table to the wrong authors because no author name ever
// reached the prompt — the ToolUniverse rows carried them, the renderer dropped them, and the model
// wrote bylines from memory. These pin that a record's REAL author list reaches the model, that the
// normalizer's fallback `authors` value ("tooluniverse", a category, a source) never does, and that
// the prompt tells the model to name authors only from that line.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { normalizeToolRecord } = require("../../openclaw-bridge/mcp/tooluniverse-mcp/tu-record-normalizer.js");
const { createToolPrefetch } = require("../../openclaw-bridge/core/tool-prefetch.js");
const { buildPrompt } = require("../../openclaw-bridge/core/agent-engine.js");

const logger = { info() {}, warn() {}, error() {} };

// The shape PubMed_search_articles returns (vendor/tooluniverse pubmed_tool.py): at most five
// "Surname Initials" names plus the true count.
const PUBMED_ROW = {
  pmid: "42937037",
  title: "Rate and shape models of ALSFRS-R decline",
  authors: ["Calvo A", "Moglia C", "Canosa A", "Manera U", "Zucchi E"],
  author_count: 12,
  authors_truncated: true,
  journal: "Annals of Neurology",
  pub_year: "2026",
  doi: "10.1002/ana.78394"
};

describe("author bylines — normalizer", () => {
  it("keeps a row's real author list and its true count", () => {
    const r = normalizeToolRecord(PUBMED_ROW, { retrievedAt: "2026-11-04T00:00:00Z" });
    assert.deepEqual(r.author_names, ["Calvo A", "Moglia C", "Canosa A", "Manera U", "Zucchi E"]);
    assert.equal(r.author_count, 12);
  });

  it("adds no author_names when the row names no author, even though `authors` falls back", () => {
    const r = normalizeToolRecord({ title: "A tool listing", category: "literature" }, { retrievedAt: "2026-11-04T00:00:00Z" });
    assert.deepEqual(r.authors, ["literature"], "the legacy fallback is unchanged");
    assert.ok(!("author_names" in r));
    const empty = normalizeToolRecord({ title: "No authors", authors: [] }, { retrievedAt: "2026-11-04T00:00:00Z" });
    assert.ok(!("author_names" in empty));
  });

  it("does not invent a count larger than the list when none is given", () => {
    const r = normalizeToolRecord({ title: "T", authors: [{ name: "Brown RH" }, { name: "Al-Chalabi A" }] }, { retrievedAt: "2026-11-04T00:00:00Z" });
    assert.deepEqual(r.author_names, ["Brown RH", "Al-Chalabi A"]);
    assert.ok(!("author_count" in r));
  });
});

describe("author bylines — what the model sees", () => {
  async function render(records) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "author-byline-"));
    try {
      fs.mkdirSync(path.join(root, "config"));
      fs.writeFileSync(path.join(root, "config", "tool-prefetch-map.json"), JSON.stringify({
        role_mappings: { fixture_role: [{ action: "executeTool", tool_name: "fixture_lit", arguments: { query: "{{topic}}" } }] }
      }));
      const prefetch = createToolPrefetch({
        toolUniverseMcp: { execute: async () => [] },
        logger,
        rootDir: root,
        localFetchers: { fixture_lit: async () => records }
      });
      const docs = await prefetch.prefetchForRole("fixture_role", { topic: "als" });
      return docs[0].content;
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }

  it("prints a ToolUniverse row's authors, with the true total when the list was cut", async () => {
    const content = await render([normalizeToolRecord(PUBMED_ROW, { retrievedAt: "2026-11-04T00:00:00Z" })]);
    assert.match(content, /\*\*Authors:\*\* Calvo A, Moglia C, Canosa A, Manera U, Zucchi E et al\. \(12 authors\)\n/);
  });

  it("prints a short list in full, and caps a long one at five with its count", async () => {
    const two = await render([{ title: "Review", author_names: ["Brown RH", "Al-Chalabi A"], pmid: "28700839" }]);
    assert.match(two, /### Review\n\*\*Authors:\*\* Brown RH, Al-Chalabi A\nPMID: 28700839/);
    const seven = await render([{ title: "Big", author_names: ["A1", "B2", "C3", "D4", "E5", "F6", "G7"] }]);
    assert.match(seven, /\*\*Authors:\*\* A1, B2, C3, D4, E5 et al\. \(7 authors\)\n/);
  });

  it("prints a local fetcher's author string, shortened when very long", async () => {
    const preprint = await render([{ title: "Preprint", authors: "Calvo A, Moglia C, Canosa A." }]);
    assert.match(preprint, /\*\*Authors:\*\* Calvo A, Moglia C, Canosa A\n/);
    const long = await render([{ title: "Consortium", authors: "X ".repeat(200) }]);
    assert.match(long, /\*\*Authors:\*\* .*… \(list shortened\)\n/);
  });

  it("never prints the normalizer's fallback `authors` array as a byline", async () => {
    const content = await render([normalizeToolRecord({ title: "A tool listing", category: "literature" }, { retrievedAt: "2026-11-04T00:00:00Z" })]);
    assert.doesNotMatch(content, /Authors:/);
    assert.doesNotMatch(content, /tooluniverse\n|literature\n/);
  });

  it("leaves a record without authors exactly as before", async () => {
    const content = await render([{ title: "A paper", pmid: "12345678", abstract: "Abstract text." }]);
    assert.match(content, /### A paper\nAbstract text\.\nPMID: 12345678\n\n/);
  });
});

describe("author bylines — counts, placeholders, sources (2026-11-04 review)", () => {
  async function bylineOf(record) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "author-byline-"));
    try {
      fs.mkdirSync(path.join(root, "config"));
      fs.writeFileSync(path.join(root, "config", "tool-prefetch-map.json"), JSON.stringify({
        role_mappings: { r: [{ action: "executeTool", tool_name: "fx", arguments: { query: "{{topic}}" } }] }
      }));
      const prefetch = createToolPrefetch({ toolUniverseMcp: { execute: async () => [] }, logger, rootDir: root, localFetchers: { fx: async () => [record] } });
      const docs = await prefetch.prefetchForRole("r", { topic: "als" });
      return docs[0].content.split("\n").find((l) => l.startsWith("**Authors:**")) || null;
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
  const names = (n) => Array.from({ length: n }, (_, i) => `Author${i + 1} X`);

  it("states the real total for a list over 25 with no declared count (Semantic Scholar / Europe PMC)", async () => {
    const r = normalizeToolRecord({ title: "T", authors: names(30) }, { retrievedAt: "2026-11-04T00:00:00Z" });
    assert.equal(r.author_names.length, 25);
    assert.equal(r.author_count, 30);
    assert.match(await bylineOf(r), /et al\. \(30 authors\)$/);
  });

  it("states a floor, not a total, for a list long enough to have been cut by the source (OpenAlex stops at 100)", async () => {
    const r = normalizeToolRecord({ title: "T", authors: names(100) }, { retrievedAt: "2026-11-04T00:00:00Z" });
    assert.equal(r.author_count_is_minimum, true);
    assert.match(await bylineOf(r), /et al\. \(at least 100 authors\)$/);
  });

  it("drops placeholder names such as OpenAlex's 'Unknown Author'", async () => {
    const r = normalizeToolRecord({ title: "T", authors: ["Unknown Author", "Jane Roe"] }, { retrievedAt: "2026-11-04T00:00:00Z" });
    assert.deepEqual(r.author_names, ["Jane Roe"]);
    const none = normalizeToolRecord({ title: "T", authors: ["Unknown Author"] }, { retrievedAt: "2026-11-04T00:00:00Z" });
    assert.ok(!("author_names" in none));
  });

  it("the business lane's OpenAlex works now carry their real authors", async () => {
    const { createOpenAlex } = require("../../openclaw-bridge/mcp/business-sources/openalex.js");
    const body = { results: [{
      doi: "https://doi.org/10.1000/example",
      display_name: "Warehouse labour costs",
      publication_year: 2024,
      authorships: [{ author: { display_name: "Ana Lima" } }, { author: { display_name: "Unknown Author" } }, { author: { display_name: "Ben Ito" } }]
    }] };
    const oa = createOpenAlex({ fetchImpl: async () => ({ ok: true, status: 200, json: async () => body }) });
    const [w] = await oa.searchWorks({ topic: "warehouse labour cost" });
    assert.deepEqual(w.author_names, ["Ana Lima", "Ben Ito"]);
    assert.match(await bylineOf(w), /^\*\*Authors:\*\* Ana Lima, Ben Ito$/);
  });

  it("the literature reviewer's and report generator's instructions name authors only from the Authors line", () => {
    const prompts = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "config", "role-prompts.json"), "utf8"));
    const text = JSON.stringify(prompts);
    assert.match(text, /Authors is copied exactly from that record's \\"Authors:\\" line and is \\"not retrieved\\" when the record has none; never write an author name from memory/);
    assert.match(text, /Name a cited work's author only where the input already names that author beside the same identifier/);
    assert.doesNotMatch(text, /Add additional identifiers where possible/, "a role with no evidence of its own must not add identifiers");
  });

  it("withholds a prior run's bylines in context-only text, as it withholds its identifiers", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "author-byline-"));
    try {
      fs.mkdirSync(path.join(root, "config"));
      fs.writeFileSync(path.join(root, "config", "tool-prefetch-map.json"), JSON.stringify({
        role_mappings: { r: [{ action: "executeTool", tool_name: "prior", context_only: true, arguments: { query: "{{topic}}" } }] }
      }));
      const prior = [{
        title: "Literature_reviewer",
        path: "OpenClaw/x/Literature_reviewer.md",
        text: "| Chio et al. / Lancet | 2022 | doi: 10.1016/s0140-6736(22)01272-7 | ALSFRS-R |\n| Calvo A, Moglia C, Canosa A / Ann Neurol | 2026 | PMID: 42937037 |",
        context_only: true
      }];
      const prefetch = createToolPrefetch({ toolUniverseMcp: { execute: async () => [] }, logger, rootDir: root, localFetchers: { prior: async () => prior } });
      const [doc] = await prefetch.prefetchForRole("r", { topic: "als" });
      assert.doesNotMatch(doc.content, /Chio|Calvo|Moglia/);
      assert.match(doc.content, /<prior-run author withheld>/);
      assert.doesNotMatch(doc.content, /42937037|s0140-6736/, "identifiers stay withheld too");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("author bylines — the prompt rule", () => {
  it("tells the model to name authors only from the record's Authors line", () => {
    const prompt = buildPrompt(
      { type: "search", description: "Find sources.", output_format: "markdown", constraints: {} },
      [{ rel: "tooluniverse://pubmed", content: "Result PMID: 11111111" }],
      {}
    );
    assert.match(prompt, /name an author only as that record's "Authors:" line in the documents below gives it/);
    assert.match(prompt, /cite it by its identifier without naming an author/);
    assert.ok(prompt.indexOf("ZERO FABRICATION") < prompt.indexOf("Authors:"), "it is part of the zero-fabrication rule");
  });
});
