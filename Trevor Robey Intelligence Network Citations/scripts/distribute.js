#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { parseArgs } = require("node:util");

const { manifestProblems, sealProblems } = require("./_delivery-checks.js");

const ROOT_DIR = path.resolve(__dirname, "..");

// T1-2 (2026-11-14): marketplace files are built ONLY from the workflow's sealed release, and only when
// that release passed the citation gate: it must hold the integrity ledger and a complete reproducibility
// manifest (shippable decision, nothing UNRESOLVED, re-resolution completed — T1-8), and every file read
// must match the release seal, the same check build-buyer-zip.js makes (scripts/_delivery-checks.js).
// Before this, the staged report was the longest .md in the mission folder or in ANY research-output
// folder whose name started with "task-", so it could come from a different run, gated or not; and a
// branch read workspace/offer-bundles/, a folder the packager never writes.
const RELEASE_FILES = Object.freeze(["report.md", "tables.csv", "citation-integrity.md", "reproducibility-manifest.json"]);

class DistributionRefusedError extends Error {
  constructor(workflowId, problems) {
    super(`distribution refused for workflow '${workflowId}', nothing written:\n- ${problems.join("\n- ")}`);
    this.name = "DistributionRefusedError";
    this.code = "PHASE30_DISTRIBUTION_REFUSED";
    this.problems = problems;
  }
}

const ADAPTER_MAP = {
  datarade: "../openclaw-bridge/distribution/datarade-format-adapter.js",
  kaggle: "../openclaw-bridge/distribution/kaggle-format-adapter.js",
  huggingface: "../openclaw-bridge/distribution/huggingface-format-adapter.js",
  "aws-data-exchange": "../openclaw-bridge/distribution/aws-data-exchange-format-adapter.js",
  "data-and-sons": "../openclaw-bridge/distribution/data-and-sons-format-adapter.js"
};

const ALL_TARGETS = [...Object.keys(ADAPTER_MAP), "training-data"];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// The staged report and citation index come from the workflow's sealed, gate-passed release, or the
// workflow is refused (DistributionRefusedError) and nothing is staged.
function findWorkflowFiles(workflowId, { rootDir = ROOT_DIR } = {}) {
  const workflowDir = path.join(rootDir, "workspace", "workflows", workflowId);
  const workflowJsonPath = path.join(workflowDir, "workflow.json");

  if (!fs.existsSync(workflowJsonPath)) {
    throw new Error(`Workflow '${workflowId}' not found at ${workflowJsonPath}`);
  }

  const state = readJson(workflowJsonPath);
  const offerId = state.artifacts && state.artifacts.offer_id;
  if (!offerId) {
    throw new DistributionRefusedError(workflowId, ["the workflow sealed no release (workflow.json names no artifacts.offer_id): only a sealed, gate-passed release is distributed"]);
  }
  const releaseDir = path.join(rootDir, "workspace", "releases", String(offerId));
  const deliverablesDir = path.join(releaseDir, "deliverables");
  if (!fs.existsSync(deliverablesDir)) {
    throw new DistributionRefusedError(workflowId, [`no sealed release at ${releaseDir}`]);
  }
  const seal = sealProblems(releaseDir, RELEASE_FILES);
  const problems = [...seal.problems, ...manifestProblems(deliverablesDir, { requireManifest: true }).problems];
  if (problems.length > 0) throw new DistributionRefusedError(workflowId, problems);

  const report = fs.readFileSync(path.join(deliverablesDir, "report.md"), "utf8");
  const citations = fs.readFileSync(path.join(deliverablesDir, "tables.csv"), "utf8");
  // One row per identifier after the header line (the header used to be counted as a citation).
  const citationCount = citations.split("\n").slice(1).filter((l) => l.trim()).length;

  return {
    workflowId,
    offerId,
    releaseDir,
    templateId: state.template_id || "unknown",
    outputDir: workflowDir,
    report,
    citations,
    citationCount,
    qualityScore: state.artifacts && state.artifacts.quality_report
      ? state.artifacts.quality_report.overall_confidence
      : null,
    metadata: state
  };
}

function runFormatAdapter(target, workflowOutput, outputBase) {
  const adapterPath = ADAPTER_MAP[target];
  if (!adapterPath) {
    console.error(`  Unknown adapter: ${target}`);
    return null;
  }

  const adapter = require(adapterPath);
  const result = adapter.transform(workflowOutput);

  const targetDir = path.join(outputBase, target, workflowOutput.workflowId);
  ensureDir(targetDir);

  for (const file of result.files) {
    const filePath = path.join(targetDir, file.name);
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, file.content, "utf8");
  }

  console.log(`  ${target}: ${result.files.length} files → ${targetDir}`);
  for (const file of result.files) {
    const size = Buffer.byteLength(file.content, "utf8");
    console.log(`    - ${file.name} (${size} bytes)`);
  }

  return result;
}

function runTrainingData(workflowOutput, outputBase) {
  const {
    generateQAPairs,
    generateEvaluationRubrics,
    generateFactualityAssessments,
    exportAsJsonl
  } = require("../openclaw-bridge/distribution/training-data-generator.js");

  const targetDir = path.join(outputBase, "training-data", workflowOutput.workflowId);
  ensureDir(targetDir);

  const qaPairs = generateQAPairs(workflowOutput.report, workflowOutput.citations);
  const rubrics = generateEvaluationRubrics(workflowOutput.report, workflowOutput.citations);
  const assessments = generateFactualityAssessments(workflowOutput.report, workflowOutput.citations);

  if (qaPairs.length > 0) {
    exportAsJsonl(qaPairs, path.join(targetDir, "qa-pairs.jsonl"));
  }
  if (rubrics.length > 0) {
    exportAsJsonl(rubrics, path.join(targetDir, "evaluation-rubrics.jsonl"));
  }
  if (assessments.length > 0) {
    exportAsJsonl(assessments, path.join(targetDir, "factuality-assessments.jsonl"));
  }

  console.log(`  training-data: ${qaPairs.length} Q&A pairs, ${rubrics.length} rubrics, ${assessments.length} assessments → ${targetDir}`);
  if (qaPairs.length > 0) console.log(`    - qa-pairs.jsonl (${qaPairs.length} records)`);
  if (rubrics.length > 0) console.log(`    - evaluation-rubrics.jsonl (${rubrics.length} records)`);
  if (assessments.length > 0) console.log(`    - factuality-assessments.jsonl (${assessments.length} records)`);

  return { qaPairs: qaPairs.length, rubrics: rubrics.length, assessments: assessments.length };
}

function main() {
  const { values } = parseArgs({
    options: {
      "workflow-id": { type: "string" },
      targets: { type: "string", default: "all" },
      confirm: { type: "boolean", default: false }
    },
    strict: false
  });

  const workflowId = values["workflow-id"];
  if (!workflowId) {
    console.error("Usage: node scripts/distribute.js --workflow-id <id> --targets datarade,kaggle,training-data [--confirm]");
    console.error(`Available targets: ${ALL_TARGETS.join(", ")}, all`);
    process.exit(1);
  }

  const targetList = values.targets === "all"
    ? ALL_TARGETS
    : values.targets.split(",").map((t) => t.trim());

  try {
    runDistribution({ workflowId, targetList });
  } catch (error) {
    if (error instanceof DistributionRefusedError) {
      console.error(error.message);
      process.exit(2);
    }
    throw error;
  }
}

// Stage the marketplace files for one workflow. Refuses (DistributionRefusedError) before writing
// anything unless the workflow's release is sealed and gate-passed (findWorkflowFiles).
function runDistribution({ workflowId, targetList = ALL_TARGETS, rootDir = ROOT_DIR }) {
  console.log(`\nDistribution Pipeline`);
  console.log(`Workflow: ${workflowId}`);
  console.log(`Targets: ${targetList.join(", ")}`);
  console.log(`---`);

  const workflowOutput = findWorkflowFiles(workflowId, { rootDir });
  console.log(`Release: ${workflowOutput.offerId}`);
  console.log(`Report: ${workflowOutput.report.length} chars`);
  console.log(`Citations: ${workflowOutput.citationCount} identifiers`);
  console.log(`Template: ${workflowOutput.templateId}`);
  console.log(`---`);

  const outputBase = path.join(rootDir, "workspace", "distribution");
  ensureDir(outputBase);

  for (const target of targetList) {
    if (target === "training-data") {
      runTrainingData(workflowOutput, outputBase);
    } else {
      runFormatAdapter(target, workflowOutput, outputBase);
    }
  }

  console.log(`\n--- Distribution complete ---`);
  console.log(`Output: ${outputBase}`);
  console.log(`NOTE: Files are prepared for manual review and upload. Nothing was submitted.`);
  return { workflowOutput, outputBase };
}

if (require.main === module) main();

module.exports = { ALL_TARGETS, DistributionRefusedError, RELEASE_FILES, findWorkflowFiles, runDistribution };
