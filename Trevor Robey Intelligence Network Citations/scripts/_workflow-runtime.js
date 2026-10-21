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
    // Trial Design Benchmark Pack: the comparable Phase 3 cohort with full structural fields.
    // Sibling of ctgovSupplemental and registered on BOTH seams for the same reason — the
    // competitive_intel_analyst prefetch and the workflow engine's post-gate deliverable render
    // share one instance, so the second call is a session-cache hit and the benchmark renders from
    // exactly the records the analyst was grounded on.
    const { createCtgovDesignBenchmark } = require("../openclaw-bridge/mcp/ctgov-supplemental/ctgov-design-benchmark.js");
    const ctgovDesignBenchmark = createCtgovDesignBenchmark({ logger });
    researchRuntime.ctgovDesignBenchmark = ctgovDesignBenchmark;
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
    // Research memory (2026-09-22, plan D5): cross-run priors from the Qdrant-backed pack store
    // (Claude/trevorobeyinc-research-memory-mcp, via the :6433 HTTPS proxy). Thin client of that
    // package's CLI — no listener, no embedding code here. CONTEXT ONLY like the vault read-back.
    // Both jobs (ingest after a run, priors before the synthesizer) are recorded skips while
    // config/vault-publish.json researchMemory.enabled is false (on since 2026-09-22). Every spawn
    // runs the store offline (EMBED_ALLOW_REMOTE=0), so a run can never download the embedding
    // model — that stays the operator's one-time `--allow-remote-model` ingest.
    const { createResearchMemory } = require("../openclaw-bridge/mcp/research-memory-mcp/index.js");
    const researchMemory = createResearchMemory({ rootDir, logger });
    researchRuntime.researchMemory = researchMemory;
    // Viz Studio (:8800, trinc-viz-studio plugin): local visualization rendering — charts,
    // mermaid, sanitized SVG, Canvas boards, vault link-graph snapshots. DELIBERATELY NOT in
    // localFetchers below: engine LLM roles have no mid-run tool loop, and viz content injected
    // into prompts could carry PMID/NCT/DOI-shaped text into the citation gate's grounded-id
    // extraction. Deterministic post-gate deliverable code consumes it instead (like
    // ctgovSupplemental), calling chart()/mermaid()/renderSvg() with returnContent — and bundle
    // assets must stay SVG (the packager hashes shipped files as UTF-8 text; PNG would corrupt).
    // Fail-soft like every sibling: a closed Obsidian degrades to { ok: false }, never a throw.
    const { createVizBridgeMcp } = require("../openclaw-bridge/mcp/viz-bridge-mcp/index.js");
    researchRuntime.vizBridge = createVizBridgeMcp({ logger });
    // Open Targets Platform (GraphQL). Closes the registry's only HIGH-priority adapter gap —
    // it was claude-host-mcp only, therefore unreachable from this subprocess. Both entry
    // points return records carrying `chemblId` / `pmid`, so their evidence lands in
    // fetched_citation_ids and raises the grounded-citation ratio instead of only adding prose.
    // Fail-soft: a GraphQL/network error returns [] and the run continues.
    const { createOpenTargetsGraphql } = require("../openclaw-bridge/mcp/open-targets-graphql/open-targets-graphql.js");
    const openTargets = createOpenTargetsGraphql({ logger });
    researchRuntime.openTargets = openTargets;
    // SEC EDGAR full-text (2026-09-19). Closes a gap the GRADING layer already anticipated:
    // gate.config.js has listed sec.gov in primary_source_domains since 2026-07-07, but nothing
    // fetched it and ToolUniverse has zero SEC coverage. Supplies a signal no biomedical database
    // carries — a public company's own disclosure of a discontinuation or failed program.
    // CONTEXT-ONLY: accession numbers are not in citation-extractor.js's grammar (every pattern
    // there needs a literal prefix), so these records cannot enter the grounded-ratio denominator
    // and cannot reach the Stage-3 re-resolver. Fail-soft: any error returns [].
    const { createSecEdgar } = require("../openclaw-bridge/mcp/sec-edgar/sec-edgar.js");
    const secEdgar = createSecEdgar({ logger });
    researchRuntime.secEdgar = secEdgar;
    // NIH RePORTER (2026-09-19). Zero ToolUniverse coverage; answers who funds work in an
    // indication, where, and at what scale. Context-only for the same reason as secEdgar.
    const { createNihReporter } = require("../openclaw-bridge/mcp/nih-reporter/nih-reporter.js");
    const nihReporter = createNihReporter({ logger });
    researchRuntime.nihReporter = nihReporter;
    // Preprint lane (2026-09-19). Closes the registry's biorxiv-medrxiv gap: bioRxiv's own API
    // has no keyword search, so a bioRxiv-specific fetcher cannot serve a topical prefetch;
    // Europe PMC indexes the same preprints and is keyword-searchable. This is a fetcher rather
    // than a prefetch-map line because a query template with a literal "AND SRC:PPR" tail is
    // never empty, which defeats BOTH tool-prefetch's empty-args skip guard and its topic
    // fallback. Unlike secEdgar/nihReporter these records are DOI-bearing and DO feed the gate.
    const { createEuropePmcPreprints } = require("../openclaw-bridge/mcp/europepmc-preprints/europepmc-preprints.js");
    const europePmcPreprints = createEuropePmcPreprints({ logger });
    researchRuntime.europePmcPreprints = europePmcPreprints;
    // Business research lane (2026-10-21, core/research-profiles.js). Four sources that make a
    // NON-biomedical question groundable: web pages read and stored as content-addressed snapshots
    // (WEB ids), SEC filings rendered citable (SEC ids), World Bank indicators (WB ids) and
    // OpenAlex works (DOIs). They are reached only through config/tool-prefetch-map.business.json,
    // so no biomedical template ever calls them. The snapshot store is also handed to the
    // re-resolver (workflow-engine.js), which re-reads and re-hashes every cited WEB snapshot.
    const { createWebSnapshotStore } = require("../openclaw-bridge/mcp/business-sources/web-snapshot-store.js");
    const { createWebEvidence } = require("../openclaw-bridge/mcp/business-sources/web-evidence.js");
    const { createSecFilings } = require("../openclaw-bridge/mcp/business-sources/sec-filings.js");
    const { createWorldBank } = require("../openclaw-bridge/mcp/business-sources/world-bank.js");
    const { createOpenAlex } = require("../openclaw-bridge/mcp/business-sources/openalex.js");
    const timeSource = (options.timeProvider && typeof options.timeProvider.nowIso === "function")
      ? options.timeProvider
      : require("../openclaw-bridge/core/time-provider.js");
    const webSnapshotStore = createWebSnapshotStore({ rootDir, nowIso: () => timeSource.nowIso() });
    researchRuntime.webSnapshotStore = webSnapshotStore;
    const webEvidence = createWebEvidence({ logger, snapshotStore: webSnapshotStore });
    const secFilings = createSecFilings({ logger, secEdgar });
    const worldBank = createWorldBank({ logger });
    const openAlex = createOpenAlex({ logger });
    toolPrefetch = createToolPrefetch({
      toolUniverseMcp, logger, rootDir, timeProvider: options.timeProvider,
      localFetchers: {
        // PROMPT PATH ONLY. Forced census:false AND an independently clamped pageSize, so no edit
        // to config/tool-prefetch-map.json can push a census — or a 1000-record page — into an
        // agent prompt. The two clamps are separate on purpose: `census` governs the walk,
        // `pageSize` governs the page, and constraining only the flag would still let a
        // prefetch-map edit request 1000 records in one page (measured: ~228 KB / ~57K tokens,
        // ~18% of the documented ~320K clinical-trial budget from one sub-source).
        ctgov_stopped_trials: (args) => ctgovSupplemental.searchStoppedTrials({
          ...(args || {}),
          census: false,
          pageSize: Math.min(Number((args || {}).pageSize) || 8, 50)
        }),
        ctgov_design_benchmark: (args) => ctgovDesignBenchmark.searchDesignCohort(args),
        obsidian_prior_research: (args) => obsidianBridge.priorResearch(args),
        research_memory_priors: (args) => researchMemory.searchPriors({
          ...(args || {}),
          limit: Math.min(Number((args || {}).limit) || 5, 10)
        }),
        opentargets_target_intel: (args) => openTargets.targetIntel(args),
        opentargets_disease_intel: (args) => openTargets.diseaseIntel(args),
        // Both fetchers already clamp internally; the seam clamps AGAIN on the same
        // defence-in-depth principle as ctgov_stopped_trials above — a prefetch-map edit alone
        // must not be able to widen how much a source can push into an agent prompt.
        sec_edgar_disclosures: (args) => secEdgar.searchDisclosures({
          ...(args || {}),
          limit: Math.min(Number((args || {}).limit) || 8, 25)
        }),
        nih_reporter_funding: (args) => nihReporter.searchFunding({
          ...(args || {}),
          limit: Math.min(Number((args || {}).limit) || 6, 25)
        }),
        europepmc_preprints: (args) => europePmcPreprints.searchPreprints({
          ...(args || {}),
          limit: Math.min(Number((args || {}).limit) || 6, 25)
        }),
        // Business lane — clamped again at the seam, same principle as above.
        web_evidence: (args) => webEvidence.searchAndRead({
          ...(args || {}),
          pages: Math.min(Number((args || {}).pages) || 5, 10)
        }),
        sec_filings_citable: (args) => secFilings.searchCitable({
          ...(args || {}),
          limit: Math.min(Number((args || {}).limit) || 8, 25)
        }),
        worldbank_indicators: (args) => worldBank.latestIndicators(args),
        openalex_works: (args) => openAlex.searchWorks({
          ...(args || {}),
          limit: Math.min(Number((args || {}).limit) || 8, 25)
        })
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

  // An injected clock reaches the monetization components too; with none, buildMonetizationRuntime
  // supplies the real one (it stamps `approved_at` and the dataset build dates), as
  // buildResearchRuntime does above for the research components (supervisor breaker, task metadata,
  // interaction log).
  const monetizationRuntime = buildMonetizationRuntime({
    rootDir,
    timeProvider: options.timeProvider
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
