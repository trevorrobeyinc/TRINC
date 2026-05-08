#!/usr/bin/env node
"use strict";

/**
 * Export Zettelkasten analysis results as Obsidian-compatible notes.
 *
 * Usage:
 *   node scripts/export-to-obsidian.js --input <file> --output <dir> --confirm
 *   node scripts/export-to-obsidian.js --input ~/workflow-output/report.md --output ~/Obsidian/Zettelkasten/ --confirm
 */

const fs = require("node:fs");
const path = require("node:path");

const { dispatch } = require("../src/handlers/index.js");
const { formatForObsidian, extractWikilinks } = require("../lib/obsidian-formatter.js");

function parseArgs(argv) {
  const out = {
    input: "",
    output: "",
    inputType: "text",
    confirm: false,
    unknown: []
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = String(argv[i] || "");
    if (token === "--input") { out.input = String(argv[i + 1] || "").trim(); i += 1; continue; }
    if (token === "--output") { out.output = String(argv[i + 1] || "").trim(); i += 1; continue; }
    if (token === "--input-type") { out.inputType = String(argv[i + 1] || "").trim(); i += 1; continue; }
    if (token === "--confirm") { out.confirm = true; continue; }
    out.unknown.push(token);
  }

  return out;
}

function usage() {
  return [
    "Usage:",
    "  node scripts/export-to-obsidian.js --input <file> --output <dir> [--input-type text|openclaw_report] --confirm",
    "",
    "Options:",
    "  --input       Input file path (text, markdown, or JSON)",
    "  --output      Output directory for Obsidian notes (default: workspace/obsidian-export/)",
    "  --input-type  Format: text, openclaw_report, tooluniverse_json, pubmed_abstracts",
    "  --confirm     Required to execute",
    "",
    "Examples:",
    "  node scripts/export-to-obsidian.js --input workspace/sample-research.md --output workspace/obsidian-export/ --confirm",
    "  node scripts/export-to-obsidian.js --input ~/workflow-output/report.md --output ~/Obsidian/Zettelkasten/ --confirm"
  ].join("\n");
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function buildFrontmatter(properties) {
  const lines = ["---"];
  for (const [key, value] of Object.entries(properties)) {
    lines.push(`${key}:: ${value}`);
  }
  lines.push("---");
  return lines.join("\n");
}

function buildConceptNote(concept, community, centrality) {
  const frontmatter = buildFrontmatter({
    type: "concept",
    community: community,
    centrality: Number(centrality).toFixed(4),
    created: new Date().toISOString().split("T")[0],
    source: "medical-zettelkasten-mcp"
  });

  return `${frontmatter}\n\n# ${concept}\n\nIdentified as a key concept via graph analysis.\n\n- Community: ${community}\n- Centrality: ${Number(centrality).toFixed(4)}\n`;
}

function buildMocNote(conceptNotes, analysisTitle) {
  const frontmatter = buildFrontmatter({
    type: "moc",
    created: new Date().toISOString().split("T")[0],
    source: "medical-zettelkasten-mcp"
  });

  const links = conceptNotes.map((n) => `- [[${n}]]`).join("\n");

  return `${frontmatter}\n\n# ${analysisTitle} — Map of Content\n\n## Concept Notes\n\n${links}\n\n## Analysis\n\nSee [[${analysisTitle}]] for the full graph analysis report.\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.input || args.unknown.length > 0) {
    process.stderr.write(`${usage()}\n`);
    process.exit(1);
  }
  if (!args.confirm) {
    process.stderr.write("Export rejected: --confirm is required\n");
    process.exit(1);
  }

  const inputPath = path.resolve(args.input);
  if (!fs.existsSync(inputPath)) {
    process.stderr.write(`Input file not found: ${inputPath}\n`);
    process.exit(1);
  }

  const outputDir = args.output
    ? path.resolve(args.output)
    : path.resolve(__dirname, "..", "workspace", "obsidian-export");
  ensureDir(outputDir);

  // Read input
  const inputText = fs.readFileSync(inputPath, "utf8");
  process.stderr.write(`Read ${inputText.length} characters from ${inputPath}\n`);

  // Run full Zettelkasten analysis (in-process — same project)
  const result = dispatch("full_zettelkasten_analysis", {
    text: inputText,
    input_type: args.inputType
  });

  if (result.isError) {
    const parsed = JSON.parse(result.content[0].text);
    process.stderr.write(`Analysis failed: ${parsed.error}\n`);
    process.exit(1);
  }

  const analysisData = JSON.parse(result.content[0].text);
  const inputBasename = path.basename(inputPath, path.extname(inputPath));
  const analysisTitle = `${inputBasename} — Graph Analysis`;

  // 1. Main analysis note
  const mainNote = formatForObsidian(analysisData, { noteTitle: analysisTitle });
  const mainFrontmatter = buildFrontmatter({
    type: "analysis",
    created: new Date().toISOString().split("T")[0],
    source: "medical-zettelkasten-mcp",
    input_file: path.basename(inputPath)
  });
  const mainContent = `${mainFrontmatter}\n\n${mainNote}`;
  const mainPath = path.join(outputDir, `${analysisTitle}.md`);
  fs.writeFileSync(mainPath, mainContent, "utf8");
  process.stderr.write(`Wrote main analysis: ${mainPath}\n`);

  // 2. Concept notes (top centrality nodes from the graph)
  const conceptNoteNames = [];
  if (analysisData.graph && analysisData.graph.nodes) {
    const nodes = Array.isArray(analysisData.graph.nodes) ? analysisData.graph.nodes : [];
    const sorted = nodes
      .filter((n) => n && typeof n.centrality === "number")
      .sort((a, b) => b.centrality - a.centrality)
      .slice(0, 10);

    for (const node of sorted) {
      const label = node.label || node.id || "unknown";
      const safeLabel = label.replace(/[/\\:*?"<>|]/g, "-");
      const noteContent = buildConceptNote(label, node.community || 0, node.centrality || 0);
      const notePath = path.join(outputDir, `${safeLabel}.md`);
      fs.writeFileSync(notePath, noteContent, "utf8");
      conceptNoteNames.push(safeLabel);
    }
    process.stderr.write(`Wrote ${conceptNoteNames.length} concept notes\n`);
  }

  // 3. MOC (Map of Content)
  const mocContent = buildMocNote(conceptNoteNames, analysisTitle);
  const mocPath = path.join(outputDir, `MOC — ${inputBasename}.md`);
  fs.writeFileSync(mocPath, mocContent, "utf8");
  process.stderr.write(`Wrote MOC: ${mocPath}\n`);

  // Summary
  const wikilinks = extractWikilinks(analysisData);
  const summary = {
    ok: true,
    output_dir: outputDir,
    notes_created: 2 + conceptNoteNames.length,
    main_analysis: mainPath,
    moc: mocPath,
    concept_notes: conceptNoteNames.length,
    wikilinks: wikilinks.length
  };

  process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
  process.stderr.write(`Export complete: ${summary.notes_created} notes created\n`);
}

module.exports = {
  buildFrontmatter,
  buildConceptNote,
  buildMocNote
};

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`Fatal: ${err.message}\n`);
    process.exit(1);
  });
}
