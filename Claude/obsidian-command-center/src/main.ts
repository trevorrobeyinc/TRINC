import { FileSystemAdapter, Notice, Plugin } from "obsidian";
import { basename } from "path";
import type {
  OpenClawSettings,
  WorkflowResult,
  StderrEvent,
} from "./types";
import { DEFAULT_SETTINGS, VIEW_TYPE_WORKFLOW } from "./constants";
import { OpenClawSettingTab } from "./settings";
import { OpenClawRunner, notifyResearchArrived } from "./subprocess/openclaw-runner";
import { WorkflowTracker } from "./workflow/workflow-tracker";
import {
  abortPending,
  createLedger,
  markStage,
  summarizeLedger,
  type PostRunLedger,
} from "./workflow/post-run-ledger";
import { WorkflowModal } from "./workflow/workflow-modal";
import { WorkflowStatusView } from "./views/workflow-sidebar";
import {
  generateWorkflowNotes,
  readSynthesizerOutput,
  computeNotesFolderPath,
  rehydrateEngineNotes,
  waitForEngineVaultNotes,
  stripNoteScaffolding,
  type GeneratedNotes,
} from "./notes/note-generator";
import { runVaultZKLinking, getVaultZKApi } from "./zettelkasten/linker";
import { MiyoClient } from "./copilot-integration/miyo-client";
import { McpBridgeServer } from "./bridge/mcp-bridge-server";
import type { PluginActions } from "./bridge/mcp-bridge-server";
import {
  previewVideoRun,
  VideoPipelineController,
  type VideoPipelineSettings,
  type VideoRunContext,
} from "./video/pipeline";
import { createObsidianVideoHost } from "./video/obsidian-host";
import { defaultRunLogPath, defaultRunMarkerPath } from "./video/run-log";
import { getWorkflowHistory } from "./workflow/workflow-history";
import { listTemplateSummaries } from "./util/template-loader";
import { runEngineScript, resolveNodeBin, buildEngineEnv } from "./util/engine-spawn";
import { readdirSync, existsSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { join } from "path";
// Static on purpose: esbuild rewrites a static builtin import to require(), but leaves a dynamic import() of a Node
// builtin untouched, and Obsidian's renderer then rejects it with "Failed to resolve module specifier
// 'child_process'" — which is how the research-memory stage failed in the first PASSING run (2026-10-08). The guard
// test/no-dynamic-builtin-imports.test.ts keeps it that way.
import { spawn } from "child_process";
import { tmpdir } from "os";
import { readJsonFile } from "./util/json-reader";
import type { WorkflowState } from "./types";

export default class OpenClawPlugin extends Plugin {
  settings: OpenClawSettings = DEFAULT_SETTINGS;
  runner: OpenClawRunner = new OpenClawRunner();
  private tracker: WorkflowTracker | null = null;
  private bridgeServer: McpBridgeServer | null = null;
  private bridgeStarting = false;
  private statusBarItem: HTMLElement | null = null;
  private lastWorkflowResult: WorkflowResult | null = null;
  private lastWorkflowId: string | null = null;
  /**
   * Stage-by-stage outcome of the most recent completed run's post-run chain (2026-10-07). Reset when
   * a new run starts. Each run's stages write to a ledger captured in a local variable, never to this
   * field, so a late stage of run N (the memory ingest is fire-and-forget) cannot land in run N+1's.
   */
  private postRunLedger: PostRunLedger | null = null;
  /**
   * The video pipeline (src/video/, 2026-11-19; the only one since phase 4): one run at a time. Owned
   * here, not by the bridge, which is rebuilt whenever it restarts, so a restart cannot lose track of a run.
   */
  private videoPipeline = new VideoPipelineController(() => this.videoRunContext());

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
      // Migrate (audit P0): the bridge token lives in a 0600 file outside
      // data.json. Scrub any legacy `bridgeToken` key out of stored settings so
      // it stops leaking via data.json (and Obsidian's auto-generated .bak
      // copies). The field itself was removed from OpenClawSettings 2026-08-20.
      const legacy = this.settings as unknown as { bridgeToken?: string; videoBackend?: string };
      if (typeof legacy.bridgeToken === "string") {
        delete legacy.bridgeToken;
        void this.saveSettings();
      }
      // Phase 3's temporary Raycast/built-in switch (2026-11-19) means nothing since phase 4
      // (2026-11-20), when the Raycast path went: drop a stored value so data.json cannot suggest one.
      if (legacy.videoBackend !== undefined) {
        delete legacy.videoBackend;
        void this.saveSettings();
      }
      if (this.settings.enableCopilotBridge) {
        this.bridgeServer = new McpBridgeServer(
          this.app,
          this.settings,
          this.createPluginActions()
        );
        this.bridgeServer.start().catch((err) => {
          console.error("[OpenClaw] Bridge failed to start:", err.message);
        });
      }

      // Catch-up sweep (2026-09-22): runs that completed while Obsidian was closed
      // — or before the engine's vault publisher existed — get their notes written
      // now. The engine CLI is idempotent (skips written / failed / non-PASS / mock).
      if (this.settings.backfillVaultNotesOnLoad) {
        setTimeout(() => {
          void this.backfillVaultNotes();
        }, 20000);
      }
      // Zettelkasten catch-up (2026-09-22): engine-written runs never got the LLM
      // linking stage; link the synthesizer notes that lack it, a few per load.
      if (this.settings.autoRunZettelkasten && this.settings.zkCatchUpOnLoad) {
        setTimeout(() => {
          void this.zkCatchUp();
        }, 60000);
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
    // A run's timers and promises outlive the plugin unless stopped: without this, a reloaded plugin
    // could start a second run beside the first. The run kills its transcriber and logs RUN FAIL.
    this.videoPipeline.abort(
      "Command Center was unloaded (a plugin reload, or Obsidian quitting) while the run was going"
    );
    this.bridgeServer?.stop().catch(() => {});
    this.bridgeServer = null;
  }

  /** The built-in video pipeline's settings, from this plugin's own. */
  private videoPipelineSettings(): VideoPipelineSettings {
    const s = this.settings;
    return {
      videoFolder: s.videoDownloadFolder,
      summaryFolder: s.videoSummaryFolder,
      transcriber: s.videoTranscriber,
      whisperModel: s.videoWhisperModel,
      whisperTask: s.videoWhisperTask,
      transcriptSource: s.videoTranscriptSource,
      cleanupAfterSummary: s.videoCleanupAfterSummary,
    };
  }

  private videoRunContext(): Omit<VideoRunContext, "signal"> {
    return {
      host: createObsidianVideoHost(this.app),
      settings: this.videoPipelineSettings(),
      logPath: defaultRunLogPath(),
      markerPath: defaultRunMarkerPath(),
    };
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

    // A new run invalidates the previous run's ledger (see the field comment).
    this.postRunLedger = null;

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

      // Post-run ledger (2026-10-07). Captured in a local: the memory ingest settles asynchronously,
      // possibly after the next run has replaced this.postRunLedger.
      const ledger = createLedger(result.workflow_id);
      this.postRunLedger = ledger;

      if (result.ok) {
        new Notice(`Workflow complete: ${result.workflow_id}`);
        this.updateStatusBar("complete");
        this.getSidebarView()?.showResult(result);
        console.log("[OpenClaw:Main] Starting post-completion pipeline (notes, ZK)...");
        try {
          await this.onWorkflowComplete(result, ledger);
        } catch (err: unknown) {
          // Without this the unstarted stages would sit at "pending" forever and a caller polling
          // obsidian_openclaw_status would wait on a chain that can never finish.
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[OpenClaw:Main] post-completion pipeline aborted:", msg);
          abortPending(ledger, `chain aborted: ${msg}`);
        }
      } else {
        const msg = result.error?.message || "Unknown error";
        new Notice(`Workflow failed: ${msg}`);
        this.updateStatusBar("failed");
        this.getSidebarView()?.showError(msg);
        // A failed run produces no notes, so every enrichment stage is skipped; only the chat
        // notify runs, and the ledger records whether it landed.
        for (const stage of ["notes", "miyo", "zk", "memory", "open"] as const) {
          markStage(ledger, stage, "skipped", "run did not complete");
        }
        markStage(ledger, "notify", "running");
        // Failure-path notify (added 2026-08-20): a failed run used to emit
        // nothing at all — the chat only ever heard about successes. Fail-soft.
        try {
          await notifyResearchArrived({
            taskId: result.workflow_id || "workflow",
            title: `${result.template_id || "Research"} FAILED`,
            status: "failure",
            error: msg,
            vault: this.app.vault.getName(),
          });
          markStage(ledger, "notify", "ok", "failure notice emitted");
        } catch (notifyErr: unknown) {
          const notifyMsg = notifyErr instanceof Error ? notifyErr.message : String(notifyErr);
          console.warn("[OpenClaw:Main] failure notify failed (non-fatal):", notifyMsg);
          markStage(ledger, "notify", "failed", notifyMsg);
        }
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
  private async onWorkflowComplete(result: WorkflowResult, ledger: PostRunLedger): Promise<void> {
    console.log("[OpenClaw:Main] onWorkflowComplete called for:", result.workflow_id);

    // Independently-gated, fail-soft stages (decoupled 2026-08-20). The old
    // single `if (autoGenerateNotes)` umbrella silently disabled Miyo indexing,
    // Zettelkasten linking AND the Research Memory ingest whenever note
    // generation was off or threw. Now each stage owns its toggle and its
    // try/catch. Miyo and ZK operate ON the generated notes, so they still
    // need stage 1's output; the chat notify and the Research Memory ingest do
    // not (ingest falls back to the engine's on-disk synthesizer artifact).

    // ── Stage 1: vault notes ──
    // Since 2026-09-22 the ENGINE writes the note set itself after the citation
    // gate passes (openclaw-bridge/vault/workflow-vault-publisher.js) and records
    // `artifacts.vault_notes` in workflow.json. This stage REHYDRATES from that
    // record — one writer per run, one folder scheme — and generates notes
    // in-plugin only when the engine wrote nothing (publishing disabled, or a
    // run from before the publisher existed).
    let notes: GeneratedNotes | null = null;
    let noteCount = 0;
    if (this.settings.autoGenerateNotes) {
      markStage(ledger, "notes", "running");
      try {
        this.updateStatusBar("locating notes...");
        const state = await waitForEngineVaultNotes(
          this.settings.openclawPath,
          result.workflow_id,
          this.settings.engineNotesWaitMs
        );
        if (state) {
          notes = await rehydrateEngineNotes(
            this.app.vault,
            state,
            this.settings.openclawPath,
            this.settings.vaultOutputFolder
          );
        }
        if (notes) {
          noteCount =
            state?.artifacts?.vault_notes?.files?.length ??
            1 + notes.agentPaths.length + (notes.qualityPath ? 1 : 0) + (notes.datasetPath ? 1 : 0);
          console.log("[OpenClaw:Main] Stage 1 notes: engine-written, rehydrated", noteCount, notes.overviewPath);
          new Notice(`Engine wrote ${noteCount} research notes.`);
          markStage(ledger, "notes", "ok", `engine-written, ${noteCount} notes`);
        } else {
          this.updateStatusBar("generating notes...");
          notes = await generateWorkflowNotes(
            this.app.vault,
            result,
            this.settings.openclawPath,
            this.settings.vaultOutputFolder
          );
          noteCount =
            1 + notes.agentPaths.length + (notes.qualityPath ? 1 : 0) + (notes.datasetPath ? 1 : 0);
          console.log("[OpenClaw:Main] Stage 1 notes: generated in-plugin (engine wrote nothing)", noteCount);
          new Notice(`Created ${noteCount} research notes.`);
          markStage(ledger, "notes", "ok", `generated in-plugin, ${noteCount} notes`);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[OpenClaw:Main] Stage 1 notes FAILED (continuing):", msg);
        new Notice(`Note generation failed: ${msg}`);
        this.updateStatusBar("notes failed");
        markStage(ledger, "notes", "failed", msg);
      }
    } else {
      console.log("[OpenClaw:Main] Stage 1 notes: disabled");
      markStage(ledger, "notes", "skipped", "autoGenerateNotes disabled");
    }

    // ── Stage 2: chat bubble (always — emit-only research_notify → :8798) ──
    markStage(ledger, "notify", "running");
    try {
      await notifyResearchArrived({
        taskId: result.workflow_id || "workflow",
        title: `${result.template_id || "Research"} complete${noteCount ? ` — ${noteCount} notes` : ""}`,
        status: "success",
        ...(notes ? { mainNotePath: notes.overviewPath } : {}),
        vault: this.app.vault.getName(),
      });
      console.log("[OpenClaw:Main] Stage 2 notify: research_notify emitted");
      markStage(ledger, "notify", "ok", "research_notify emitted");
    } catch (notifyErr: unknown) {
      const notifyMsg = notifyErr instanceof Error ? notifyErr.message : String(notifyErr);
      console.warn("[OpenClaw:Main] Stage 2 notify FAILED (non-fatal):", notifyMsg);
      markStage(ledger, "notify", "failed", notifyMsg);
    }

    // ── Stage 3: Miyo index scan (operates on the new notes) ──
    if (this.settings.miyoEnabled && notes) {
      markStage(ledger, "miyo", "running");
      try {
        const miyoScan = new MiyoClient(this.settings.miyoPort);
        const vaultBase = this.getVaultBasePath();
        if (!vaultBase) markStage(ledger, "miyo", "skipped", "vault base path unavailable");
        if (vaultBase) {
          const vaultName = basename(vaultBase);
          await miyoScan.scanFolder(vaultBase, false);
          const miyoPaths = [
            notes.overviewPath,
            ...notes.agentPaths.map((a) => a.path),
            ...(notes.qualityPath ? [notes.qualityPath] : []),
            ...(notes.datasetPath ? [notes.datasetPath] : []),
          ].map((p) => `${vaultName}/${p}`);
          console.log("[OpenClaw:Main] Stage 3 Miyo: waiting to index", miyoPaths.length, "notes...");
          const indexResult = await miyoScan.waitForFilesIndexed(
            vaultBase,
            miyoPaths,
            this.settings.miyoIndexWaitMs,
            this.settings.miyoIndexPollIntervalMs
          );
          console.log(
            `[OpenClaw:Main] Stage 3 Miyo: indexed ${indexResult.indexed.length}/${miyoPaths.length}` +
              (indexResult.missing.length > 0 ? ` (${indexResult.missing.length} still pending)` : "")
          );
          // Notes not yet indexed when the wait expires are not a failure: Miyo's own watcher keeps
          // going. The detail says how many were confirmed so a caller can tell the difference.
          markStage(
            ledger,
            "miyo",
            "ok",
            `indexed ${indexResult.indexed.length}/${miyoPaths.length}` +
              (indexResult.missing.length > 0 ? `, ${indexResult.missing.length} still pending` : "")
          );
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn("[OpenClaw:Main] Stage 3 Miyo FAILED (non-fatal):", msg);
        markStage(ledger, "miyo", "failed", msg);
      }
    } else {
      const why = !this.settings.miyoEnabled ? "disabled" : "no notes generated";
      console.log("[OpenClaw:Main] Stage 3 Miyo: skipped —", why);
      markStage(ledger, "miyo", "skipped", why);
    }

    // ── Stage 4: Zettelkasten linking (appends to the synthesizer note) ──
    if (this.settings.autoRunZettelkasten && notes?.synthesizerContent) {
      console.log("[OpenClaw:Main] Stage 4 ZK: running graph analysis...");
      markStage(ledger, "zk", "running");
      // runZettelkastenOnNotes swallows its own errors (it must never break the chain), so the
      // ledger takes its returned outcome rather than assuming success.
      const zk = await this.runZettelkastenOnNotes(notes);
      markStage(ledger, "zk", zk.outcome, zk.detail);
    } else {
      const why = !this.settings.autoRunZettelkasten ? "disabled" : "no synthesizer note";
      console.log("[OpenClaw:Main] Stage 4 ZK: skipped —", why);
      markStage(ledger, "zk", "skipped", why);
    }

    // ── Stage 5: Research Memory ingest (independent of note generation) ──
    if (this.settings.autoIngestToResearchMemory) {
      const content =
        notes?.synthesizerContent ??
        readSynthesizerOutput(this.settings.openclawPath, result.workflow_id);
      if (content) {
        console.log("[OpenClaw:Main] Stage 5 RM: starting auto-ingest...");
        // Deliberately not awaited (it can take a while and must not hold the chain), so this stage
        // stays "running" in the ledger until the promise settles — which is exactly why
        // `post_run_done` can lag the rest of the chain.
        markStage(ledger, "memory", "running");
        this.ingestToResearchMemory(
          content,
          result.workflow_id,
          result.template_id || "unknown"
        )
          .then((ingest) => {
            console.log(
              "[OpenClaw:Main] Stage 5 RM: SUCCESS",
              `(action=${ingest.action}, pack_id=${ingest.pack_id})`
            );
            markStage(ledger, "memory", "ok", `action=${ingest.action}`);
          })
          .catch((err: Error) => {
            console.warn("[OpenClaw:Main] Stage 5 RM FAILED (non-fatal):", err.message);
            markStage(ledger, "memory", "failed", err.message);
          });
      } else {
        console.log(
          "[OpenClaw:Main] Stage 5 RM: skipped — no synthesizer output in vault notes or on disk"
        );
        markStage(ledger, "memory", "skipped", "no synthesizer output in vault notes or on disk");
      }
    } else {
      console.log("[OpenClaw:Main] Stage 5 RM: disabled");
      markStage(ledger, "memory", "skipped", "autoIngestToResearchMemory disabled");
    }

    // ── Stage 6: open the overview note ──
    // Engine-written files can trail the metadata index by a moment; retry briefly.
    if (notes) {
      let overviewFile = this.app.vault.getAbstractFileByPath(notes.overviewPath);
      for (let attempt = 0; !overviewFile && attempt < 6; attempt += 1) {
        await new Promise((r) => setTimeout(r, 500));
        overviewFile = this.app.vault.getAbstractFileByPath(notes.overviewPath);
      }
      if (overviewFile) {
        markStage(ledger, "open", "running");
        try {
          const leaf = this.app.workspace.getLeaf(false);
          await leaf.openFile(overviewFile as any);
          markStage(ledger, "open", "ok");
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn("[OpenClaw:Main] Stage 6 open FAILED (non-fatal):", msg);
          markStage(ledger, "open", "failed", msg);
        }
      } else {
        markStage(ledger, "open", "failed", "overview note not visible in the vault after 3 s");
      }
    } else {
      markStage(ledger, "open", "skipped", "no notes");
    }

    this.updateStatusBar("complete");
    console.log("[OpenClaw:Main] ========== WORKFLOW PIPELINE COMPLETE ==========");
  }

  /**
   * Zettelkasten catch-up: find synthesizer notes under the output folder that
   * lack the "Zettelkasten Graph Intelligence" section (engine-written runs,
   * or runs linked while the vault-zettelkasten plugin was off) and link up to
   * `zkCatchUpMaxPerLoad` of them. Each is a hosted-model call, hence the cap.
   */
  private async zkCatchUp(): Promise<void> {
    const max = Math.max(0, this.settings.zkCatchUpMaxPerLoad);
    if (max === 0 || this.runner.isRunning) return;
    const vaultZK = getVaultZKApi(this.app);
    if (!vaultZK) {
      console.log("[OpenClaw:Main] zk catch-up: vault-zettelkasten plugin not available — skipped");
      return;
    }
    const prefix = `${this.settings.vaultOutputFolder.replace(/\/+$/, "")}/`;
    const marker = "## Zettelkasten Graph Intelligence";
    const candidates = this.app.vault
      .getMarkdownFiles()
      .filter((f) => f.path.startsWith(prefix) && f.basename === "Synthesizer")
      .sort((a, b) => b.stat.mtime - a.stat.mtime);
    let linked = 0;
    for (const file of candidates) {
      if (linked >= max) break;
      try {
        const noteText = await this.app.vault.read(file);
        if (noteText.includes(marker)) continue;
        const folder = file.parent?.path ?? "";
        let workflowId: string | null = null;
        const overview = this.app.vault.getAbstractFileByPath(`${folder}/Overview.md`);
        if (overview) {
          const ov = await this.app.vault.read(overview as any);
          const m = ov.match(/^workflow_id:\s*"?([^"\n]+)"?\s*$/m);
          workflowId = m ? m[1].trim() : null;
        }
        const content =
          (workflowId ? readSynthesizerOutput(this.settings.openclawPath, workflowId) : null) ??
          stripNoteScaffolding(noteText);
        if (!content || content.trim().length < 200) continue;
        console.log("[OpenClaw:Main] zk catch-up: linking", file.path);
        await this.runZettelkastenOnNotes({
          synthesizerContent: content,
          agentPaths: [{ role: "synthesizer", path: file.path }],
        });
        linked += 1;
      } catch (err: unknown) {
        console.warn("[OpenClaw:Main] zk catch-up failed for", file.path, err instanceof Error ? err.message : String(err));
      }
    }
    console.log(`[OpenClaw:Main] zk catch-up: ${linked} synthesizer note(s) linked (cap ${max})`);
  }

  /**
   * Catch-up sweep: ask the engine's own publisher to write notes for every
   * completed run that has none yet. Fail-soft; never blocks the UI.
   */
  private async backfillVaultNotes(): Promise<void> {
    if (this.runner.isRunning) {
      console.log("[OpenClaw:Main] backfill: a workflow is running — skipping this pass");
      return;
    }
    try {
      const nodeBin = resolveNodeBin(this.settings.nodePath);
      const res = await runEngineScript({
        openclawPath: this.settings.openclawPath,
        nodeBin,
        scriptRel: "scripts/publish-workflow-to-vault.js",
        args: ["--all", "--json"],
        timeoutMs: 180000,
      });
      if (res.timedOut) {
        console.warn("[OpenClaw:Main] backfill: timed out");
        return;
      }
      // Tolerate any stray lines a dependency prints before the JSON (parse from the first "{").
      let parsed: { summary?: { written?: number; skipped?: number; failed?: number } } | null = null;
      try {
        parsed = JSON.parse(res.stdout);
      } catch {
        const start = res.stdout.indexOf("{");
        try {
          parsed = start >= 0 ? JSON.parse(res.stdout.slice(start)) : null;
        } catch {
          parsed = null;
        }
      }
      const s = parsed?.summary;
      if (!s) {
        console.warn("[OpenClaw:Main] backfill: no summary (exit", res.code, ")", res.stderr.slice(0, 300));
        return;
      }
      console.log(`[OpenClaw:Main] backfill: ${s.written ?? 0} written, ${s.skipped ?? 0} skipped, ${s.failed ?? 0} failed`);
      if ((s.written ?? 0) > 0) {
        new Notice(`Engine backfilled ${s.written} research run${s.written === 1 ? "" : "s"} into the vault.`);
      }
    } catch (err: unknown) {
      console.warn("[OpenClaw:Main] backfill failed (non-fatal):", err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * Never throws (it must not break the post-run chain). Since 2026-10-07 it RETURNS what happened so
   * the post-run ledger can record "ok" / "skipped" / "failed" instead of assuming success; the
   * catch-up sweep, which only cares that it did not throw, ignores the value.
   */
  private async runZettelkastenOnNotes(notes: {
    synthesizerContent: string | null;
    agentPaths: Array<{ role: string; path: string }>;
  }): Promise<{ outcome: "ok" | "skipped" | "failed"; detail?: string }> {
    if (!notes.synthesizerContent) return { outcome: "skipped", detail: "no synthesizer content" };

    try {
      this.updateStatusBar("running Zettelkasten analysis...");

      const synthPath = notes.agentPaths.find(
        (a) => a.role === "synthesizer"
      )?.path;
      if (!synthPath) return { outcome: "skipped", detail: "no synthesizer note path" };

      const miyoClient = this.settings.miyoEnabled
        ? new MiyoClient(this.settings.miyoPort)
        : null;
      const miyoOptions = {
        enabled: this.settings.miyoEnabled,
        threshold: this.settings.miyoSimilarityThreshold,
        maxResults: this.settings.miyoMaxResults,
        searchRetries: this.settings.miyoSearchRetries,
      };

      // In-process vault-zettelkasten plugin api is the ONLY lane (the stdio
      // subprocess fallback was retired 2026-08-20 — it had been unreachable).
      const vaultZK = getVaultZKApi(this.app);
      if (!vaultZK) {
        new Notice(
          "Zettelkasten analysis skipped: enable the vault-zettelkasten plugin under Community plugins."
        );
        return { outcome: "skipped", detail: "vault-zettelkasten plugin not available" };
      }
      await runVaultZKLinking(
        vaultZK,
        notes.synthesizerContent,
        synthPath,
        this.app.vault,
        miyoClient,
        miyoOptions
      );

      new Notice("Zettelkasten analysis complete.");
      return { outcome: "ok" };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[OpenClaw:Main] Zettelkasten analysis failed:", msg);
      new Notice(`Zettelkasten analysis failed: ${msg}`);
      return { outcome: "failed", detail: msg };
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

      const vaultZK = getVaultZKApi(this.app);
      if (!vaultZK) {
        new Notice(
          "Zettelkasten analysis unavailable: enable the vault-zettelkasten plugin under Community plugins."
        );
        this.updateStatusBar("idle");
        return;
      }
      await runVaultZKLinking(
        vaultZK,
        content,
        file.path,
        this.app.vault,
        miyoClient,
        miyoOptions
      );

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
      awaitWorkflowId: (timeoutMs) => this.runner.awaitWorkflowId(timeoutMs),
      getLastRunError: () => this.runner.getLastError(),
      cancelWorkflow: () => {
        if (!this.runner.isRunning) {
          return { cancelled: false, workflow_id: this.lastWorkflowId, reason: "no_run" };
        }
        const id = this.runner.getDetectedWorkflowId() || this.lastWorkflowId;
        this.runner.cancel();
        this.tracker?.stop();
        this.updateStatusBar("cancelled");
        this.getSidebarView()?.renderIdle();
        return { cancelled: true, workflow_id: id };
      },
      isRunning: () => this.runner.isRunning,
      getLastResult: () => {
        if (this.lastWorkflowResult) {
          return this.lastWorkflowResult as unknown as Record<string, unknown>;
        }
        // Fallback: read from workflow.json if runner callback didn't fire
        return this.readWorkflowStateFromDisk();
      },
      getWorkflowState: () => {
        // Try live tracker first, then fall back to disk
        const live = this.tracker?.readCurrentState();
        if (live) return live as unknown as Record<string, unknown>;
        return this.readWorkflowStateFromDisk();
      },
      getPostRunLedger: () => (this.postRunLedger ? summarizeLedger(this.postRunLedger) : null),
      listTemplates: () => listTemplateSummaries(this.settings.openclawPath),
      getHistory: (limit) =>
        getWorkflowHistory(this.settings.openclawPath, limit) as unknown as Array<
          Record<string, unknown>
        >,
      getArtifacts: (workflowId) => this.readWorkflowArtifacts(workflowId),
      runEngineScript: (spec) =>
        runEngineScript({
          openclawPath: this.settings.openclawPath,
          nodeBin: resolveNodeBin(this.settings.nodePath),
          scriptRel: spec.scriptRel,
          args: spec.args,
          timeoutMs: spec.timeoutMs,
        }),
      getFeedStats: () => this.readFeedStats(),
      getCitationIntegrity: (workflowId) => this.readCitationIntegrity(workflowId),
      startVideoRun: async (input, options) => {
        const handle = await this.videoPipeline.start(input, options);
        return { runId: handle.runId, startedAt: handle.startedAt };
      },
      activeVideoRun: () => this.videoPipeline.activeRun(),
      previewVideoRun: (input) =>
        previewVideoRun(input, this.videoPipelineSettings(), createObsidianVideoHost(this.app).vaultPath),
    };
  }

  /** Resolve a workflow id: explicit → last run this session → newest on disk. */
  private resolveWorkflowId(workflowId?: string): string | null {
    if (workflowId) return workflowId;
    if (this.lastWorkflowId) return this.lastWorkflowId;
    const history = getWorkflowHistory(this.settings.openclawPath, 1);
    return history[0]?.workflowId ?? null;
  }

  private readWorkflowArtifacts(workflowId?: string): Record<string, unknown> {
    const id = this.resolveWorkflowId(workflowId);
    if (!id) {
      return {
        error: "no_workflow",
        message: "No workflow id known — pass workflow_id or run a workflow first.",
      };
    }
    const runDir = join(this.settings.openclawPath, "workspace", "workflows", id);
    const state = readJsonFile<WorkflowState>(join(runDir, "workflow.json"));
    if (!state) {
      return { error: "not_found", workflow_id: id, message: `No workflow.json under ${id}` };
    }
    let runDirFiles: string[] = [];
    try {
      runDirFiles = readdirSync(runDir).sort();
    } catch {
      /* dir unreadable — report empty */
    }
    const notesFolder = computeNotesFolderPath(state, this.settings.vaultOutputFolder);
    const folder = this.app.vault.getAbstractFileByPath(notesFolder);
    const vaultNotes =
      folder && "children" in (folder as object)
        ? ((folder as unknown as { children: Array<{ path: string }> }).children || []).map(
            (c) => c.path
          )
        : [];
    return {
      workflow_id: id,
      template_id: state.template_id,
      status: state.status,
      artifacts: state.artifacts || {},
      run_dir: runDir,
      run_dir_files: runDirFiles,
      notes_folder: notesFolder,
      vault_notes: vaultNotes,
    };
  }

  private readCitationIntegrity(workflowId?: string): Record<string, unknown> {
    const id = this.resolveWorkflowId(workflowId);
    if (!id) {
      return {
        error: "no_workflow",
        message: "No workflow id known — pass workflow_id or run a workflow first.",
      };
    }
    const runDir = join(this.settings.openclawPath, "workspace", "workflows", id);
    const state = readJsonFile<WorkflowState>(join(runDir, "workflow.json"));
    const cv = readJsonFile<Record<string, unknown>>(join(runDir, "citation-verification.json"));
    const manifest = readJsonFile<{ summary?: Record<string, unknown> }>(
      join(runDir, "reproducibility-manifest.json")
    );
    return {
      workflow_id: id,
      template_id: state?.template_id ?? null,
      status: state?.status ?? null,
      citation_verification: cv ?? null,
      reproducibility_summary: manifest?.summary ?? null,
      offer_id: state?.artifacts?.offer_id ?? null,
      export_path: state?.artifacts?.export_path ?? null,
      note:
        "verdict/grounded_ratio vs min_grounded_ratio is the shippable gate. " +
        "cited/grounded are extraction tallies from the runtime evidence cross-check — " +
        "never present them as accuracy claims.",
    };
  }

  private readFeedStats(): Record<string, unknown> {
    const base = join(
      this.settings.openclawPath,
      "workspace",
      "aws-marketplace-listing",
      "trial-graveyard-feed",
      "data"
    );
    let indications: string[] = [];
    try {
      indications = readdirSync(base).filter((d) => !d.startsWith("."));
    } catch {
      return { error: "feed_data_not_found", path: base };
    }
    const perIndication: Array<Record<string, unknown>> = [];
    for (const ind of indications.sort()) {
      const entry: Record<string, unknown> = { indication: ind };
      for (const lane of ["paid", "free"] as const) {
        const csvPath = join(base, ind, lane, "register.csv");
        if (!existsSync(csvPath)) {
          entry[lane] = null;
          continue;
        }
        try {
          const rows = parseCsv(readFileSync(csvPath, "utf8"));
          const header = rows[0] || [];
          const idx = (name: string) => header.indexOf(name);
          const statusIdx = idx("overall_status");
          const riskIdx = idx("amendment_risk_band");
          const asOfIdx = idx("as_of");
          const statuses: Record<string, number> = {};
          const riskBands: Record<string, number> = {};
          let asOf = "";
          for (const row of rows.slice(1)) {
            if (statusIdx >= 0 && row[statusIdx]) {
              statuses[row[statusIdx]] = (statuses[row[statusIdx]] || 0) + 1;
            }
            if (riskIdx >= 0 && row[riskIdx]) {
              riskBands[row[riskIdx]] = (riskBands[row[riskIdx]] || 0) + 1;
            }
            if (asOfIdx >= 0 && row[asOfIdx] && row[asOfIdx] > asOf) {
              asOf = row[asOfIdx];
            }
          }
          entry[lane] = {
            rows: Math.max(rows.length - 1, 0),
            as_of: asOf || null,
            overall_status: statuses,
            amendment_risk_band: riskBands,
          };
        } catch (err: unknown) {
          entry[lane] = { error: err instanceof Error ? err.message : String(err) };
        }
      }
      perIndication.push(entry);
    }
    return {
      source: base,
      indications: perIndication,
      note: "Read-only profile of the shipped Trial Graveyard register.csv files.",
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

  // (Template listing moved to util/template-loader.ts — shared with the
  // workflow modal, with a sort guard for name-less templates.)

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
    const tmpFile = join(
      tmpdir(),
      `openclaw-pack-${workflowId.slice(0, 8)}-${Date.now()}.md`
    );
    writeFileSync(tmpFile, synthesizerContent, "utf8");
    // Idempotent cleanup — previously the timeout path leaked the temp file
    // whenever the SIGTERM'd process failed to reach its close handler.
    const removeTmp = () => {
      try {
        if (existsSync(tmpFile)) unlinkSync(tmpFile);
      } catch {
        /* ignore */
      }
    };

    const today = new Date().toISOString().slice(0, 10);
    const packId = `pack-${today}-${templateId}-${workflowId.slice(0, 8)}`;
    const tags = ["openclaw", "synthesizer", templateId].join(",");

    // Fixed 2026-08-20: this spawn previously passed NO env (so no mkcert CA —
    // the CLI could never validate HTTPS Qdrant :6433 from a Finder-launched
    // Obsidian) and used bare settings.nodePath with no fallback. Both now go
    // through the shared engine-spawn helpers.
    const nodeBin = resolveNodeBin(this.settings.nodePath);

    return await new Promise((resolve, reject) => {
      const proc = spawn(
        nodeBin,
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
        { stdio: ["ignore", "pipe", "pipe"], env: buildEngineEnv(nodeBin) }
      );

      let stdout = "";
      let stderr = "";
      proc.stdout.on("data", (b) => { stdout += b.toString(); });
      proc.stderr.on("data", (b) => { stderr += b.toString(); });

      const timer = setTimeout(() => {
        proc.kill("SIGTERM");
        setTimeout(removeTmp, 5000);
        reject(new Error(`research-memory ingest timed out after ${this.settings.researchMemoryTimeoutMs}ms`));
      }, this.settings.researchMemoryTimeoutMs);

      proc.on("error", (err: Error) => {
        clearTimeout(timer);
        removeTmp();
        reject(err);
      });

      proc.on("close", (code: number) => {
        clearTimeout(timer);
        removeTmp();
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

  // ── CSV (quote-aware) ─────────────────────────────────────────
}

/** Minimal RFC-4180-ish CSV parser — register.csv titles carry commas. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== "") rows.push(row);
  }
  return rows;
}
