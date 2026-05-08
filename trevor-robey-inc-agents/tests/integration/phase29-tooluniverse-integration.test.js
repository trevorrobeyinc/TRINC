"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

const root = path.resolve(__dirname, "../..");

// ── MCP service wiring tests ──

test("mcp-service.js imports and instantiates ToolUniverseMcp", () => {
  const content = fs.readFileSync(path.join(root, "openclaw-bridge", "mcp", "mcp-service.js"), "utf8");
  assert.ok(content.includes("createToolUniverseMcp"), "must import createToolUniverseMcp");
  assert.ok(content.includes('tooluniverse: createToolUniverseMcp'), "must instantiate tooluniverse module");
  assert.ok(content.includes('"tooluniverse"'), "must include tooluniverse in RESEARCH_PROVIDERS");
});

test("mcp-service.js handles all five ToolUniverse methods", () => {
  const content = fs.readFileSync(path.join(root, "openclaw-bridge", "mcp", "mcp-service.js"), "utf8");
  assert.ok(content.includes("RESEARCH_FIND_TOOL"), "must handle RESEARCH_FIND_TOOL");
  assert.ok(content.includes("RESEARCH_GET_TOOL_INFO"), "must handle RESEARCH_GET_TOOL_INFO");
  assert.ok(content.includes("RESEARCH_EXECUTE_TOOL"), "must handle RESEARCH_EXECUTE_TOOL");
  assert.ok(content.includes("RESEARCH_LIST_TOOLS"), "must handle RESEARCH_LIST_TOOLS");
  assert.ok(content.includes("RESEARCH_GREP_TOOLS"), "must handle RESEARCH_GREP_TOOLS");
});

test("mcp-service.js gates research_executeTool behind operator role", () => {
  const content = fs.readFileSync(path.join(root, "openclaw-bridge", "mcp", "mcp-service.js"), "utf8");
  // Find the RESEARCH_EXECUTE_TOOL handler section and verify assertOperatorRole is called
  const executeToolIdx = content.indexOf("RESEARCH_EXECUTE_TOOL");
  assert.ok(executeToolIdx > 0, "must handle RESEARCH_EXECUTE_TOOL");
  const handlerSection = content.slice(executeToolIdx, executeToolIdx + 300);
  assert.ok(handlerSection.includes("assertOperatorRole"), "executeTool must be gated by assertOperatorRole");
});

// ── Method registry integration tests ──

test("mcp-method-registry.js contains all ToolUniverse methods", () => {
  const registry = require(path.join(root, "openclaw-bridge", "bridge", "mcp-method-registry.js"));
  assert.ok(registry.MCP_METHODS.RESEARCH_FIND_TOOL, "must define RESEARCH_FIND_TOOL");
  assert.ok(registry.MCP_METHODS.RESEARCH_GET_TOOL_INFO, "must define RESEARCH_GET_TOOL_INFO");
  assert.ok(registry.MCP_METHODS.RESEARCH_EXECUTE_TOOL, "must define RESEARCH_EXECUTE_TOOL");
  assert.ok(registry.MCP_METHODS.RESEARCH_LIST_TOOLS, "must define RESEARCH_LIST_TOOLS");
  assert.ok(registry.MCP_METHODS.RESEARCH_GREP_TOOLS, "must define RESEARCH_GREP_TOOLS");
});

test("mcp-method-registry.js aliases resolve to underscore form", () => {
  const registry = require(path.join(root, "openclaw-bridge", "bridge", "mcp-method-registry.js"));
  assert.equal(registry.normalizeMcpMethodName("research.findTool"), "research_findTool");
  assert.equal(registry.normalizeMcpMethodName("research.getToolInfo"), "research_getToolInfo");
  assert.equal(registry.normalizeMcpMethodName("research.executeTool"), "research_executeTool");
  assert.equal(registry.normalizeMcpMethodName("research.listTools"), "research_listTools");
  assert.equal(registry.normalizeMcpMethodName("research.grepTools"), "research_grepTools");
});

test("research_executeTool is in operator allowlist", () => {
  const content = fs.readFileSync(path.join(root, "openclaw-bridge", "bridge", "mcp-method-registry.js"), "utf8");
  // The operator allowlist must include executeTool for external API gating
  assert.ok(content.includes("research_executeTool"), "research_executeTool must be registered");
});

// ── ToolUniverse MCP adapter contract tests ──

test("tooluniverse-mcp.js exports ToolUniverseMcp class and factory", () => {
  const tuMcp = require(path.join(root, "openclaw-bridge", "mcp", "tooluniverse-mcp", "tooluniverse-mcp.js"));
  assert.ok(typeof tuMcp.ToolUniverseMcp === "function", "must export ToolUniverseMcp class");
  assert.ok(typeof tuMcp.createToolUniverseMcp === "function", "must export createToolUniverseMcp factory");
});

test("tu-process-manager.js exports createToolUniverseProcessManager and MCP helpers", () => {
  const pm = require(path.join(root, "openclaw-bridge", "mcp", "tooluniverse-mcp", "tu-process-manager.js"));
  assert.ok(typeof pm.createToolUniverseProcessManager === "function", "must export factory function");
  assert.ok(typeof pm.unwrapMcpToolResult === "function", "must export unwrapMcpToolResult");
  assert.equal(typeof pm.MCP_PROTOCOL_VERSION, "string", "must export MCP_PROTOCOL_VERSION");
});

test("tu-record-normalizer.js exports normalizeToolRecord and normalizeToolList", () => {
  const norm = require(path.join(root, "openclaw-bridge", "mcp", "tooluniverse-mcp", "tu-record-normalizer.js"));
  assert.ok(typeof norm.normalizeToolRecord === "function", "must export normalizeToolRecord");
  assert.ok(typeof norm.normalizeToolList === "function", "must export normalizeToolList");
});

test("tu-schema.js exports ToolUniverseInputSchema and MCP schemas", () => {
  const schema = require(path.join(root, "openclaw-bridge", "mcp", "tooluniverse-mcp", "tu-schema.js"));
  assert.ok(schema.ToolUniverseInputSchema, "must export ToolUniverseInputSchema");
  assert.ok(typeof schema.ToolUniverseInputSchema.safeParse === "function", "schema must have safeParse");
  assert.ok(schema.McpToolCallResultSchema, "must export McpToolCallResultSchema");
  assert.ok(schema.McpInitializeResultSchema, "must export McpInitializeResultSchema");
});

// ── Egress policy tests ──

test("egress-policy.js includes tooluniverse-mcp with deny-all", () => {
  const policy = require(path.join(root, "openclaw-bridge", "execution", "egress-policy.js"));
  const tuPolicy = policy.TOOL_EGRESS_POLICIES && policy.TOOL_EGRESS_POLICIES["tooluniverse-mcp"];
  assert.ok(tuPolicy, "must define tooluniverse-mcp egress policy");
  assert.equal(tuPolicy.defaultAction, "deny", "tooluniverse-mcp must default to deny");
});

// ── RBAC policy tests ──

test("rbac-policy.json includes tooluniverse integration role", () => {
  const rbac = JSON.parse(fs.readFileSync(path.join(root, "security", "rbac-policy.json"), "utf8"));
  const roles = rbac.roles || rbac;
  const hasToolUniverseRole = JSON.stringify(roles).includes("tooluniverse");
  assert.ok(hasToolUniverseRole, "RBAC policy must include tooluniverse role or permission");
});

// ── Feature flag tests ──

test("openclaw.json has ENABLE_TOOLUNIVERSE_MCP feature flag", () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, "openclaw-bridge", "openclaw.json"), "utf8"));
  const flags = config.featureFlags || config.features || {};
  assert.equal(flags.ENABLE_TOOLUNIVERSE_MCP, true, "feature flag must be enabled");
});

// ── Config integration tests ──

test("dataset-schemas.json includes all five biomedical schemas", () => {
  const schemas = JSON.parse(fs.readFileSync(path.join(root, "config", "dataset-schemas.json"), "utf8"));
  const schemaNames = Array.isArray(schemas) ? schemas.map(s => s.name || s.id) : Object.keys(schemas);
  const schemaStr = JSON.stringify(schemas);
  assert.ok(schemaStr.includes("molecular_properties"), "must include molecular_properties schema");
  assert.ok(schemaStr.includes("clinical_trial_record"), "must include clinical_trial_record schema");
  assert.ok(schemaStr.includes("genomic_variant"), "must include genomic_variant schema");
  assert.ok(schemaStr.includes("protein_interaction"), "must include protein_interaction schema");
  assert.ok(schemaStr.includes("pharmacovigilance_signal"), "must include pharmacovigilance_signal schema");
});

test("mission-templates.json includes all six biomedical templates", () => {
  const templates = JSON.parse(fs.readFileSync(path.join(root, "config", "mission-templates.json"), "utf8"));
  const templateStr = JSON.stringify(templates);
  assert.ok(templateStr.includes("biomedical_drug_discovery"), "must include drug discovery template");
  assert.ok(templateStr.includes("biomedical_target_identification"), "must include target ID template");
  assert.ok(templateStr.includes("clinical_trial_intelligence"), "must include clinical trial template");
  assert.ok(templateStr.includes("pharmacovigilance_scan"), "must include pharmacovigilance template");
  assert.ok(templateStr.includes("genomic_variant_analysis"), "must include genomic variant template");
  assert.ok(templateStr.includes("rare_disease_landscape"), "must include rare disease template");
});

test("monetization-map.json includes biomedical product lines", () => {
  const monetization = JSON.parse(fs.readFileSync(path.join(root, "config", "monetization-map.json"), "utf8"));
  const monStr = JSON.stringify(monetization);
  assert.ok(monStr.includes("biomedical") || monStr.includes("drug_discovery") || monStr.includes("clinical"),
    "must include biomedical monetization product lines");
});

// ── Startup integrity tests ──

test("phase29-startup-integrity.js verifies required files", async () => {
  const integrity = require(path.join(root, "security", "phase29-startup-integrity.js"));
  assert.ok(typeof integrity.verifyPhase29StartupIntegrity === "function", "must export verification function");

  const result = await integrity.verifyPhase29StartupIntegrity({ rootDir: root });
  assert.ok(result, "must return a result");
  assert.equal(result.healthy, true, `startup integrity must be healthy, failures: ${JSON.stringify(result.failures || [])}`);
});
