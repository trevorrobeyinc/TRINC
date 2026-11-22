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
        "Absolute path to the research-engine workspace root (the Trevor Robey Intelligence Network Citations directory in the TRINC monorepo)."
      )
      .addText((text) =>
        text
          .setPlaceholder(
            "/Users/myhome/TRINC/Trevor Robey Intelligence Network Citations"
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
      .setDesc(
        "Locate the run's vault notes when a workflow completes. Since 2026-09-22 the engine writes them itself after the citation gate passes; this stage rehydrates from that record and only generates notes in-plugin when the engine wrote nothing."
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoGenerateNotes)
          .onChange(async (value) => {
            this.plugin.settings.autoGenerateNotes = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Backfill engine-written notes on load")
      .setDesc(
        "On startup, run the engine's vault publisher over every completed run on disk so runs that finished while Obsidian was closed land in the vault (idempotent; skips already-written, failed, non-PASS and mock runs)."
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.backfillVaultNotesOnLoad)
          .onChange(async (value) => {
            this.plugin.settings.backfillVaultNotesOnLoad = value;
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

    new Setting(containerEl)
      .setName("Zettelkasten catch-up on load")
      .setDesc(
        "Runs that completed while Obsidian was closed get their notes from the engine but no Zettelkasten linking. On startup, link the synthesizer notes that lack the section (LLM cost: at most the number below per load)."
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.zkCatchUpOnLoad)
          .onChange(async (value) => {
            this.plugin.settings.zkCatchUpOnLoad = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Zettelkasten catch-up: max notes per load")
      .setDesc("Upper bound on synthesizer notes linked per startup (each is a hosted-model call).")
      .addText((text) =>
        text
          .setPlaceholder("2")
          .setValue(String(this.plugin.settings.zkCatchUpMaxPerLoad))
          .onChange(async (value) => {
            const n = parseInt(value, 10);
            if (Number.isFinite(n) && n >= 0 && n <= 20) {
              this.plugin.settings.zkCatchUpMaxPerLoad = n;
              await this.plugin.saveSettings();
            }
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

    // --- Video pipeline (2026-11-19, phase 3 of retiring Raycast and Downie) ---
    this.displayVideoPipelineSettings(containerEl);

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
            "/Users/myhome/TRINC/Claude/trevorobeyinc-research-memory-mcp/dist/cli.js"
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

  /** The video_pipeline_run backend switch and the built-in pipeline's settings. */
  private displayVideoPipelineSettings(containerEl: HTMLElement): void {
    const settings = this.plugin.settings;
    containerEl.createEl("h3", { text: "Video pipeline" });
    containerEl.createEl("p", {
      text:
        "Which backend video_pipeline_run uses for a local video file or folder. A URL always goes to the " +
        "Raycast runner for now. Both backends write the same run log, so video_pipeline_status reads either.",
      cls: "setting-item-description",
    });

    new Setting(containerEl)
      .setName("Backend for files and folders")
      .setDesc(
        "Raycast: open the Raycast Video Pipeline Runner (today's path). Built-in: transcribe and summarize " +
          "inside Obsidian, with no paid fallback; a failed summary ends the run, and the Copilot agent writes it."
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOption("raycast", "Raycast")
          .addOption("builtin", "Built-in (inside Obsidian)")
          .setValue(settings.videoBackend)
          .onChange(async (value) => {
            settings.videoBackend = value === "builtin" ? "builtin" : "raycast";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Video download folder")
      .setDesc(
        "Vault folder for transcription notes, and where the download script saves videos. After a " +
          "successful summary, a video inside this folder is deleted with its subtitle files (operator " +
          "decision, 2026-11-19); a video anywhere else is never touched."
      )
      .addText((text) =>
        text
          .setPlaceholder("Video Downloads")
          .setValue(settings.videoDownloadFolder)
          .onChange(async (value) => {
            settings.videoDownloadFolder = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Summary folder")
      .setDesc("Vault folder for the summary notes, '<title> summary.md'.")
      .addText((text) =>
        text
          .setPlaceholder("Copilot Summaries")
          .setValue(settings.videoSummaryFolder)
          .onChange(async (value) => {
            settings.videoSummaryFolder = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Transcriber")
      .setDesc(
        "Parakeet first, with Whisper as the fallback, or Whisper only. The binaries are fixed in the " +
          "plugin's code, not settings: ~/.local/bin/whisper-parakeet-shim for Parakeet, and " +
          "~/.local/venvs/fwhisper/bin/whisper-ctranslate2 for Whisper."
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOption("parakeet", "Parakeet, then Whisper")
          .addOption("whisper", "Whisper only")
          .setValue(settings.videoTranscriber)
          .onChange(async (value) => {
            settings.videoTranscriber = value === "whisper" ? "whisper" : "parakeet";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Whisper model")
      .setDesc("Used by the Whisper lane only; Parakeet ignores it.")
      .addDropdown((dropdown) => {
        for (const model of ["tiny", "base", "small", "medium", "large-v3"]) {
          dropdown.addOption(model, model);
        }
        return dropdown.setValue(settings.videoWhisperModel).onChange(async (value) => {
          settings.videoWhisperModel = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Whisper task")
      .setDesc("Translate gives an English transcript of any language; transcribe keeps the audio's language.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("translate", "Translate to English")
          .addOption("transcribe", "Transcribe")
          .setValue(settings.videoWhisperTask)
          .onChange(async (value) => {
            settings.videoWhisperTask = value === "transcribe" ? "transcribe" : "translate";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Transcript source")
      .setDesc("Always transcribe the audio, or use an English subtitle file next to the video when there is one.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("whisper", "Audio only")
          .addOption("auto", "Subtitles first, then audio")
          .setValue(settings.videoTranscriptSource)
          .onChange(async (value) => {
            settings.videoTranscriptSource = value === "auto" ? "auto" : "whisper";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Clean up after the summary")
      .setDesc(
        "Delete the transcription note, the transcript text and the scratch folder once the summary has " +
          "landed, and a downloaded video inside the video download folder. Nothing is deleted after a failure."
      )
      .addToggle((toggle) =>
        toggle.setValue(settings.videoCleanupAfterSummary).onChange(async (value) => {
          settings.videoCleanupAfterSummary = value;
          await this.plugin.saveSettings();
        })
      );
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
