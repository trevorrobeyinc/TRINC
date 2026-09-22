import { Vault, TFolder, Notice } from "obsidian";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type {
  WorkflowResult,
  WorkflowState,
  MissionStatus,
  AgentMetadata,
} from "../types";
import { readJsonFile } from "../util/json-reader";
import { PathResolver } from "../util/path-resolver";
import {
  workflowFrontmatter,
  agentFrontmatter,
  qualityFrontmatter,
  datasetFrontmatter,
} from "./frontmatter";
import {
  buildWorkflowOverview,
  buildAgentNote,
  buildQualityNote,
  buildDatasetNote,
} from "./content-builder";

export interface GeneratedNotes {
  overviewPath: string;
  agentPaths: Array<{ role: string; path: string }>;
  qualityPath: string | null;
  datasetPath: string | null;
  synthesizerContent: string | null;
}

/**
 * Vault folder for a run's notes — one formula, shared with the bridge's
 * artifacts tool so it can locate a run's notes without re-deriving the layout.
 */
export function computeNotesFolderPath(
  state: Pick<WorkflowState, "created_at" | "inputs" | "template_id">,
  vaultOutputFolder: string
): string {
  const dateStr = new Date(state.created_at).toISOString().slice(0, 10);
  const inputLabel = sanitizeFolderName(
    Object.values(state.inputs || {})
      .slice(0, 2)
      .join(" ")
  );
  return `${vaultOutputFolder}/${state.template_id}/${dateStr} ${inputLabel}`;
}

/**
 * Read a run's synthesizer output straight from the engine's on-disk
 * artifacts (workflow.json → mission status.json → the synthesizer subtask's
 * output file). This is the engine's own persistence contract — it exists
 * whether or not vault notes were generated, which is what lets the
 * research-memory ingest stage run independently of the notes stage.
 */
export function readSynthesizerOutput(
  openclawPath: string,
  workflowId: string
): string | null {
  const resolver = new PathResolver(openclawPath);
  const state = readJsonFile<WorkflowState>(resolver.workflowStateFile(workflowId));
  const missionId = state?.artifacts?.mission_id;
  if (!missionId) return null;
  const status = readJsonFile<MissionStatus>(resolver.missionStatusFile(missionId));
  if (!status) return null;

  const subtasks =
    ((status as unknown as { subtask_results?: unknown[] }).subtask_results as Array<
      Record<string, unknown>
    >) ||
    (status.subtasks as unknown as Array<Record<string, unknown>>) ||
    [];

  for (const subtask of subtasks) {
    const role =
      (subtask.role as string) ||
      extractRoleFromAgentId((subtask.agent_id as string) || "");
    if (role !== "synthesizer") continue;
    const outputPath = subtask.output_path as string | undefined;
    if (outputPath && existsSync(outputPath)) {
      return readFileSync(outputPath, "utf8");
    }
    const taskId = (subtask.task_id as string) || (subtask.subtask_id as string) || "";
    if (taskId) {
      const conventional = resolver.agentOutputFile(taskId);
      if (existsSync(conventional)) return readFileSync(conventional, "utf8");
    }
  }
  return null;
}

/**
 * Wait for the ENGINE's post-run vault publisher to record `artifacts.vault_notes`
 * in workflow.json (2026-09-22). The engine writes that record right after the
 * run's notes, a few hundred ms after `status: completed` lands — so the tracker's
 * completion path can fire before the record exists. Returns the freshest state
 * either way (null only when the state file is unreadable) so the caller can still
 * check the disk for an engine-written folder.
 */
export async function waitForEngineVaultNotes(
  openclawPath: string,
  workflowId: string,
  waitMs: number,
  pollMs = 500
): Promise<WorkflowState | null> {
  const resolver = new PathResolver(openclawPath);
  const deadline = Date.now() + Math.max(0, waitMs);
  let state: WorkflowState | null = null;
  for (;;) {
    state = readJsonFile<WorkflowState>(resolver.workflowStateFile(workflowId));
    if (state?.artifacts?.vault_notes?.overview) return state;
    if (Date.now() >= deadline) return state;
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

/**
 * Rehydrate a GeneratedNotes view from notes the ENGINE already wrote, so the
 * enrichment stages (notify, Miyo, Zettelkasten, research-memory) run on them
 * without a second write. Uses the vault adapter (disk), not the metadata index,
 * because files written seconds ago may not be indexed yet. Returns null when
 * no engine-written Overview for THIS workflow_id exists — the caller then falls
 * back to generateWorkflowNotes().
 */
export async function rehydrateEngineNotes(
  vault: Vault,
  state: WorkflowState,
  openclawPath: string,
  vaultOutputFolder: string
): Promise<GeneratedNotes | null> {
  const record = state.artifacts?.vault_notes;
  const folder = record?.folder || computeNotesFolderPath(state, vaultOutputFolder);
  const overviewPath = record?.overview || `${folder}/Overview.md`;
  if (!(await vault.adapter.exists(overviewPath))) return null;
  const overviewText = await vault.adapter.read(overviewPath);
  const owner = overviewText.match(/^workflow_id:\s*"?([^"\n]+)"?\s*$/m);
  if (!owner || owner[1].trim() !== state.workflow_id) return null;

  let agentPaths: Array<{ role: string; path: string }> = (record?.agent_notes || []).map((a) => ({
    role: a.role,
    path: a.path,
  }));
  if (agentPaths.length === 0) {
    const resolver = new PathResolver(openclawPath);
    const agents = await readAgentData(resolver, state.artifacts?.mission_id);
    for (const a of agents) {
      const p = `${folder}/${capitalize(a.role)}.md`;
      if (await vault.adapter.exists(p)) agentPaths.push({ role: a.role, path: p });
    }
  }
  agentPaths = agentPaths.filter((a) => typeof a.path === "string" && a.path.length > 0);

  const qualityCandidate = `${folder}/Quality Audit.md`;
  const datasetCandidate = `${folder}/Dataset Card.md`;
  const qualityPath = (await vault.adapter.exists(qualityCandidate)) ? qualityCandidate : null;
  const datasetPath = (await vault.adapter.exists(datasetCandidate)) ? datasetCandidate : null;

  // The RAW synthesizer output (what Zettelkasten + research-memory consumed before) comes from
  // the engine's own artifact; the vault note is the sanitized rendering and is the fallback.
  let synthesizerContent = readSynthesizerOutput(openclawPath, state.workflow_id);
  if (!synthesizerContent) {
    const synthNote = agentPaths.find((a) => a.role === "synthesizer")?.path;
    if (synthNote && (await vault.adapter.exists(synthNote))) {
      synthesizerContent = stripNoteScaffolding(await vault.adapter.read(synthNote));
    }
  }

  return { overviewPath, agentPaths, qualityPath, datasetPath, synthesizerContent };
}

/** Drop frontmatter + the agent note's header block, leaving the research body. */
export function stripNoteScaffolding(text: string): string {
  let body = text;
  if (body.startsWith("---")) {
    const end = body.indexOf("\n---", 3);
    if (end >= 0) body = body.slice(end + 4);
  }
  const firstRule = body.indexOf("\n---\n");
  if (firstRule >= 0) body = body.slice(firstRule + 5);
  return body.trim();
}

/**
 * Generate vault notes from a completed OpenClaw workflow.
 *
 * Reads workflow state, mission status, and agent outputs from the
 * OpenClaw workspace, then creates structured Obsidian notes with
 * frontmatter, wikilinks, and verbatim research content.
 *
 * Since 2026-09-22 this is the FALLBACK path: the engine writes the same note
 * set itself (openclaw-bridge/vault/workflow-vault-publisher.js) and the plugin
 * rehydrates from it. This runs only when the engine wrote nothing.
 */
export async function generateWorkflowNotes(
  vault: Vault,
  result: WorkflowResult,
  openclawPath: string,
  vaultOutputFolder: string
): Promise<GeneratedNotes> {
  const resolver = new PathResolver(openclawPath);

  // 1. Read workflow state
  const state = readJsonFile<WorkflowState>(
    resolver.workflowStateFile(result.workflow_id)
  );
  if (!state) {
    throw new Error(
      `Could not read workflow state for ${result.workflow_id}`
    );
  }

  // 2. Build folder path (shared formula — see computeNotesFolderPath)
  const folderPath = computeNotesFolderPath(state, vaultOutputFolder);

  // Ensure folder exists
  await ensureFolder(vault, folderPath);

  // 3. Determine what notes to generate
  const missionId = state.artifacts?.mission_id;
  const datasetId = state.artifacts?.dataset_id;
  const qualityReport = state.artifacts?.quality_report;

  // 4. Read mission status and agent outputs
  const agentData = await readAgentData(resolver, missionId);

  // 5. Build note names
  const overviewName = "Overview";
  const qualityName = qualityReport ? "Quality Audit" : null;
  const datasetName = datasetId ? "Dataset Card" : null;

  const agentNotes = agentData.map((a) => ({
    role: a.role,
    noteName: capitalize(a.role),
  }));

  // 6. Generate overview note
  const overviewFm = workflowFrontmatter(state);
  const overviewBody = buildWorkflowOverview(
    state,
    agentNotes,
    qualityName,
    datasetName
  );
  const overviewPath = `${folderPath}/${overviewName}.md`;
  await createOrReplace(vault, overviewPath, overviewFm + "\n" + overviewBody);

  // 7. Generate agent notes
  const agentPaths: Array<{ role: string; path: string }> = [];
  let synthesizerContent: string | null = null;

  for (const agent of agentData) {
    const noteName = capitalize(agent.role);
    const fm = agentFrontmatter({
      missionId: missionId || "",
      role: agent.role,
      agentId: agent.agentId,
      taskId: agent.taskId,
      provider: agent.provider,
      model: agent.model,
      tokenCount: agent.tokenCount,
      workflowNoteLink: `[[${overviewName}]]`,
      missionNoteLink: `[[${overviewName}]]`,
    });
    const body = buildAgentNote(
      agent.role,
      agent.content,
      overviewName,
      agent.tokenCount,
      agent.provider,
      agent.model,
      agent.taskId
    );
    const notePath = `${folderPath}/${noteName}.md`;
    await createOrReplace(vault, notePath, fm + "\n" + body);
    agentPaths.push({ role: agent.role, path: notePath });

    if (agent.role === "synthesizer") {
      synthesizerContent = agent.content;
    }
  }

  // 8. Generate quality note
  let qualityPath: string | null = null;
  if (qualityReport && qualityName) {
    const cv = result.artifacts?.citation_verification;
    const fm = qualityFrontmatter(result.workflow_id, qualityReport, cv);
    const body = buildQualityNote(
      result.workflow_id,
      qualityReport,
      overviewName,
      cv
    );
    qualityPath = `${folderPath}/${qualityName}.md`;
    await createOrReplace(vault, qualityPath, fm + "\n" + body);
  }

  // 9. Generate dataset note
  let datasetPath: string | null = null;
  if (datasetId && datasetName) {
    const fm = datasetFrontmatter(result.workflow_id, datasetId);
    const body = buildDatasetNote(datasetId, overviewName);
    datasetPath = `${folderPath}/${datasetName}.md`;
    await createOrReplace(vault, datasetPath, fm + "\n" + body);
  }

  return {
    overviewPath,
    agentPaths,
    qualityPath,
    datasetPath,
    synthesizerContent,
  };
}

// --- Internal helpers ---

interface AgentData {
  role: string;
  agentId: string;
  taskId: string;
  provider: string;
  model: string;
  tokenCount: number;
  content: string;
}

async function readAgentData(
  resolver: PathResolver,
  missionId: string | undefined
): Promise<AgentData[]> {
  if (!missionId) return [];

  const statusFile = resolver.missionStatusFile(missionId);
  const status = readJsonFile<MissionStatus>(statusFile);
  if (!status) return [];

  const results: AgentData[] = [];

  // Read subtask results from status.json
  const subtasks = (status as any).subtask_results || status.subtasks || [];

  for (const subtask of subtasks) {
    const taskId = subtask.task_id || subtask.subtask_id || "";
    const outputPath = subtask.output_path;
    const metadataPath = subtask.metadata_path;

    // Read output content
    let content = "";
    if (outputPath && existsSync(outputPath)) {
      content = readFileSync(outputPath, "utf8");
    } else if (taskId) {
      // Try conventional path
      const conventionalPath = resolver.agentOutputFile(taskId);
      if (existsSync(conventionalPath)) {
        content = readFileSync(conventionalPath, "utf8");
      }
    }

    // Read metadata
    let metadata: AgentMetadata | null = null;
    if (metadataPath && existsSync(metadataPath)) {
      metadata = readJsonFile<AgentMetadata>(metadataPath);
    } else if (taskId) {
      metadata = readJsonFile<AgentMetadata>(
        resolver.agentMetadataFile(taskId)
      );
    }

    // Determine role from metadata or subtask
    const role =
      metadata?.role ||
      (metadata as any)?.task_definition?.role ||
      subtask.role ||
      extractRoleFromAgentId(subtask.agent_id || "");

    results.push({
      role: role || "unknown",
      agentId: subtask.agent_id || "",
      taskId,
      provider: metadata?.provider || subtask.provider || "unknown",
      model: metadata?.model || subtask.model || "unknown",
      tokenCount: metadata?.token_count || subtask.token_count || 0,
      content,
    });
  }

  // Sort: scout → analyst → synthesizer
  const roleOrder: Record<string, number> = {
    scout: 0,
    analyst: 1,
    synthesizer: 2,
  };
  results.sort(
    (a, b) => (roleOrder[a.role] ?? 99) - (roleOrder[b.role] ?? 99)
  );

  return results;
}

function extractRoleFromAgentId(agentId: string): string {
  // Agent IDs look like: "mission-xxx:scout:1", "mission-xxx:analyst:2"
  const parts = agentId.split(":");
  if (parts.length >= 2) return parts[parts.length - 2];
  return "unknown";
}

async function ensureFolder(vault: Vault, path: string): Promise<void> {
  const parts = path.split("/");
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    const existing = vault.getAbstractFileByPath(current);
    if (!existing) {
      await vault.createFolder(current);
    }
  }
}

async function createOrReplace(
  vault: Vault,
  path: string,
  content: string
): Promise<void> {
  const existing = vault.getAbstractFileByPath(path);
  if (existing) {
    await vault.modify(existing as any, content);
  } else {
    await vault.create(path, content);
  }
}

function sanitizeFolderName(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
