import { Notice, Plugin } from "obsidian";
import { spawn, type ChildProcess, execSync } from "child_process";
import { existsSync, mkdirSync, appendFileSync } from "fs";
import { homedir } from "os";
import { join, resolve, dirname } from "path";
import { BRIDGE_IPC_FD, DEFAULT_SETTINGS, PLUGIN_ID } from "./constants";
import type { BridgeLauncherSettings, BridgeStatus } from "./types";
import { BridgeLauncherSettingTab } from "./settings";
import { ConsoleCapture } from "./consoleCapture";
import { attachLauncherIpcServer } from "./launcherIpcServer";

/**
 * Append a security-audit event to the shared internal-disk JSONL sink
 * (~/Library/Logs/trevclaw/audit.jsonl, overridable via TREVCLAW_AUDIT_LOG) so the
 * OSSEC/Falcon detection plane sees bridge subprocess lifecycle. Never throws.
 */
function emitLauncherAudit(event: Record<string, unknown>): void {
  try {
    const override = process.env.TREVCLAW_AUDIT_LOG;
    const file = override && override.trim()
      ? resolve(override.trim())
      : join(homedir(), "Library", "Logs", "trevclaw", "audit.jsonl");
    mkdirSync(dirname(file), { recursive: true });
    const line = `${JSON.stringify({ ts: new Date().toISOString(), kind: "trevclaw_audit", source: "obsidian-bridge-launcher", ...event })}\n`;
    appendFileSync(file, line);
  } catch {
    // never throw out of audit emit
  }
}

export default class BridgeLauncherPlugin extends Plugin {
  settings!: BridgeLauncherSettings;
  child: ChildProcess | null = null;
  status: BridgeStatus = "stopped";
  capture: ConsoleCapture | null = null;
  private detachIpcServer: (() => void) | null = null;
  private statusBarEl: HTMLElement | null = null;
  private startedAt: number | null = null;
  private syncCleanup = (): void => {
    // Synchronous SIGKILL — runs from process exit handlers / window beforeunload
    // where we have no time to await anything. Safe to call repeatedly.
    if (this.child && this.child.pid && !this.child.killed) {
      try {
        process.kill(this.child.pid, "SIGKILL");
      } catch {
        // already dead
      }
    }
  };
  private beforeUnloadHandler: (() => void) | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();

    // Install renderer console capture BEFORE anything else this plugin
    // touches, so the ring buffers are warm by the time the bridge fires
    // its first dev-console tool.
    this.capture = new ConsoleCapture(
      this.settings.consoleBufferSize,
      this.settings.consoleErrorsBufferSize
    );
    this.capture.install();

    this.statusBarEl = this.addStatusBarItem();
    this.setStatus("stopped");
    this.addSettingTab(new BridgeLauncherSettingTab(this.app, this));

    this.addCommand({
      id: "bridge-launcher-restart",
      name: "Restart bridge",
      callback: async () => {
        await this.stopBridge();
        await this.startBridge();
      },
    });

    // Belt-and-suspenders: catch the case where Obsidian terminates the
    // renderer without awaiting our onunload. Both fire synchronously.
    process.on("exit", this.syncCleanup);
    this.beforeUnloadHandler = () => this.syncCleanup();
    window.addEventListener("beforeunload", this.beforeUnloadHandler);

    await this.startBridge();
  }

  async onunload(): Promise<void> {
    // Synchronous SIGKILL first — guarantees signal delivery before the
    // renderer exits, even if Obsidian doesn't await this onunload promise.
    // The bridge is stateless (HTTPS server with no flushable buffers), so
    // graceful SIGTERM gains us nothing here.
    this.syncCleanup();
    process.removeListener("exit", this.syncCleanup);
    if (this.beforeUnloadHandler) {
      window.removeEventListener("beforeunload", this.beforeUnloadHandler);
      this.beforeUnloadHandler = null;
    }
    if (this.detachIpcServer) {
      this.detachIpcServer();
      this.detachIpcServer = null;
    }
    if (this.capture) {
      this.capture.uninstall();
      this.capture = null;
    }
    await this.stopBridge();
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  setStatus(status: BridgeStatus, detail?: string): void {
    this.status = status;
    if (!this.statusBarEl) return;
    const dot =
      status === "running" ? "●" :
      status === "starting" ? "○" :
      status === "error" ? "●" :
      "○";
    const color =
      status === "running" ? "var(--color-green)" :
      status === "starting" ? "var(--color-yellow)" :
      status === "error" ? "var(--color-red)" :
      "var(--text-muted)";
    this.statusBarEl.empty();
    const span = this.statusBarEl.createSpan({ text: `Bridge ${dot}` });
    span.style.color = color;
    span.title = detail ?? `Bridge: ${status}`;
  }

  private isPortInUse(port: number): boolean {
    try {
      const out = execSync(`lsof -nP -iTCP:${port} -sTCP:LISTEN -t`, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      return out.length > 0;
    } catch {
      return false;
    }
  }

  private getPortListenerPid(port: number): number | null {
    try {
      const out = execSync(`lsof -nP -iTCP:${port} -sTCP:LISTEN -t`, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      const lines = out.split("\n").filter((l) => l.length);
      if (lines.length === 0) return null;
      const pid = parseInt(lines[0], 10);
      return Number.isFinite(pid) ? pid : null;
    } catch {
      return null;
    }
  }

  async startBridge(): Promise<void> {
    if (this.child && !this.child.killed) {
      new Notice("Bridge already running");
      return;
    }

    const distEntry = `${this.settings.bridgePackagePath}/dist/index.js`;
    if (!existsSync(distEntry)) {
      const msg = `Bridge dist not found: ${distEntry}\nRun \`npm run build\` in the bridge package first.`;
      new Notice(msg, 8000);
      this.setStatus("error", msg);
      return;
    }
    if (!existsSync(this.settings.mcpConfigPath)) {
      const msg = `MCP config not found: ${this.settings.mcpConfigPath}`;
      new Notice(msg, 8000);
      this.setStatus("error", msg);
      return;
    }
    if (!existsSync(this.settings.nodePath)) {
      const msg = `Node binary not found: ${this.settings.nodePath}`;
      new Notice(msg, 8000);
      this.setStatus("error", msg);
      return;
    }

    if (this.isPortInUse(this.settings.bridgePort)) {
      const stalePid = this.getPortListenerPid(this.settings.bridgePort);
      if (this.settings.staleProcessKillEnabled && stalePid) {
        try {
          process.kill(stalePid, "SIGTERM");
          await this.wait(1500);
          if (this.isPortInUse(this.settings.bridgePort)) {
            process.kill(stalePid, "SIGKILL");
            await this.wait(500);
          }
          new Notice(`Killed stale bridge on :${this.settings.bridgePort} (pid ${stalePid})`);
        } catch (err) {
          const msg = `Port :${this.settings.bridgePort} is held by pid ${stalePid} and could not be killed: ${(err as Error).message}`;
          new Notice(msg, 8000);
          this.setStatus("error", msg);
          return;
        }
      } else {
        const msg = `Port :${this.settings.bridgePort} already in use; refusing to start.`;
        new Notice(msg, 8000);
        this.setStatus("error", msg);
        return;
      }
    }

    this.setStatus("starting");
    try {
      this.child = spawn(
        this.settings.nodePath,
        ["dist/index.js", "--transport=https"],
        {
          cwd: this.settings.bridgePackagePath,
          env: {
            ...process.env,
            NODE_ENV: "production",
            NODE_EXTRA_CA_CERTS: this.settings.caCertPath,
            OBSIDIAN_MCP_CONFIG: this.settings.mcpConfigPath,
            BRIDGE_IPC_FD: String(BRIDGE_IPC_FD),
          },
          // fd 3 is a bidirectional pipe used as a JSON-RPC channel for
          // dev-console tools. Replaces the retired CDP path on :8315.
          stdio: ["ignore", "pipe", "pipe", "pipe"],
        }
      );
    } catch (err) {
      const msg = `Failed to spawn bridge: ${(err as Error).message}`;
      new Notice(msg, 8000);
      this.setStatus("error", msg);
      return;
    }

    this.startedAt = Date.now();
    const pid = this.child.pid;
    emitLauncherAudit({
      eventType: "EXEC_START",
      pid,
      command: `${this.settings.nodePath} dist/index.js --transport=https`,
      port: this.settings.bridgePort,
    });

    if (this.capture) {
      this.detachIpcServer = attachLauncherIpcServer(this.child, {
        app: this.app,
        capture: this.capture,
        evalEnabled: () => this.settings.devConsoleEvalEnabled,
      });
    }

    this.child.stdout?.on("data", (chunk) => {
      console.log(`[bridge-launcher] ${chunk.toString().trimEnd()}`);
    });
    this.child.stderr?.on("data", (chunk) => {
      console.warn(`[bridge-launcher] ${chunk.toString().trimEnd()}`);
    });
    this.child.on("exit", (code, signal) => {
      const detail = `exit code=${code} signal=${signal ?? ""}`;
      emitLauncherAudit({ eventType: "EXEC_EXIT", pid, code, signal });
      console.log(`[bridge-launcher] bridge exited: ${detail}`);
      if (this.detachIpcServer) {
        this.detachIpcServer();
        this.detachIpcServer = null;
      }
      if (this.status === "running") {
        new Notice(`Bridge exited unexpectedly (${detail})`, 8000);
        this.setStatus("exited", detail);
      }
      this.child = null;
    });

    await this.wait(800);
    if (this.isPortInUse(this.settings.bridgePort)) {
      this.setStatus("running", `pid ${pid} :${this.settings.bridgePort}`);
      new Notice(`Bridge started on :${this.settings.bridgePort}`);
    } else {
      this.setStatus("starting", `pid ${pid} (waiting on :${this.settings.bridgePort})`);
      this.app.workspace.onLayoutReady(() => this.confirmRunning());
      setTimeout(() => this.confirmRunning(), 4000);
    }
  }

  private confirmRunning(): void {
    if (!this.child || this.child.killed) return;
    if (this.isPortInUse(this.settings.bridgePort)) {
      this.setStatus("running", `pid ${this.child.pid} :${this.settings.bridgePort}`);
    } else if (this.status !== "exited" && this.status !== "error") {
      this.setStatus("error", `bridge spawned (pid ${this.child.pid}) but :${this.settings.bridgePort} not bound after 4s`);
    }
  }

  async stopBridge(): Promise<void> {
    const child = this.child;
    if (!child || child.killed) {
      this.setStatus("stopped");
      return;
    }
    try {
      child.kill("SIGTERM");
    } catch {
      // already dead
    }
    const deadline = Date.now() + this.settings.shutdownTimeoutMs;
    while (Date.now() < deadline && !child.killed) {
      await this.wait(100);
    }
    if (!child.killed) {
      try {
        child.kill("SIGKILL");
      } catch {
        // already dead
      }
    }
    this.child = null;
    this.startedAt = null;
    this.setStatus("stopped");
  }

  uptimeMs(): number | null {
    return this.startedAt ? Date.now() - this.startedAt : null;
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
