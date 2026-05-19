#!/usr/bin/env node
"use strict";

const { buildWorkflowRuntime } = require("./_workflow-runtime.js");
const { withSidecar } = require("../openclaw-bridge/core/scrape-sidecar-lifecycle.js");

function parseArgs(argv) {
  const out = {
    template: "",
    inputs: "",
    operatorId: process.env.OPERATOR_ID || "operator-cli",
    confirm: false,
    unknown: []
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = String(argv[index] || "");
    if (token === "--template") { out.template = String(argv[index + 1] || "").trim(); index += 1; continue; }
    if (token === "--inputs") { out.inputs = String(argv[index + 1] || "").trim(); index += 1; continue; }
    if (token === "--operator-id") { out.operatorId = String(argv[index + 1] || "").trim() || out.operatorId; index += 1; continue; }
    if (token === "--confirm") { out.confirm = true; continue; }
    out.unknown.push(token);
  }

  return out;
}

function usage() {
  return [
    "Usage:",
    "  node scripts/run-workflow.js --template <template_id> --inputs '{\"key\":\"val\"}' [--operator-id <id>] --confirm",
    "",
    "Examples:",
    "  node scripts/run-workflow.js --template drug-discovery-full --inputs '{\"compound_name\":\"aspirin\",\"indication\":\"pain\"}' --confirm",
    "  node scripts/run-workflow.js --template pharmacovigilance-report --inputs '{\"drug_class\":\"NSAID\"}' --confirm",
    "  node scripts/run-workflow.js --template general-research-pack --inputs '{\"topic\":\"AI governance\",\"input_dir\":\"workspace/research-input/sample/\"}' --confirm"
  ].join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.unknown.length > 0 || !args.template) {
    process.stderr.write(`${usage()}\n`);
    process.exit(1);
  }
  if (!args.confirm) {
    process.stderr.write("Workflow execution rejected: --confirm is required\n");
    process.exit(1);
  }

  let inputs = {};
  if (args.inputs) {
    try {
      inputs = JSON.parse(args.inputs);
    } catch (parseError) {
      process.stderr.write(`Invalid --inputs JSON: ${parseError.message}\n`);
      process.exit(1);
    }
    if (!inputs || typeof inputs !== "object" || Array.isArray(inputs)) {
      process.stderr.write("--inputs must be a JSON object\n");
      process.exit(1);
    }
  }

  const logger = {
    info(data) { process.stderr.write(`[INFO] ${JSON.stringify(data)}\n`); },
    warn(data) { process.stderr.write(`[WARN] ${JSON.stringify(data)}\n`); },
    error(data) { process.stderr.write(`[ERROR] ${JSON.stringify(data)}\n`); }
  };

  const result = await withSidecar(async () => {
    const runtime = await buildWorkflowRuntime({ logger });
    const workflowDef = runtime.loadWorkflowTemplate(args.template);

    logger.info({
      event: "phase30_workflow_starting",
      template: args.template,
      inputs: Object.keys(inputs),
      auto_approve: workflowDef.auto_approve || false,
      pipeline_steps: (workflowDef.pipeline || []).length
    });

    return runtime.workflowEngine.executeWorkflow(workflowDef, {
      inputs,
      operatorId: args.operatorId
    });
  }, { logger });

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

  if (!result.ok) {
    process.exit(1);
  }
}

main().catch((error) => {
  process.stderr.write(`${error && error.stack ? error.stack : String(error)}\n`);
  process.exit(1);
});
