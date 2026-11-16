"use strict";

// workflow-vault-publisher.js — engine-owned write of a completed, gate-PASSING workflow into the
// Obsidian vault (2026-09-22, Obsidian re-integration plan, decisions D1-A / D2 / D3).
//
// WHY THIS EXISTS. Until 2026-09-22 the engine had no vault-write path at all. The only writer was
// the Command Center plugin's autoGenerateNotes, which fires only for a run the plugin itself
// dispatched, only while Obsidian is open, and only on completion — a combination that had never
// occurred in the live vault (no `OpenClaw/` folder existed). A headless `run-workflow.js` run — the
// lane the engine actually completes on — wrote nothing.
//
// ONE SCHEME, ONE OWNER PER RUN. This module writes the SAME folder scheme the plugin uses
// (`<vaultOutputFolder>/<template_id>/<YYYY-MM-DD> <input label>/`, same note names, same
// frontmatter keys — see Claude/obsidian-command-center/src/notes/{note-generator,frontmatter,
// content-builder}.ts) so there is exactly one tree in the vault. It records what it wrote in the
// run's workflow.json (`artifacts.vault_notes`); the plugin reads that record and REHYDRATES its
// enrichment stages from it instead of writing a second time. The dormant `Research-Output/`
// scheme (bridge `research_publish`, scripts/publish-to-vault.js) is tombstoned, not used.
//
// TRANSPORT. A guarded direct filesystem write — the same mechanism the :8798 bridge's own
// researchPublish.ts uses (path guard + allow-listed vault root). No listener, no bridge, never the
// Local REST API on :27124. Root CLAUDE.md's "no alternative vault bridges" rule is about bridges;
// this opens none. Reading confirmed by the operator 2026-09-22 (plan decision D1).
//
// GATES. Writes only when the run is `completed`, its citation verification is PASS, and no agent
// in the run used the mock provider. Everything else is a RECORDED SKIP, never a throw: the vault is
// the operator's knowledge base and what Copilot answers from, so a failed, UNVERIFIED or mock run
// must never land there. An absent vault (unmounted, other machine) is also a skip — a research run
// never fails because of a note.
//
// RESTRICTED GLOBALS. Dates come from the workflow state (ISO strings the engine's own
// time-provider wrote) and from an injected timeProvider; nothing here reads the wall clock.

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const defaultTimeProvider = require("../core/time-provider.js");
const { CUSTOMER_RUN_PUBLISH_BLOCK } = require("../core/customer-run.js");

const CONFIG_REL = path.join("config", "vault-publish.json");
const OVERVIEW_NAME = "Overview";
const QUALITY_NAME = "Quality Audit";
const DATASET_NAME = "Dataset Card";

const STEP_TYPE_LABELS = Object.freeze({
  mission: "Research",
  quality_audit: "Quality Audit",
  dataset: "Build Dataset",
  offer: "Package Offer",
  approve: "Approve Release",
  export: "Export"
});

const DEFAULT_CONFIG = Object.freeze({
  enabled: false,
  vaultRoot: "",
  allowedVaultRoots: [],
  vaultOutputFolder: "OpenClaw",
  requireCitationPass: true,
  deliverables: ["citation-integrity", "graveyard-memo", "search-coverage", "reproducibility-manifest"]
});

// ── helpers shared with the plugin (ported 1:1 from its TypeScript) ───────────────────────────

function sanitizeFolderName(name) {
  return String(name || "")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

function capitalize(s) {
  const str = String(s || "");
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function titleFromSlug(slug) {
  return String(slug || "")
    .split(/[-_]+/)
    .filter(Boolean)
    .map(capitalize)
    .join(" ");
}

/**
 * Vault folder for a run's notes — byte-for-byte the plugin's `computeNotesFolderPath`:
 *   `${vaultOutputFolder}/${template_id}/${created_at as YYYY-MM-DD (UTC)} ${first two inputs}`
 * The plugin derives the date by constructing a Date from created_at and taking its ISO string;
 * `msToIso(Date.parse())` is the same UTC conversion without the restricted constructor. Pinned
 * by a fixture test against the plugin's formula.
 */
function computeNotesFolderPath(state, vaultOutputFolder, timeProvider = defaultTimeProvider) {
  const createdMs = Date.parse(String(state && state.created_at ? state.created_at : ""));
  if (!Number.isFinite(createdMs)) {
    const error = new Error("workflow state has no parseable created_at — cannot derive the notes folder");
    error.code = "VAULT_PUBLISH_BAD_STATE";
    throw error;
  }
  const iso = (timeProvider && typeof timeProvider.msToIso === "function" ? timeProvider : defaultTimeProvider).msToIso(createdMs);
  const dateStr = String(iso).slice(0, 10);
  const inputLabel = sanitizeFolderName(
    Object.values((state && state.inputs) || {}).slice(0, 2).join(" ")
  );
  return `${vaultOutputFolder}/${state.template_id}/${dateStr} ${inputLabel}`;
}

function renderYamlLine(key, value, indent = 0) {
  const prefix = "  ".repeat(indent);
  if (value === null || value === undefined) return `${prefix}${key}: null`;
  if (typeof value === "boolean" || typeof value === "number") return `${prefix}${key}: ${value}`;
  if (typeof value === "string") {
    if (value.startsWith('"[[')) return `${prefix}${key}: ${value}`;
    if (value.includes(":") || value.includes("#") || value.includes('"')) {
      return `${prefix}${key}: "${value.replace(/"/g, '\\"')}"`;
    }
    return `${prefix}${key}: ${value}`;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return `${prefix}${key}: []`;
    return `${prefix}${key}:\n${value.map((v) => `${prefix}  - ${v}`).join("\n")}`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value).map(([k, v]) => renderYamlLine(k, v, indent + 1)).join("\n");
    return `${prefix}${key}:\n${entries}`;
  }
  return `${prefix}${key}: ${String(value)}`;
}

function renderYaml(fields) {
  const lines = ["---"];
  for (const [key, value] of Object.entries(fields)) lines.push(renderYamlLine(key, value));
  lines.push("---");
  return lines.join("\n");
}

function buildTags(state) {
  const tags = ["openclaw", String(state.template_id || "").replace(/-/g, "_")];
  for (const val of Object.values(state.inputs || {})) {
    if (typeof val === "string" && val.length < 40 && !val.includes("/")) {
      tags.push(val.toLowerCase().replace(/\s+/g, "_"));
    }
  }
  return tags;
}

function summarizeCitationIntegrity(cv) {
  if (!cv || typeof cv.cited !== "number") return null;
  const cited = cv.cited || 0;
  const grounded = cv.grounded || 0;
  const ratio = typeof cv.grounded_ratio === "number" ? cv.grounded_ratio : cited > 0 ? grounded / cited : 0;
  const floor = typeof cv.min_grounded_ratio === "number" ? cv.min_grounded_ratio : 0.75;
  return {
    verdict: cv.verdict || (cv.pass ? "PASS" : "FAIL"),
    ok: cv.pass === true,
    cited,
    grounded,
    ungrounded: typeof cv.ungrounded === "number" ? cv.ungrounded : Math.max(0, cited - grounded),
    groundedPct: Math.round(ratio * 100),
    floorPct: Math.round(floor * 100),
    retracted: Array.isArray(cv.retracted) ? cv.retracted.length : 0
  };
}

function stepStatusIcon(status) {
  switch (status) {
    case "completed": return "✓";
    case "running": return "○";
    case "failed": return "✗";
    default: return "•";
  }
}

// sanitizeForVault — strips infrastructure noise from raw agent output (code blocks, ToolUniverse
// source lines, retrieval timestamps, handoff boilerplate, live-data summary tables) while keeping
// findings, citations and analysis. Same rules as the plugin's content-builder.ts.
function collapseCodeBlocks(lines) {
  const result = [];
  let i = 0;
  while (i < lines.length) {
    if (/^```/.test(lines[i])) {
      const block = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i])) { block.push(lines[i]); i += 1; }
      if (i < lines.length) i += 1;
      if (block.length > 0 && block.length < 5) for (const bl of block) result.push(`> ${bl}`);
    } else {
      result.push(lines[i]);
      i += 1;
    }
  }
  return result;
}

function stripTrailingHandoff(lines) {
  let end = lines.length;
  while (end > 0) {
    const trimmed = lines[end - 1].trim();
    if (trimmed === "" || trimmed === "---") { end -= 1; continue; }
    if (trimmed.startsWith("*") && trimmed.endsWith("*") && /handoff|output complete|hand off/i.test(trimmed)) {
      end -= 1;
      continue;
    }
    break;
  }
  return lines.slice(0, end);
}

function stripSection(lines, headerPattern) {
  const result = [];
  let skipping = false;
  let skipLevel = 0;
  for (const line of lines) {
    const headerMatch = line.match(/^(#+)\s/);
    if (skipping) {
      if (headerMatch && headerMatch[1].length <= skipLevel) { skipping = false; result.push(line); }
    } else if (headerPattern.test(line) && headerMatch) {
      skipping = true;
      skipLevel = headerMatch[1].length;
    } else {
      result.push(line);
    }
  }
  return result;
}

function stripScoutToolCatalog(lines) {
  const result = [];
  let inNumbered = false;
  let level = 0;
  for (const line of lines) {
    const headerMatch = line.match(/^(#+)\s/);
    if (inNumbered) {
      if (headerMatch && headerMatch[1].length <= level) {
        if (/^#+\s*\d+\./.test(line)) continue;
        inNumbered = false;
        result.push(line);
      }
    } else if (headerMatch && /^#+\s*\d+\.\s/.test(line)) {
      inNumbered = true;
      level = headerMatch[1].length;
    } else {
      result.push(line);
    }
  }
  return result;
}

function sanitizeForVault(content, role) {
  let lines = String(content || "").split("\n");
  lines = collapseCodeBlocks(lines);
  lines = lines.filter((l) => !/^\*\*Source\*\*:\s*ToolUniverse/i.test(l) && !/^\*\*Source\*\*:.*findTool-/i.test(l));
  lines = lines.map((l) => l.replace(/\s*\(Retrieved:\s*\d{4}-\d{2}-\d{2}T[\d:]+Z\)/g, ""));
  lines = stripTrailingHandoff(lines);
  lines = stripSection(lines, /^#+\s*\d*\.?\s*Live Data Source Summary/i);
  if (role === "scout") lines = stripScoutToolCatalog(lines);
  const result = [];
  let blankRun = 0;
  for (const line of lines) {
    if (line.trim() === "") { blankRun += 1; if (blankRun <= 2) result.push(line); }
    else { blankRun = 0; result.push(line); }
  }
  return result.join("\n").trim();
}

function extractRoleFromAgentId(agentId) {
  const parts = String(agentId || "").split(":");
  return parts.length >= 2 ? parts[parts.length - 2] : "unknown";
}

// ── filesystem helpers ────────────────────────────────────────────────────────────────────────

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function sha256(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Resolve + validate the vault root: must exist, be a directory, and be allow-listed. */
function resolveVaultRoot(vaultRoot, allowedVaultRoots) {
  const wanted = String(vaultRoot || "").trim();
  if (!wanted) return { ok: false, reason: "no vaultRoot configured" };
  let real;
  try {
    real = fs.realpathSync(wanted);
  } catch {
    return { ok: false, reason: `vault root not present: ${wanted}` };
  }
  let stat;
  try {
    stat = fs.statSync(real);
  } catch {
    return { ok: false, reason: `vault root not readable: ${wanted}` };
  }
  if (!stat.isDirectory()) return { ok: false, reason: `vault root is not a directory: ${wanted}` };
  const allowed = (Array.isArray(allowedVaultRoots) ? allowedVaultRoots : []).map((p) => {
    try { return fs.realpathSync(String(p)); } catch { return path.resolve(String(p)); }
  });
  if (!allowed.includes(real)) {
    return { ok: false, reason: `vault root is not in allowedVaultRoots: ${wanted}`, refused: true };
  }
  return { ok: true, real };
}

/**
 * Path guard — the same contract as the bridge's guardVaultRelativePath: relative only, no `..`
 * segments, never inside `.obsidian/`, and the resolved absolute path must stay under the root.
 */
function guardVaultRelativePath(vaultRootReal, relPath) {
  const rel = String(relPath || "");
  if (!rel || path.isAbsolute(rel) || /^[a-zA-Z]:[\\/]/.test(rel)) {
    throw withCode(new Error(`vault path must be relative: ${rel}`), "VAULT_PUBLISH_PATH_REFUSED");
  }
  const segments = rel.split(/[\\/]+/);
  if (segments.some((s) => s === "..") || segments[0] === ".obsidian") {
    throw withCode(new Error(`vault path refused: ${rel}`), "VAULT_PUBLISH_PATH_REFUSED");
  }
  const absolutePath = path.resolve(vaultRootReal, rel);
  if (absolutePath !== vaultRootReal && !absolutePath.startsWith(vaultRootReal + path.sep)) {
    throw withCode(new Error(`vault path escapes the vault root: ${rel}`), "VAULT_PUBLISH_PATH_REFUSED");
  }
  return { absolutePath, relativePath: segments.join("/") };
}

function withCode(error, code) {
  error.code = code;
  return error;
}

function readFrontmatterValue(file, key) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
  if (!text.startsWith("---")) return null;
  const end = text.indexOf("\n---", 3);
  if (end < 0) return null;
  const block = text.slice(3, end);
  const match = block.match(new RegExp(`^${key}:\\s*"?([^"\\n]*)"?\\s*$`, "m"));
  return match ? match[1].trim() : null;
}

function atomicWriteJson(file, value) {
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(tmp, file);
}

// ── run assessment (shared with the research-memory ingest) ─────────────────────────────────

/** Every agent's role, provider, model, token count and raw output for a mission — the plugin's readAgentData. */
function readAgentDataFrom(rootDir, missionId) {
  if (!missionId) return [];
  const missionsDir = path.join(rootDir, "workspace", "missions");
  const researchOutputDir = path.join(rootDir, "workspace", "research-output");
  const status = readJson(path.join(missionsDir, missionId, "status.json"));
  if (!status) return [];
  const subtasks = Array.isArray(status.subtask_results) ? status.subtask_results
    : Array.isArray(status.subtasks) ? status.subtasks : [];
  const results = [];
  for (const subtask of subtasks) {
    if (!isPlainObject(subtask)) continue;
    const taskId = String(subtask.task_id || subtask.subtask_id || "");
    let content = "";
    const outputPath = subtask.output_path && fs.existsSync(subtask.output_path)
      ? subtask.output_path
      : taskId && fs.existsSync(path.join(researchOutputDir, taskId, "output.md"))
        ? path.join(researchOutputDir, taskId, "output.md")
        : null;
    if (outputPath) content = fs.readFileSync(outputPath, "utf8");
    const metadataPath = subtask.metadata_path && fs.existsSync(subtask.metadata_path)
      ? subtask.metadata_path
      : taskId ? path.join(researchOutputDir, taskId, "metadata.json") : null;
    const metadata = metadataPath ? readJson(metadataPath) : null;
    const role =
      (metadata && metadata.role) ||
      (metadata && metadata.task_definition && metadata.task_definition.role) ||
      subtask.role ||
      extractRoleFromAgentId(subtask.agent_id);
    results.push({
      role: role || "unknown",
      agentId: String(subtask.agent_id || ""),
      taskId,
      outputPath: outputPath || null,
      provider: String((metadata && metadata.provider) || subtask.provider || "unknown"),
      model: String((metadata && metadata.model) || subtask.model || "unknown"),
      tokenCount: Number((metadata && metadata.token_count) || subtask.token_count || 0),
      content
    });
  }
  const order = { scout: 0, analyst: 1, synthesizer: 2 };
  results.sort((a, b) => (order[a.role] ?? 99) - (order[b.role] ?? 99));
  return results;
}

/** Why a run must not leave the workspace (vault note, memory pack), or null when it may. */
function assessShippability(state, agentData, cfg = {}) {
  // First, whatever its status: a customer run never leaves the workspace (core/customer-run.js).
  // This one check covers the engine's post-run publish and ingest, `publish-workflow-to-vault.js
  // --all`, `research-memory.js ingest` and the Command Center plugin's load-time backfill.
  if (state && state.customer_run === true) return CUSTOMER_RUN_PUBLISH_BLOCK;
  if (!state || state.status !== "completed") {
    return `workflow status is '${state && state.status}' — only completed runs are published`;
  }
  const cv = state.artifacts && state.artifacts.citation_verification;
  if (cfg.requireCitationPass !== false && cv && !(cv.pass === true || cv.verdict === "PASS")) {
    return `citation verification is '${cv.verdict || "not PASS"}' — only PASS runs are published`;
  }
  const mock = (agentData || []).find((a) => /^mock$/i.test(a.provider));
  if (mock) return `agent '${mock.role}' ran on the mock provider — mock runs are never published`;
  return null;
}

/**
 * One read of a run for any post-run consumer: its state, every agent's output, the shippability
 * verdict, and the synthesizer's output (the "pack"). Never throws; `state` is null when unreadable.
 */
function assessWorkflow(rootDir, workflowId, cfg = {}) {
  const stateFile = path.join(rootDir, "workspace", "workflows", String(workflowId || ""), "workflow.json");
  const state = readJson(stateFile);
  if (!state) return { state: null, stateFile, agentData: [], block: `no workflow state at ${stateFile}`, synthesizer: null };
  const agentData = readAgentDataFrom(rootDir, state.artifacts && state.artifacts.mission_id);
  const block = assessShippability(state, agentData, cfg);
  const synthesizer = agentData.find((a) => a.role === "synthesizer" && a.content && a.content.trim()) || null;
  return { state, stateFile, agentData, block, synthesizer };
}

// ── publisher ─────────────────────────────────────────────────────────────────────────────────

function loadConfig(rootDir) {
  const file = path.join(rootDir, CONFIG_REL);
  const raw = readJson(file);
  if (!isPlainObject(raw)) return { ...DEFAULT_CONFIG, _source: null };
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    deliverables: Array.isArray(raw.deliverables) ? raw.deliverables.map(String) : DEFAULT_CONFIG.deliverables,
    allowedVaultRoots: Array.isArray(raw.allowedVaultRoots) ? raw.allowedVaultRoots.map(String) : [],
    _source: file
  };
}

function createWorkflowVaultPublisher(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const logger = isPlainObject(options.logger) ? options.logger : { info() {}, warn() {}, error() {} };
  const timeProvider =
    options.timeProvider && typeof options.timeProvider.nowIso === "function" ? options.timeProvider : defaultTimeProvider;
  const config = { ...loadConfig(rootDir), ...(isPlainObject(options.configOverride) ? options.configOverride : {}) };
  const envDisabled = String(process.env.OPENCLAW_VAULT_PUBLISH || "").trim() === "0";

  const workflowsDir = path.join(rootDir, "workspace", "workflows");
  const missionsDir = path.join(rootDir, "workspace", "missions");
  const researchOutputDir = path.join(rootDir, "workspace", "research-output");
  const releasesDir = path.join(rootDir, "workspace", "releases");

  function workflowStateFile(workflowId) {
    return path.join(workflowsDir, workflowId, "workflow.json");
  }

  const readAgentData = (missionId) => readAgentDataFrom(rootDir, missionId);

  function collectDeliverables(state) {
    const workflowId = state.workflow_id;
    const offerId = state.artifacts && state.artifacts.offer_id;
    const bundleDir = offerId ? path.join(releasesDir, String(offerId)) : null;
    const bundleDeliverables = bundleDir ? path.join(bundleDir, "deliverables") : null;
    const workflowDir = path.join(workflowsDir, workflowId);
    const out = [];
    for (const slug of config.deliverables) {
      const fileName = `${slug}.md`;
      let source = null;
      let sealed = false;
      if (bundleDeliverables && fs.existsSync(path.join(bundleDeliverables, fileName))) {
        source = path.join(bundleDeliverables, fileName);
        sealed = true;
      } else if (fs.existsSync(path.join(workflowDir, fileName))) {
        source = path.join(workflowDir, fileName);
      }
      let content = null;
      if (source) {
        content = fs.readFileSync(source, "utf8");
      } else if (slug === "citation-integrity" && state.artifacts && state.artifacts.citation_verification) {
        content = renderIntegrityFallback(state);
      }
      if (typeof content !== "string" || !content.trim()) continue;
      out.push({
        slug,
        title: titleFromSlug(slug),
        content,
        sourceRel: source ? path.relative(rootDir, source) : "(rendered from workflow.json citation_verification)",
        sealed,
        sha256: sha256(content)
      });
    }
    let bundleChecksumsSha256 = null;
    if (bundleDir && fs.existsSync(path.join(bundleDir, "checksums.txt"))) {
      bundleChecksumsSha256 = sha256(fs.readFileSync(path.join(bundleDir, "checksums.txt"), "utf8"));
    }
    return { deliverables: out, bundleChecksumsSha256 };
  }

  /**
   * Deterministic graph analysis of the synthesizer output (plan D6). Fail-soft: any problem
   * (package absent, analysis error, too little text) simply omits the note.
   */
  async function buildGraphAnalysisNote(state, agentData) {
    const ga = isPlainObject(config.graphAnalysis) ? config.graphAnalysis : null;
    if (!ga || ga.enabled !== true) return null;
    const synth = agentData.find((a) => a.role === "synthesizer" && a.content && a.content.trim());
    if (!synth) return null;
    try {
      const { createGraphAnalysis } = require("./graph-analysis.js");
      const engine = createGraphAnalysis({ ...ga, logger });
      const analysis = await engine.analyze(sanitizeForVault(synth.content, "synthesizer"));
      if (!analysis.ok) {
        logger.info({ event: "vault_publish_graph_analysis_skipped", workflow_id: state.workflow_id, reason: analysis.reason });
        return null;
      }
      const fm = renderYaml({
        type: "openclaw/graph-analysis",
        workflow_id: state.workflow_id,
        workflow: `"[[${OVERVIEW_NAME}]]"`,
        concept_nodes: analysis.summary.nodes,
        communities: analysis.summary.communities,
        diversity: analysis.summary.diversity,
        modularity: Number(analysis.summary.modularity.toFixed(3)),
        tags: ["openclaw", "graph-analysis"]
      });
      return `${fm}\n${engine.render(analysis, { workflowId: state.workflow_id })}`;
    } catch (err) {
      logger.warn({ event: "vault_publish_graph_analysis_failed", workflow_id: state.workflow_id, error: err && err.message });
      return null;
    }
  }

  function renderIntegrityFallback(state) {
    try {
      const { buildIntegrityReport } = require("../monetization/integrity-rating.js");
      const qr = state.artifacts.quality_report || {};
      const rendered = buildIntegrityReport(state.artifacts.citation_verification, qr.section_coverage || []);
      if (typeof rendered === "string") return rendered;
      if (isPlainObject(rendered)) {
        return rendered.markdown || rendered.content || rendered.report || rendered.text || null;
      }
    } catch (err) {
      logger.warn({ event: "vault_publish_integrity_fallback_failed", error: err && err.message });
    }
    return null;
  }

  function buildNotes(state, agentData, deliverableSet, meta) {
    const notes = [];
    const cv = state.artifacts && state.artifacts.citation_verification;
    const qr = state.artifacts && state.artifacts.quality_report;
    const missionId = (state.artifacts && state.artifacts.mission_id) || "";
    const datasetId = (state.artifacts && state.artifacts.dataset_id) || null;
    const qualityName = qr ? QUALITY_NAME : null;
    const datasetName = datasetId ? DATASET_NAME : null;
    const agentNotes = agentData.map((a) => ({ role: a.role, noteName: capitalize(a.role) }));
    const deliverableNames = deliverableSet.deliverables.map((d) => d.title);

    // Overview — the plugin's workflowFrontmatter + provenance keys the engine can vouch for.
    const overviewFm = renderYaml({
      type: "openclaw/workflow",
      workflow_id: state.workflow_id,
      template: state.template_id,
      status: state.status,
      created: state.created_at,
      completed: state.completed_at,
      inputs: state.inputs,
      mission_id: missionId || null,
      dataset_id: datasetId,
      offer_id: (state.artifacts && state.artifacts.offer_id) || null,
      citation_integrity: cv && cv.verdict !== undefined ? cv.verdict : null,
      grounded_ratio: cv && cv.grounded_ratio !== undefined ? cv.grounded_ratio : null,
      citation_density: qr && qr.citation_density_raw !== undefined ? qr.citation_density_raw : null,
      density_pass: qr && qr.pass !== undefined ? qr.pass : null,
      verified_claims: qr && qr.verified_claims !== undefined ? qr.verified_claims : null,
      total_claims: qr && qr.total_claims !== undefined ? qr.total_claims : null,
      written_by: "engine",
      published_at: meta.publishedAt,
      export_path: (state.artifacts && state.artifacts.export_path) || null,
      bundle_checksums_sha256: deliverableSet.bundleChecksumsSha256,
      deliverable_notes: deliverableNames,
      graph_analysis: Boolean(meta.graphAnalysisNote),
      tags: buildTags(state)
    });
    notes.push({ rel: `${OVERVIEW_NAME}.md`, content: `${overviewFm}\n${buildOverviewBody(state, agentNotes, qualityName, datasetName, deliverableNames, Boolean(meta.graphAnalysisNote))}` });

    for (const agent of agentData) {
      const noteName = capitalize(agent.role);
      const fm = renderYaml({
        type: "openclaw/agent-output",
        mission_id: missionId,
        agent_role: agent.role,
        agent_id: agent.agentId,
        task_id: agent.taskId,
        provider: agent.provider,
        model: agent.model,
        token_count: agent.tokenCount,
        workflow: `"[[${OVERVIEW_NAME}]]"`,
        mission: `"[[${OVERVIEW_NAME}]]"`,
        tags: ["openclaw", "agent-output", agent.role]
      });
      notes.push({ rel: `${noteName}.md`, role: agent.role, content: `${fm}\n${buildAgentNoteBody(agent)}` });
    }

    if (qr && qualityName) {
      const fm = renderYaml({
        type: "openclaw/quality-report",
        workflow_id: state.workflow_id,
        citation_integrity: cv && cv.verdict !== undefined ? cv.verdict : null,
        grounded_ratio: cv && cv.grounded_ratio !== undefined ? cv.grounded_ratio : null,
        cited_ids: cv && cv.cited !== undefined ? cv.cited : null,
        grounded_ids: cv && cv.grounded !== undefined ? cv.grounded : null,
        citation_density: qr.citation_density_raw,
        density_pass: qr.pass,
        total_claims: qr.total_claims,
        verified_claims: qr.verified_claims,
        tags: ["openclaw", "quality"]
      });
      notes.push({ rel: `${qualityName}.md`, content: `${fm}\n${buildQualityBody(qr, cv)}` });
    }

    if (datasetId && datasetName) {
      const rowCount = state.artifacts && typeof state.artifacts.row_count === "number" ? state.artifacts.row_count : undefined;
      const fm = renderYaml({
        type: "openclaw/dataset",
        workflow_id: state.workflow_id,
        dataset_id: datasetId,
        row_count: rowCount === undefined ? null : rowCount,
        tags: ["openclaw", "dataset"]
      });
      const body = [
        "# Dataset Card", "",
        `Workflow: [[${OVERVIEW_NAME}]]`, "",
        "| Field | Value |", "|-------|-------|",
        `| Dataset ID | \`${datasetId}\` |`,
        ...(rowCount !== undefined ? [`| Row count | ${rowCount} |`] : []),
        ""
      ].join("\n");
      notes.push({ rel: `${datasetName}.md`, content: `${fm}\n${body}` });
    }

    if (meta.graphAnalysisNote) {
      notes.push({ rel: "Graph Analysis.md", content: meta.graphAnalysisNote });
    }

    for (const d of deliverableSet.deliverables) {
      const fm = renderYaml({
        type: "openclaw/deliverable",
        workflow_id: state.workflow_id,
        deliverable: d.slug,
        sealed_bundle: d.sealed,
        source: d.sourceRel,
        sha256: d.sha256,
        workflow: `"[[${OVERVIEW_NAME}]]"`,
        tags: ["openclaw", "deliverable", d.slug]
      });
      // A deliverable is copied VERBATIM: the frontmatter is prepended only when the file has none
      // of its own, so the body checksum above always matches the shipped file.
      const content = d.content.startsWith("---\n") ? d.content : `${fm}\n${d.content}`;
      notes.push({ rel: `${d.title}.md`, content });
    }

    return notes;
  }

  function buildOverviewBody(state, agentNotes, qualityName, datasetName, deliverableNames, hasGraphAnalysis = false) {
    const lines = [];
    const inputLabel = Object.values(state.inputs || {}).join(" / ");
    lines.push(`# ${state.template_id} — ${inputLabel}`, "");
    lines.push("## Summary", "", "| Field | Value |", "|-------|-------|");
    lines.push(`| Template | ${state.template_id} |`, `| Status | ${state.status} |`, `| Created | ${state.created_at} |`);
    if (state.completed_at) lines.push(`| Completed | ${state.completed_at} |`);
    for (const [key, val] of Object.entries(state.inputs || {})) lines.push(`| ${key} | ${val} |`);
    lines.push("");
    lines.push("## Pipeline", "", "| Step | Type | Status |", "|------|------|--------|");
    const steps = state.pipeline_progress && Array.isArray(state.pipeline_progress.steps) ? state.pipeline_progress.steps : [];
    for (const step of steps) {
      lines.push(`| ${step.step_id} | ${STEP_TYPE_LABELS[step.type] || step.type} | ${stepStatusIcon(step.status)} ${step.status} |`);
    }
    lines.push("");
    if (agentNotes.length > 0) {
      lines.push("## Agent Outputs", "");
      for (const a of agentNotes) lines.push(`- [[${a.noteName}|${capitalize(a.role)}]]`);
      lines.push("");
    }
    if (qualityName) {
      lines.push("## Quality", "");
      const ci = summarizeCitationIntegrity(state.artifacts && state.artifacts.citation_verification);
      if (ci) {
        lines.push(`**Citation integrity: ${ci.verdict}** — ${ci.grounded}/${ci.cited} cited IDs grounded (${ci.groundedPct}%, ${ci.ungrounded} unverified, ${ci.retracted} retracted; floor ${ci.floorPct}%)`);
      }
      const qr = state.artifacts && state.artifacts.quality_report;
      if (qr) {
        const density = qr.citation_density_raw ?? (qr.total_claims > 0 ? qr.verified_claims / qr.total_claims : 0);
        lines.push(`Citation density: ${Number(density).toFixed(2)} (${qr.verified_claims}/${qr.total_claims} lines carry an inline citation — a writing heuristic, not verification)`);
      }
      lines.push(`See: [[${qualityName}]]`, "");
    }
    if (datasetName) lines.push("## Dataset", "", `See: [[${datasetName}]]`, "");
    if (hasGraphAnalysis) {
      lines.push("## Graph Analysis", "", "Deterministic text-network analysis of the synthesizer output (no language model): see [[Graph Analysis]].", "");
    }
    if (deliverableNames.length > 0) {
      lines.push("## Deliverables", "");
      lines.push("Copied verbatim from the run's sealed bundle (or the workflow directory when no bundle exists); each note's `sha256` is the checksum of the shipped file.", "");
      for (const name of deliverableNames) lines.push(`- [[${name}]]`);
      lines.push("");
    }
    lines.push("## Artifacts", "");
    const a = state.artifacts || {};
    if (a.mission_id) lines.push(`- Mission: \`${a.mission_id}\``);
    if (a.dataset_id) lines.push(`- Dataset: \`${a.dataset_id}\``);
    if (a.offer_id) lines.push(`- Offer: \`${a.offer_id}\``);
    if (a.export_path) lines.push(`- Export: \`${a.export_path}\``);
    // T2-14 (2026-11-16): the workflow's export step refused the release (scripts/_delivery-checks.js).
    if (Array.isArray(a.export_refused) && a.export_refused.length > 0) {
      const n = a.export_refused.length;
      lines.push(`- Export: refused by the delivery checks, nothing exported (${n} problem${n === 1 ? "" : "s"}; see \`artifacts.export_refused\` in workflow.json)`);
    }
    lines.push("");
    lines.push("## Provenance", "");
    lines.push("Written by the research engine's post-run vault publisher (`openclaw-bridge/vault/workflow-vault-publisher.js`) after the citation gate passed. The Command Center plugin rehydrates its enrichment stages (chat notify, Miyo index, Zettelkasten linking, research-memory ingest) from this folder instead of writing it again.", "");
    return lines.join("\n");
  }

  function buildAgentNoteBody(agent) {
    const lines = [];
    lines.push(`# ${capitalize(agent.role)} Output`, "");
    lines.push(`> Workflow: [[${OVERVIEW_NAME}]] | Provider: ${agent.provider} (${agent.model}) | Tokens: ${Number(agent.tokenCount || 0).toLocaleString("en-US")}`, "");
    lines.push("---", "");
    lines.push(sanitizeForVault(agent.content, agent.role), "");
    if (agent.taskId) {
      lines.push("---", "", `> Full output: \`workspace/research-output/${agent.taskId}/output.md\``, "");
    }
    return lines.join("\n");
  }

  function buildQualityBody(qr, cv) {
    const lines = ["# Quality Audit", "", `Workflow: [[${OVERVIEW_NAME}]]`, ""];
    const ci = summarizeCitationIntegrity(cv);
    if (ci) {
      const barLen = 20;
      const filled = Math.round((ci.groundedPct / 100) * barLen);
      const bar = "█".repeat(filled) + "░".repeat(barLen - filled);
      lines.push("## Citation integrity (verification gate)", "");
      lines.push(`**${ci.verdict}** — every cited identifier cross-checked against the evidence actually fetched at runtime.`, "");
      lines.push(`Grounded: ${ci.groundedPct}% \`${bar}\``, "");
      lines.push("| Metric | Value |", "|--------|-------|");
      lines.push(`| Verdict | ${ci.verdict} |`);
      lines.push(`| Cited IDs grounded | ${ci.grounded} / ${ci.cited} (${ci.groundedPct}%) |`);
      lines.push(`| Unverified (ungrounded) | ${ci.ungrounded} |`);
      lines.push(`| Retracted | ${ci.retracted} |`);
      lines.push(`| Grounded floor to pass | ${ci.floorPct}% |`, "");
    }
    const density = qr.citation_density_raw ?? (qr.total_claims > 0 ? qr.verified_claims / qr.total_claims : 0);
    lines.push("## Citation density (writing heuristic — not verification)", "");
    lines.push("| Metric | Value |", "|--------|-------|");
    lines.push(`| Citation density | ${Number(density).toFixed(2)} |`);
    lines.push(`| Lines with an inline citation | ${qr.verified_claims} / ${qr.total_claims} |`);
    lines.push(`| Density check | ${qr.pass ? "pass" : "fail"} |`, "");
    lines.push("> Density measures how citation-dense the writing is (lines matching a citation pattern). It is **not** a confidence or verification score — the verification gate above is the one that backs the zero-fabrication guarantee.", "");
    return lines.join("\n");
  }

  const shippabilityBlock = (state, agentData) => assessShippability(state, agentData, config);

  function locateFolder(vaultRootReal, state) {
    const base = computeNotesFolderPath(state, config.vaultOutputFolder, timeProvider);
    const candidates = [base, `${base} (${String(state.workflow_id).slice(-8)})`];
    for (const folder of candidates) {
      const overview = guardVaultRelativePath(vaultRootReal, `${folder}/${OVERVIEW_NAME}.md`);
      if (!fs.existsSync(overview.absolutePath)) return { folder, existing: false };
      const owner = readFrontmatterValue(overview.absolutePath, "workflow_id");
      if (owner === state.workflow_id) return { folder, existing: true };
    }
    // Both candidates hold OTHER runs' notes (same day, same inputs, twice over): refuse rather than
    // overwrite someone else's run.
    throw withCode(new Error(`notes folder collision for ${state.workflow_id}: ${base}`), "VAULT_PUBLISH_FOLDER_COLLISION");
  }

  /**
   * Publish one run. Never throws on a skip; returns { ok, action, reason?, folder?, files? }.
   *   action: "written" | "skipped" | "failed"
   */
  async function publishWorkflow(workflowId, opts = {}) {
    const force = opts.force === true;
    const dryRun = opts.dryRun === true;
    const id = String(workflowId || "").trim();
    if (!id) return { ok: false, action: "failed", error: "workflowId required" };

    if (config.enabled !== true) return skip(id, "vault publishing disabled in config/vault-publish.json");
    if (envDisabled) return skip(id, "OPENCLAW_VAULT_PUBLISH=0");

    const stateFile = workflowStateFile(id);
    const state = readJson(stateFile);
    if (!state) return { ok: false, action: "failed", workflow_id: id, error: `no workflow state at ${stateFile}` };

    const agentData = readAgentData(state.artifacts && state.artifacts.mission_id);
    const block = shippabilityBlock(state, agentData);
    if (block) return skip(id, block);

    const root = resolveVaultRoot(config.vaultRoot, config.allowedVaultRoots);
    if (!root.ok) {
      if (root.refused) return { ok: false, action: "failed", workflow_id: id, error: root.reason, code: "VAULT_PUBLISH_ROOT_REFUSED" };
      return skip(id, root.reason);
    }

    try {
      const located = locateFolder(root.real, state);
      if (located.existing && !force) {
        return { ok: true, action: "skipped", workflow_id: id, folder: located.folder, reason: "notes already present for this workflow_id (use force to rewrite)" };
      }
      const deliverableSet = collectDeliverables(state);
      const publishedAt = timeProvider.nowIso();
      const graphAnalysisNote = await buildGraphAnalysisNote(state, agentData);
      const notes = buildNotes(state, agentData, deliverableSet, { publishedAt, graphAnalysisNote });
      const files = [];
      for (const note of notes) {
        const guarded = guardVaultRelativePath(root.real, `${located.folder}/${note.rel}`);
        files.push(guarded.relativePath);
        if (dryRun) continue;
        fs.mkdirSync(path.dirname(guarded.absolutePath), { recursive: true });
        fs.writeFileSync(guarded.absolutePath, note.content, "utf8");
      }
      const record = {
        folder: located.folder,
        overview: `${located.folder}/${OVERVIEW_NAME}.md`,
        files,
        agent_notes: notes.filter((n) => n.role).map((n) => ({ role: n.role, path: `${located.folder}/${n.rel}` })),
        written_by: "engine",
        published_at: publishedAt,
        vault_root: root.real
      };
      if (!dryRun) {
        const fresh = readJson(stateFile) || state;
        fresh.artifacts = isPlainObject(fresh.artifacts) ? fresh.artifacts : {};
        fresh.artifacts.vault_notes = record;
        atomicWriteJson(stateFile, fresh);
      }
      logger.info({ event: dryRun ? "vault_publish_dry_run" : "vault_publish_written", workflow_id: id, folder: located.folder, files: files.length, rewritten: located.existing });
      return { ok: true, action: dryRun ? "dry-run" : "written", workflow_id: id, folder: located.folder, files, rewritten: located.existing, record };
    } catch (err) {
      logger.warn({ event: "vault_publish_failed", workflow_id: id, error: err && err.message, code: err && err.code });
      return { ok: false, action: "failed", workflow_id: id, error: err && err.message ? err.message : String(err), code: err && err.code };
    }
  }

  function skip(id, reason) {
    logger.info({ event: "vault_publish_skipped", workflow_id: id, reason });
    return { ok: true, action: "skipped", workflow_id: id, reason };
  }

  function listWorkflowIds() {
    if (!fs.existsSync(workflowsDir)) return [];
    return fs.readdirSync(workflowsDir)
      .filter((name) => fs.existsSync(path.join(workflowsDir, name, "workflow.json")))
      .sort();
  }

  /** Backfill: every completed run on disk, oldest first. Skips are normal (already written, mock, non-PASS). */
  async function publishAll(opts = {}) {
    const results = [];
    for (const id of listWorkflowIds()) {
      const state = readJson(workflowStateFile(id));
      if (!state || state.status !== "completed") continue;
      results.push(await publishWorkflow(id, opts));
    }
    const summary = { written: 0, skipped: 0, failed: 0, dry_run: 0 };
    for (const r of results) {
      if (r.action === "written") summary.written += 1;
      else if (r.action === "dry-run") summary.dry_run += 1;
      else if (r.action === "skipped") summary.skipped += 1;
      else summary.failed += 1;
    }
    return { ok: summary.failed === 0, summary, results };
  }

  return Object.freeze({
    publishWorkflow,
    publishAll,
    listWorkflowIds,
    config: Object.freeze({ ...config }),
    _internals: Object.freeze({ computeNotesFolderPath, guardVaultRelativePath, sanitizeForVault, readAgentData, collectDeliverables })
  });
}

module.exports = {
  createWorkflowVaultPublisher,
  computeNotesFolderPath,
  guardVaultRelativePath,
  sanitizeForVault,
  sanitizeFolderName,
  renderYaml,
  loadConfig,
  assessWorkflow,
  assessShippability,
  readAgentDataFrom,
  atomicWriteJson,
  OVERVIEW_NAME
};
