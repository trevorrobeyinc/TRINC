import { Notice, Plugin } from "obsidian";
import { VizBridgeServer } from "./bridge/bridge-server";
import { DEFAULT_SETTINGS } from "./constants";
import { VizStudioSettingTab } from "./settings";
import { buildToolHandlers } from "./tools";
import type { VizStudioSettings } from "./types";

export default class VizStudioPlugin extends Plugin {
  // Mutated in place (never reassigned) so the bridge and tool handlers,
  // which capture this reference, always read current values.
  settings: VizStudioSettings = { ...DEFAULT_SETTINGS };
  private bridgeServer: VizBridgeServer | null = null;
  private bridgeStarting = false;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.addSettingTab(new VizStudioSettingTab(this.app, this));

    this.app.workspace.onLayoutReady(() => {
      if (this.settings.enableBridge) {
        this.startBridge().catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[VizStudio] Bridge failed to start:", msg);
          new Notice(`Viz Studio bridge failed to start: ${msg}`, 8000);
        });
      }
    });
  }

  get isBridgeRunning(): boolean {
    return this.bridgeServer?.isRunning ?? false;
  }

  async startBridge(): Promise<void> {
    if (this.bridgeStarting || this.bridgeServer?.isRunning) return;
    this.bridgeStarting = true;
    try {
      this.bridgeServer = null; // clean up any zombie from a previous failed start
      const handlers = buildToolHandlers({ app: this.app, settings: this.settings });
      this.bridgeServer = new VizBridgeServer(this.settings, handlers);
      await this.bridgeServer.start();
    } catch (err) {
      this.bridgeServer = null; // failed start must not block the next attempt
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
    this.bridgeServer?.stop().catch(() => {});
    this.bridgeServer = null;
  }

  async loadSettings(): Promise<void> {
    Object.assign(this.settings, DEFAULT_SETTINGS, (await this.loadData()) ?? {});
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
