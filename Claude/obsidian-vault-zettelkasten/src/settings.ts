import { App, PluginSettingTab, Setting } from "obsidian";
import type VaultZettelkastenPlugin from "./main";

export class VaultZKSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: VaultZettelkastenPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    /* ── LLM Configuration ────────────────────────────────────── */

    containerEl.createEl("h2", { text: "LLM Configuration" });

    new Setting(containerEl)
      .setName("Provider")
      .setDesc("LLM provider for Zettelkasten analysis")
      .addDropdown((d) =>
        d
          .addOption("lm-studio", "LM Studio")
          .addOption("ollama", "Ollama")
          .addOption("openai", "OpenAI")
          .setValue(this.plugin.settings.llmProvider)
          .onChange(async (v) => {
            this.plugin.settings.llmProvider = v as any;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Base URL")
      .setDesc("API endpoint (e.g. https://127.0.0.1:1235/v1 — LM Studio via TLS proxy)")
      .addText((t) =>
        t
          .setPlaceholder("https://127.0.0.1:1235/v1")
          .setValue(this.plugin.settings.llmBaseUrl)
          .onChange(async (v) => {
            this.plugin.settings.llmBaseUrl = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Model name")
      .setDesc("Model identifier sent in API requests")
      .addText((t) =>
        t
          .setPlaceholder("qwen2.5-coder-7b-instruct")
          .setValue(this.plugin.settings.llmModelName)
          .onChange(async (v) => {
            this.plugin.settings.llmModelName = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("API key")
      .setDesc("Optional — leave blank for local providers")
      .addText((t) => {
        t.inputEl.type = "password";
        t
          .setPlaceholder("sk-...")
          .setValue(this.plugin.settings.llmApiKey)
          .onChange(async (v) => {
            this.plugin.settings.llmApiKey = v;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Temperature")
      .setDesc("0.0 = deterministic, 1.0 = creative")
      .addSlider((s) =>
        s
          .setLimits(0, 1.5, 0.1)
          .setValue(this.plugin.settings.llmTemperature)
          .setDynamicTooltip()
          .onChange(async (v) => {
            this.plugin.settings.llmTemperature = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Max tokens")
      .setDesc("Maximum output tokens per LLM call")
      .addText((t) =>
        t
          .setPlaceholder("2048")
          .setValue(String(this.plugin.settings.llmMaxTokens))
          .onChange(async (v) => {
            const n = parseInt(v, 10);
            if (!isNaN(n) && n > 0) {
              this.plugin.settings.llmMaxTokens = n;
              await this.plugin.saveSettings();
            }
          })
      );

    /* ── Miyo ─────────────────────────────────────────────────── */

    containerEl.createEl("h2", { text: "Miyo Semantic Search" });

    new Setting(containerEl)
      .setName("Miyo base URL")
      .setDesc("Miyo server endpoint")
      .addText((t) =>
        t
          .setPlaceholder("https://127.0.0.1:8743")
          .setValue(this.plugin.settings.miyoBaseUrl)
          .onChange(async (v) => {
            this.plugin.settings.miyoBaseUrl = v;
            await this.plugin.saveSettings();
          })
      );

    /* ── Qdrant ───────────────────────────────────────────────── */

    containerEl.createEl("h2", { text: "Qdrant Vector DB" });

    new Setting(containerEl)
      .setName("Qdrant base URL")
      .setDesc("Qdrant server endpoint")
      .addText((t) =>
        t
          .setPlaceholder("https://127.0.0.1:6433")
          .setValue(this.plugin.settings.qdrantBaseUrl)
          .onChange(async (v) => {
            this.plugin.settings.qdrantBaseUrl = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Collection name")
      .setDesc("Qdrant collection used by Miyo")
      .addText((t) =>
        t
          .setPlaceholder("miyo")
          .setValue(this.plugin.settings.qdrantCollection)
          .onChange(async (v) => {
            this.plugin.settings.qdrantCollection = v;
            await this.plugin.saveSettings();
          })
      );

    /* ── Scheduler ────────────────────────────────────────────── */

    containerEl.createEl("h2", { text: "Scheduled Tasks" });

    new Setting(containerEl)
      .setName("Orphan scan")
      .setDesc("Daily 2:00 AM — batch orphan rescue analysis")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.enableOrphanScan).onChange(async (v) => {
          this.plugin.settings.enableOrphanScan = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Health digest")
      .setDesc("Weekly Sunday 9:00 AM — vault health report")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.enableHealthDigest).onChange(async (v) => {
          this.plugin.settings.enableHealthDigest = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Serendipity digest")
      .setDesc("Weekly Wednesday 9:00 AM — serendipity on a random recent note")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.enableSerendipityDigest).onChange(async (v) => {
          this.plugin.settings.enableSerendipityDigest = v;
          await this.plugin.saveSettings();
        })
      );

    /* ── Reports ──────────────────────────────────────────────── */

    containerEl.createEl("h2", { text: "Reports" });

    new Setting(containerEl)
      .setName("Reports folder")
      .setDesc("Vault folder for scheduled report output")
      .addText((t) =>
        t
          .setPlaceholder("Zettelkasten/Reports")
          .setValue(this.plugin.settings.reportsFolder)
          .onChange(async (v) => {
            this.plugin.settings.reportsFolder = v;
            await this.plugin.saveSettings();
          })
      );
  }
}
