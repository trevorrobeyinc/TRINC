import type { WorkflowState, StderrEvent } from "../types";
import { PathResolver } from "../util/path-resolver";
import { readJsonFile } from "../util/json-reader";
import { readdirSync, statSync } from "fs";
import { join } from "path";

type StateChangeCallback = (state: WorkflowState) => void;
type WorkflowDoneCallback = (state: WorkflowState) => void;

/**
 * Tracks a running workflow by:
 * 1. Parsing stderr events to extract the workflow_id (primary)
 * 2. Scanning the workflows directory for new directories (fallback)
 * 3. Polling the workflow state file for step-level progress
 * 4. Firing onWorkflowDone exactly once when a terminal state is detected
 */
export class WorkflowTracker {
  private workflowId: string | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private dirScanTimer: ReturnType<typeof setInterval> | null = null;
  private lastStateJson = "";
  private pathResolver: PathResolver;
  private pollIntervalMs: number;
  private doneFired = false;
  private existingDirs: Set<string> | null = null;

  onStateChange: StateChangeCallback = () => {};
  onWorkflowDone: WorkflowDoneCallback = () => {};

  constructor(openclawPath: string, pollIntervalMs: number) {
    this.pathResolver = new PathResolver(openclawPath);
    this.pollIntervalMs = pollIntervalMs;
  }

  /**
   * Feed stderr events from the OpenClaw runner. Watches for events
   * with workflow_id to begin state file polling.
   */
  handleEvent(event: StderrEvent): void {
    if (event.workflow_id && !this.workflowId) {
      this.workflowId = event.workflow_id as string;
      console.log("[OpenClaw:Tracker] Got workflow_id from stderr:", this.workflowId);
      this.stopDirScan();
      this.startPolling();
    }
  }

  /**
   * Start scanning the workflows directory for new directories.
   * This is the FALLBACK for when stderr doesn't provide workflow_id.
   * Called immediately when the workflow is started.
   */
  startDirScan(): void {
    if (this.dirScanTimer) return;
    if (this.workflowId) return; // Already have it

    // Snapshot existing directories
    const workflowsDir = this.pathResolver.workflowsDir;
    try {
      this.existingDirs = new Set(
        readdirSync(workflowsDir).filter(d => d.startsWith("workflow-"))
      );
    } catch {
      this.existingDirs = new Set();
    }
    console.log("[OpenClaw:Tracker] Dir scan started. Existing dirs:", this.existingDirs.size);

    this.dirScanTimer = setInterval(() => {
      try {
        const currentDirs = readdirSync(workflowsDir)
          .filter(d => d.startsWith("workflow-"));

        for (const dir of currentDirs) {
          if (!this.existingDirs!.has(dir)) {
            // Found a new workflow directory
            console.log("[OpenClaw:Tracker] Dir scan found new workflow:", dir);
            this.workflowId = dir;
            this.stopDirScan();
            this.startPolling();
            return;
          }
        }
      } catch {
        // Ignore read errors
      }
    }, 3000);
  }

  /** Stop the directory scanner. */
  private stopDirScan(): void {
    if (this.dirScanTimer) {
      clearInterval(this.dirScanTimer);
      this.dirScanTimer = null;
      console.log("[OpenClaw:Tracker] Dir scan stopped");
    }
  }

  /** Stop polling (but preserve workflowId for post-completion reads). */
  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.stopDirScan();
  }

  /** Get the detected workflow ID (null if not yet detected). */
  getWorkflowId(): string | null {
    return this.workflowId;
  }

  /** Has the completion callback already been fired? */
  isDone(): boolean {
    return this.doneFired;
  }

  /** Do a single read of the current workflow state. */
  readCurrentState(): WorkflowState | null {
    if (!this.workflowId) return null;
    const filePath = this.pathResolver.workflowStateFile(this.workflowId);
    return readJsonFile<WorkflowState>(filePath);
  }

  private startPolling(): void {
    if (this.pollTimer) return;
    if (!this.workflowId) return;

    console.log("[OpenClaw:Tracker] Started polling workflow:", this.workflowId, "every", this.pollIntervalMs, "ms");

    // Do an immediate first poll
    this.poll();

    this.pollTimer = setInterval(() => this.poll(), this.pollIntervalMs);
  }

  private poll(): void {
    const state = this.readCurrentState();
    if (!state) {
      console.log("[OpenClaw:Tracker] Poll: workflow.json not readable yet");
      return;
    }

    const stateJson = JSON.stringify(state);
    if (stateJson !== this.lastStateJson) {
      this.lastStateJson = stateJson;
      const step = state.pipeline_progress?.current_step || "none";
      const completed = state.pipeline_progress?.completed_steps ?? 0;
      const total = state.pipeline_progress?.total_steps ?? 0;
      console.log(`[OpenClaw:Tracker] State change: status=${state.status}, step=${step} (${completed}/${total})`);
      this.onStateChange(state);
    }

    // Fire onWorkflowDone exactly once when terminal
    if (
      (state.status === "completed" || state.status === "failed") &&
      !this.doneFired
    ) {
      this.doneFired = true;
      console.log("[OpenClaw:Tracker] COMPLETION DETECTED:", state.status, "workflow:", state.workflow_id);
      this.stop();
      console.log("[OpenClaw:Tracker] Firing onWorkflowDone callback...");
      this.onWorkflowDone(state);
    }
  }
}
