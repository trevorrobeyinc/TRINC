import { App, PluginSettingTab, Setting } from "obsidian";
import type OpenClawPlugin from "./main";
import { existsSync } from "fs";
import { join } from "path";

export class OpenClawSettingTab extends PluginSettingTab {
  plugin: OpenClawPlugin;

  constructor(app: App, plugin: OpenClawPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "OpenClaw Command Center" });

    // --- Paths ---
    containerEl.createEl("h3", { text: "Paths" });

    new Setting(containerEl)
      .setName("OpenClaw path")
      .setDesc("Absolute path to the trevor-robey-inc-agents repository root (OpenClaw engine)")
      .addText((text) =>
        text
          .setPlaceholder("/Users/myhome/Code/trevor-robey-inc-agents")
          .setValue(this.plugin.settings.openclawPath)
          .onChange(async (value) => {
            this.plugin.settings.openclawPath = value.trim();
            await this.plugin.saveSettings();
            this.validateOpenClawPath(containerEl);
          })
      );

    new Setting(containerEl)
      .setName("Zettelkasten MCP server path")
      .setDesc("Absolute path to the Medical Zettelkasten MCP server.js")
      .addText((text) =>
        text
          .setPlaceholder(
            "/Users/myhome/Code/Claude/Medical-Zettelkasten-MCP/src/server.js"
          )
          .setValue(this.plugin.settings.zettelkastenServerPath)
          .onChange(async (value) => {
            this.plugin.settings.zettelkastenServerPath = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Node.js path")
      .setDesc(
        "Path to Node.js binary. Leave empty to use the system default."
      )
      .addText((text) =>
        text
          .setPlaceholder("(auto-detect)")
          .setValue(this.plugin.settings.nodePath)
          .onChange(async (value) => {
            this.plugin.settings.nodePath = value.trim();
            await this.plugin.saveSettings();
          })
      );

    // --- Vault ---
    containerEl.createEl("h3", { text: "Vault" });

    new Setting(containerEl)
      .setName("Output folder")
      .setDesc("Vault folder for generated research notes (relative to vault root)")
      .addText((text) =>
        text
          .setPlaceholder("OpenClaw")
          .setValue(this.plugin.settings.vaultOutputFolder)
          .onChange(async (value) => {
            this.plugin.settings.vaultOutputFolder = value.trim() || "OpenClaw";
            await this.plugin.saveSettings();
          })
      );

    // --- Behavior ---
    containerEl.createEl("h3", { text: "Behavior" });

    new Setting(containerEl)
      .setName("Auto-generate notes")
      .setDesc("Automatically create vault notes when a workflow completes")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoGenerateNotes)
          .onChange(async (value) => {
            this.plugin.settings.autoGenerateNotes = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Auto-run Zettelkasten")
      .setDesc(
        "Automatically run Zettelkasten graph analysis after note generation"
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoRunZettelkasten)
          .onChange(async (value) => {
            this.plugin.settings.autoRunZettelkasten = value;
            await this.plugin.saveSettings();
          })
      );

    // --- Miyo Semantic Search ---
    containerEl.createEl("h3", { text: "Miyo Semantic Search" });

    new Setting(containerEl)
      .setName("Enable Miyo")
      .setDesc(
        "Use Miyo semantic search to find related vault notes during auto-linking"
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.miyoEnabled)
          .onChange(async (value) => {
            this.plugin.settings.miyoEnabled = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Miyo port")
      .setDesc(
        "HTTPS port for the Miyo TLS proxy (default 8743). Always point this at the HTTPS proxy port, not Miyo's plaintext upstream — per the monorepo HTTPS-only invariant."
      )
      .addText((text) =>
        text
          .setPlaceholder("8743")
          .setValue(String(this.plugin.settings.miyoPort))
          .onChange(async (value) => {
            const n = parseInt(value, 10);
            if (!isNaN(n) && n > 0) {
              this.plugin.settings.miyoPort = n;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName("Similarity threshold")
      .setDesc("Minimum score (0-1) for Miyo results to be included")
      .addText((text) =>
        text
          .setPlaceholder("0.5")
          .setValue(String(this.plugin.settings.miyoSimilarityThreshold))
          .onChange(async (value) => {
            const n = parseFloat(value);
            if (!isNaN(n) && n >= 0 && n <= 1) {
              this.plugin.settings.miyoSimilarityThreshold = n;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName("Max results")
      .setDesc("Maximum number of Miyo semantic matches to include")
      .addText((text) =>
        text
          .setPlaceholder("10")
          .setValue(String(this.plugin.settings.miyoMaxResults))
          .onChange(async (value) => {
            const n = parseInt(value, 10);
            if (!isNaN(n) && n > 0) {
              this.plugin.settings.miyoMaxResults = n;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName("Index wait timeout (ms)")
      .setDesc("Max time to wait for Miyo to index new notes before searching")
      .addText((text) =>
        text
          .setPlaceholder("15000")
          .setValue(String(this.plugin.settings.miyoIndexWaitMs))
          .onChange(async (value) => {
            const n = parseInt(value, 10);
            if (!isNaN(n) && n >= 0) {
              this.plugin.settings.miyoIndexWaitMs = n;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName("Index poll interval (ms)")
      .setDesc("How often to check if Miyo has finished indexing new notes")
      .addText((text) =>
        text
          .setPlaceholder("1000")
          .setValue(String(this.plugin.settings.miyoIndexPollIntervalMs))
          .onChange(async (value) => {
            const n = parseInt(value, 10);
            if (!isNaN(n) && n >= 200) {
              this.plugin.settings.miyoIndexPollIntervalMs = n;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName("Search retries")
      .setDesc("Number of retry attempts if Miyo search returns empty results")
      .addText((text) =>
        text
          .setPlaceholder("3")
          .setValue(String(this.plugin.settings.miyoSearchRetries))
          .onChange(async (value) => {
            const n = parseInt(value, 10);
            if (!isNaN(n) && n >= 0 && n <= 10) {
              this.plugin.settings.miyoSearchRetries = n;
              await this.plugin.saveSettings();
            }
          })
      );

    // --- Copilot Bridge ---
    containerEl.createEl("h3", { text: "Copilot Bridge" });

    // Live status indicator + Start/Stop buttons
    const bridgeStatusSetting = new Setting(containerEl)
      .setName("Bridge status");

    const statusEl = bridgeStatusSetting.descEl.createSpan({
      cls: "oc-bridge-status",
    });

    const updateBridgeStatus = () => {
      const running = this.plugin.isBridgeRunning;
      const port = this.plugin.settings.bridgePort;
      statusEl.empty();
      if (running) {
        statusEl.setText(`Running on port ${port}`);
        statusEl.className = "oc-bridge-status oc-bridge-running";
      } else {
        statusEl.setText("Stopped");
        statusEl.className = "oc-bridge-status oc-bridge-stopped";
      }
    };

    updateBridgeStatus();

    bridgeStatusSetting
      .addButton((btn) =>
        btn.setButtonText("Start").onClick(async () => {
          try {
            await this.plugin.startBridge();
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error("[OpenClaw] Bridge start failed:", msg);
          }
          updateBridgeStatus();
        })
      )
      .addButton((btn) =>
        btn
          .setButtonText("Stop")
          .setWarning()
          .onClick(async () => {
            try {
              await this.plugin.stopBridge();
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : String(err);
              console.error("[OpenClaw] Bridge stop failed:", msg);
            }
            updateBridgeStatus();
          })
      );

    new Setting(containerEl)
      .setName("Enable on startup")
      .setDesc(
        "Automatically start the bridge when Obsidian loads"
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableCopilotBridge)
          .onChange(async (value) => {
            this.plugin.settings.enableCopilotBridge = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Bridge port")
      .setDesc("Port for the MCP bridge HTTP server")
      .addText((text) =>
        text
          .setPlaceholder("8799")
          .setValue(String(this.plugin.settings.bridgePort))
          .onChange(async (value) => {
            const n = parseInt(value, 10);
            if (!isNaN(n) && n > 0 && n < 65536) {
              this.plugin.settings.bridgePort = n;
              await this.plugin.saveSettings();
            }
          })
      );

    // --- Trevorobeyinc Research Memory ---
    containerEl.createEl("h3", { text: "Trevorobeyinc Research Memory" });

    new Setting(containerEl)
      .setName("Auto-ingest pack to Research Memory")
      .setDesc(
        "On workflow completion, embed and store the synthesizer output in the trevorobeyinc-research-memory MCP (Qdrant + nomic-embed-text-v1). Builds a permanent searchable memory of every shipped pack. Failure is non-blocking — the pack still ships, ingestion logs to ~/Claude/.logs/research-memory.log."
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoIngestToResearchMemory)
          .onChange(async (value) => {
            this.plugin.settings.autoIngestToResearchMemory = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Research Memory CLI path")
      .setDesc("Absolute path to the trevorobeyinc-research-memory CLI (dist/cli.js).")
      .addText((text) =>
        text
          .setValue(this.plugin.settings.researchMemoryCliPath)
          .onChange(async (value) => {
            this.plugin.settings.researchMemoryCliPath = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Default client tag")
      .setDesc("Client value passed to pack_ingest when no per-workflow override is set.")
      .addText((text) =>
        text
          .setValue(this.plugin.settings.researchMemoryDefaultClient)
          .onChange(async (value) => {
            this.plugin.settings.researchMemoryDefaultClient = value.trim() || "internal";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Ingest timeout (ms)")
      .setDesc("Hard cap on how long the ingest subprocess can run before being killed. Embedding ~30s + Qdrant write — 60000ms (60s) is safe.")
      .addText((text) =>
        text
          .setValue(String(this.plugin.settings.researchMemoryTimeoutMs))
          .onChange(async (value) => {
            const n = Number(value);
            if (Number.isFinite(n) && n >= 5000 && n <= 600000) {
              this.plugin.settings.researchMemoryTimeoutMs = n;
              await this.plugin.saveSettings();
            }
          })
      );

    // --- VaultZK Plugin ---
    containerEl.createEl("h3", { text: "VaultZK Plugin" });

    new Setting(containerEl)
      .setName("Prefer VaultZK plugin (in-process)")
      .setDesc(
        "When the VaultZK plugin is installed, use its in-process API for Zettelkasten analysis instead of the subprocess MCP server. Falls back to subprocess automatically if the plugin is not available."
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.vaultZKPreferPlugin)
          .onChange(async (value) => {
            this.plugin.settings.vaultZKPreferPlugin = value;
            await this.plugin.saveSettings();
          })
      );

    // --- Advanced ---
    containerEl.createEl("h3", { text: "Advanced" });

    new Setting(containerEl)
      .setName("Poll interval (ms)")
      .setDesc("How often to check workflow state file for progress updates")
      .addText((text) =>
        text
          .setPlaceholder("2000")
          .setValue(String(this.plugin.settings.pollIntervalMs))
          .onChange(async (value) => {
            const n = parseInt(value, 10);
            if (!isNaN(n) && n >= 500) {
              this.plugin.settings.pollIntervalMs = n;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName("Workflow timeout (ms)")
      .setDesc("Maximum time to wait for a workflow before killing it")
      .addText((text) =>
        text
          .setPlaceholder("600000")
          .setValue(String(this.plugin.settings.workflowTimeoutMs))
          .onChange(async (value) => {
            const n = parseInt(value, 10);
            if (!isNaN(n) && n >= 60000) {
              this.plugin.settings.workflowTimeoutMs = n;
              await this.plugin.saveSettings();
            }
          })
      );

    this.validateOpenClawPath(containerEl);
  }

  private validateOpenClawPath(containerEl: HTMLElement): void {
    const existing = containerEl.querySelector(".oc-path-validation");
    if (existing) existing.remove();

    const p = this.plugin.settings.openclawPath;
    if (!p) return;

    const el = containerEl.createDiv({ cls: "oc-path-validation" });
    const scriptPath = join(p, "scripts", "run-workflow.js");

    if (existsSync(scriptPath)) {
      el.createEl("p", {
        text: "OpenClaw path verified.",
        cls: "oc-path-valid",
      });
    } else {
      el.createEl("p", {
        text: `Could not find scripts/run-workflow.js at the configured path.`,
        cls: "oc-path-invalid",
      });
    }
  }
}
