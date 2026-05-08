"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  buildFrontmatter,
  buildConceptNote,
  buildMocNote
} = require("../../scripts/export-to-obsidian.js");

const { dispatch } = require("../../src/handlers/index.js");
const { formatForObsidian, extractWikilinks } = require("../../lib/obsidian-formatter.js");

const SAMPLE_BIOMEDICAL_TEXT = `
Aspirin is a non-steroidal anti-inflammatory drug used for pain relief
and cardiovascular prevention. It irreversibly inhibits cyclooxygenase
enzymes COX-1 and COX-2, reducing prostaglandin synthesis.
Gastrointestinal bleeding is a major adverse effect. Warfarin interaction
increases bleeding risk. Metformin shows promise for cancer prevention
through AMPK pathway activation and mTOR signaling inhibition.
Statins reduce cholesterol via HMG-CoA reductase inhibition with
anti-inflammatory pleiotropic effects. Thalidomide is used for
multiple myeloma treatment due to anti-angiogenic properties.
TNF-alpha inhibition is a key mechanism of thalidomide action.
`;

describe("Export to Obsidian — buildFrontmatter", () => {
  it("produces valid Dataview frontmatter", () => {
    const fm = buildFrontmatter({
      type: "analysis",
      created: "2026-04-04",
      source: "medical-zettelkasten-mcp"
    });
    assert.ok(fm.startsWith("---"));
    assert.ok(fm.endsWith("---"));
    assert.ok(fm.includes("type:: analysis"));
    assert.ok(fm.includes("created:: 2026-04-04"));
    assert.ok(fm.includes("source:: medical-zettelkasten-mcp"));
  });
});

describe("Export to Obsidian — buildConceptNote", () => {
  it("produces concept note with frontmatter and content", () => {
    const note = buildConceptNote("aspirin", 0, 0.5432);
    assert.ok(note.includes("---"));
    assert.ok(note.includes("type:: concept"));
    assert.ok(note.includes("centrality:: 0.5432"));
    assert.ok(note.includes("# aspirin"));
    assert.ok(note.includes("Community: 0"));
  });

  it("handles zero centrality", () => {
    const note = buildConceptNote("unknown_drug", 2, 0);
    assert.ok(note.includes("centrality:: 0.0000"));
  });
});

describe("Export to Obsidian — buildMocNote", () => {
  it("produces MOC with wikilinks to concept notes", () => {
    const moc = buildMocNote(["aspirin", "metformin", "statins"], "Test Analysis");
    assert.ok(moc.includes("type:: moc"));
    assert.ok(moc.includes("[[aspirin]]"));
    assert.ok(moc.includes("[[metformin]]"));
    assert.ok(moc.includes("[[statins]]"));
    assert.ok(moc.includes("# Test Analysis — Map of Content"));
  });

  it("handles empty concept list", () => {
    const moc = buildMocNote([], "Empty");
    assert.ok(moc.includes("type:: moc"));
    assert.ok(moc.includes("# Empty — Map of Content"));
  });
});

describe("Export to Obsidian — Full Pipeline", () => {
  it("full analysis produces valid Obsidian content", async () => {
    const result = await dispatch("full_zettelkasten_analysis", {
      text: SAMPLE_BIOMEDICAL_TEXT,
      input_type: "text"
    });

    assert.ok(!result.isError);
    const data = JSON.parse(result.content[0].text);

    // Format as Obsidian note
    const markdown = formatForObsidian(data, { noteTitle: "Drug Research" });
    assert.ok(markdown.includes("# Drug Research"));
    assert.ok(typeof markdown === "string");
    assert.ok(markdown.length > 100);
  });

  it("wikilinks extracted from analysis contain concept names", async () => {
    const result = await dispatch("full_zettelkasten_analysis", {
      text: SAMPLE_BIOMEDICAL_TEXT,
      input_type: "text"
    });
    const data = JSON.parse(result.content[0].text);
    const links = extractWikilinks(data);
    assert.ok(Array.isArray(links));
    assert.ok(links.length > 0);
  });

  it("formatted output contains [[wikilinks]]", async () => {
    const result = await dispatch("full_zettelkasten_analysis", {
      text: SAMPLE_BIOMEDICAL_TEXT,
      input_type: "text"
    });
    const data = JSON.parse(result.content[0].text);
    const markdown = formatForObsidian(data, { noteTitle: "Test" });
    // Check for wikilink pattern [[...]]
    assert.ok(/\[\[[^\]]+\]\]/.test(markdown), "Should contain [[wikilinks]]");
  });

  it("concept note frontmatter uses Dataview syntax", () => {
    const note = buildConceptNote("aspirin", 1, 0.75);
    // Verify Dataview property format: key:: value
    const lines = note.split("\n");
    const propLines = lines.filter((l) => l.includes("::"));
    assert.ok(propLines.length >= 4, "Should have at least 4 Dataview properties");
    for (const line of propLines) {
      assert.ok(/\w+::\s/.test(line), `Invalid Dataview property: ${line}`);
    }
  });

  it("analysis handles openclaw_report input type", async () => {
    const report = `# Research Report\n\n**Key Finding**: Aspirin reduces COX-2 expression.\n\n[PMID:12345678] supports this claim.`;
    const result = await dispatch("full_zettelkasten_analysis", {
      text: report,
      input_type: "openclaw_report"
    });
    assert.ok(!result.isError);
    const data = JSON.parse(result.content[0].text);
    assert.ok(data.cross_domain !== undefined);
    assert.ok(data.echo_chamber !== undefined);
  });
});
