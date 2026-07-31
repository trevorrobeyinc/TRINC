#!/usr/bin/env node
"use strict";

const { buildPhase14Runtime } = require("./_phase14-agent-utils.js");
const { enforceOperatorGate } = require("./_operator-gate-cli.js");

function parseArgs(argv) {
  const out = { provider: "", model: "", operatorApprove: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--provider") { out.provider = String(argv[i + 1] || "").trim(); i += 1; continue; }
    if (argv[i] === "--model") { out.model = String(argv[i + 1] || "").trim(); i += 1; continue; }
    if (argv[i] === "--operator-approve") { out.operatorApprove = true; continue; }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // This is a connectivity probe that spawns a REAL `claude -p` on the default provider, so it
  // needs the same authorization as any other model call. `--provider mock` still runs ungated
  // and is enough to prove the adapter contract.
  const gate = enforceOperatorGate({
    provider: args.provider,
    operatorApprove: args.operatorApprove
  });
  if (!gate.ok) {
    process.stderr.write(`Operator-approve denied: ${gate.reason}\n`);
    process.exit(1);
  }

  const runtime = await buildPhase14Runtime({
    config: {
      provider: args.provider,
      model: args.model
    }
  });

  const response = await runtime.llmAdapter.complete("Phase14 connectivity test prompt", {
    taskId: "phase14-connection-test",
    model: args.model
  });

  process.stdout.write(`${JSON.stringify({
    ok: true,
    provider: response.provider,
    model: response.model,
    tokenCount: response.tokenCount,
    textPreview: String(response.text || "").slice(0, 200)
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error && error.stack ? error.stack : String(error)}\n`);
  process.exit(1);
});
