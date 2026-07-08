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

interface GeneratedNotes {
  overviewPath: string;
  agentPaths: Array<{ role: string; path: string }>;
  qualityPath: string | null;
  datasetPath: string | null;
  synthesizerContent: string | null;
}

/**
 * Generate vault notes from a completed OpenClaw workflow.
 *
 * Reads workflow state, mission status, and agent outputs from the
 * OpenClaw workspace, then creates structured Obsidian notes with
 * frontmatter, wikilinks, and verbatim research content.
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

  // 2. Build folder path
  const dateStr = new Date(state.created_at).toISOString().slice(0, 10);
  const inputLabel = sanitizeFolderName(
    Object.values(state.inputs || {})
      .slice(0, 2)
      .join(" ")
  );
  const folderPath = `${vaultOutputFolder}/${state.template_id}/${dateStr} ${inputLabel}`;

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
    const fm = qualityFrontmatter(result.workflow_id, qualityReport);
    const body = buildQualityNote(
      result.workflow_id,
      qualityReport,
      overviewName
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
