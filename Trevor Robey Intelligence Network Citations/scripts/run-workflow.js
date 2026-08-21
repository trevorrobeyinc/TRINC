#!/usr/bin/env node
"use strict";

// The engine reaches in-monorepo mkcert TLS proxies (Qdrant :6433, Miyo :8743, SearXNG :8891;
// Ollama :11435 is Obsidian-side only), so it needs the mkcert root CA trusted via NODE_EXTRA_CA_CERTS. Node
// reads that env var only at process startup, so it can't be set after the fact. If it's not
// already set (e.g. a direct `node scripts/run-workflow.js` rather than via run-workflow.sh or
// the Command Center plugin, which both set it), re-exec ourselves ONCE with it set. Guarded by
// a sentinel so it never loops, and a no-op when the CA file is absent.
if (!process.env.NODE_EXTRA_CA_CERTS && !process.env.__OPENCLAW_CA_REEXEC) {
  const _caPath = require("path").join(
    require("os").homedir(),
    "Library/Application Support/mkcert/rootCA.pem"
  );
  if (require("fs").existsSync(_caPath)) {
    const _r = require("child_process").spawnSync(process.execPath, process.argv.slice(1), {
      stdio: "inherit",
      env: { ...process.env, NODE_EXTRA_CA_CERTS: _caPath, __OPENCLAW_CA_REEXEC: "1" },
    });
    process.exit(_r.status === null ? 1 : _r.status);
  }
}

const { buildWorkflowRuntime, loadWorkflowTemplate } = require("./_workflow-runtime.js");
const {
  findMissingRequiredInputs,
  formatMissingRequiredInputs
} = require("../openclaw-bridge/core/workflow-schema.js");
const { withSidecar } = require("../openclaw-bridge/core/scrape-sidecar-lifecycle.js");
const { enforceOperatorGate } = require("./_operator-gate-cli.js");

function parseArgs(argv) {
  const out = {
    template: "",
    inputs: "",
    operatorId: process.env.OPERATOR_ID || "operator-cli",
    confirm: false,
    operatorApprove: false,
    unknown: []
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = String(argv[index] || "");
    if (token === "--template") { out.template = String(argv[index + 1] || "").trim(); index += 1; continue; }
    if (token === "--inputs") { out.inputs = String(argv[index + 1] || "").trim(); index += 1; continue; }
    if (token === "--operator-id") { out.operatorId = String(argv[index + 1] || "").trim() || out.operatorId; index += 1; continue; }
    if (token === "--confirm") { out.confirm = true; continue; }
    // Operator-initiated human-approval grant for the Phase-15 autonomy gate.
    // Default OFF (fail-closed): without this flag the gate still blocks every
    // research mission's execute_task, exactly as before. Setting it is the
    // explicit, audit-logged human approval that the operator typing the command
    // IS the human the gate asks for. It does NOT weaken the gate for any other
    // caller — it only supplies approval through context for THIS run.
    if (token === "--operator-approve") { out.operatorApprove = true; continue; }
    out.unknown.push(token);
  }

  return out;
}

function usage() {
  return [
    "Usage:",
    "  node scripts/run-workflow.js --template <template_id> --inputs '{\"key\":\"val\"}' [--operator-id <id>] [--operator-approve] --confirm",
    "",
    "  --operator-approve   Grant the operator's human approval for the Phase-15 autonomy gate so",
    "                       research missions can execute. Default OFF (fail-closed): without it the",
    "                       gate blocks every mission's execute_task. Only affects THIS run.",
    "",
    "Examples:",
    "  node scripts/run-workflow.js --template drug-discovery-full --inputs '{\"compound_name\":\"aspirin\",\"indication\":\"pain\"}' --operator-approve --confirm",
    "  node scripts/run-workflow.js --template pharmacovigilance-report --inputs '{\"drug_class\":\"NSAID\"}' --operator-approve --confirm",
    "  node scripts/run-workflow.js --template general-research-pack --inputs '{\"topic\":\"AI governance\",\"input_dir\":\"workspace/research-input/sample/\"}' --operator-approve --confirm"
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

  // Input preflight — ABOVE the gate on purpose (2026-08-20). The operator's armed token is
  // ONE-SHOT with a 300s TTL, so a bad template id or a missing required input must not
  // consume it: previously the template was not even loaded until after the ceremony, inside
  // withSidecar. loadWorkflowTemplate is filesystem-only (no runtime build, no sidecar, no
  // spawn), which is what makes it safe to run before the gate. The engine repeats this check
  // authoritatively for every other caller.
  let preflightTemplate;
  try {
    preflightTemplate = loadWorkflowTemplate(process.cwd(), args.template);
  } catch (templateError) {
    process.stderr.write(`${String(templateError.message || templateError)}\n`);
    process.exit(1);
  }
  const missingRequiredInputs = findMissingRequiredInputs(preflightTemplate, inputs);
  if (missingRequiredInputs.length > 0) {
    process.stderr.write(
      `${formatMissingRequiredInputs(preflightTemplate, missingRequiredInputs)}\n` +
      "No operator-approve token was consumed.\n"
    );
    process.exit(1);
  }

  // YubiKey consent gate: --operator-approve is only honored if a FRESH armed token
  // exists (minted by `operator-approve-gate arm` — PIN via pinentry + physical touch).
  // Fail-closed and one-shot — verify+consume here, before spawning anything.
  //
  // This is now REQUIRED rather than opt-in, and it must stay above withSidecar below: the
  // sidecar spawns bash and syncs dependencies, so gating only the LLM lane still let real work
  // happen before the operator authorized it. An unauthorized run previously reached the sidecar
  // and the tool-prefetch pass before failing at the router with PHASE15_HUMAN_APPROVAL_REQUIRED;
  // it now fails here instead — same outcome, nothing executed. Mock is exempt (see
  // _operator-gate-cli.js) so CI keeps working.
  // roleRouted: this is the MOST role-routed lane in the engine — executeWorkflow →
  // executeMissionStep → spawnMission → spawn-orchestrator → roleRouter.dispatch — and it has no
  // --provider flag at all. Without this the gate would resolve the provider from
  // config/agent-config.json defaultProvider, a value this lane never executes on (templates pin
  // provider_preference.primary=claude-code and role-provider-map pins the roles), so editing that
  // one config key to "mock" would exempt the ceremony while the run still spent real capacity.
  const gate = enforceOperatorGate({
    roleRouted: true,
    operatorApprove: args.operatorApprove,
    logger
  });
  if (!gate.ok) {
    process.stderr.write(`Operator-approve denied: ${gate.reason}\n`);
    process.exit(1);
  }
  logger.info({
    event: "operator_approve_gate_ok",
    provider: gate.provider,
    gate_required: gate.required,
    bypassed: gate.bypassed === true
  });

  const result = await withSidecar(async () => {
    const runtime = await buildWorkflowRuntime({ logger });
    const workflowDef = runtime.loadWorkflowTemplate(args.template);

    logger.info({
      event: "phase30_workflow_starting",
      template: args.template,
      inputs: Object.keys(inputs),
      auto_approve: workflowDef.auto_approve || false,
      operator_approve: args.operatorApprove,
      pipeline_steps: (workflowDef.pipeline || []).length
    });

    try {
      return await runtime.workflowEngine.executeWorkflow(workflowDef, {
        inputs,
        operatorId: args.operatorId,
        // gate.ceremonyVerified, NOT args.operatorApprove: the router's
        // PHASE15_HUMAN_APPROVAL_REQUIRED must only ever be satisfied by a consumed one-shot
        // token. Threading the raw CLI flag would make the two approval layers dependent on the
        // same unverified input.
        operatorApproved: gate.ceremonyVerified
      });
    } finally {
      // Tear down the ToolUniverse SMCP server (+ its health-check interval) so the
      // process can exit cleanly instead of hanging with an orphaned subprocess.
      if (typeof runtime.shutdown === "function") {
        runtime.shutdown();
      }
    }
  }, { logger });

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

  return result.ok ? 0 : 1;
}

main()
  .then((code) => {
    const exitCode = typeof code === "number" ? code : 0;
    const exit = () => process.exit(exitCode);
    // The final result JSON (written above) may still be buffered; a synchronous
    // process.exit() can truncate it. Wait for stdout to drain, with a 2s backstop so a
    // closed pipe can never re-hang the CLI (runtime.shutdown() already removed the known
    // long-lived handles — the forced exit stays as the backstop).
    if (process.stdout.writableLength > 0) {
      process.stdout.once("drain", exit);
      setTimeout(exit, 2000).unref();
    } else {
      exit();
    }
  })
  .catch((error) => {
    process.stderr.write(`${error && error.stack ? error.stack : String(error)}\n`, () => process.exit(1));
    setTimeout(() => process.exit(1), 2000).unref();
  });
