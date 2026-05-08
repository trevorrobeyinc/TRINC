"use strict";

const fs = require("node:fs");
const path = require("node:path");

function requiredFiles(rootDir) {
  return [
    "openclaw-bridge/mcp/tooluniverse-mcp/tooluniverse-mcp.js",
    "openclaw-bridge/mcp/tooluniverse-mcp/tu-process-manager.js",
    "openclaw-bridge/mcp/tooluniverse-mcp/tu-record-normalizer.js",
    "openclaw-bridge/mcp/tooluniverse-mcp/tu-schema.js",
    "vendor/tooluniverse/.git",
    "config/dataset-schemas.json",
    "config/mission-templates.json",
    "config/monetization-map.json"
  ].map((rel) => ({ rel, abs: path.join(rootDir, rel) }));
}

function verifyMethodRegistry(rootDir) {
  const registryPath = path.join(rootDir, "openclaw-bridge", "bridge", "mcp-method-registry.js");
  if (!fs.existsSync(registryPath)) {
    return { ok: false, reason: "mcp-method-registry.js not found" };
  }
  const content = fs.readFileSync(registryPath, "utf8");
  const requiredMethods = [
    "research_findTool",
    "research_getToolInfo",
    "research_executeTool",
    "research_listTools",
    "research_grepTools"
  ];
  for (const method of requiredMethods) {
    if (!content.includes(method)) {
      return { ok: false, reason: `Method '${method}' not found in registry` };
    }
  }
  return { ok: true };
}

function verifyEgressPolicy(rootDir) {
  const policyPath = path.join(rootDir, "openclaw-bridge", "execution", "egress-policy.js");
  if (!fs.existsSync(policyPath)) {
    return { ok: false, reason: "egress-policy.js not found" };
  }
  const content = fs.readFileSync(policyPath, "utf8");
  if (!content.includes("tooluniverse-mcp")) {
    return { ok: false, reason: "tooluniverse-mcp egress policy not found" };
  }
  return { ok: true };
}

function verifyFeatureFlag(rootDir) {
  const configPath = path.join(rootDir, "openclaw-bridge", "openclaw.json");
  if (!fs.existsSync(configPath)) {
    return { ok: false, reason: "openclaw.json not found" };
  }
  try {
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const flags = config.features || config.featureFlags || {};
    if (flags.ENABLE_TOOLUNIVERSE_MCP !== true) {
      return { ok: false, reason: "ENABLE_TOOLUNIVERSE_MCP feature flag not enabled" };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: `Failed to parse openclaw.json: ${error.message}` };
  }
}

function verifyDatasetSchemas(rootDir) {
  const schemasPath = path.join(rootDir, "config", "dataset-schemas.json");
  if (!fs.existsSync(schemasPath)) {
    return { ok: false, reason: "dataset-schemas.json not found" };
  }
  try {
    const schemas = JSON.parse(fs.readFileSync(schemasPath, "utf8"));
    const requiredTypes = [
      "molecular_properties",
      "clinical_trial_record",
      "genomic_variant",
      "protein_interaction",
      "pharmacovigilance_signal"
    ];
    for (const dtype of requiredTypes) {
      if (!schemas.dataset_types || !schemas.dataset_types[dtype]) {
        return { ok: false, reason: `Dataset type '${dtype}' not found in schemas` };
      }
      const schema = schemas.dataset_types[dtype];
      if (!schema.schema_version || !schema.schema_version.startsWith("phase29-")) {
        return { ok: false, reason: `Dataset type '${dtype}' schema_version must start with 'phase29-'` };
      }
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: `Failed to parse dataset-schemas.json: ${error.message}` };
  }
}

async function verifyPhase29StartupIntegrity(options = {}) {
  const logger = options.logger && typeof options.logger === "object" ? options.logger : { info() {}, warn() {}, error() {} };
  const rootDir = typeof options.rootDir === "string" && options.rootDir.trim() ? options.rootDir : process.cwd();
  const failures = [];

  for (const file of requiredFiles(rootDir)) {
    if (!fs.existsSync(file.abs)) {
      failures.push({ check: "required_file", file: file.rel, reason: "missing" });
    }
  }

  const registryCheck = verifyMethodRegistry(rootDir);
  if (!registryCheck.ok) {
    failures.push({ check: "method_registry", reason: registryCheck.reason });
  }

  const egressCheck = verifyEgressPolicy(rootDir);
  if (!egressCheck.ok) {
    failures.push({ check: "egress_policy", reason: egressCheck.reason });
  }

  const flagCheck = verifyFeatureFlag(rootDir);
  if (!flagCheck.ok) {
    failures.push({ check: "feature_flag", reason: flagCheck.reason });
  }

  const schemaCheck = verifyDatasetSchemas(rootDir);
  if (!schemaCheck.ok) {
    failures.push({ check: "dataset_schemas", reason: schemaCheck.reason });
  }

  const result = {
    healthy: failures.length === 0,
    failures
  };

  if (!result.healthy) {
    logger.error({ event: "phase29_startup_integrity_failed", failures });
    return result;
  }

  logger.info({ event: "phase29_startup_integrity_verified", checks: "all", healthy: true });
  return result;
}

module.exports = {
  verifyPhase29StartupIntegrity
};
