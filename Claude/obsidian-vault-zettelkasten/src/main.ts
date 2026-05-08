import { Notice, Plugin, type TFile } from "obsidian";
import { DEFAULT_SETTINGS, PLUGIN_ID, type VaultZKSettings } from "./constants";
import type { VaultZettelkastenAPI, PipelineStep } from "./types";
import type {
  ZettelkastenCommandRequest,
  ZettelkastenCommandResponse,
  ZettelkastenPipelineResponse,
} from "./types/zettelkasten";
import { VaultFS } from "./adapters/vault-fs";
import { MiyoClient } from "./adapters/miyo-client";
import { QdrantClient } from "./adapters/qdrant-client";
import { ModelGateway } from "./adapters/model-gateway";
import { ZettelkastenService } from "./services/zettelkasten-service";
import { EventBus } from "./services/event-bus";
import { Scheduler } from "./services/scheduler";
import { VaultZKSettingTab } from "./settings";

export default class VaultZettelkastenPlugin extends Plugin {
  settings: VaultZKSettings = DEFAULT_SETTINGS;
  api!: VaultZettelkastenAPI;

  private service!: ZettelkastenService;
  private eventBus!: EventBus;
  private scheduler!: Scheduler;
  private vaultFs!: VaultFS;
  private miyoClient!: MiyoClient;
  private qdrantClient!: QdrantClient;
  private modelGateway!: ModelGateway;

  async onload(): Promise<void> {
    await this.loadSettings();

    // Adapters
    this.vaultFs = new VaultFS(this.app);
    this.miyoClient = new MiyoClient(this.settings.miyoBaseUrl);
    this.qdrantClient = new QdrantClient(this.settings.qdrantBaseUrl, this.settings.qdrantCollection);
    this.modelGateway = new ModelGateway();

    // Core service
    const vaultName = this.app.vault.getName();
    const adapter = this.app.vault.adapter as any;
    const vaultRoot = typeof adapter?.basePath === "string" ? adapter.basePath : "";
    if (!vaultRoot) console.warn("[VaultZK] Could not determine vault root path — Qdrant file lookups may not work");

    this.service = new ZettelkastenService(
      this.vaultFs,
      this.miyoClient,
      this.qdrantClient,
      this.modelGateway,
      () => this.settings,
      vaultName,
      vaultRoot
    );

    // Event bus
    this.eventBus = new EventBus(this.app);

    // Scheduler
    this.scheduler = new Scheduler(this.app, this.service, this.eventBus, () => this.settings);
    this.scheduler.start();

    // Public API for cross-plugin communication
    this.api = this.buildAPI();

    // Obsidian commands
    this.registerCommands();

    // Settings tab
    this.addSettingTab(new VaultZKSettingTab(this.app, this));

    // Invalidate VaultFS cache when files change
    this.registerEvent(this.app.vault.on("create", () => this.vaultFs.invalidateCache()));
    this.registerEvent(this.app.vault.on("delete", () => this.vaultFs.invalidateCache()));
    this.registerEvent(this.app.vault.on("rename", () => this.vaultFs.invalidateCache()));

    console.log(`[VaultZK] Plugin loaded (vault: ${vaultName})`);
  }

  onunload(): void {
    this.scheduler?.stop();
    this.eventBus?.destroy();
    console.log("[VaultZK] Plugin unloaded");
  }

  async loadSettings(): Promise<void> {
    const loaded = (await this.loadData()) ?? {};
    const safe: VaultZKSettings = { ...DEFAULT_SETTINGS };
    for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof VaultZKSettings)[]) {
      if (key in loaded && typeof loaded[key] === typeof DEFAULT_SETTINGS[key]) {
        (safe as any)[key] = loaded[key];
      }
    }
    this.settings = safe;
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    // Propagate config changes to adapters
    this.miyoClient?.updateBaseUrl(this.settings.miyoBaseUrl);
    this.qdrantClient?.updateConfig(this.settings.qdrantBaseUrl, this.settings.qdrantCollection);
  }

  /* ── Public API ──────────────────────────────────────────────── */

  private buildAPI(): VaultZettelkastenAPI {
    return {
      serendipity: (req) => this.runCommand("serendipity", req),
      crossDomain: (req) => this.runCommand("cross-domain", req),
      echoChamber: (req) => this.runCommand("echo-chamber", req),
      semanticLinker: (req) => this.runCommand("semantic-linker", req),
      orphanRescue: (req) => this.runCommand("orphan-rescue", req),
      vaultHealth: (req) => this.runCommand("health", req),
      pipeline: (steps, baseRequest) => this.runPipeline(steps, baseRequest),
    };
  }

  private async runCommand(
    command: string,
    request: ZettelkastenCommandRequest
  ): Promise<ZettelkastenCommandResponse> {
    const start = Date.now();
    let result: ZettelkastenCommandResponse;

    switch (command) {
      case "serendipity":
        result = await this.service.serendipity(request);
        break;
      case "cross-domain":
        result = await this.service.crossDomain(request);
        break;
      case "echo-chamber":
        result = await this.service.echoChamber(request);
        break;
      case "semantic-linker":
        result = await this.service.semanticLinker(request);
        break;
      case "orphan-rescue":
        result = await this.service.orphanRescue(request);
        break;
      case "health":
        result = await this.service.vaultHealth(request);
        break;
      default:
        throw new Error(`Unknown command: ${command}`);
    }

    this.eventBus.emit("analysis:complete", {
      command,
      notePath: request.notePath ?? null,
      durationMs: Date.now() - start,
    });

    return result;
  }

  private async runPipeline(
    steps: PipelineStep[],
    baseRequest: ZettelkastenCommandRequest
  ): Promise<ZettelkastenPipelineResponse> {
    const result = await this.service.pipeline(steps, baseRequest);

    this.eventBus.emit("pipeline:complete", {
      steps: result.steps.map((s) => s.command),
      durationMs: result.metadata.durationMs,
    });

    return result;
  }

  /* ── Obsidian Commands ───────────────────────────────────────── */

  private registerCommands(): void {
    const commands: Array<{
      id: string;
      name: string;
      command: string;
    }> = [
      { id: "run-serendipity", name: "Run Serendipity on current note", command: "serendipity" },
      { id: "run-cross-domain", name: "Run Cross-Domain on current note", command: "cross-domain" },
      { id: "run-echo-chamber", name: "Run Echo Chamber on current note", command: "echo-chamber" },
      { id: "run-semantic-linker", name: "Run Semantic Linker on current note", command: "semantic-linker" },
      { id: "run-orphan-rescue", name: "Run Orphan Rescue on current note", command: "orphan-rescue" },
      { id: "run-vault-health", name: "Run Vault Health Check", command: "health" },
    ];

    for (const cmd of commands) {
      this.addCommand({
        id: cmd.id,
        name: cmd.name,
        callback: () => this.executeOnActiveNote(cmd.command, cmd.name),
      });
    }

    this.addCommand({
      id: "run-full-pipeline",
      name: "Run Full Pipeline on current note",
      callback: () => this.executeFullPipeline(),
    });
  }

  private async executeOnActiveNote(command: string, displayName: string): Promise<void> {
    const file = this.app.workspace.getActiveFile();

    const request: ZettelkastenCommandRequest = {
      notePath: file?.path,
      options: { limit: 10, batchMode: false, writeReport: false },
    };

    // Health doesn't need an active note
    if (command !== "health" && !file) {
      new Notice("No active markdown file");
      return;
    }

    new Notice(`[VaultZK] Running ${displayName}...`);

    try {
      const result = await this.runCommand(command, request);
      new Notice(
        `[VaultZK] ${displayName} complete (${(result.metadata.durationMs / 1000).toFixed(1)}s)`
      );

      // Open result in a new note
      await this.showResult(command, file, result);
    } catch (e) {
      console.error(`[VaultZK] ${command} failed:`, e);
      new Notice(`[VaultZK] ${displayName} failed: ${(e as Error).message}`);
    }
  }

  private async executeFullPipeline(): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      new Notice("No active markdown file");
      return;
    }

    new Notice("[VaultZK] Running full pipeline...");

    try {
      const steps: PipelineStep[] = [
        { command: "serendipity" },
        { command: "cross-domain" },
        { command: "semantic-linker" },
        { command: "echo-chamber" },
      ];

      const result = await this.runPipeline(steps, {
        notePath: file.path,
        options: { limit: 10, batchMode: false, writeReport: false },
      });

      new Notice(
        `[VaultZK] Pipeline complete (${(result.metadata.durationMs / 1000).toFixed(1)}s)`
      );

      const reportPath = `${this.settings.reportsFolder}/Pipeline ${file.basename} ${new Date().toISOString().slice(0, 10)}.md`;
      await this.ensureFolder(this.settings.reportsFolder);
      await this.app.vault.create(reportPath, result.combinedContent);
      await this.app.workspace.openLinkText(reportPath, "", true);
    } catch (e) {
      console.error("[VaultZK] Pipeline failed:", e);
      new Notice(`[VaultZK] Pipeline failed: ${(e as Error).message}`);
    }
  }

  private async showResult(
    command: string,
    sourceFile: TFile | null,
    result: ZettelkastenCommandResponse
  ): Promise<void> {
    const basename = sourceFile?.basename ?? "vault";
    const date = new Date().toISOString().slice(0, 10);
    const reportPath = `${this.settings.reportsFolder}/${command} ${basename} ${date}.md`;

    await this.ensureFolder(this.settings.reportsFolder);

    const existing = this.app.vault.getAbstractFileByPath(reportPath);
    if (existing && "extension" in existing) {
      await this.app.vault.modify(existing as TFile, result.content);
    } else {
      await this.app.vault.create(reportPath, result.content);
    }

    await this.app.workspace.openLinkText(reportPath, "", true);
  }

  private async ensureFolder(folder: string): Promise<void> {
    if (!(await this.app.vault.adapter.exists(folder))) {
      await this.app.vault.createFolder(folder);
    }
  }
}
