#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { buildMonetizationRuntime } = require("./_monetization-runtime.js");
const { buildDeterministicZip, copyDir } = require("./_export-zip-util.js");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function parseArgs(argv) {
  const out = {
    offerId: "",
    format: "folder",
    operatorId: process.env.OPERATOR_ID || "operator-cli",
    confirm: false,
    unknown: []
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = String(argv[index] || "");
    if (token === "--offer-id") { out.offerId = String(argv[index + 1] || "").trim(); index += 1; continue; }
    if (token === "--format") { out.format = String(argv[index + 1] || "").trim() || "folder"; index += 1; continue; }
    if (token === "--operator-id") { out.operatorId = String(argv[index + 1] || "").trim() || out.operatorId; index += 1; continue; }
    if (token === "--confirm") { out.confirm = true; continue; }
    out.unknown.push(token);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.unknown.length > 0 || !args.offerId || !["folder", "zip"].includes(args.format)) {
    process.stderr.write("Usage: node scripts/export-release.js --offer-id <offer_id> --format zip|folder [--operator-id <operator_id>] --confirm\n");
    process.exit(1);
  }
  if (!args.confirm) {
    process.stderr.write("Release export rejected: --confirm is required\n");
    process.exit(1);
  }

  const runtime = buildMonetizationRuntime();
  const validated = runtime.releaseApprovalManager.validateApprovedRelease(args.offerId);
  const bundleDir = validated.bundle_dir;
  const offer = readJson(path.join(bundleDir, "offer.json"));
  const directDeliveryTargets = Array.isArray(offer.direct_delivery_targets)
    ? offer.direct_delivery_targets
    : [];
  if (args.format === "folder") {
    const targetDir = path.join(runtime.rootDir, "workspace", "releases", `${args.offerId}-export`);
    if (fs.existsSync(targetDir)) {
      fs.rmSync(targetDir, { recursive: true, force: true });
    }
    copyDir(bundleDir, targetDir);
    const exportArtifactRef = await runtime.submissionEvidenceManager.buildExportArtifactRef({
      export_path: targetDir
    });
    const exportEvent = await runtime.submissionEvidenceManager.recordExportEvent({
      offer_id: args.offerId,
      operator_id: args.operatorId,
      export_format: "folder",
      exported_platform_targets: validated.approval && Array.isArray(validated.approval.approved_platform_targets)
        ? validated.approval.approved_platform_targets
        : [],
      export_artifact_refs: [exportArtifactRef]
    });
    const deliveryExportEvent = directDeliveryTargets.length > 0
      ? await runtime.deliveryEvidenceManager.recordExportEvent({
        offer_id: args.offerId,
        operator_id: args.operatorId,
        export_format: "folder",
        exported_delivery_targets: directDeliveryTargets,
        export_artifact_refs: [
          await runtime.deliveryEvidenceManager.buildExportArtifactRef({
            export_path: targetDir
          })
        ]
      })
      : null;
    process.stdout.write(`${JSON.stringify({
      ok: true,
      offer_id: args.offerId,
      export_path: targetDir,
      format: "folder",
      dataset_phase20_status: validated.dataset_phase20_status || {},
      publisher_adapter_status: validated.publisher_adapter_status || {},
      submission_evidence_export_event: exportEvent.event,
      delivery_evidence_export_event: deliveryExportEvent ? deliveryExportEvent.event : null
    }, null, 2)}\n`);
    return;
  }

  const zipPath = path.join(runtime.rootDir, "workspace", "releases", `${args.offerId}-export.zip`);
  if (fs.existsSync(zipPath)) {
    fs.rmSync(zipPath, { force: true });
  }
  buildDeterministicZip(bundleDir, zipPath);
  const exportArtifactRef = await runtime.submissionEvidenceManager.buildExportArtifactRef({
    export_path: zipPath
  });
  const exportEvent = await runtime.submissionEvidenceManager.recordExportEvent({
    offer_id: args.offerId,
    operator_id: args.operatorId,
    export_format: "zip",
    exported_platform_targets: validated.approval && Array.isArray(validated.approval.approved_platform_targets)
      ? validated.approval.approved_platform_targets
      : [],
    export_artifact_refs: [exportArtifactRef]
  });
  const deliveryExportEvent = directDeliveryTargets.length > 0
    ? await runtime.deliveryEvidenceManager.recordExportEvent({
      offer_id: args.offerId,
      operator_id: args.operatorId,
      export_format: "zip",
      exported_delivery_targets: directDeliveryTargets,
      export_artifact_refs: [
        await runtime.deliveryEvidenceManager.buildExportArtifactRef({
          export_path: zipPath
        })
      ]
    })
    : null;
  process.stdout.write(`${JSON.stringify({
    ok: true,
    offer_id: args.offerId,
    export_path: zipPath,
    format: "zip",
    dataset_phase20_status: validated.dataset_phase20_status || {},
    publisher_adapter_status: validated.publisher_adapter_status || {},
    submission_evidence_export_event: exportEvent.event,
    delivery_evidence_export_event: deliveryExportEvent ? deliveryExportEvent.event : null
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error && error.stack ? error.stack : String(error)}\n`);
  process.exit(1);
});
