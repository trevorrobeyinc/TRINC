import { Modal, Setting, App, Notice } from "obsidian";
import type OpenClawPlugin from "../main";
import type { WorkflowTemplate, InputProperty } from "../types";
import { loadTemplates } from "../util/template-loader";

export class WorkflowModal extends Modal {
  private plugin: OpenClawPlugin;
  private templates: WorkflowTemplate[] = [];
  private selectedTemplate: WorkflowTemplate | null = null;
  private inputValues: Record<string, string> = {};

  constructor(app: App, plugin: OpenClawPlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen(): void {
    this.templates = this.loadTemplates();
    if (this.templates.length === 0) {
      this.contentEl.createEl("p", {
        text: "No workflow templates found. Check your OpenClaw path in settings.",
      });
      return;
    }
    this.renderTemplateList();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private loadTemplates(): WorkflowTemplate[] {
    // Shared loader (util/template-loader.ts) — includes the sort guard for
    // templates without the optional `name` field.
    return loadTemplates(this.plugin.settings.openclawPath);
  }

  private renderTemplateList(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Run OpenClaw Workflow" });
    contentEl.createEl("p", {
      text: "Select a workflow template:",
      cls: "oc-modal-subtitle",
    });

    for (const template of this.templates) {
      const card = contentEl.createDiv({ cls: "oc-template-card" });
      card.createEl("h4", { text: template.name });
      card.createEl("p", {
        text: template.description,
        cls: "oc-template-desc",
      });

      const meta = card.createDiv({ cls: "oc-template-meta" });
      const required = template.input_schema.required || [];
      meta.createEl("span", {
        text: `${template.pipeline.length} steps`,
        cls: "oc-tag",
      });
      meta.createEl("span", {
        text: `${required.length} inputs`,
        cls: "oc-tag",
      });
      meta.createEl("span", {
        text: template.provider_preference.primary,
        cls: "oc-tag",
      });

      card.addEventListener("click", () => {
        this.selectedTemplate = template;
        this.inputValues = {};
        // Pre-fill defaults
        for (const [key, prop] of Object.entries(
          template.input_schema.properties
        )) {
          if (prop.default) this.inputValues[key] = prop.default;
        }
        this.renderInputForm();
      });
    }
  }

  private renderInputForm(): void {
    const template = this.selectedTemplate;
    if (!template) return;

    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h2", { text: template.name });

    const backBtn = contentEl.createEl("button", {
      text: "Back to templates",
      cls: "oc-back-btn",
    });
    backBtn.addEventListener("click", () => {
      this.selectedTemplate = null;
      this.renderTemplateList();
    });

    contentEl.createEl("p", {
      text: template.description,
      cls: "oc-modal-subtitle",
    });

    const required = new Set(template.input_schema.required || []);
    const properties = template.input_schema.properties;

    for (const [key, prop] of Object.entries(properties) as Array<
      [string, InputProperty]
    >) {
      const label = `${key}${required.has(key) ? " *" : ""}`;
      new Setting(contentEl)
        .setName(label)
        .setDesc(prop.description)
        .addText((text) =>
          text
            .setPlaceholder(prop.default || "")
            .setValue(this.inputValues[key] || "")
            .onChange((value) => {
              this.inputValues[key] = value;
            })
        );
    }

    const runBtn = contentEl.createEl("button", {
      text: "Run Workflow",
      cls: "mod-cta oc-run-btn",
    });
    runBtn.addEventListener("click", () => {
      // Validate required fields
      for (const req of required) {
        if (!this.inputValues[req]?.trim()) {
          new Notice(`Missing required input: ${req}`);
          return;
        }
      }
      this.close();
      this.plugin.runWorkflow(
        template.workflow_template_id,
        this.inputValues
      );
    });
  }
}
