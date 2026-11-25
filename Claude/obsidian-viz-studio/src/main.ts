import { Notice, Plugin } from "obsidian";
import { VizBridgeServer, vizBridgeSocketPath } from "./bridge/bridge-server";
import { DEFAULT_SETTINGS } from "./constants";
import { VizStudioSettingTab } from "./settings";
import { buildToolHandlers } from "./tools";
import type { VizStudioSettings } from "./types";

export default class VizStudioPlugin extends Plugin {
  // Mutated in place (never reassigned) so the tool handlers, which capture
  // this reference, always read current values.
  settings: VizStudioSettings = { ...DEFAULT_SETTINGS };
  // Bridge lifecycle (bridges-uds DESIGN D3). Obsidian's unload is synchronous
  // and never awaits, and a queued onLayoutReady callback still runs after the
  // plugin unloaded. So `disposed` is set first thing in onunload and checked
  // before any start, one start runs at a time, and a start that finishes after
  // a stop or an unload closes its listener at once.
  private disposed = false;
  private bridgeServer: VizBridgeServer | null = null;
  private bridgeStart: Promise<void> | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.addSettingTab(new VizStudioSettingTab(this.app, this));

    this.app.workspace.onLayoutReady(() => {
      if (this.disposed) return;
      if (this.settings.enableBridge) {
        this.startBridge().catch((err) => {
          if (this.disposed) return;
          // A newer start of this socket in this window took over (a Stop and Start while this one was
          // still starting): nothing failed.
          if ((err as { code?: unknown } | null)?.code === "SUPERSEDED") return;
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

  /** The bridge's socket: the live listener's path, or the fixed path it takes when it starts. */
  get bridgeSocketPath(): string {
    return this.bridgeServer?.socketPath ?? vizBridgeSocketPath();
  }

  /** One start in flight per plugin instance: onLayoutReady and the settings tab's Start button can race. */
  startBridge(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (this.bridgeStart) return this.bridgeStart;
    if (this.bridgeServer?.isRunning) return Promise.resolve();
    const starting = this.runBridgeStart().finally(() => {
      if (this.bridgeStart === starting) this.bridgeStart = null;
    });
    this.bridgeStart = starting;
    return starting;
  }

  private async runBridgeStart(): Promise<void> {
    const handlers = buildToolHandlers({
      app: this.app,
      settings: this.settings,
      bridgeSocketName: () => this.bridgeServer?.socketName ?? null,
    });
    const server = new VizBridgeServer(handlers, {
      isDisposed: () => this.disposed,
      onLost: (reason) => {
        if (!this.disposed) new Notice(`Bridge stopped: ${reason}`);
      },
    });
    this.bridgeServer = server;
    try {
      const listener = await server.start();
      // Obsidian runs registered callbacks before onunload, so the socket closes even if onunload never gets there.
      if (listener !== null) this.register(() => void listener.close().catch(() => {}));
    } catch (err) {
      if (this.bridgeServer === server) this.bridgeServer = null; // a failed start must not block the next attempt
      throw err;
    }
  }

  /** Stop the bridge. The server closes the listener at once, or, with a start still in flight, whatever that start opens. */
  stopBridge(): Promise<void> {
    const server = this.bridgeServer;
    this.bridgeServer = null;
    this.bridgeStart = null;
    return server ? server.stop() : Promise.resolve();
  }

  onunload(): void {
    this.disposed = true;
    this.stopBridge().catch((err) => {
      console.warn("[VizStudio] Bridge stop failed:", err instanceof Error ? err.message : String(err));
    });
  }

  async loadSettings(): Promise<void> {
    // A bridgePort saved by a build before bridges-uds (2026-11-24) is copied along and saved back
    // untouched: nothing reads it, and code does not rewrite the operator's data.json to drop it.
    Object.assign(this.settings, DEFAULT_SETTINGS, (await this.loadData()) ?? {});
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
