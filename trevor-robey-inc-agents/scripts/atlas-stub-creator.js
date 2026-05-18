#!/usr/bin/env node
"use strict";

/**
 * atlas-stub-creator — DEBUG/FALLBACK TOOL ONLY.
 *
 * The CANONICAL path for materializing atlas stub notes is via the bridge's
 * `research_publish` MCP tool — see scripts/publish-to-vault.js. That path
 * goes:
 *   publish-to-vault.js → HTTPS :8798 → research_publish tool →
 *   RestApiBackend → Local REST API plugin :27124 → vault.
 *
 * THIS script writes stubs directly to the filesystem (`fs.writeFileSync`)
 * without going through the bridge or the REST API plugin. It exists for:
 *   - Batch backfills when Obsidian is closed and the REST API plugin is
 *     therefore unreachable.
 *   - Manual debugging / one-off stub generation outside the workflow.
 *   - CI scenarios that need to materialize stubs without spinning up a
 *     full Obsidian instance.
 *
 * For production workflow output, prefer publish-to-vault.js. As of 2026-05-09
 * the daemon is REST-only with no silent CLI fallback — every other vault
 * write path in the project goes through the REST API plugin.
 */

const fs = require("node:fs");
const path = require("node:path");

const TYPE_DIR = {
  entity: "entity",
  PMID: "PMID",
  NCT: "NCT",
  ChEMBL: "ChEMBL",
  "PubChem CID": "PubChem",
  DrugBank: "DrugBank",
  UniProt: "UniProt",
  DOI: "DOI"
};

const VERIFY_URL = {
  PMID: (id) => `https://pubmed.ncbi.nlm.nih.gov/${id.replace(/^PMID-/, "")}/`,
  NCT: (id) => `https://clinicaltrials.gov/study/${id}`,
  ChEMBL: (id) => `https://www.ebi.ac.uk/chembl/compound_report_card/${id}/`,
  "PubChem CID": (id) => `https://pubchem.ncbi.nlm.nih.gov/compound/${id.replace(/^CID-/, "")}`,
  DrugBank: (id) => `https://go.drugbank.com/drugs/${id}`,
  UniProt: (id) => `https://www.uniprot.org/uniprotkb/${id.replace(/^UniProt-/, "")}/entry`,
  DOI: (id) => `https://doi.org/${id.replace(/^DOI-/, "").replace(/_/g, "/")}`
};

const TYPE_BLURB = {
  entity: "Workflow entity (drug, indication, mechanism, target). First materialized from",
  PMID: "PubMed article ID. Verify at",
  NCT: "ClinicalTrials.gov trial registration. Verify at",
  ChEMBL: "ChEMBL bioactivity record. Verify at",
  "PubChem CID": "PubChem compound. Verify at",
  DrugBank: "DrugBank drug record. Verify at",
  UniProt: "UniProt protein record. Verify at",
  DOI: "Document Object Identifier. Verify at"
};

function parseArgs(argv) {
  const out = { taskId: "", vaultRoot: "/Volumes/ExtraCurricular/My Digital Garden", synthNotePath: "" };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === "--task-id") { out.taskId = argv[++i] || ""; continue; }
    if (t === "--vault-root") { out.vaultRoot = argv[++i] || out.vaultRoot; continue; }
    if (t === "--synth-note") { out.synthNotePath = argv[++i] || ""; continue; }
  }
  return out;
}

function buildStubContent(link, ctx) {
  const { taskId, runDate, synthNoteBasename } = ctx;
  const verifyUrl = (VERIFY_URL[link.type] || (() => ""))(link.target);
  const blurb = TYPE_BLURB[link.type] || "Atlas entry. First materialized from";
  const tagsArr = ["openclaw", "atlas", String(link.type || "").toLowerCase().replace(/[^a-z0-9]+/g, "-")];

  const frontmatter = [
    "---",
    `type: ${link.type}`,
    `identifier: ${link.target}`,
    `display: ${link.display}`,
    `source_task: ${taskId}`,
    `run_date: ${runDate}`,
    verifyUrl ? `verify_url: ${verifyUrl}` : null,
    `tags: [${tagsArr.join(", ")}]`,
    "---",
    ""
  ].filter((line) => line !== null).join("\n");

  const body = [
    `# ${link.display}`,
    "",
    verifyUrl
      ? `${blurb} ${verifyUrl}`
      : `${blurb} [[${synthNoteBasename}]].`,
    "",
    `Referenced from [[${synthNoteBasename}]] (count: ${link.count}).`,
    ""
  ].join("\n");

  return frontmatter + body;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.taskId) {
    process.stderr.write("Usage: node scripts/atlas-stub-creator.js --task-id <task> [--vault-root <path>] [--synth-note <path>]\n");
    process.exit(1);
  }

  const taskDir = path.resolve("workspace/research-output", args.taskId);
  const sidecarPath = path.join(taskDir, "wiki-links.json");
  if (!fs.existsSync(sidecarPath)) {
    process.stderr.write(`No wiki-links.json at ${sidecarPath}\n`);
    process.exit(1);
  }
  const sidecar = JSON.parse(fs.readFileSync(sidecarPath, "utf8"));
  const links = Array.isArray(sidecar.links) ? sidecar.links : [];

  const synthNoteBasename = args.synthNotePath
    ? path.basename(args.synthNotePath, ".md")
    : "Synthesizer-v2";
  const ctx = {
    taskId: args.taskId,
    runDate: new Date().toISOString().slice(0, 10),
    synthNoteBasename
  };

  const atlasRoot = path.join(args.vaultRoot, "OpenClaw", "atlas");
  let created = 0, skipped = 0;
  const byType = {};

  for (const link of links) {
    const dirName = TYPE_DIR[link.type];
    if (!dirName) {
      skipped++;
      continue;
    }
    const noteDir = path.join(atlasRoot, dirName);
    fs.mkdirSync(noteDir, { recursive: true });
    const notePath = path.join(noteDir, `${link.target}.md`);
    if (fs.existsSync(notePath)) {
      skipped++;
      byType[dirName] = byType[dirName] || { created: 0, skipped: 0 };
      byType[dirName].skipped += 1;
      continue;
    }
    const content = buildStubContent(link, ctx);
    fs.writeFileSync(notePath, content, "utf8");
    created++;
    byType[dirName] = byType[dirName] || { created: 0, skipped: 0 };
    byType[dirName].created += 1;
  }

  process.stdout.write(JSON.stringify({
    ok: true,
    taskId: args.taskId,
    atlasRoot,
    synthNoteBasename,
    totalLinks: links.length,
    created,
    skipped,
    byType
  }, null, 2) + "\n");
}

main();
