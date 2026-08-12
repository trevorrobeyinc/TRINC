import { App, PluginSettingTab, Setting } from "obsidian";
import type BridgeLauncherPlugin from "./main";

export class BridgeLauncherSettingTab extends PluginSettingTab {
  plugin: BridgeLauncherPlugin;

  constructor(app: App, plugin: BridgeLauncherPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Obsidian Bridge Launcher" });
    containerEl.createEl("p", {
      text:
        "Spawns the canonical Obsidian MCP bridge as a child process tied to Obsidian's lifecycle. " +
        "Bridge dies when Obsidian quits or when this plugin is disabled.",
    });

    // --- Status ---
    containerEl.createEl("h3", { text: "Status" });
    const statusEl = containerEl.createDiv();
    const refresh = () => {
      const uptime = this.plugin.uptimeMs();
      statusEl.setText(
        `Status: ${this.plugin.status} · port :${this.plugin.settings.bridgePort}` +
          (this.plugin.child?.pid ? ` · pid ${this.plugin.child.pid}` : "") +
          (uptime ? ` · uptime ${Math.round(uptime / 1000)}s` : "")
      );
    };
    refresh();

    new Setting(containerEl)
      .setName("Restart bridge")
      .setDesc("Stop and re-spawn the bridge child process")
      .addButton((btn) =>
        btn.setButtonText("Restart").onClick(async () => {
          await this.plugin.stopBridge();
          await this.plugin.startBridge();
          refresh();
        })
      );

    // --- Paths ---
    containerEl.createEl("h3", { text: "Paths" });

    new Setting(containerEl)
      .setName("Bridge package path")
      .setDesc("Absolute path to the obsidian-copilot-bridge package root (must contain dist/index.js)")
      .addText((text) =>
        text
          .setPlaceholder(
            "/Users/myhome/TrevClaw-Obsidianodus/Copilot-Everything/bridges/obsidian-copilot-bridge"
          )
          .setValue(this.plugin.settings.bridgePackagePath)
          .onChange(async (value) => {
            this.plugin.settings.bridgePackagePath = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Node.js path")
      .setDesc("Path to Node.js binary (>= 22.5 for node:sqlite)")
      .addText((text) =>
        text
          .setPlaceholder("/Users/myhome/.nvm/versions/node/v22.13.1/bin/node")
          .setValue(this.plugin.settings.nodePath)
          .onChange(async (value) => {
            this.plugin.settings.nodePath = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("MCP config path")
      .setDesc("Absolute path to obsidian-cli-mcp.local.json (must define transport.tls.{certPath,keyPath})")
      .addText((text) =>
        text
          .setValue(this.plugin.settings.mcpConfigPath)
          .onChange(async (value) => {
            this.plugin.settings.mcpConfigPath = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Extra CA cert path")
      .setDesc("Passed to the bridge as NODE_EXTRA_CA_CERTS (mkcert root CA)")
      .addText((text) =>
        text
          .setValue(this.plugin.settings.caCertPath)
          .onChange(async (value) => {
            this.plugin.settings.caCertPath = value.trim();
            await this.plugin.saveSettings();
          })
      );

    // --- Behavior ---
    containerEl.createEl("h3", { text: "Behavior" });

    new Setting(containerEl)
      .setName("Bridge port")
      .setDesc("Port the bridge listens on (used for stale-process detection)")
      .addText((text) =>
        text
          .setValue(String(this.plugin.settings.bridgePort))
          .onChange(async (value) => {
            const n = parseInt(value, 10);
            if (Number.isFinite(n) && n > 0 && n < 65536) {
              this.plugin.settings.bridgePort = n;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName("Shutdown timeout (ms)")
      .setDesc("Time to wait after SIGTERM before sending SIGKILL")
      .addText((text) =>
        text
          .setValue(String(this.plugin.settings.shutdownTimeoutMs))
          .onChange(async (value) => {
            const n = parseInt(value, 10);
            if (Number.isFinite(n) && n >= 0) {
              this.plugin.settings.shutdownTimeoutMs = n;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName("Kill stale bridge on start")
      .setDesc("If the bridge port is held when this plugin enables, kill the holder before spawning a fresh bridge.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.staleProcessKillEnabled)
          .onChange(async (value) => {
            this.plugin.settings.staleProcessKillEnabled = value;
            await this.plugin.saveSettings();
          })
      );

    // --- Dev console (renderer-side, replaces the retired CDP path) ---
    containerEl.createEl("h3", { text: "Dev console" });
    containerEl.createEl("p", {
      text:
        "The bridge exposes obsidian_dev_console_logs and obsidian_dev_console_errors " +
        "(read-only) via the launcher IPC channel. obsidian_dev_console_eval was removed " +
        "in 2026-08 — the launcher no longer carries a code-execution primitive, so there " +
        "is no setting that can re-enable it. Attempts are still recorded to the audit log.",
    });

    new Setting(containerEl)
      .setName("Console log buffer size")
      .setDesc("Number of recent console.{log,info,warn,debug,error} entries kept in the ring buffer.")
      .addText((text) =>
        text
          .setValue(String(this.plugin.settings.consoleBufferSize))
          .onChange(async (value) => {
            const n = parseInt(value, 10);
            if (Number.isFinite(n) && n > 0 && n <= 10_000) {
              this.plugin.settings.consoleBufferSize = n;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName("Error buffer size")
      .setDesc("Number of recent uncaught errors / unhandled rejections kept.")
      .addText((text) =>
        text
          .setValue(String(this.plugin.settings.consoleErrorsBufferSize))
          .onChange(async (value) => {
            const n = parseInt(value, 10);
            if (Number.isFinite(n) && n > 0 && n <= 10_000) {
              this.plugin.settings.consoleErrorsBufferSize = n;
              await this.plugin.saveSettings();
            }
          })
      );
  }
}
