"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "audit", "evidence", "phase29");

fs.mkdirSync(outDir, { recursive: true });

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

async function main() {
  // ── Collect Phase 29 evidence ──

  const registry = require(path.join(root, "openclaw-bridge", "bridge", "mcp-method-registry.js"));
  const egress = require(path.join(root, "openclaw-bridge", "execution", "egress-policy.js"));
  const integrity = require(path.join(root, "security", "phase29-startup-integrity.js"));
  const config = JSON.parse(fs.readFileSync(path.join(root, "openclaw-bridge", "openclaw.json"), "utf8"));
  const schemas = JSON.parse(fs.readFileSync(path.join(root, "config", "dataset-schemas.json"), "utf8"));
  const templates = JSON.parse(fs.readFileSync(path.join(root, "config", "mission-templates.json"), "utf8"));
  const monetization = JSON.parse(fs.readFileSync(path.join(root, "config", "monetization-map.json"), "utf8"));
  const rbac = JSON.parse(fs.readFileSync(path.join(root, "security", "rbac-policy.json"), "utf8"));

  // Startup integrity check
  const integrityResult = await integrity.verifyPhase29StartupIntegrity({ rootDir: root });

  // Method registry snapshot
  const toolUniverseMethods = [
    "RESEARCH_FIND_TOOL",
    "RESEARCH_GET_TOOL_INFO",
    "RESEARCH_EXECUTE_TOOL",
    "RESEARCH_LIST_TOOLS",
    "RESEARCH_GREP_TOOLS"
  ].map(key => ({
    key,
    value: registry.MCP_METHODS[key] || null,
    registered: Boolean(registry.MCP_METHODS[key])
  }));

  // Egress policy snapshot
  const tuEgress = egress.TOOL_EGRESS_POLICIES && egress.TOOL_EGRESS_POLICIES["tooluniverse-mcp"];

  // Feature flag
  const flags = config.featureFlags || config.features || {};

  // Build evidence bundle
  const evidence = {
    phase: 29,
    title: "ToolUniverse Biomedical Research Integration",
    generated_at: new Date().toISOString(),
    startup_integrity: integrityResult,
    feature_flag: {
      ENABLE_TOOLUNIVERSE_MCP: flags.ENABLE_TOOLUNIVERSE_MCP || false
    },
    method_registry: toolUniverseMethods,
    egress_policy: {
      "tooluniverse-mcp": tuEgress || null
    },
    adapter_files: [
      "openclaw-bridge/mcp/tooluniverse-mcp/tooluniverse-mcp.js",
      "openclaw-bridge/mcp/tooluniverse-mcp/tu-process-manager.js",
      "openclaw-bridge/mcp/tooluniverse-mcp/tu-record-normalizer.js",
      "openclaw-bridge/mcp/tooluniverse-mcp/tu-schema.js"
    ].map(rel => ({
      path: rel,
      exists: fs.existsSync(path.join(root, rel))
    })),
    dataset_schemas_count: Array.isArray(schemas) ? schemas.length : Object.keys(schemas).length,
    mission_templates_count: Array.isArray(templates) ? templates.length : Object.keys(templates).length,
    monetization_products_count: Array.isArray(monetization) ? monetization.length : Object.keys(monetization).length,
    rbac_includes_tooluniverse: JSON.stringify(rbac).includes("tooluniverse"),
    submodule_present: fs.existsSync(path.join(root, "vendor", "tooluniverse", "README.md")) ||
                       fs.existsSync(path.join(root, "vendor", "tooluniverse", ".git")),
    boundary_invariants: [
      "No direct external tool execution from bridge server",
      "research_executeTool gated by operator role",
      "tooluniverse-mcp egress policy defaults to deny",
      "All ToolUniverse-sourced datasets default to review_required license",
      "Submodule pinned to specific commit"
    ]
  };

  writeJson(path.join(outDir, "phase29-evidence-bundle.json"), evidence);

  console.log(`Phase 29 evidence generated at ${outDir}/phase29-evidence-bundle.json`);
  console.log(`  Startup integrity: ${integrityResult.healthy ? "HEALTHY" : "UNHEALTHY"}`);
  console.log(`  Methods registered: ${toolUniverseMethods.filter(m => m.registered).length}/5`);
  console.log(`  Adapter files present: ${evidence.adapter_files.filter(f => f.exists).length}/4`);
  console.log(`  Feature flag: ${evidence.feature_flag.ENABLE_TOOLUNIVERSE_MCP}`);
  console.log(`  Submodule present: ${evidence.submodule_present}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
