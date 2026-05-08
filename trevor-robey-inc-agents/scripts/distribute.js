#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { parseArgs } = require("node:util");

const { extractCitations, deduplicateCitations } = require("../openclaw-bridge/core/citation-extractor.js");

const ROOT_DIR = path.resolve(__dirname, "..");

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

function readTextSafe(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function findWorkflowFiles(workflowId) {
  // Check workflow state first
  const workflowDir = path.join(ROOT_DIR, "workspace", "workflows", workflowId);
  const workflowJsonPath = path.join(workflowDir, "workflow.json");

  if (!fs.existsSync(workflowJsonPath)) {
    throw new Error(`Workflow '${workflowId}' not found at ${workflowJsonPath}`);
  }

  const state = readJson(workflowJsonPath);
  const missionId = state.artifacts && state.artifacts.mission_id;
  const offerId = state.artifacts && state.artifacts.offer_id;

  // Find report and citations from mission output
  let report = "";
  let citations = "";

  if (missionId) {
    const missionDir = path.join(ROOT_DIR, "workspace", "missions", missionId);
    if (fs.existsSync(missionDir)) {
      // Look for report files in mission directory
      const files = fs.readdirSync(missionDir, { recursive: true }).sort();
      for (const file of files) {
        const fullPath = path.join(missionDir, file);
        if (!fs.statSync(fullPath).isFile()) continue;
        const content = readTextSafe(fullPath);
        if (file.endsWith(".md") && content.length > report.length) {
          report = content;
        }
        if ((file.includes("table") || file.includes("citation")) && file.endsWith(".csv")) {
          citations = content;
        }
      }
    }

    // Also check research output
    const outputDir = path.join(ROOT_DIR, "workspace", "research-output");
    if (fs.existsSync(outputDir)) {
      const taskDirs = fs.readdirSync(outputDir).filter((d) => d.includes(missionId) || d.startsWith("task-"));
      for (const taskDir of taskDirs) {
        const taskPath = path.join(outputDir, taskDir);
        if (!fs.statSync(taskPath).isDirectory()) continue;
        const taskFiles = fs.readdirSync(taskPath);
        for (const file of taskFiles) {
          const fullPath = path.join(taskPath, file);
          if (!fs.statSync(fullPath).isFile()) continue;
          const content = readTextSafe(fullPath);
          if (file === "output.md" && content.length > report.length) {
            report = content;
          }
        }
      }
    }
  }

  // Check offer bundle for packaged deliverables
  if (offerId) {
    const bundleDir = path.join(ROOT_DIR, "workspace", "offer-bundles", offerId);
    if (fs.existsSync(bundleDir)) {
      const bundleFiles = fs.readdirSync(bundleDir, { recursive: true }).sort();
      for (const file of bundleFiles) {
        const fullPath = path.join(bundleDir, file);
        if (!fs.statSync(fullPath).isFile()) continue;
        const content = readTextSafe(fullPath);
        if (file.endsWith("report.md") && content.length > report.length) {
          report = content;
        }
        if (file.endsWith("tables.csv") && content.length > citations.length) {
          citations = content;
        }
      }
    }
  }

  // Extract citations from report markdown if no CSV file was found
  if (!citations && report) {
    const extracted = deduplicateCitations(extractCitations(report));
    if (extracted.length > 0) {
      const csvLines = ["type,id,context"];
      for (const cit of extracted) {
        const ctx = (cit.context || "").replace(/"/g, '""').slice(0, 200);
        csvLines.push(`${cit.type},${cit.id},"${ctx}"`);
      }
      citations = csvLines.join("\n");
    }
  }

  // Count citations
  const citationCount = citations
    ? citations.split("\n").filter((l) => l.trim() && !l.startsWith("type")).length
    : 0;

  return {
    workflowId,
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

  console.log(`\nDistribution Pipeline`);
  console.log(`Workflow: ${workflowId}`);
  console.log(`Targets: ${targetList.join(", ")}`);
  console.log(`---`);

  const workflowOutput = findWorkflowFiles(workflowId);
  console.log(`Report: ${workflowOutput.report.length} chars`);
  console.log(`Citations: ${workflowOutput.citationCount} identifiers`);
  console.log(`Template: ${workflowOutput.templateId}`);
  console.log(`---`);

  const outputBase = path.join(ROOT_DIR, "workspace", "distribution");
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
}

main();
