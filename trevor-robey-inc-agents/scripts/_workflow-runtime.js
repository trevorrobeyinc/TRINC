"use strict";

const path = require("node:path");
const fs = require("node:fs");

const { buildResearchRuntime, createNoopLogger } = require("./_research-runtime.js");
const { buildMonetizationRuntime } = require("./_monetization-runtime.js");
const { createWorkflowEngine } = require("../openclaw-bridge/core/workflow-engine.js");

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

function loadWorkflowTemplate(rootDir, templateId) {
  const templatesDir = path.join(rootDir, "config", "workflow-templates");
  const filePath = path.join(templatesDir, `${templateId}.json`);
  const data = readJson(filePath, null);
  if (!data) {
    const available = [];
    if (fs.existsSync(templatesDir)) {
      for (const entry of fs.readdirSync(templatesDir)) {
        if (entry.endsWith(".json")) {
          available.push(entry.replace(/\.json$/, ""));
        }
      }
    }
    const error = new Error(
      `Workflow template '${templateId}' not found at ${filePath}` +
      (available.length > 0 ? `\nAvailable templates: ${available.join(", ")}` : "\nNo templates found in config/workflow-templates/")
    );
    error.code = "PHASE30_TEMPLATE_NOT_FOUND";
    throw error;
  }
  return data;
}

async function buildWorkflowRuntime(options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const logger = options.logger || createNoopLogger();

  const researchRuntime = await buildResearchRuntime({
    rootDir,
    logger,
    config: options.config || {},
    spawnerConfig: options.spawnerConfig || {},
    timeProvider: options.timeProvider
  });

  // WS1: Initialize ToolUniverse pre-fetch for live database queries during workflows
  let toolPrefetch = null;
  try {
    const { createToolPrefetch } = require("../openclaw-bridge/core/tool-prefetch.js");
    const { createToolUniverseMcp } = require("../openclaw-bridge/mcp/tooluniverse-mcp/tooluniverse-mcp.js");
    // Resolve uv binary — it may not be on Node's PATH (e.g., /opt/homebrew/bin)
    let uvPath = "uv";
    const uvCandidates = ["/opt/homebrew/bin/uv", "/usr/local/bin/uv"];
    for (const candidate of uvCandidates) {
      if (fs.existsSync(candidate)) { uvPath = candidate; break; }
    }
    const toolUniverseMcp = createToolUniverseMcp({
      logger,
      pythonPath: uvPath,
      toolUniverseDir: path.join(rootDir, "vendor", "tooluniverse")
    });
    toolPrefetch = createToolPrefetch({ toolUniverseMcp, logger, rootDir, timeProvider: options.timeProvider });
    logger.info({ event: "tool_prefetch_initialized", uv_path: uvPath });
  } catch (err) {
    logger.warn({ event: "tool_prefetch_init_failed", error: err.message });
  }
  researchRuntime.toolPrefetch = toolPrefetch;

  const monetizationRuntime = buildMonetizationRuntime({
    rootDir
  });

  const workflowEngine = createWorkflowEngine({
    researchRuntime,
    monetizationRuntime,
    logger,
    timeProvider: options.timeProvider
  });

  return {
    rootDir,
    logger,
    researchRuntime,
    monetizationRuntime,
    workflowEngine,
    loadWorkflowTemplate: (templateId) => loadWorkflowTemplate(rootDir, templateId)
  };
}

module.exports = {
  buildWorkflowRuntime,
  loadWorkflowTemplate
};
