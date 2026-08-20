import { spawn } from "child_process";
import { join } from "path";
import { existsSync } from "fs";

/** Resolve the Node binary: explicit setting when present, else Electron's node. */
export function resolveNodeBin(settingsNodePath: string): string {
  return (settingsNodePath || "").trim() || process.execPath;
}

/**
 * PATH enrichment + mkcert CA trust for EVERY engine/CLI subprocess this plugin
 * spawns — single source of truth. Obsidian launched from Finder/Spotlight
 * inherits a minimal PATH (/usr/bin:/bin) that lacks ~/.local/bin (claude) and
 * the nvm node bin dir, and Electron's Node does not pass NODE_EXTRA_CA_CERTS —
 * without the mkcert root CA, the HTTPS loopback services (Miyo :8743, Qdrant
 * :6433, SearXNG :8891) fail TLS validation. The workflow runner and the
 * research-memory ingest previously diverged here: the ingest lane spawned with
 * NO env at all, which is why it could never have reached Qdrant from a GUI
 * launch (fixed 2026-08-20).
 */
export function buildEngineEnv(
  nodeBin: string,
  extra?: Record<string, string>
): NodeJS.ProcessEnv {
  const home = process.env.HOME || "";
  const nodeBinDir = nodeBin.replace(/\/[^/]+$/, "");
  const enrichedPath = [
    `${home}/.local/bin`,
    nodeBinDir,
    "/opt/homebrew/bin",
    "/usr/local/bin",
    process.env.PATH || "/usr/bin:/bin:/usr/sbin:/sbin",
  ]
    .filter(Boolean)
    .join(":");
  return {
    ...process.env,
    PATH: enrichedPath,
    NODE_EXTRA_CA_CERTS:
      process.env.NODE_EXTRA_CA_CERTS ||
      `${home}/Library/Application Support/mkcert/rootCA.pem`,
    ...(extra || {}),
  };
}

export interface EngineScriptResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

const MAX_CAPTURE_BYTES = 512 * 1024;

/**
 * Run one engine script as an argv-array spawn (never a shell string) with a
 * hard timeout and bounded output capture. cwd is the engine root — the engine
 * resolves everything from process.cwd(), so this is load-bearing.
 */
export function runEngineScript(opts: {
  openclawPath: string;
  nodeBin: string;
  scriptRel: string;
  args: string[];
  timeoutMs: number;
  extraEnv?: Record<string, string>;
}): Promise<EngineScriptResult> {
  const scriptAbs = join(opts.openclawPath, opts.scriptRel);
  if (!existsSync(scriptAbs)) {
    return Promise.reject(
      new Error(`Engine script not found: ${opts.scriptRel} under ${opts.openclawPath}`)
    );
  }
  return new Promise((resolve, reject) => {
    const proc = spawn(opts.nodeBin, [scriptAbs, ...opts.args], {
      cwd: opts.openclawPath,
      stdio: ["ignore", "pipe", "pipe"],
      env: buildEngineEnv(opts.nodeBin, opts.extraEnv),
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const cap = (s: string, b: Buffer) =>
      s.length < MAX_CAPTURE_BYTES ? s + b.toString() : s;
    proc.stdout.on("data", (b) => {
      stdout = cap(stdout, b);
    });
    proc.stderr.on("data", (b) => {
      stderr = cap(stderr, b);
    });

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        proc.kill("SIGTERM");
      } catch {
        /* already dead */
      }
      setTimeout(() => {
        try {
          proc.kill("SIGKILL");
        } catch {
          /* already dead */
        }
      }, 5000);
    }, opts.timeoutMs);

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    });
  });
}

/**
 * Detect an operator-approve gate refusal in engine output. The gate is
 * one-shot YubiKey-armed (300s TTL) and fail-closed: an agent-initiated real
 * run without a freshly armed token dies here, and the error must come back
 * actionable, not cryptic.
 */
export function isGateRefusal(stdout: string, stderr: string): boolean {
  const text = `${stdout}\n${stderr}`;
  return /HUMAN_APPROVAL_REQUIRED|operator-approve|armed token/i.test(text);
}

export function gateNotArmedError(): Record<string, unknown> {
  return {
    error: "operator_gate_not_armed",
    message:
      "The engine's operator-approve gate has no armed token (it is one-shot, 300s TTL, YubiKey-bound).",
    action:
      "Ask the operator to run `operator-approve-gate arm` on the host (PIN + physical touch), then retry within 5 minutes.",
  };
}
