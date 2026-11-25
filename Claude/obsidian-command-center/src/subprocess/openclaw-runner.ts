import { spawn, ChildProcess } from "child_process";
import { join } from "path";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import type { WorkflowResult, WorkflowState, StderrEvent, OpenClawSettings } from "../types";
import { buildEngineEnv, resolveNodeBin } from "../util/engine-spawn";
import { classifyGateDenial, gateDenialAction } from "./gate-denial";
import {
  postResearchNotify,
  researchNotifyBody,
  researchNotifyHeaders,
  type ResearchNotifyInput,
} from "./research-notify";

export interface RunWorkflowOptions {
  template: string;
  inputs: Record<string, string>;
}

type ProgressCallback = (event: StderrEvent) => void;
type CompleteCallback = (result: WorkflowResult) => void;
type ErrorCallback = (error: Error) => void;

export class OpenClawRunner {
  private proc: ChildProcess | null = null;
  private timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private killed = false;
  private openclawPath = "";
  private detectedWorkflowId: string | null = null;
  /**
   * Message of the last run's terminal error (null while running or after success). Read by the
   * bridge so obsidian_openclaw_run_workflow can report a fail-closed gate denial synchronously
   * instead of "started" (2026-09-22, found by the first smoke run through Copilot chat).
   */
  private lastError: string | null = null;
  /**
   * Wall-clock at spawn, used to reject PRE-EXISTING workflow dirs in the
   * newest-dir fallback below. Without it, a run that dies before creating its
   * own state file (e.g. the engine's pre-gate input preflight, added
   * 2026-08-20) makes findLatestWorkflowId return the PREVIOUS run's directory
   * — and the plugin then announces that older run's terminal result as this
   * one's. A failed start must surface as a failure, not as a stale success.
   */
  private runStartedAtMs = 0;

  onProgress: ProgressCallback = () => {};
  onComplete: CompleteCallback = () => {};
  onError: ErrorCallback = () => {};

  get isRunning(): boolean {
    return this.proc !== null && !this.killed;
  }

  /** Expose the detected workflow ID for directory-watcher fallback. */
  getLastError(): string | null {
    return this.lastError;
  }

  getDetectedWorkflowId(): string | null {
    return this.detectedWorkflowId;
  }

  /** Allow external code (main.ts dir-watcher) to set the workflow ID. */
  setDetectedWorkflowId(id: string): void {
    if (!this.detectedWorkflowId) {
      this.detectedWorkflowId = id;
      console.log("[OpenClaw:Runner] Workflow ID set externally:", id);
    }
  }

  /**
   * Bounded await of the workflow id (Decision 1, 2026-08-20): the id is
   * captured asynchronously from the engine's stderr events (or the tracker's
   * dir scan via setDetectedWorkflowId) seconds after spawn. The bridge's
   * run tool blocks on this so the agent gets a correlation handle for
   * status/cancel/artifacts at submit time — mirroring the id-based async
   * contract in openclaw-bridge/bridge/research-api.js.
   */
  awaitWorkflowId(timeoutMs: number): Promise<string | null> {
    if (this.detectedWorkflowId) return Promise.resolve(this.detectedWorkflowId);
    const deadline = Date.now() + timeoutMs;
    return new Promise((resolve) => {
      const poll = () => {
        if (this.detectedWorkflowId) {
          resolve(this.detectedWorkflowId);
          return;
        }
        if (Date.now() >= deadline || (!this.proc && !this.detectedWorkflowId)) {
          resolve(this.detectedWorkflowId);
          return;
        }
        setTimeout(poll, 250);
      };
      poll();
    });
  }

  run(options: RunWorkflowOptions, settings: OpenClawSettings): void {
    if (this.proc) {
      this.onError(new Error("A workflow is already running."));
      return;
    }

    const scriptPath = join(settings.openclawPath, "scripts", "run-workflow.js");
    if (!existsSync(scriptPath)) {
      this.onError(
        new Error(`OpenClaw not found at ${settings.openclawPath}`)
      );
      return;
    }

    const nodePath = resolveNodeBin(settings.nodePath);
    this.killed = false;
    this.openclawPath = settings.openclawPath;
    this.detectedWorkflowId = null;
    // 3s of slack absorbs clock/mtime granularity without admitting an older run.
    this.runStartedAtMs = Date.now() - 3000;
    this.lastError = null;

    const args = [
      scriptPath,
      "--template",
      options.template,
      "--inputs",
      JSON.stringify(options.inputs),
      "--confirm",
      // Obsidian-launched runs go through the same YubiKey gate as the CLI: the engine
      // verifies+consumes an armed token. Arm it first in a terminal: `operator-approve-gate arm`
      // (PIN + touch). Without a fresh armed token the run is denied (fail-closed).
      "--operator-approve",
    ];

    // PATH enrichment + mkcert CA trust: shared helper (util/engine-spawn.ts) —
    // one env contract for every engine/CLI spawn in this plugin.
    const env = buildEngineEnv(nodePath, { OPENCLAW_ROOT: settings.openclawPath });

    console.log("[OpenClaw:Runner] Spawning subprocess:", nodePath, args.slice(0, 3).join(" "));

    this.proc = spawn(nodePath, args, {
      cwd: settings.openclawPath,
      stdio: ["pipe", "pipe", "pipe"],
      env,
    });

    console.log("[OpenClaw:Runner] Subprocess spawned, PID:", this.proc.pid);

    // Timeout guard — WARN ONLY, do not kill the subprocess.
    // The tracker will detect completion from workflow.json independently.
    // Only the explicit "Cancel Workflow" command kills the subprocess.
    const timeoutSec = settings.workflowTimeoutMs / 1000;
    this.timeoutTimer = setTimeout(() => {
      console.warn(
        `[OpenClaw:Runner] Workflow exceeded timeout (${timeoutSec}s) but may still be running. ` +
        "The tracker will detect completion from workflow.json. Use 'Cancel Workflow' to force-stop."
      );
      // Clear the timer reference but do NOT kill the process
      this.timeoutTimer = null;
    }, settings.workflowTimeoutMs);

    console.log("[OpenClaw:Runner] Timeout set:", timeoutSec, "seconds (warn-only)");

    // stderr: structured log lines → progress events
    let stderrBuffer = "";
    // Raw rolling copy for error reports. The line parser below consumes every complete line out
    // of stderrBuffer, so on exit that buffer holds only an unterminated fragment — which is why,
    // until 2026-09-22, an operator-gate denial ("Operator-approve denied: not armed …\n") reached
    // the sidebar as an EMPTY "stderr tail". Found by the first smoke run through Copilot chat.
    let stderrTail = "";
    this.proc.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderrTail = (stderrTail + text).slice(-2000);
      stderrBuffer += text;
      const lines = stderrBuffer.split("\n");
      stderrBuffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const event = this.parseStderrLine(trimmed);
        if (event) {
          // Capture workflow_id from events
          if (event.workflow_id && !this.detectedWorkflowId) {
            this.detectedWorkflowId = event.workflow_id as string;
            console.log("[OpenClaw:Runner] Detected workflow_id from stderr:", this.detectedWorkflowId);
          }
          this.onProgress(event);
        }
      }
    });

    // stdout: collect but don't rely on it as primary result source
    let stdoutBuffer = "";
    this.proc.stdout?.on("data", (chunk: Buffer) => {
      stdoutBuffer += chunk.toString();
    });

    this.proc.on("error", (err: Error) => {
      console.error("[OpenClaw:Runner] Subprocess error:", err.message);
      this.cleanup();
      this.lastError = err.message;
      this.onError(err);
    });

    this.proc.on("exit", (code: number | null) => {
      console.log("[OpenClaw:Runner] Subprocess exited, code:", code, "killed:", this.killed);
      this.cleanup();
      if (this.killed) {
        console.log("[OpenClaw:Runner] Exit ignored — process was killed by cancel()");
        return;
      }

      // Strategy: try multiple sources for the result
      // 1. Read workflow.json from disk (most reliable)
      const diskResult = this.readResultFromDisk();
      console.log("[OpenClaw:Runner] readResultFromDisk:", diskResult ? `found (${diskResult.status})` : "not found");
      if (diskResult) {
        this.onComplete(diskResult);
        return;
      }

      // 2. Parse stdout JSON (fallback)
      const stdoutResult = this.extractJsonResult(stdoutBuffer);
      console.log("[OpenClaw:Runner] extractJsonResult:", stdoutResult ? "found" : "not found");
      if (stdoutResult) {
        this.onComplete(stdoutResult);
        return;
      }

      const tail = stderrTail.trim().slice(-500);
      // The engine's fail-closed YubiKey gate (scripts/run-workflow.js) prints
      // "Operator-approve denied: <reason>" and exits 1 before creating a workflow — nothing was spent.
      // Name which refusal it was (not armed / expired / mismatched), and carry the operator's action,
      // the same way obsidian_openclaw_research_task reports it. Until 2026-10-07 only "not armed" was
      // recognised, so an expired token surfaced as the generic exit error below.
      const denial = classifyGateDenial(stderrTail);
      const failure = denial
        ? new Error(`${denial}: ${gateDenialAction(denial)} Engine said: ${tail}`)
        : new Error(
            `Process exited with code ${code}. No result found in workflow state file or stdout. stderr tail: ${tail}`
          );
      this.lastError = failure.message;
      this.onError(failure);
    });
  }

  /** Cancel just the timeout timer (e.g. when tracker detects completion). */
  clearTimeout(): void {
    if (this.timeoutTimer) {
      globalThis.clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
      console.log("[OpenClaw:Runner] Timeout cancelled — completion detected");
    }
  }

  /** User-initiated cancel: SIGTERM then force-kill after 5s. */
  cancel(): void {
    if (!this.proc) return;
    this.killed = true;
    console.log("[OpenClaw:Runner] Cancel requested — killing subprocess");

    try {
      this.proc.kill("SIGTERM");
    } catch {
      /* already dead */
    }

    // Force kill after 5s if still alive
    const forceKillTimer = setTimeout(() => {
      if (this.proc) {
        try {
          this.proc.kill("SIGKILL");
        } catch {
          /* already dead */
        }
      }
    }, 5000);

    this.proc.once("exit", () => clearTimeout(forceKillTimer));
    this.cleanup();
  }

  private cleanup(): void {
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
    this.proc = null;
  }

  /**
   * Read the workflow result from the workflow.json state file on disk.
   * This is the most reliable source because it doesn't depend on stdout.
   * Public so main.ts can use it as a fallback too.
   */
  readResultFromDisk(): WorkflowResult | null {
    const workflowId = this.detectedWorkflowId || this.findLatestWorkflowId();
    if (!workflowId) {
      console.log("[OpenClaw:Runner] readResultFromDisk: no workflow_id available");
      return null;
    }

    const statePath = join(
      this.openclawPath,
      "workspace",
      "workflows",
      workflowId,
      "workflow.json"
    );

    try {
      const raw = readFileSync(statePath, "utf-8");
      const state = JSON.parse(raw) as WorkflowState;

      if (state.status !== "completed" && state.status !== "failed") {
        console.log("[OpenClaw:Runner] readResultFromDisk: status is", state.status, "(not terminal)");
        return null;
      }

      return {
        ok: state.status === "completed",
        workflow_id: state.workflow_id,
        template_id: state.template_id,
        status: state.status,
        artifacts: state.artifacts || {},
        pipeline_progress: state.pipeline_progress,
        error: state.error || null,
      } as WorkflowResult;
    } catch (err) {
      console.log("[OpenClaw:Runner] readResultFromDisk: read error:", (err as Error).message);
      return null;
    }
  }

  /**
   * Find the most recently modified workflow directory if we didn't
   * capture the workflow_id from stderr events.
   *
   * Only dirs whose state file was written AFTER this run started qualify: a
   * run that never got far enough to create its own state file must yield
   * null (→ the caller reports the real error) rather than the previous run's
   * result. See runStartedAtMs.
   */
  findLatestWorkflowId(): string | null {
    const workflowsDir = join(this.openclawPath, "workspace", "workflows");
    try {
      const entries = readdirSync(workflowsDir, { withFileTypes: true })
        .filter(e => e.isDirectory() && e.name.startsWith("workflow-"));

      if (entries.length === 0) return null;

      let latest: { name: string; mtime: number } | null = null;
      for (const entry of entries) {
        const statePath = join(workflowsDir, entry.name, "workflow.json");
        try {
          const stat = statSync(statePath);
          if (stat.mtimeMs < this.runStartedAtMs) continue; // predates this run
          if (!latest || stat.mtimeMs > latest.mtime) {
            latest = { name: entry.name, mtime: stat.mtimeMs };
          }
        } catch {
          // no workflow.json in this dir
        }
      }

      if (!latest) {
        console.log(
          "[OpenClaw:Runner] findLatestWorkflowId: no workflow dir created since this run started —" +
          " refusing to report an older run's result"
        );
      }
      return latest?.name ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Extract the final JSON result from stdout. Fallback for when
   * workflow.json reading fails.
   */
  private extractJsonResult(stdout: string): WorkflowResult | null {
    try {
      return JSON.parse(stdout) as WorkflowResult;
    } catch {
      // fall through
    }

    for (let i = stdout.length - 1; i >= 0; i--) {
      if (stdout[i] === "}") {
        let depth = 0;
        for (let j = i; j >= 0; j--) {
          if (stdout[j] === "}") depth++;
          if (stdout[j] === "{") depth--;
          if (depth === 0) {
            try {
              const candidate = JSON.parse(stdout.slice(j, i + 1));
              if (candidate && typeof candidate === "object" && "ok" in candidate) {
                return candidate as WorkflowResult;
              }
            } catch {
              // not valid JSON, keep searching
            }
            break;
          }
        }
      }
    }

    return null;
  }

  private parseStderrLine(line: string): StderrEvent | null {
    // Primary format: [INFO] {"event":"xxx","workflow_id":"yyy"}
    const match = line.match(/^\[(INFO|WARN|ERROR)]\s+(.+)$/);
    if (match) {
      try {
        const data = JSON.parse(match[2]);
        return { level: match[1] as StderrEvent["level"], ...data };
      } catch {
        // JSON parse failed — not a structured line
      }
    }

    // Fallback: try to find any JSON object in the line that has workflow_id
    const jsonMatch = line.match(/\{[^}]*"workflow_id"[^}]*\}/);
    if (jsonMatch) {
      try {
        const data = JSON.parse(jsonMatch[0]);
        return { level: "INFO" as const, ...data };
      } catch {
        // ignore
      }
    }

    return null;
  }
}

// ── Auto-bubble: notify the Copilot chat that a research run finished ──────────

const DEFAULT_BRIDGE_CONFIG =
  "/Users/myhome/TRINC/Copilot-Everything/bridges/obsidian-copilot-bridge/config/obsidian-cli-mcp.local.json";

export interface NotifyResearchArrivedOptions extends ResearchNotifyInput {
  bridgeConfigPath?: string;
}

/**
 * Fire the emit-only `research_notify` tool on the vault bridge (obsidian-copilot-bridge)
 * so the Copilot plugin renders a `research_arrived` chat bubble linking to the
 * note Command Center already generated. Emit-only — it NEVER writes to the vault,
 * so it can't duplicate the workflow output (unlike research_publish). Fail-soft:
 * the caller wraps this in try/catch; a failure never blocks note delivery.
 *
 * Auth mirrors publish-to-vault.js: reads the bridge's own authToken from its
 * 0600 config file and sends the full replay-guard header set. Since bridges-uds
 * (2026-11-24) the request goes over vault-bridge.sock (./research-notify.ts):
 * a 10 s timeout, no CA and no TCP. A trust refusal or a missing socket (ENOENT:
 * the bridge is not running) is a failure the caller logs, never a TCP retry.
 */
export async function notifyResearchArrived(
  opts: NotifyResearchArrivedOptions
): Promise<void> {
  const configPath = opts.bridgeConfigPath || DEFAULT_BRIDGE_CONFIG;
  if (!existsSync(configPath)) {
    throw new Error(`bridge config not found: ${configPath}`);
  }
  const token = JSON.parse(readFileSync(configPath, "utf8"))?.security?.authToken;
  if (!token || typeof token !== "string") {
    throw new Error("bridge config missing security.authToken");
  }

  const body = researchNotifyBody(opts);
  await postResearchNotify(body, researchNotifyHeaders(body, token));
}
