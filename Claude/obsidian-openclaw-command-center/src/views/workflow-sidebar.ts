import { ItemView, WorkspaceLeaf } from "obsidian";
import { VIEW_TYPE_WORKFLOW, STEP_TYPE_LABELS, STEP_STATUS_ICONS } from "../constants";
import type { WorkflowState, PipelineStep, WorkflowResult } from "../types";

export class WorkflowStatusView extends ItemView {
  private state: WorkflowState | null = null;
  private lastResult: WorkflowResult | null = null;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_WORKFLOW;
  }

  getDisplayText(): string {
    return "trevor-robey-inc Pipeline";
  }

  getIcon(): string {
    return "activity";
  }

  async onOpen(): Promise<void> {
    this.renderIdle();
  }

  async onClose(): Promise<void> {
    this.contentEl.empty();
  }

  /** Update with live workflow state from the tracker. */
  updateState(state: WorkflowState): void {
    this.state = state;
    this.renderPipeline();
  }

  /** Show final result after workflow completes. */
  showResult(result: WorkflowResult): void {
    this.lastResult = result;
    // Read state from result for rendering
    this.state = {
      workflow_id: result.workflow_id,
      template_id: "",
      status: result.status,
      inputs: {},
      created_at: "",
      updated_at: "",
      completed_at: null,
      pipeline_progress: result.pipeline_progress,
      artifacts: result.artifacts,
      error: result.error,
    };
    this.renderPipeline();
  }

  /** Show error state. */
  showError(message: string): void {
    const container = this.contentEl;
    container.empty();
    const wrapper = container.createDiv({ cls: "oc-sidebar" });
    wrapper.createEl("h4", { text: "trevor-robey-inc Pipeline" });
    const errorEl = wrapper.createDiv({ cls: "oc-error" });
    errorEl.createEl("p", { text: message });
  }

  /** Render idle state (no workflow running). */
  renderIdle(): void {
    const container = this.contentEl;
    container.empty();
    const wrapper = container.createDiv({ cls: "oc-sidebar" });
    wrapper.createEl("h4", { text: "trevor-robey-inc Pipeline" });
    wrapper.createEl("p", {
      text: "No workflow running. Use the command palette to start one.",
      cls: "oc-idle-text",
    });

    if (this.lastResult) {
      wrapper.createEl("h5", { text: "Last Run" });
      this.renderStepList(wrapper, this.lastResult.pipeline_progress.steps);
    }
  }

  private renderPipeline(): void {
    const state = this.state;
    if (!state) return;

    const container = this.contentEl;
    container.empty();
    const wrapper = container.createDiv({ cls: "oc-sidebar" });

    // Header
    const header = wrapper.createDiv({ cls: "oc-pipeline-header" });
    header.createEl("h4", { text: state.template_id || "Workflow" });
    header.createEl("span", {
      text: state.status,
      cls: `oc-status-badge oc-status-${state.status}`,
    });

    // Workflow ID
    if (state.workflow_id) {
      wrapper.createEl("code", {
        text: state.workflow_id,
        cls: "oc-workflow-id",
      });
    }

    // Progress bar
    const progress = state.pipeline_progress;
    if (progress) {
      const pct =
        progress.total_steps > 0
          ? (progress.completed_steps / progress.total_steps) * 100
          : 0;

      const barOuter = wrapper.createDiv({ cls: "oc-progress-bar" });
      barOuter.createDiv({
        cls: "oc-progress-fill",
        attr: { style: `width: ${pct}%` },
      });

      wrapper.createEl("p", {
        text: `${progress.completed_steps} / ${progress.total_steps} steps`,
        cls: "oc-progress-text",
      });

      // Step list
      this.renderStepList(wrapper, progress.steps);
    }

    // Inputs
    if (state.inputs && Object.keys(state.inputs).length > 0) {
      const inputsSection = wrapper.createDiv({ cls: "oc-inputs-section" });
      inputsSection.createEl("h5", { text: "Inputs" });
      for (const [key, val] of Object.entries(state.inputs)) {
        inputsSection.createEl("p", {
          text: `${key}: ${val}`,
          cls: "oc-input-item",
        });
      }
    }

    // Quality report
    const qr = state.artifacts?.quality_report;
    if (qr) {
      const qualitySection = wrapper.createDiv({ cls: "oc-quality-section" });
      qualitySection.createEl("h5", { text: "Quality" });
      qualitySection.createEl("p", {
        text: `Confidence: ${qr.overall_confidence.toFixed(2)}`,
      });
      qualitySection.createEl("p", {
        text: `Citations: ${qr.verified_claims} / ${qr.total_claims}`,
      });
      qualitySection.createEl("span", {
        text: qr.pass ? "PASS" : "FAIL",
        cls: `oc-quality-badge oc-quality-${qr.pass ? "pass" : "fail"}`,
      });
    }

    // Error
    if (state.error) {
      const errorEl = wrapper.createDiv({ cls: "oc-error" });
      errorEl.createEl("p", { text: `Error: ${state.error.message}` });
      if (state.error.code) {
        errorEl.createEl("code", { text: state.error.code });
      }
    }
  }

  private renderStepList(parent: HTMLElement, steps: PipelineStep[]): void {
    const stepList = parent.createDiv({ cls: "oc-step-list" });
    for (const step of steps) {
      const stepEl = stepList.createDiv({
        cls: `oc-step oc-step-${step.status}`,
      });
      stepEl.createEl("span", {
        cls: "oc-step-icon",
        text: STEP_STATUS_ICONS[step.status] || "\u2022",
      });
      const label = STEP_TYPE_LABELS[step.type] || step.type;
      stepEl.createEl("span", {
        cls: "oc-step-label",
        text: `${step.step_id} (${label})`,
      });
      if (step.status === "running") {
        stepEl.createEl("span", { cls: "oc-step-spinner" });
      }
    }
  }
}
