import { FileSystemAdapter, Notice, Plugin } from "obsidian";
import { basename } from "path";
import type {
  OpenClawSettings,
  WorkflowResult,
  WorkflowTemplate,
  StderrEvent,
} from "./types";
import { DEFAULT_SETTINGS, VIEW_TYPE_WORKFLOW } from "./constants";
import { OpenClawSettingTab } from "./settings";
import { OpenClawRunner, notifyResearchArrived } from "./subprocess/openclaw-runner";
import { WorkflowTracker } from "./workflow/workflow-tracker";
import { WorkflowModal } from "./workflow/workflow-modal";
import { WorkflowStatusView } from "./views/workflow-sidebar";
import { generateWorkflowNotes } from "./notes/note-generator";
import { ZettelkastenClient } from "./subprocess/zettelkasten-client";
import { runZettelkastenLinking, runVaultZKLinking, getVaultZKApi } from "./zettelkasten/linker";
import { MiyoClient } from "./copilot-integration/miyo-client";
import { McpBridgeServer } from "./bridge/mcp-bridge-server";
import type { PluginActions } from "./bridge/mcp-bridge-server";
import { readdirSync } from "fs";
import { join } from "path";
import { readJsonFile } from "./util/json-reader";

export default class OpenClawPlugin extends Plugin {
  settings: OpenClawSettings = DEFAULT_SETTINGS;
  runner: OpenClawRunner = new OpenClawRunner();
  private tracker: WorkflowTracker | null = null;
  private zkClient: ZettelkastenClient | null = null;
  private bridgeServer: McpBridgeServer | null = null;
  private bridgeStarting = false;
  private statusBarItem: HTMLElement | null = null;
  private lastWorkflowResult: WorkflowResult | null = null;
  private lastWorkflowId: string | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();

    // Register sidebar view
    this.registerView(
      VIEW_TYPE_WORKFLOW,
      (leaf) => new WorkflowStatusView(leaf)
    );

    // Ribbon icon — opens the pipeline status sidebar.
    this.addRibbonIcon("activity", "Open Pipeline", () => {
      this.activateSidebarView();
    });

    // Status bar
    this.statusBarItem = this.addStatusBarItem();
    this.statusBarItem.setText("OpenClaw: idle");

    // Commands
    this.addCommand({
      id: "run-workflow",
      name: "Run Workflow",
      callback: () => {
        if (this.runner.isRunning) {
          new Notice("A workflow is already running.");
          return;
        }
        new WorkflowModal(this.app, this).open();
      },
    });

    this.addCommand({
      id: "cancel-workflow",
      name: "Cancel Running Workflow",
      callback: () => {
        if (!this.runner.isRunning) {
          new Notice("No workflow is running.");
          return;
        }
        this.runner.cancel();
        new Notice("Workflow cancelled.");
        this.updateStatusBar("cancelled");
        this.getSidebarView()?.renderIdle();
      },
    });

    this.addCommand({
      id: "toggle-pipeline-sidebar",
      name: "Toggle Pipeline Status Sidebar",
      callback: () => this.activateSidebarView(),
    });

    this.addCommand({
      id: "analyze-current-note",
      name: "Run Zettelkasten Analysis on Current Note",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file) return false;
        if (checking) return true;
        this.analyzeCurrentNote();
        return true;
      },
    });

    // Settings tab
    this.addSettingTab(new OpenClawSettingTab(this.app, this));

    // MCP bridge for Copilot integration — wait for layout to be ready
    this.app.workspace.onLayoutReady(() => {
      // Migrate (audit P0): the bridge token now lives in a 0600 file outside
      // data.json. Clear any legacy token so it stops leaking via data.json (and
      // Obsidian's auto-generated .bak copies).
      if (this.settings.bridgeToken) {
        this.settings.bridgeToken = "";
        void this.saveSettings();
      }
      if (this.settings.enableCopilotBridge) {
        this.bridgeServer = new McpBridgeServer(
          this.app,
          this.settings,
          this.createPluginActions()
        );
        // Persist any auto-generated bridge token (added 2026-05-04 H2 hardening).
        (this.bridgeServer as unknown as { onTokenGenerated?: (t: string) => void }).onTokenGenerated = async (_t: string) => {
          await this.saveSettings();
        };
        this.bridgeServer.start().catch((err) => {
          console.error("[OpenClaw] Bridge failed to start:", err.message);
        });
      }
    });

    // Listen for VaultZK cross-plugin events
    this.registerEvent(
      (this.app.workspace as any).on(
        "vaultZK:analysis:complete",
        (data: { command: string; notePath: string | null; durationMs: number }) => {
          console.log(
            `[OpenClaw] VaultZK analysis complete: ${data.command} (${(data.durationMs / 1000).toFixed(1)}s)`
          );
          if (this.statusBarItem) {
            this.statusBarItem.setText(
              `OpenClaw: ZK → ${data.command}`
            );
            setTimeout(() => {
              this.statusBarItem?.setText("OpenClaw: idle");
            }, 5000);
          }
        }
      )
    );
  }

  get isBridgeRunning(): boolean {
    return this.bridgeServer?.isRunning ?? false;
  }

  async startBridge(): Promise<void> {
    if (this.bridgeStarting || this.bridgeServer?.isRunning) return;
    this.bridgeStarting = true;
    try {
      // Clean up any zombie from a previous failed start
      this.bridgeServer = null;
      this.bridgeServer = new McpBridgeServer(
        this.app,
        this.settings,
        this.createPluginActions()
      );
      // Persist any auto-generated bridge token (added 2026-05-04 H2 hardening).
      (this.bridgeServer as unknown as { onTokenGenerated?: (t: string) => void }).onTokenGenerated = async (_t: string) => {
        await this.saveSettings();
      };
      await this.bridgeServer.start();
    } catch (err) {
      // start() failed — null out the zombie so next Start attempt works
      this.bridgeServer = null;
      throw err;
    } finally {
      this.bridgeStarting = false;
    }
  }

  async stopBridge(): Promise<void> {
    if (!this.bridgeServer) return;
    try {
      await this.bridgeServer.stop();
    } finally {
      this.bridgeServer = null;
    }
  }

  onunload(): void {
    this.runner.cancel();
    this.tracker?.stop();
    this.zkClient?.shutdown();
    this.bridgeServer?.stop().catch(() => {});
    this.bridgeServer = null;
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign(
      {},
      DEFAULT_SETTINGS,
      await this.loadData()
    );
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /**
   * Run an OpenClaw workflow. Called by the WorkflowModal after
   * the user selects a template and fills in inputs.
   */
  runWorkflow(templateId: string, inputs: Record<string, string>): void {
    console.log("[OpenClaw:Main] ========== WORKFLOW START ==========");
    console.log("[OpenClaw:Main] Template:", templateId, "Inputs:", JSON.stringify(inputs));

    // Shared flag to prevent duplicate completion handling
    let completionHandled = false;

    // Shared completion handler — called from EITHER tracker or runner exit
    const handleCompletion = async (result: WorkflowResult, source: string) => {
      if (completionHandled) {
        console.log(`[OpenClaw:Main] handleCompletion called from ${source} but already handled — skipping`);
        return;
      }
      completionHandled = true;
      console.log(`[OpenClaw:Main] handleCompletion called from: ${source}`);
      console.log("[OpenClaw:Main] Result:", result.workflow_id, result.status, "ok:", result.ok);

      // Cancel timeout and stop tracker
      this.runner.clearTimeout();
      this.tracker?.stop();

      // Store result
      this.lastWorkflowResult = result;
      this.lastWorkflowId = result.workflow_id;

      if (result.ok) {
        new Notice(`Workflow complete: ${result.workflow_id}`);
        this.updateStatusBar("complete");
        this.getSidebarView()?.showResult(result);
        console.log("[OpenClaw:Main] Starting post-completion pipeline (notes, ZK)...");
        await this.onWorkflowComplete(result);
      } else {
        const msg = result.error?.message || "Unknown error";
        new Notice(`Workflow failed: ${msg}`);
        this.updateStatusBar("failed");
        this.getSidebarView()?.showError(msg);
      }
    };

    // Create tracker for this run
    this.tracker = new WorkflowTracker(
      this.settings.openclawPath,
      this.settings.pollIntervalMs
    );

    // Wire tracker → sidebar + progress
    this.tracker.onStateChange = (state) => {
      if (state.workflow_id) {
        this.lastWorkflowId = state.workflow_id;
      }
      this.getSidebarView()?.updateState(state);
      const step = state.pipeline_progress?.current_step || "...";
      const n = state.pipeline_progress?.completed_steps ?? 0;
      const total = state.pipeline_progress?.total_steps ?? 0;
      this.updateStatusBar(`${step} (${n}/${total})`);
    };

    // PATH A (primary): Tracker detects completion from workflow.json polling
    this.tracker.onWorkflowDone = (state) => {
      console.log("[OpenClaw:Main] PATH A: Tracker detected workflow done:", state.workflow_id, state.status);
      const result: WorkflowResult = {
        ok: state.status === "completed",
        workflow_id: state.workflow_id,
        template_id: state.template_id,
        status: state.status as "completed" | "failed",
        artifacts: state.artifacts || {},
        pipeline_progress: state.pipeline_progress,
        error: state.error || null,
      };
      handleCompletion(result, "tracker");
    };

    // Wire runner events — stderr → tracker
    this.runner.onProgress = (event: StderrEvent) => {
      this.tracker?.handleEvent(event);
    };

    // PATH B (fallback): Runner exit with disk-based result reading
    this.runner.onComplete = (result: WorkflowResult) => {
      console.log("[OpenClaw:Main] PATH B: Runner exit (onComplete):", result.workflow_id, result.status);
      handleCompletion(result, "runner-exit");
    };

    this.runner.onError = (error: Error) => {
      console.error("[OpenClaw:Main] Runner error:", error.message);

      // Before giving up, try one last disk read — the workflow may have
      // completed even though the subprocess reported an error/timeout
      if (!completionHandled) {
        console.log("[OpenClaw:Main] Runner error fallback: attempting disk read...");
        const diskResult = this.runner.readResultFromDisk();
        if (diskResult && (diskResult.status === "completed" || diskResult.status === "failed")) {
          console.log("[OpenClaw:Main] Runner error fallback: found result on disk:", diskResult.status);
          handleCompletion(diskResult, "runner-error-fallback");
          return;
        }
      }

      this.tracker?.stop();
      new Notice(`Workflow error: ${error.message}`);
      this.updateStatusBar("error");
      this.getSidebarView()?.showError(error.message);
    };

    // Open sidebar and start
    this.activateSidebarView();
    this.updateStatusBar(`starting ${templateId}...`);
    new Notice(`Starting ${templateId}...`);

    this.runner.run({ template: templateId, inputs }, this.settings);

    // Start directory scanning IMMEDIATELY as a fallback.
    // If stderr provides workflow_id, the dir scan stops automatically.
    // If stderr fails, the dir scan will detect the new workflow directory.
    console.log("[OpenClaw:Main] Starting tracker dir scan (fallback for stderr)...");
    this.tracker.startDirScan();
  }

  /**
   * Called after a workflow completes successfully.
   * Generates vault notes and optionally runs Zettelkasten linking.
   */
  private async onWorkflowComplete(result: WorkflowResult): Promise<void> {
    console.log("[OpenClaw:Main] onWorkflowComplete called for:", result.workflow_id);
    console.log("[OpenClaw:Main] autoGenerateNotes:", this.settings.autoGenerateNotes);

    // Phase 3: Note generation
    if (this.settings.autoGenerateNotes) {
      try {
        this.updateStatusBar("generating notes...");
        console.log("[OpenClaw:Main] Generating vault notes...");
        const notes = await generateWorkflowNotes(
          this.app.vault,
          result,
          this.settings.openclawPath,
          this.settings.vaultOutputFolder
        );

        const noteCount =
          1 + notes.agentPaths.length + (notes.qualityPath ? 1 : 0) + (notes.datasetPath ? 1 : 0);
        console.log("[OpenClaw:Main] Notes generated:", noteCount);
        new Notice(`Created ${noteCount} research notes.`);

        // Auto-bubble: tell the Copilot chat a research run arrived. Emit-only
        // (research_notify → :8798 `research` SSE), linking to the overview note
        // we just created — it never re-writes the output, so no duplication.
        // Fail-soft: a notify failure must not block note delivery or the rest
        // of the completion pipeline (Miyo scan, Zettelkasten, memory ingest).
        try {
          await notifyResearchArrived({
            taskId: result.workflow_id || "workflow",
            title: `${result.template_id || "Research"} complete — ${noteCount} notes`,
            mainNotePath: notes.overviewPath,
            vault: this.app.vault.getName(),
          });
          console.log("[OpenClaw:Main] research_notify emitted → Copilot chat bubble");
        } catch (notifyErr: unknown) {
          console.warn(
            "[OpenClaw:Main] research_notify failed (non-fatal):",
            notifyErr instanceof Error ? notifyErr.message : String(notifyErr)
          );
        }

        // Phase 3.5: Trigger Miyo rescan and wait for indexing
        if (this.settings.miyoEnabled) {
          try {
            const miyoScan = new MiyoClient(this.settings.miyoPort);
            const vaultBase = this.getVaultBasePath();
            if (vaultBase) {
              const vaultName = basename(vaultBase);
              await miyoScan.scanFolder(vaultBase, false);
              const miyoPaths = [
                notes.overviewPath,
                ...notes.agentPaths.map((a) => a.path),
                ...(notes.qualityPath ? [notes.qualityPath] : []),
                ...(notes.datasetPath ? [notes.datasetPath] : []),
              ].map((p) => `${vaultName}/${p}`);
              console.log("[OpenClaw:Main] Waiting for Miyo to index", miyoPaths.length, "notes...");
              const indexResult = await miyoScan.waitForFilesIndexed(
                vaultBase,
                miyoPaths,
                this.settings.miyoIndexWaitMs,
                this.settings.miyoIndexPollIntervalMs
              );
              console.log(
                `[OpenClaw:Main] Miyo indexed ${indexResult.indexed.length}/${miyoPaths.length} notes` +
                (indexResult.missing.length > 0 ? ` (${indexResult.missing.length} still pending)` : "")
              );
            }
          } catch (err: unknown) {
            const scanMsg = err instanceof Error ? err.message : String(err);
            console.warn("[OpenClaw:Main] Miyo scan/wait failed (non-fatal):", scanMsg);
          }
        }

        // Phase 4: Zettelkasten linking
        if (this.settings.autoRunZettelkasten && notes.synthesizerContent) {
          console.log("[OpenClaw:Main] Running Zettelkasten analysis...");
          await this.runZettelkastenOnNotes(notes);
          console.log("[OpenClaw:Main] Zettelkasten analysis complete.");
        }

        // [REMOVED 2026-04-28] Post-workflow auto-open of Obsidian's native
        // Graph view (graph:open-local) was removed because it accumulated
        // duplicate Graph tabs across multiple workflow runs. Graph view
        // is now opened on demand by the user (Cmd+P → "Graph: Open local
        // graph") or by an explicit bridge MCP call from the main
        // conversation, never automatically by this plugin.

        // Auto-ingest synthesizer output to Trevorobeyinc Research Memory
        // (Mode B: subprocess CLI spawn). Non-blocking — failure logs to
        // ~/Claude/.logs/research-memory.log and does NOT block the user-visible
        // pack delivery. Added 2026-04-26.
        if (
          this.settings.autoIngestToResearchMemory &&
          notes.synthesizerContent
        ) {
          console.log("[OpenClaw:Main] Starting Research Memory auto-ingest...");
          this.ingestToResearchMemory(
            notes.synthesizerContent,
            result.workflow_id,
            result.template_id || "unknown"
          ).then((ingest) => {
            console.log(
              "[OpenClaw:Main] Research Memory auto-ingest: SUCCESS",
              `(action=${ingest.action}, pack_id=${ingest.pack_id})`
            );
          }).catch((err: Error) => {
            console.warn(
              "[OpenClaw:Main] Research Memory auto-ingest FAILED (non-fatal):",
              err.message
            );
          });
        } else {
          console.log(
            "[OpenClaw:Main] Research Memory auto-ingest skipped:",
            !this.settings.autoIngestToResearchMemory
              ? "disabled in settings"
              : "no synthesizer content"
          );
        }

        // Open the overview note
        const overviewFile = this.app.vault.getAbstractFileByPath(
          notes.overviewPath
        );
        if (overviewFile) {
          const leaf = this.app.workspace.getLeaf(false);
          await leaf.openFile(overviewFile as any);
        }

        this.updateStatusBar("complete");
        console.log("[OpenClaw:Main] ========== WORKFLOW PIPELINE COMPLETE ==========");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[OpenClaw:Main] Note generation failed:", msg);
        new Notice(`Note generation failed: ${msg}`);
        this.updateStatusBar("notes failed");
      }
    } else {
      console.log("[OpenClaw:Main] Note generation disabled — skipping post-completion pipeline");
    }
  }

  private async runZettelkastenOnNotes(notes: {
    synthesizerContent: string | null;
    agentPaths: Array<{ role: string; path: string }>;
  }): Promise<void> {
    if (!notes.synthesizerContent) return;

    try {
      this.updateStatusBar("running Zettelkasten analysis...");

      const synthPath = notes.agentPaths.find(
        (a) => a.role === "synthesizer"
      )?.path;
      if (!synthPath) return;

      const miyoClient = this.settings.miyoEnabled
        ? new MiyoClient(this.settings.miyoPort)
        : null;
      const miyoOptions = {
        enabled: this.settings.miyoEnabled,
        threshold: this.settings.miyoSimilarityThreshold,
        maxResults: this.settings.miyoMaxResults,
        searchRetries: this.settings.miyoSearchRetries,
      };

      // Dual-path: prefer VaultZK plugin API (in-process), fall back to subprocess MCP
      const vaultZK = this.settings.vaultZKPreferPlugin
        ? getVaultZKApi(this.app)
        : null;

      if (vaultZK) {
        console.log("[OpenClaw:Main] Using VaultZK plugin API (in-process)");
        await runVaultZKLinking(
          vaultZK,
          notes.synthesizerContent,
          synthPath,
          this.app.vault,
          miyoClient,
          miyoOptions
        );
      } else {
        console.log("[OpenClaw:Main] Using Zettelkasten MCP subprocess");
        if (!this.zkClient) {
          this.zkClient = new ZettelkastenClient(
            this.settings.zettelkastenServerPath,
            this.settings.nodePath || process.execPath
          );
        }
        await this.zkClient.ensureReady();

        await runZettelkastenLinking(
          this.zkClient,
          notes.synthesizerContent,
          synthPath,
          this.app.vault,
          miyoClient,
          miyoOptions
        );
      }

      new Notice("Zettelkasten analysis complete.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[OpenClaw:Main] Zettelkasten analysis failed:", msg);
      new Notice(`Zettelkasten analysis failed: ${msg}`);
    }
  }

  /**
   * Run Zettelkasten graph analysis on the currently active note.
   */
  private async analyzeCurrentNote(): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      new Notice("No active note.");
      return;
    }

    try {
      const content = await this.app.vault.read(file);
      if (!content.trim()) {
        new Notice("Note is empty.");
        return;
      }

      this.updateStatusBar("analyzing note...");
      new Notice("Running Zettelkasten analysis...");

      const miyoClient = this.settings.miyoEnabled
        ? new MiyoClient(this.settings.miyoPort)
        : null;
      const miyoOptions = {
        enabled: this.settings.miyoEnabled,
        threshold: this.settings.miyoSimilarityThreshold,
        maxResults: this.settings.miyoMaxResults,
        searchRetries: this.settings.miyoSearchRetries,
      };

      const vaultZK = this.settings.vaultZKPreferPlugin
        ? getVaultZKApi(this.app)
        : null;

      if (vaultZK) {
        await runVaultZKLinking(
          vaultZK,
          content,
          file.path,
          this.app.vault,
          miyoClient,
          miyoOptions
        );
      } else {
        if (!this.zkClient) {
          this.zkClient = new ZettelkastenClient(
            this.settings.zettelkastenServerPath,
            this.settings.nodePath || process.execPath
          );
        }
        await this.zkClient.ensureReady();

        await runZettelkastenLinking(
          this.zkClient,
          content,
          file.path,
          this.app.vault,
          miyoClient,
          miyoOptions
        );
      }

      new Notice("Zettelkasten analysis appended to note.");
      this.updateStatusBar("idle");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      new Notice(`Analysis failed: ${msg}`);
      this.updateStatusBar("idle");
    }
  }

  private getVaultBasePath(): string | null {
    const adapter = this.app.vault.adapter;
    if (adapter instanceof FileSystemAdapter) {
      return adapter.getBasePath();
    }
    return null;
  }

  private updateStatusBar(text: string): void {
    this.statusBarItem?.setText(`OpenClaw: ${text}`);
  }

  private getSidebarView(): WorkflowStatusView | null {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_WORKFLOW);
    if (leaves.length > 0) {
      return leaves[0].view as WorkflowStatusView;
    }
    return null;
  }

  private async activateSidebarView(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_WORKFLOW);
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }

    const leaf = this.app.workspace.getRightLeaf(false);
    if (leaf) {
      await leaf.setViewState({
        type: VIEW_TYPE_WORKFLOW,
        active: true,
      });
      this.app.workspace.revealLeaf(leaf);
    }
  }

  // ─── Plugin Actions for MCP Bridge ──────────────────────────

  private createPluginActions(): PluginActions {
    return {
      runWorkflow: (templateId, inputs) =>
        this.runWorkflow(templateId, inputs),
      isRunning: () => this.runner.isRunning,
      getLastResult: () => {
        if (this.lastWorkflowResult) {
          return this.lastWorkflowResult as Record<string, unknown>;
        }
        // Fallback: read from workflow.json if runner callback didn't fire
        return this.readWorkflowStateFromDisk();
      },
      getWorkflowState: () => {
        // Try live tracker first, then fall back to disk
        const live = this.tracker?.readCurrentState();
        if (live) return live as Record<string, unknown>;
        return this.readWorkflowStateFromDisk();
      },
      listTemplates: () => this.loadTemplateList(),
    };
  }

  private readWorkflowStateFromDisk(): Record<string, unknown> | null {
    if (!this.lastWorkflowId) return null;
    const statePath = join(
      this.settings.openclawPath,
      "workspace",
      "workflows",
      this.lastWorkflowId,
      "workflow.json"
    );
    return readJsonFile<Record<string, unknown>>(statePath);
  }

  private loadTemplateList(): Array<{
    id: string;
    name: string;
    description: string;
    requiredInputs: string[];
  }> {
    const templatesDir = join(
      this.settings.openclawPath,
      "config",
      "workflow-templates"
    );
    try {
      const files = readdirSync(templatesDir).filter((f) =>
        f.endsWith(".json")
      );
      const result: Array<{
        id: string;
        name: string;
        description: string;
        requiredInputs: string[];
      }> = [];
      for (const file of files) {
        const t = readJsonFile<WorkflowTemplate>(join(templatesDir, file));
        if (t && t.workflow_template_id) {
          result.push({
            id: t.workflow_template_id,
            name: t.name,
            description: t.description,
            requiredInputs: t.input_schema.required || [],
          });
        }
      }
      return result.sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      return [];
    }
  }

  // ─── Trevorobeyinc Research Memory ingest (Mode B subprocess CLI) ───
  // Spawns the trevorobeyinc-research-memory-mcp CLI with the synthesizer
  // markdown written to a temp file. Returns the parsed ingest result. All
  // errors (timeout, CLI exit non-zero, JSON parse failure) propagate as
  // rejections so the caller's .catch() can log + continue without blocking
  // the user-visible pack delivery.
  private async ingestToResearchMemory(
    synthesizerContent: string,
    workflowId: string,
    templateId: string
  ): Promise<{ action: string; pack_id: string; content_sha256: string }> {
    const { spawn } = await import("child_process");
    const { tmpdir } = await import("os");
    const { writeFileSync, unlinkSync } = await import("fs");
    const { join } = await import("path");

    const tmpFile = join(
      tmpdir(),
      `openclaw-pack-${workflowId.slice(0, 8)}-${Date.now()}.md`
    );
    writeFileSync(tmpFile, synthesizerContent, "utf8");

    const today = new Date().toISOString().slice(0, 10);
    const packId = `pack-${today}-${templateId}-${workflowId.slice(0, 8)}`;
    const tags = ["openclaw", "synthesizer", templateId].join(",");

    return await new Promise((resolve, reject) => {
      const proc = spawn(
        this.settings.nodePath,
        [
          this.settings.researchMemoryCliPath,
          "ingest",
          "--pack-file", tmpFile,
          "--client", this.settings.researchMemoryDefaultClient,
          "--topic", templateId,
          "--tags", tags,
          "--source-uri", `file://${tmpFile}`,
          "--synthesizer-version", "openclaw-auto",
          "--pack-id", packId,
        ],
        { stdio: ["ignore", "pipe", "pipe"] }
      );

      let stdout = "";
      let stderr = "";
      proc.stdout.on("data", (b) => { stdout += b.toString(); });
      proc.stderr.on("data", (b) => { stderr += b.toString(); });

      const timer = setTimeout(() => {
        proc.kill("SIGTERM");
        reject(new Error(`research-memory ingest timed out after ${this.settings.researchMemoryTimeoutMs}ms`));
      }, this.settings.researchMemoryTimeoutMs);

      proc.on("error", (err: Error) => {
        clearTimeout(timer);
        try { unlinkSync(tmpFile); } catch { /* ignore */ }
        reject(err);
      });

      proc.on("close", (code: number) => {
        clearTimeout(timer);
        try { unlinkSync(tmpFile); } catch { /* ignore */ }
        if (code !== 0) {
          reject(new Error(`research-memory CLI exited ${code}: ${stderr.trim() || stdout.trim()}`));
          return;
        }
        try {
          const parsed = JSON.parse(stdout);
          resolve(parsed);
        } catch (e) {
          reject(new Error(`research-memory CLI returned non-JSON: ${stdout.slice(0, 200)}`));
        }
      });
    });
  }
}
