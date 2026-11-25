import { App, PluginSettingTab, Setting } from "obsidian";
import type VizStudioPlugin from "./main";

export class VizStudioSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private plugin: VizStudioPlugin
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h3", { text: "Bridge" });

    const bridgeStatusSetting = new Setting(containerEl).setName("Bridge status");
    const statusEl = bridgeStatusSetting.descEl.createSpan({ cls: "vz-bridge-status" });
    const updateBridgeStatus = () => {
      const running = this.plugin.isBridgeRunning;
      statusEl.empty();
      if (running) {
        statusEl.setText(`Running on unix:${this.plugin.bridgeSocketPath}`);
        statusEl.className = "vz-bridge-status vz-bridge-running";
      } else {
        statusEl.setText("Stopped");
        statusEl.className = "vz-bridge-status vz-bridge-stopped";
      }
    };
    updateBridgeStatus();

    bridgeStatusSetting
      .addButton((btn) =>
        btn.setButtonText("Start").onClick(async () => {
          try {
            await this.plugin.startBridge();
          } catch (err: unknown) {
            console.error(
              "[VizStudio] Bridge start failed:",
              err instanceof Error ? err.message : String(err)
            );
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
              console.error(
                "[VizStudio] Bridge stop failed:",
                err instanceof Error ? err.message : String(err)
              );
            }
            updateBridgeStatus();
          })
      );

    new Setting(containerEl)
      .setName("Enable on startup")
      .setDesc("Automatically start the bridge when Obsidian loads")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.enableBridge).onChange(async (value) => {
          this.plugin.settings.enableBridge = value;
          await this.plugin.saveSettings();
        })
      );

    // Read-only: the bridge has no TCP port since bridges-uds (2026-11-24), and its socket path is fixed.
    new Setting(containerEl)
      .setName("Socket path")
      .setDesc(
        "The MCP bridge listens only on this Unix socket (run directory 0700, socket 0600): programs running as your user account can reach it, a browser cannot. It is fixed and cannot be changed."
      )
      .addText((text) => {
        text.setValue(this.plugin.bridgeSocketPath);
        text.inputEl.readOnly = true;
      });

    containerEl.createEl("h3", { text: "Output" });

    new Setting(containerEl)
      .setName("Asset folder")
      .setDesc("Vault folder for generated SVG/PNG images")
      .addText((text) =>
        text
          .setPlaceholder("Visualizations/assets")
          .setValue(this.plugin.settings.assetFolder)
          .onChange(async (value) => {
            if (value.trim()) {
              this.plugin.settings.assetFolder = value.trim().replace(/\/+$/, "");
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName("Canvas folder")
      .setDesc("Vault folder for generated .canvas boards")
      .addText((text) =>
        text
          .setPlaceholder("Visualizations")
          .setValue(this.plugin.settings.canvasFolder)
          .onChange(async (value) => {
            if (value.trim()) {
              this.plugin.settings.canvasFolder = value.trim().replace(/\/+$/, "");
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName("Notes folder")
      .setDesc("Vault folder for generated diagram notes (mermaid fences)")
      .addText((text) =>
        text
          .setPlaceholder("Visualizations")
          .setValue(this.plugin.settings.notesFolder)
          .onChange(async (value) => {
            if (value.trim()) {
              this.plugin.settings.notesFolder = value.trim().replace(/\/+$/, "");
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName("PNG scale")
      .setDesc("Rasterization scale multiplier for PNG export (1-4)")
      .addText((text) =>
        text
          .setPlaceholder("2")
          .setValue(String(this.plugin.settings.pngScale))
          .onChange(async (value) => {
            const n = parseInt(value, 10);
            if (!isNaN(n) && n >= 1 && n <= 4) {
              this.plugin.settings.pngScale = n;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName("Chart background")
      .setDesc('Background behind charts and PNG exports ("transparent" to disable)')
      .addText((text) =>
        text
          .setPlaceholder("#ffffff")
          .setValue(this.plugin.settings.chartBackground)
          .onChange(async (value) => {
            if (value.trim()) {
              this.plugin.settings.chartBackground = value.trim();
              await this.plugin.saveSettings();
            }
          })
      );
  }
}
