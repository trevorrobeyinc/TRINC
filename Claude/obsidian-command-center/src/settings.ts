import { App, PluginSettingTab, Setting } from "obsidian";
import type OpenClawPlugin from "./main";
import { existsSync } from "fs";
import { join } from "path";

export class OpenClawSettingTab extends PluginSettingTab {
  plugin: OpenClawPlugin;
  private statusInterval: number | null = null;
  private pathValidationEl: HTMLElement | null = null;

  constructor(app: App, plugin: OpenClawPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "OpenClaw Command Center" });

    // --- Engine ---
    containerEl.createEl("h3", { text: "Engine" });

    new Setting(containerEl)
      .setName("OpenClaw engine path")
      .setDesc(
        "Absolute path to the research-engine workspace root (the Trevor Robey Intelligence Network Citations directory in the TrevClaw-Obsidianodus monorepo)."
      )
      .addText((text) =>
        text
          .setPlaceholder(
            "/Users/myhome/TrevClaw-Obsidianodus/Trevor Robey Intelligence Network Citations"
          )
          .setValue(this.plugin.settings.openclawPath)
          .onChange(async (value) => {
            this.plugin.settings.openclawPath = value.trim();
            await this.plugin.saveSettings();
            this.validateOpenClawPath();
          })
      );

    // Validation message renders directly under the path field it validates
    // (it used to append to the bottom of the whole settings tab).
    this.pathValidationEl = containerEl.createDiv({ cls: "oc-path-validation" });

    new Setting(containerEl)
      .setName("Node.js path")
      .setDesc("Path to the Node.js binary. Leave empty to use Obsidian's bundled Node.")
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

    // --- Pipeline stages ---
    containerEl.createEl("h3", { text: "Pipeline stages" });
    containerEl.createEl("p", {
      cls: "setting-item-description",
      text:
        "Post-workflow stages are independent: turning one off never disables the others. " +
        "The chat notification and Research Memory ingest always run on their own toggles; " +
        "Miyo indexing and Zettelkasten linking operate on the generated notes, so they " +
        "additionally need note generation to have produced output.",
    });

    new Setting(containerEl)
      .setName("Auto-generate notes")
      .setDesc("Create vault notes when a workflow completes (the notes stage only).")
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
        "Run graph analysis on the synthesizer note after note generation — in-process via the vault-zettelkasten plugin (the old subprocess server was retired 2026-08-20)."
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
        "Use Miyo semantic search to find related vault notes during auto-linking, and index freshly generated notes."
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

    const bridgeStatusSetting = new Setting(containerEl).setName("Bridge status");

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
    // Auto-refresh while the tab is open (the status used to only update on
    // open and on button clicks). Cleared in hide().
    if (this.statusInterval !== null) {
      window.clearInterval(this.statusInterval);
    }
    this.statusInterval = window.setInterval(updateBridgeStatus, 2000);

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
      .setDesc("Automatically start the bridge when Obsidian loads")
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
      .setDesc(
        "Port for the HTTPS MCP bridge (default 8799 — coordinated in the monorepo port map). If the bridge is running, changing this restarts it on the new port."
      )
      .addText((text) =>
        text
          .setPlaceholder("8799")
          .setValue(String(this.plugin.settings.bridgePort))
          .onChange(async (value) => {
            const n = parseInt(value, 10);
            if (!isNaN(n) && n > 0 && n < 65536) {
              this.plugin.settings.bridgePort = n;
              await this.plugin.saveSettings();
              // Rebind: the server captures the port at listen time, so a port
              // change on a running bridge silently kept the old socket before.
              if (this.plugin.isBridgeRunning) {
                try {
                  await this.plugin.stopBridge();
                  await this.plugin.startBridge();
                } catch (err: unknown) {
                  console.error(
                    "[OpenClaw] Bridge rebind failed:",
                    err instanceof Error ? err.message : String(err)
                  );
                }
                updateBridgeStatus();
              }
            }
          })
      );

    // --- Trevorobeyinc Research Memory ---
    containerEl.createEl("h3", { text: "Trevorobeyinc Research Memory" });

    new Setting(containerEl)
      .setName("Auto-ingest pack to Research Memory")
      .setDesc(
        "On workflow completion, embed and store the synthesizer output in the trevorobeyinc-research-memory store (Qdrant collection trevorobeyinc-packs + nomic-embed-text-v1, both local). Runs on its own toggle — works even when note generation is off (reads the engine's on-disk synthesizer artifact). Failure is non-blocking: the pack still ships; the CLI logs to ~/Claude/.logs/research-memory.log."
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
          .setPlaceholder(
            "/Users/myhome/TrevClaw-Obsidianodus/Claude/trevorobeyinc-research-memory-mcp/dist/cli.js"
          )
          .setValue(this.plugin.settings.researchMemoryCliPath)
          .onChange(async (value) => {
            this.plugin.settings.researchMemoryCliPath = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Client tag")
      .setDesc(
        "Client value passed to pack_ingest — a tenant tag stored as a filterable field on every ingested pack."
      )
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
      .setDesc(
        "Hard cap on how long the ingest subprocess can run before being killed. Embedding ~30s + Qdrant write — 60000ms (60s) is safe."
      )
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

    // --- Advanced ---
    containerEl.createEl("h3", { text: "Advanced" });

    new Setting(containerEl)
      .setName("Poll interval (ms)")
      .setDesc("How often to check the workflow state file for progress updates")
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
      .setName("Workflow timeout warning (ms)")
      .setDesc(
        "After this long the plugin logs a console WARNING — it never kills the run (completion is detected from workflow.json regardless). Use the Cancel Workflow command to force-stop. Default 1800000 (30 min)."
      )
      .addText((text) =>
        text
          .setPlaceholder("1800000")
          .setValue(String(this.plugin.settings.workflowTimeoutMs))
          .onChange(async (value) => {
            const n = parseInt(value, 10);
            if (!isNaN(n) && n >= 60000) {
              this.plugin.settings.workflowTimeoutMs = n;
              await this.plugin.saveSettings();
            }
          })
      );

    this.validateOpenClawPath();
  }

  hide(): void {
    if (this.statusInterval !== null) {
      window.clearInterval(this.statusInterval);
      this.statusInterval = null;
    }
  }

  private validateOpenClawPath(): void {
    const el = this.pathValidationEl;
    if (!el) return;
    el.empty();

    const p = this.plugin.settings.openclawPath;
    if (!p) return;

    const scriptPath = join(p, "scripts", "run-workflow.js");
    if (existsSync(scriptPath)) {
      el.createEl("p", {
        text: "OpenClaw path verified.",
        cls: "oc-path-valid",
      });
    } else {
      el.createEl("p", {
        text: "Could not find scripts/run-workflow.js at the configured path.",
        cls: "oc-path-invalid",
      });
    }
  }
}
