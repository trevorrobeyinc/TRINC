"use strict";

const fs = require("node:fs");
const path = require("node:path");

const defaultTimeProvider = require("../openclaw-bridge/core/time-provider.js");
const { createDatasetOutputManager } = require("../openclaw-bridge/dataset/dataset-output-manager.js");
const { createOfferBuilder } = require("../openclaw-bridge/monetization/offer-builder.js");
const { createDeliverablePackager } = require("../openclaw-bridge/monetization/deliverable-packager.js");
const { createSubmissionPackGenerator } = require("../openclaw-bridge/monetization/submission-pack-generator.js");
const { createReleaseApprovalManager } = require("../openclaw-bridge/monetization/release-approval-manager.js");
const { createDefaultPublisherAdapterRegistry } = require("../openclaw-bridge/monetization/publisher-adapter-registry.js");
const { createSubmissionEvidenceManager } = require("../openclaw-bridge/monetization/submission-evidence-manager.js");
const { createDeliveryEvidenceManager } = require("../openclaw-bridge/monetization/delivery-evidence-manager.js");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function asPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asStringArray(value) {
  return Array.isArray(value)
    ? value.map((entry) => String(entry || "").trim()).filter(Boolean).sort((left, right) => left.localeCompare(right))
    : [];
}

function validateRegistryCoverage(publisherAdapterRegistry, platformTargets) {
  if (!publisherAdapterRegistry || typeof publisherAdapterRegistry.resolve !== "function" || typeof publisherAdapterRegistry.list !== "function") {
    const error = new Error("buildMonetizationRuntime requires a valid publisherAdapterRegistry");
    error.code = "PHASE21_RUNTIME_ADAPTER_REGISTRY_REQUIRED";
    throw error;
  }
  const configuredTargets = Object.keys(asPlainObject(asPlainObject(platformTargets).platform_targets)).sort((left, right) => left.localeCompare(right));
  const listedTargets = asStringArray(publisherAdapterRegistry.configured_targets);
  if (listedTargets.length > 0 && JSON.stringify(listedTargets) !== JSON.stringify(configuredTargets)) {
    const error = new Error("publisher adapter registry configured_targets does not match config/platform-targets.json");
    error.code = "PHASE21_RUNTIME_ADAPTER_REGISTRY_TARGETS_MISMATCH";
    throw error;
  }
  const resolvedTargets = asStringArray((publisherAdapterRegistry.list() || []).map((entry) => asPlainObject(entry).platform_target));
  if (JSON.stringify(resolvedTargets) !== JSON.stringify(configuredTargets)) {
    const error = new Error("publisher adapter registry entries must map exactly one adapter per configured platform target");
    error.code = "PHASE21_RUNTIME_ADAPTER_REGISTRY_TARGETS_MISMATCH";
    throw error;
  }
  for (const targetName of configuredTargets) {
    const adapter = publisherAdapterRegistry.resolve(targetName);
    if (!adapter || String(asPlainObject(adapter).platform_target || "").trim() !== targetName) {
      const error = new Error(`publisher adapter registry target mismatch for '${targetName}'`);
      error.code = "PHASE21_RUNTIME_ADAPTER_REGISTRY_TARGETS_MISMATCH";
      throw error;
    }
  }
  return publisherAdapterRegistry;
}

function buildMonetizationRuntime(options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const monetizationMap = readJson(path.join(rootDir, "config", "monetization-map.json"));
  const platformTargets = readJson(path.join(rootDir, "config", "platform-targets.json"));
  const directDeliveryTargets = readJson(path.join(rootDir, "config", "direct-delivery-targets.json"));
  const publisherAdapterRegistry = validateRegistryCoverage(
    options.publisherAdapterRegistry || createDefaultPublisherAdapterRegistry({ platformTargets }),
    platformTargets
  );
  // The release-approval manager and the dataset output manager stamp customer-visible dates
  // (`approved_at`, `build_completed_at`), and each one's built-in default is a FROZEN EPOCH - that
  // is what keeps unit tests deterministic. Production must therefore hand them a real clock, or
  // every approval is stamped 1970-01-01 (first real run, 2026-10-08). This factory is the single
  // place approve-release, export-release, generate-offer, the evidence scripts and the workflow
  // runtime all build through, so the default lives here. Same idiom as the workflow engine
  // (`options.timeProvider || timeProviderModule`); a test or a replay injects its own.
  const timeProvider = options.timeProvider || defaultTimeProvider;
  const datasetOutputManager = createDatasetOutputManager({ rootDir, timeProvider });
  const offerBuilder = createOfferBuilder({
    rootDir,
    monetizationMap,
    platformTargets,
    directDeliveryTargets,
    datasetOutputManager
  });
  const deliverablePackager = createDeliverablePackager({ rootDir, directDeliveryTargets });
  const submissionPackGenerator = createSubmissionPackGenerator({
    platformTargets,
    publisherAdapterRegistry
  });
  const releaseApprovalManager = createReleaseApprovalManager({
    platformTargets,
    releasesDir: path.join(rootDir, "workspace", "releases"),
    timeProvider
  });
  const submissionEvidenceManager = createSubmissionEvidenceManager({
    rootDir,
    releasesDir: path.join(rootDir, "workspace", "releases"),
    releaseApprovalManager,
    timeProvider
  });
  const deliveryEvidenceManager = createDeliveryEvidenceManager({
    rootDir,
    releasesDir: path.join(rootDir, "workspace", "releases"),
    releaseApprovalManager,
    timeProvider
  });

  return {
    rootDir,
    monetizationMap,
    platformTargets,
    directDeliveryTargets,
    publisherAdapterRegistry,
    datasetOutputManager,
    offerBuilder,
    deliverablePackager,
    submissionPackGenerator,
    releaseApprovalManager,
    submissionEvidenceManager,
    deliveryEvidenceManager
  };
}

module.exports = {
  buildMonetizationRuntime,
  readJson
};
