"use strict";

const path = require("node:path");

const { createPhase23EvidenceAggregator } = require("../analytics/portfolio-intelligence/phase23-evidence-aggregator.js");
const { createPhase23ReportBuilder } = require("../analytics/portfolio-intelligence/phase23-report-builder.js");

function parseArgs(argv) {
  const out = {
    confirm: false,
    outDir: "",
    rootDir: process.cwd(),
    unknown: []
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--confirm") {
      out.confirm = true;
      continue;
    }
    if (token === "--out-dir") {
      out.outDir = String(argv[index + 1] || "");
      index += 1;
      continue;
    }
    if (token === "--as-of") {
      out.asOfIso = String(argv[index + 1] || "");
      index += 1;
      continue;
    }
    if (token === "--root") {
      out.rootDir = path.resolve(String(argv[index + 1] || ""));
      index += 1;
      continue;
    }
    out.unknown.push(token);
  }

  return out;
}

function usage() {
  return [
    "Usage:",
    "  node scripts/generate-phase23-report.js [--root <repo_root>] [--out-dir <dir>] [--as-of <ISO>] --confirm",
    "",
    "Writes deterministic Phase 23 commercialization decision-support artifacts under audit/evidence/phase23/ by default."
  ].join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.unknown.length > 0 || args.confirm !== true) {
    process.stderr.write(`${usage()}\n`);
    process.exit(1);
  }

  const evidenceAggregator = createPhase23EvidenceAggregator({
    rootDir: args.rootDir
  });
  const reportBuilder = createPhase23ReportBuilder({
    evidenceAggregator,
    outDir: args.outDir ? path.resolve(args.rootDir, args.outDir) : path.join(args.rootDir, "audit", "evidence", "phase23")
  });

  const result = await reportBuilder.writePhase23Artifacts({
    asOfIso: args.asOfIso
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error && error.stack ? error.stack : error}\n`);
  process.exit(1);
});
