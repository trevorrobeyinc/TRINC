import { spawn, ChildProcess } from "child_process";
import { request as httpsRequest } from "https";
import { createHash, randomUUID } from "crypto";
import { join } from "path";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import type { WorkflowResult, WorkflowState, StderrEvent, OpenClawSettings } from "../types";

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

  onProgress: ProgressCallback = () => {};
  onComplete: CompleteCallback = () => {};
  onError: ErrorCallback = () => {};

  get isRunning(): boolean {
    return this.proc !== null && !this.killed;
  }

  /** Expose the detected workflow ID for directory-watcher fallback. */
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

    const nodePath = settings.nodePath || process.execPath;
    this.killed = false;
    this.openclawPath = settings.openclawPath;
    this.detectedWorkflowId = null;

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

    // Enrich PATH so the spawned subprocess can find `claude`, `node`, `npx`, `uv`, etc.
    // Obsidian launched from Finder/Spotlight inherits a minimal PATH (~/usr/bin:/bin)
    // that lacks ~/.local/bin (claude) and ~/.nvm/versions/node/<v>/bin (node/npx).
    // Without this enrichment, claude -p fails to spawn and the workflow falls back
    // to LM Studio, which then fails on context-length for analyst-sized prompts.
    const home = process.env.HOME || "";
    const nodeBinDir = nodePath.replace(/\/node$/, "");
    const enrichedPath = [
      `${home}/.local/bin`,
      nodeBinDir,
      "/opt/homebrew/bin",
      "/usr/local/bin",
      process.env.PATH || "/usr/bin:/bin:/usr/sbin:/sbin",
    ].filter(Boolean).join(":");

    console.log("[OpenClaw:Runner] Spawning subprocess:", nodePath, args.slice(0, 3).join(" "));
    console.log("[OpenClaw:Runner] Enriched PATH first entries:", enrichedPath.split(":").slice(0, 4).join(":"));

    this.proc = spawn(nodePath, args, {
      cwd: settings.openclawPath,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        OPENCLAW_ROOT: settings.openclawPath,
        PATH: enrichedPath,
        // Trust the mkcert root CA so the stack's HTTPS loopback proxies validate
        // (Miyo :8743, Qdrant :6433, SearXNG :8891) from an Obsidian launch.
        // The local-model proxies this used to name are gone: LM Studio :1235
        // decommissioned 2026-07-16, Ollama :11435 removed 2026-07-23.
        NODE_EXTRA_CA_CERTS:
          process.env.NODE_EXTRA_CA_CERTS ||
          `${home}/Library/Application Support/mkcert/rootCA.pem`,
      },
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
    this.proc.stderr?.on("data", (chunk: Buffer) => {
      stderrBuffer += chunk.toString();
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

      this.onError(
        new Error(
          `Process exited with code ${code}. No result found in workflow state file or stdout. stderr tail: ${stderrBuffer.slice(-500)}`
        )
      );
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
          if (!latest || stat.mtimeMs > latest.mtime) {
            latest = { name: entry.name, mtime: stat.mtimeMs };
          }
        } catch {
          // no workflow.json in this dir
        }
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

const DEFAULT_BRIDGE = "https://127.0.0.1:8798";
const DEFAULT_BRIDGE_CONFIG =
  "/Users/myhome/TrevClaw-Obsidianodus/Copilot-Everything/bridges/obsidian-copilot-bridge/config/obsidian-cli-mcp.local.json";

export interface NotifyResearchArrivedOptions {
  /** Identifier for the event (a label; e.g. the workflow_id). */
  taskId: string;
  /** Human-readable bubble title. */
  title: string;
  /** Vault-relative path to the note the chat bubble should link to (optional). */
  mainNotePath?: string;
  /** Vault display name (optional). */
  vault?: string;
  bridge?: string;
  bridgeConfigPath?: string;
  caCertPath?: string;
}

/**
 * Fire the emit-only `research_notify` tool on the obsidian-copilot-bridge (:8798)
 * so the Copilot plugin renders a `research_arrived` chat bubble linking to the
 * note Command Center already generated. Emit-only — it NEVER writes to the vault,
 * so it can't duplicate the workflow output (unlike research_publish). Fail-soft:
 * the caller wraps this in try/catch; a failure never blocks note delivery.
 *
 * Auth mirrors publish-to-vault.js: reads the bridge's own authToken from its
 * 0600 config file and sends the full replay-guard header set, trusting the
 * mkcert root CA explicitly (Electron's Node may not inherit NODE_EXTRA_CA_CERTS).
 */
export async function notifyResearchArrived(
  opts: NotifyResearchArrivedOptions
): Promise<void> {
  const bridge = opts.bridge || DEFAULT_BRIDGE;
  const configPath = opts.bridgeConfigPath || DEFAULT_BRIDGE_CONFIG;
  if (!existsSync(configPath)) {
    throw new Error(`bridge config not found: ${configPath}`);
  }
  const token = JSON.parse(readFileSync(configPath, "utf8"))?.security?.authToken;
  if (!token || typeof token !== "string") {
    throw new Error("bridge config missing security.authToken");
  }

  const body = JSON.stringify({
    tool: "research_notify",
    input: {
      taskId: opts.taskId,
      title: opts.title,
      ...(opts.mainNotePath ? { mainNotePath: opts.mainNotePath } : {}),
      ...(opts.vault ? { vault: opts.vault } : {}),
    },
  });

  const caPath =
    opts.caCertPath ||
    `${process.env.HOME || ""}/Library/Application Support/mkcert/rootCA.pem`;
  const ca = existsSync(caPath) ? readFileSync(caPath) : undefined;
  const url = new URL(`${bridge.replace(/\/+$/, "")}/mcp/tool`);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Content-Length": String(Buffer.byteLength(body)),
    Authorization: `Bearer ${token}`,
    "x-mcp-token": token,
    "x-mcp-timestamp": String(Date.now()),
    "x-mcp-nonce": randomUUID(),
    "x-mcp-body-sha256": createHash("sha256").update(body, "utf8").digest("hex"),
  };

  await new Promise<void>((resolve, reject) => {
    const req = httpsRequest(
      {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: "POST",
        headers,
        ...(ca ? { ca } : {}),
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json: { ok?: boolean } | null = null;
          try {
            json = JSON.parse(text);
          } catch {
            json = null;
          }
          if ((res.statusCode || 0) === 200 && json?.ok === true) {
            resolve();
          } else {
            reject(
              new Error(
                `research_notify failed (HTTP ${res.statusCode}): ${text.slice(0, 200)}`
              )
            );
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}
