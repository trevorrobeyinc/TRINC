import { Notice, Plugin, TFile, TFolder, normalizePath, prepareSimpleSearch } from "obsidian";
import { spawn, type ChildProcess } from "child_process";
import { existsSync, mkdirSync, appendFileSync } from "fs";
import { homedir } from "os";
import { join, resolve, dirname } from "path";
import { BRIDGE_IPC_FD, DEFAULT_SETTINGS, HEALTHZ_TIMEOUT_MS, PLUGIN_ID } from "./constants";
import type { BridgeLauncherSettings, BridgeStatus } from "./types";
import { BridgeLauncherSettingTab } from "./settings";
import { ConsoleCapture } from "./consoleCapture";
import { attachLauncherIpcServer } from "./launcherIpcServer";
import { clearStaleHolder, getHealthz } from "./bridgeSocket";
import type { ObsidianRuntime } from "./vaultIpc";

/** The 'obsidian' functions the vault operations call. vaultIpc.ts takes them as a dependency, for its tests. */
const OBSIDIAN_RUNTIME: ObsidianRuntime = {
  normalizePath,
  prepareSimpleSearch,
  isNote: (entry): entry is TFile => entry instanceof TFile,
  isFolder: (entry): entry is TFolder => entry instanceof TFolder,
};

/**
 * bridges-uds (2026-11-24): the bridge serves only on <home>/.local/state/trinc/run/vault-bridge.sock
 * (run directory 0700, socket 0600), never on TCP. The path comes from os.homedir(), never from "~" or
 * XDG variables; the bridge's pidfile sits next to it.
 */
const RUN_DIR = join(homedir(), ".local", "state", "trinc", "run");
const BRIDGE_SOCKET_NAME = "vault-bridge.sock";
const BRIDGE_SOCKET_PATH = join(RUN_DIR, BRIDGE_SOCKET_NAME);
const BRIDGE_PIDFILE_PATH = join(RUN_DIR, "vault-bridge.pid");

/** After SIGKILL, how long stopBridge still waits for the child's "exit" event. */
const KILL_WAIT_MS = 3_000;

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

/** Not yet exited. child.killed is no use here: it turns true as soon as a signal is sent. */
function isAlive(child: ChildProcess): boolean {
  return child.exitCode === null && child.signalCode === null;
}

/** Resolve true on the child's "exit" event (at once if it already exited), false after ms. */
function waitForExit(child: ChildProcess, ms: number): Promise<boolean> {
  if (!isAlive(child)) return Promise.resolve(true);
  return new Promise((done) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onExit = (): void => {
      if (timer !== null) clearTimeout(timer);
      done(true);
    };
    timer = setTimeout(() => {
      child.off("exit", onExit);
      done(false);
    }, ms);
    child.once("exit", onExit);
  });
}

export default class BridgeLauncherPlugin extends Plugin {
  settings!: BridgeLauncherSettings;
  child: ChildProcess | null = null;
  status: BridgeStatus = "stopped";
  capture: ConsoleCapture | null = null;
  /** Shown by the settings tab; the bridge always serves here. */
  readonly socketPath = BRIDGE_SOCKET_PATH;
  private detachIpcServer: (() => void) | null = null;
  private statusBarEl: HTMLElement | null = null;
  private startedAt: number | null = null;
  /** Set first in onunload: nothing spawns or signals after that. */
  private disposed = false;
  /** One spawn at a time: onload, the Restart command and the settings button can overlap. */
  private spawning = false;
  /** The child stopBridge is stopping, so its exit is not reported as unexpected. */
  private stopping: ChildProcess | null = null;
  private syncCleanup = (): void => {
    // Synchronous SIGKILL — runs from process exit handlers / window beforeunload
    // where we have no time to await anything. Safe to call repeatedly. A child that
    // was already sent SIGTERM still counts until it has actually exited.
    const child = this.child;
    if (child && child.pid && child.exitCode === null && child.signalCode === null) {
      try {
        process.kill(child.pid, "SIGKILL");
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
    this.disposed = true;
    // Synchronous SIGKILL first — guarantees signal delivery before the
    // renderer exits, even if Obsidian doesn't await this onunload promise.
    // It leaves vault-bridge.sock behind as a stale socket; the next bridge
    // start replaces it (startup stale recovery is the real guarantee).
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
    // A port setting left in data.json from the TCP era is ignored (kept as an unknown key, not
    // scrubbed): data.json is operator-owned, and the bridge has no port since bridges-uds.
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

  async startBridge(): Promise<void> {
    if (this.child && isAlive(this.child)) {
      new Notice("Bridge already running");
      return;
    }
    if (this.spawning) {
      new Notice("Bridge start already in progress");
      return;
    }
    this.spawning = true;
    let child: ChildProcess | null = null;
    try {
      child = await this.spawnBridge();
    } finally {
      this.spawning = false;
    }
    if (child) {
      await this.confirmStarted(child);
    }
  }

  private fail(msg: string): null {
    new Notice(msg, 8000);
    this.setStatus("error", msg);
    return null;
  }

  /** Checks, the stale-holder procedure, then the spawn. Returns the child, or null when it did not spawn. */
  private async spawnBridge(): Promise<ChildProcess | null> {
    const pkg = this.settings.bridgePackagePath;
    const distEntry = `${pkg}/dist/index.js`;
    if (!existsSync(distEntry)) {
      return this.fail(`Bridge dist not found: ${distEntry}\nRun \`npm run build\` in the bridge package first.`);
    }
    // tsc never deletes outputs: a dist built before bridges-uds keeps its TCP listener
    // (server/httpTransport.js) and lacks the socket helper (server/udsListener.js).
    if (!existsSync(`${pkg}/dist/server/udsListener.js`) || existsSync(`${pkg}/dist/server/httpTransport.js`)) {
      return this.fail(`bridge dist predates bridges-uds: run \`rm -rf dist && npm run build\` in ${pkg}`);
    }
    // A dist built before 2026-11-25 still sends its vault operations to the Local REST API plugin. It is
    // warned about, not refused: deploying this launcher first and rebuilding the bridge second is the safe
    // order, and the old bridge keeps working in between, while that plugin is still enabled.
    if (!existsSync(`${pkg}/dist/backends/launcherIpcBackend.js`)) {
      new Notice(
        `The bridge build predates the launcher pipe backend, so it still uses the Local REST API. ` +
          `Expected between deploying this launcher and rebuilding the bridge, and while rolled back. ` +
          `Otherwise follow ops/security/vault-ipc-2026-11-25.md in TRINC (save the current dist first).`,
        12000
      );
      console.warn("[bridge-launcher] bridge dist predates LauncherIpcBackend (2026-11-25)");
    }
    if (!existsSync(this.settings.mcpConfigPath)) {
      return this.fail(`MCP config not found: ${this.settings.mcpConfigPath}`);
    }
    if (!existsSync(this.settings.nodePath)) {
      return this.fail(`Node binary not found: ${this.settings.nodePath}`);
    }

    // No live child of ours here (startBridge returned early otherwise). A socket that still answers
    // is an orphaned bridge only if its identity checks out; anything else is refused, never killed.
    const holder = await clearStaleHolder({
      socketPath: BRIDGE_SOCKET_PATH,
      runDir: RUN_DIR,
      socketName: BRIDGE_SOCKET_NAME,
      pidfilePath: BRIDGE_PIDFILE_PATH,
      bridgePackagePath: pkg,
      killEnabled: this.settings.staleProcessKillEnabled,
      cancelled: () => this.disposed,
    });
    if (this.disposed) return null; // unloaded meanwhile: never spawn after onunload
    if (holder.action === "refused") {
      return this.fail(`Bridge not started: ${holder.reason}`);
    }
    if (holder.action === "killed") {
      new Notice(`Killed stale bridge on ${BRIDGE_SOCKET_NAME} (pid ${holder.pid})`);
    }

    this.setStatus("starting");
    let child: ChildProcess;
    try {
      child = spawn(
        this.settings.nodePath,
        // Keep the --transport= flag: Falcon Custom-IOA rule 176 matches the bridge's command line on it.
        ["dist/index.js", "--transport=uds"],
        {
          cwd: pkg,
          env: {
            ...process.env,
            NODE_ENV: "production",
            // Still needed after bridges-uds: the bridge's own outbound HTTPS (Miyo) trusts mkcert through it.
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
      return this.fail(`Failed to spawn bridge: ${(err as Error).message}`);
    }

    this.child = child;
    this.startedAt = Date.now();
    const pid = child.pid;
    emitLauncherAudit({
      eventType: "EXEC_START",
      pid,
      command: `${this.settings.nodePath} dist/index.js --transport=uds`,
      socketPath: BRIDGE_SOCKET_PATH,
    });

    if (this.capture) {
      this.detachIpcServer = attachLauncherIpcServer(child, {
        capture: this.capture,
        audit: emitLauncherAudit,
        app: this.app,
        obsidian: OBSIDIAN_RUNTIME,
        version: this.manifest.version,
      });
    }

    child.stdout?.on("data", (chunk) => {
      console.log(`[bridge-launcher] ${chunk.toString().trimEnd()}`);
    });
    child.stderr?.on("data", (chunk) => {
      console.warn(`[bridge-launcher] ${chunk.toString().trimEnd()}`);
    });
    child.on("exit", (code, signal) => {
      const detail = `exit code=${code} signal=${signal ?? ""}`;
      emitLauncherAudit({ eventType: "EXEC_EXIT", pid, code, signal });
      console.log(`[bridge-launcher] bridge exited: ${detail}`);
      // Only the current child touches the plugin's state. An older child that exits late (after a
      // bounded stop gave up on it) must not detach the new IPC channel, clear this.child or rewrite
      // the status.
      if (this.child !== child) return;
      if (this.detachIpcServer) {
        this.detachIpcServer();
        this.detachIpcServer = null;
      }
      // A bridge that refuses its socket exits 1 while still "starting": that is unexpected too.
      if ((this.status === "running" || this.status === "starting") && this.stopping !== child) {
        new Notice(`Bridge exited unexpectedly (${detail})`, 8000);
        this.setStatus("exited", detail);
      }
      this.child = null;
    });
    return child;
  }

  /**
   * Readiness: GET /healthz over the socket at 800 ms, then at layout-ready and 4 s later if needed. Only the 4 s
   * probe may set "error". The layout-ready probe can only promote the status to running: on a plugin reload the
   * layout is already ready, so it runs at once, while the new bridge may still be confirming that the socket the
   * old one left is stale.
   */
  private async confirmStarted(child: ChildProcess): Promise<void> {
    await this.wait(800);
    if (this.disposed || this.child !== child || !isAlive(child)) return;
    const status = await getHealthz(BRIDGE_SOCKET_PATH, HEALTHZ_TIMEOUT_MS);
    if (this.disposed || this.child !== child || !isAlive(child)) return;
    if (status === 200) {
      this.setStatus("running", `pid ${child.pid} · unix:${BRIDGE_SOCKET_PATH}`);
      new Notice(`Bridge started on unix:${BRIDGE_SOCKET_PATH}`);
    } else {
      this.setStatus("starting", `pid ${child.pid} (waiting for /healthz on ${BRIDGE_SOCKET_NAME})`);
      this.app.workspace.onLayoutReady(() => void this.confirmRunning(child, false));
      setTimeout(() => void this.confirmRunning(child, true), 4000);
    }
  }

  /** A later readiness probe. An answer sets "running"; a miss sets "error" only when `final` (the 4 s probe). */
  private async confirmRunning(child: ChildProcess, final: boolean): Promise<void> {
    if (this.disposed || this.child !== child || !isAlive(child)) return;
    const status = await getHealthz(BRIDGE_SOCKET_PATH, HEALTHZ_TIMEOUT_MS);
    if (this.disposed || this.child !== child || !isAlive(child)) return;
    if (status === 200) {
      this.setStatus("running", `pid ${child.pid} · unix:${BRIDGE_SOCKET_PATH}`);
    } else if (final && this.status !== "exited" && this.status !== "error") {
      this.setStatus("error", `bridge spawned (pid ${child.pid}) but ${BRIDGE_SOCKET_NAME} did not answer /healthz after 4s`);
    }
  }

  /** SIGTERM, then SIGKILL after shutdownTimeoutMs, waiting for the child's "exit" event each time. */
  async stopBridge(): Promise<void> {
    const child = this.child;
    if (child && isAlive(child)) {
      this.stopping = child;
      try {
        try {
          child.kill("SIGTERM");
        } catch {
          // already dead
        }
        if (!(await waitForExit(child, this.settings.shutdownTimeoutMs))) {
          try {
            child.kill("SIGKILL");
          } catch {
            // already dead
          }
          await waitForExit(child, KILL_WAIT_MS);
        }
      } finally {
        if (this.stopping === child) this.stopping = null;
      }
    }
    if (child && this.child === child) {
      // Its exit handler did not run (a spawn that failed, or the bounded wait ran out): forget it here.
      if (this.detachIpcServer) {
        this.detachIpcServer();
        this.detachIpcServer = null;
      }
      this.child = null;
    }
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
