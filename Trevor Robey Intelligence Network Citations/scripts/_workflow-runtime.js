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
  // Hardening (F-SUB1): template IDs are simple slugs. Reject anything that
  // could escape templatesDir (path separators, "..", leading dot, etc.)
  // BEFORE building the path, then assert containment as defense-in-depth.
  if (typeof templateId !== "string" || !/^[a-z0-9][a-z0-9_-]*$/.test(templateId)) {
    const error = new Error(
      `Invalid workflow template id '${templateId}' (must match /^[a-z0-9][a-z0-9_-]*$/)`
    );
    error.code = "PHASE30_TEMPLATE_ID_INVALID";
    throw error;
  }
  const filePath = path.join(templatesDir, `${templateId}.json`);
  const resolvedDir = path.resolve(templatesDir);
  if (!path.resolve(filePath).startsWith(resolvedDir + path.sep)) {
    const error = new Error("Resolved template path escapes templates directory");
    error.code = "PHASE30_TEMPLATE_PATH_ESCAPE";
    throw error;
  }
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
  let toolUniverseMcp = null;
  try {
    const { createToolPrefetch } = require("../openclaw-bridge/core/tool-prefetch.js");
    const { createToolUniverseMcp } = require("../openclaw-bridge/mcp/tooluniverse-mcp/tooluniverse-mcp.js");
    const { createCtgovSupplemental } = require("../openclaw-bridge/mcp/ctgov-supplemental/ctgov-supplemental.js");
    // Resolve uv binary — it may not be on Node's PATH (e.g., /opt/homebrew/bin)
    let uvPath = "uv";
    const uvCandidates = ["/opt/homebrew/bin/uv", "/usr/local/bin/uv"];
    for (const candidate of uvCandidates) {
      if (fs.existsSync(candidate)) { uvPath = candidate; break; }
    }
    toolUniverseMcp = createToolUniverseMcp({
      logger,
      pythonPath: uvPath,
      toolUniverseDir: path.join(rootDir, "vendor", "tooluniverse")
    });
    // Slice 2: local corpora fetchers (ClinicalTrials.gov stop-reason archaeology) routed
    // through the prefetch's local-fetcher seam alongside ToolUniverse.
    const ctgovSupplemental = createCtgovSupplemental({ logger });
    // Slice 3 v2: the SAME instance backs both the prefetch local-fetcher and the workflow
    // engine's deliverable-assembly re-fetch, so the re-fetch is a session-cache hit (no extra
    // CT.gov round-trip) and the graveyard memo renders from the very records scout grounded on.
    researchRuntime.ctgovSupplemental = ctgovSupplemental;
    // Vault read-back: lets a role consult PRIOR RESEARCH already in the Obsidian vault
    // (`obsidian_prior_research`) through the same local-fetcher seam. Read-only by default —
    // `allowWrites` stays false so this can never double-write against Command Center's
    // autoGenerateNotes. Routed through the CANONICAL :8798 bridge, never a parallel listener
    // (root CLAUDE.md: ":8798 is the canonical vault access point").
    //
    // Fail-soft by construction: if Obsidian (and therefore the bridge) is closed — which is
    // normal when run-workflow.js is launched standalone from a terminal — every method returns
    // an empty result and the run continues with no prior-vault context.
    const { createObsidianBridgeMcp } = require("../openclaw-bridge/mcp/obsidian-bridge-mcp/index.js");
    const obsidianBridge = createObsidianBridgeMcp({ logger });
    researchRuntime.obsidianBridge = obsidianBridge;
    toolPrefetch = createToolPrefetch({
      toolUniverseMcp, logger, rootDir, timeProvider: options.timeProvider,
      localFetchers: {
        ctgov_stopped_trials: (args) => ctgovSupplemental.searchStoppedTrials(args),
        obsidian_prior_research: (args) => obsidianBridge.priorResearch(args)
      }
    });
    logger.info({ event: "tool_prefetch_initialized", uv_path: uvPath });
  } catch (err) {
    logger.warn({ event: "tool_prefetch_init_failed", error: err.message });
  }
  researchRuntime.toolPrefetch = toolPrefetch;
  // Slice 2: literature-integrity retraction checker (Crossref) used by the citation gate.
  try {
    const { createCrossrefRetraction } = require("../openclaw-bridge/mcp/crossref-retraction/crossref-retraction.js");
    researchRuntime.crossrefRetraction = createCrossrefRetraction({ logger });
  } catch (err) {
    logger.warn({ event: "crossref_retraction_init_failed", error: err.message });
  }
  // Companion PMID screen (PubMed). Crossref's `update-to` relation is absent on some older
  // retracted records, and PMID-only citations never reach the DOI screen at all — so the gate
  // screens both identifier classes. Fail-soft: an init failure just leaves the screen absent.
  try {
    const { createPubmedRetraction } = require("../openclaw-bridge/mcp/pubmed-retraction/pubmed-retraction.js");
    const ncbiApiKey = (researchRuntime.config && researchRuntime.config.ncbiApiKey) || process.env.NCBI_API_KEY || "";
    researchRuntime.pubmedRetraction = createPubmedRetraction({
      logger,
      contactEmail: (researchRuntime.config && researchRuntime.config.contactEmail) || undefined,
      ncbiApiKey,
      // Throttle every eutils request to NCBI's polite-use ceiling (3 req/sec anonymous, 10 with a
      // key) so the DOI→PMID escalation can't burst itself into a 429 storm that degrades the
      // retraction screen to INCOMPLETE. A small margin under the exact limit.
      minRequestIntervalMs: ncbiApiKey ? 110 : 350
    });
  } catch (err) {
    logger.warn({ event: "pubmed_retraction_init_failed", error: err.message });
  }

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
    loadWorkflowTemplate: (templateId) => loadWorkflowTemplate(rootDir, templateId),
    // Tear down spawned subprocesses (the ToolUniverse SMCP server and its 30s
    // health-check interval) so the caller can exit instead of hanging open with an
    // orphaned server. Idempotent and safe to call when ToolUniverse never started.
    shutdown() {
      try {
        if (toolUniverseMcp && typeof toolUniverseMcp.shutdown === "function") {
          toolUniverseMcp.shutdown();
          logger.info({ event: "workflow_runtime_shutdown", component: "tooluniverse-mcp" });
        }
      } catch (err) {
        logger.warn({ event: "workflow_runtime_shutdown_failed", error: err && err.message });
      }
    }
  };
}

module.exports = {
  buildWorkflowRuntime,
  loadWorkflowTemplate
};
