/**
 * OpenClaw Command Center — Type Definitions
 *
 * Source of truth: /Users/myhome/TRINC/Trevor Robey Intelligence Network Citations/openclaw-shared-types/index.d.ts
 * Last synced: 2026-04-06
 *
 * Types below are aligned with the shared types package. When OpenClaw adds fields
 * (especially to PipelineStep or WorkflowState), update from the shared types source.
 */

// ── Workflow Types ───────────────────────────────────────────────

export type WorkflowStatus = "draft" | "running" | "completed" | "failed" | "cancelled";

export type PipelineStepType = "mission" | "dataset" | "offer" | "approve" | "export" | "quality_audit";

export type PipelineStepStatus = "pending" | "running" | "completed" | "failed";

export interface WorkflowError {
  code: string;
  message: string;
}

export interface QualityReport {
  ok: boolean;
  overall_confidence: number;
  citation_density_raw?: number;
  total_claims: number;
  verified_claims: number;
  pass: boolean;
}

/**
 * The runtime citation-INTEGRITY gate (openclaw-bridge core/citation-gate.js).
 * This is the TRUTH gate: every cited identifier is cross-checked against the
 * evidence actually fetched at runtime. `verdict === "PASS"` (grounded_ratio >=
 * min_grounded_ratio) is the only shippable state — this is the number that
 * backs the zero-fabrication guarantee. It is DISTINCT from QualityReport, which
 * is a cheap citation-DENSITY heuristic (citation-shaped lines), NOT verification.
 */
export interface CitationVerification {
  pass: boolean;
  verdict: string;
  cited: number;
  grounded: number;
  ungrounded: number;
  grounded_ratio: number;
  min_grounded_ratio: number;
  retracted?: unknown[];
}

/**
 * Written by the ENGINE's post-run vault publisher (2026-09-22,
 * openclaw-bridge/vault/workflow-vault-publisher.js) into workflow.json after
 * it wrote the run's notes. The plugin rehydrates its enrichment stages from
 * this record instead of generating the notes a second time.
 */
export interface VaultNotesRecord {
  folder: string;
  overview: string;
  files: string[];
  agent_notes?: Array<{ role: string; path: string }>;
  written_by: string;
  published_at?: string;
  vault_root?: string;
}

export interface WorkflowArtifacts {
  mission_id?: string;
  mission_result?: Record<string, unknown>;
  dataset_id?: string;
  row_count?: number;
  offer_id?: string;
  export_path?: string;
  quality_report?: QualityReport;
  citation_verification?: CitationVerification;
  vault_notes?: VaultNotesRecord;
}

export interface PipelineStep {
  step_id: string;
  type: PipelineStepType;
  status: PipelineStepStatus;
  result?: Record<string, unknown>;
  error?: WorkflowError;
}

export interface PipelineProgress {
  total_steps: number;
  completed_steps: number;
  current_step: string | null;
  steps: PipelineStep[];
}

/** Mirrors the workflow state file at workspace/workflows/{id}/workflow.json */
export interface WorkflowState {
  workflow_id: string;
  template_id: string;
  status: WorkflowStatus;
  inputs: Record<string, string>;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  pipeline_progress: PipelineProgress;
  artifacts: WorkflowArtifacts;
  error: WorkflowError | null;
}

/** Final stdout result from run-workflow.js (or reconstructed from workflow.json) */
export interface WorkflowResult {
  ok: boolean;
  workflow_id: string;
  template_id?: string;
  status: "completed" | "failed";
  artifacts: WorkflowArtifacts;
  pipeline_progress: PipelineProgress;
  error: WorkflowError | null;
}

/** Parsed from stderr JSON log lines */
export interface StderrEvent {
  level: "INFO" | "WARN" | "ERROR";
  event: string;
  workflow_id?: string;
  template_id?: string;
  [key: string]: unknown;
}

// ── Template Types ───────────────────────────────────────────────

export interface InputProperty {
  type: "string" | "number" | "boolean" | "array";
  description?: string;
  default?: unknown;
  [key: string]: unknown;
}

/**
 * Full pipeline step as defined in workflow template JSON files.
 * All 15+ fields from the Zod schema in workflow-schema.js.
 */
export interface TemplatePipelineStep {
  step_id: string;
  type: PipelineStepType;
  depends_on?: string[];
  mission_template_id?: string;
  description_template?: string;
  mission_type?: "research_only" | "research_to_dataset";
  dataset_type?: string;
  target_schema?: string;
  quality_threshold?: number;
  product_line?: string;
  tier?: string;
  targets?: string[];
  delivery_targets?: string[];
  format?: "zip" | "folder";
  confidence_threshold?: number;
  verification_tools?: string[];
}

/** Workflow template from config/workflow-templates/*.json */
export interface WorkflowTemplate {
  schema_version: "phase30-workflow-v1";
  workflow_template_id: string;
  name?: string;
  description?: string;
  auto_approve: boolean;
  provider_preference?: {
    primary: string;
    fallback?: string;
  };
  input_schema: {
    required: string[];
    properties: Record<string, InputProperty>;
  };
  pipeline: TemplatePipelineStep[];
  /** "business" opts a template into the engine's business-research lane; absent = biomedical. */
  research_profile?: string;
}

// ── Mission Types ────────────────────────────────────────────────

export type MissionStatusValue =
  | "draft"
  | "supervisor_approved"
  | "governance_approved"
  | "planning"
  | "spawned"
  | "running"
  | "synthesizing"
  | "completed"
  | "failed"
  | "rejected"
  | "paused";

export type SubtaskStatus =
  | "queued"
  | "dispatched"
  | "running"
  | "reported"
  | "completed"
  | "failed"
  | "paused";

/** Mission status file at workspace/missions/{id}/status.json */
export interface MissionStatus {
  mission_id: string;
  template_id: string;
  status: MissionStatusValue;
  created_at?: string;
  updated_at?: string;
  status_history: Array<{ status: string; timestamp: string }>;
  spawned_agents?: Array<{
    agent_id: string;
    role: string;
  }>;
  subtasks: Array<{
    subtask_id: string;
    agent_id: string;
    role: string;
    status: SubtaskStatus;
    output_path?: string;
  }>;
  output_path?: string;
  synthesis_mode?: string;
  error_code?: string;
  error_message?: string;
}

/** Agent task metadata from workspace/research-output/{taskId}/metadata.json */
export interface AgentMetadata {
  provider: string;
  model: string;
  token_count: number;
  duration_ms: number;
  task_id: string;
  role: string;
  mission_id: string;
}

// ── Plugin Settings ──────────────────────────────────────────────

export interface OpenClawSettings {
  openclawPath: string;
  nodePath: string;
  vaultOutputFolder: string;
  autoGenerateNotes: boolean;
  // 2026-09-22: the engine writes the note set itself after a gate-PASS run and
  // records artifacts.vault_notes; Stage 1 waits this long for that record before
  // falling back to generating the notes in-plugin.
  engineNotesWaitMs: number;
  // On load, spawn `scripts/publish-workflow-to-vault.js --all` so runs that
  // completed while Obsidian was closed (or before the publisher existed) land
  // in the vault. Idempotent on the engine side.
  backfillVaultNotesOnLoad: boolean;
  autoRunZettelkasten: boolean;
  // 2026-09-22: engine-written runs (headless) never got the LLM Zettelkasten
  // linking; on load, link up to N synthesizer notes that lack the section.
  zkCatchUpOnLoad: boolean;
  zkCatchUpMaxPerLoad: number;
  pollIntervalMs: number;
  workflowTimeoutMs: number;
  miyoEnabled: boolean;
  miyoPort: number;
  miyoSimilarityThreshold: number;
  miyoMaxResults: number;
  miyoIndexWaitMs: number;
  miyoIndexPollIntervalMs: number;
  miyoSearchRetries: number;
  enableCopilotBridge: boolean;
  bridgePort: number;
  // (bridgeToken removed 2026-08-20: the bearer token lives ONLY in the 0600
  // file ~/.config/openclaw-command-center/bridge-token — it must never return
  // to data.json, which Obsidian persists world-readably with .bak copies.
  // vaultZKPreferPlugin removed same day: the vault-zettelkasten plugin api is
  // the only Zettelkasten lane; the stdio subprocess was retired.)
  // Trevorobeyinc Research Memory MCP — auto-ingest synthesizer output as a vector
  // memory of every shipped pack (added 2026-04-26).
  autoIngestToResearchMemory: boolean;
  researchMemoryCliPath: string;
  researchMemoryDefaultClient: string;
  researchMemoryTimeoutMs: number;
  // The video pipeline's settings (src/video/, 2026-11-19), defaulting to the retired Raycast runner's
  // values. The transcriber BINARIES are fixed in src/video/transcribe.ts, never settings: data.json
  // lives in the vault. (Phase 3's temporary `videoBackend` switch went with the Raycast path in phase 4,
  // 2026-11-20; main.ts scrubs a stored value.)
  videoDownloadFolder: string;
  videoSummaryFolder: string;
  videoTranscriber: "parakeet" | "whisper";
  videoWhisperModel: string;
  videoWhisperTask: "translate" | "transcribe";
  videoTranscriptSource: "whisper" | "auto";
  videoCleanupAfterSummary: boolean;
}

// ── MCP/JSON-RPC Types ───────────────────────────────────────────

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
}
