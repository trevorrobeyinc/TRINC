import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { runCli } from "./runner";
import type { BackendResult } from "../types";
import { AppError } from "../server/errors";
import { ERROR_CODES } from "../server/errorCodes";

const EXTRA_PATH_ENTRIES = [
  "/Applications/Obsidian.app/Contents/MacOS",
  "/opt/homebrew/bin",
  "/usr/local/bin",
  "/usr/bin",
  "/bin",
  "/usr/sbin",
  "/sbin",
];

const MAC_OBSIDIAN_CLI_PATH = "/Applications/Obsidian.app/Contents/MacOS/obsidian";
const MAC_OPEN_BINARY = "/usr/bin/open";
const MIN_PROBE_TIMEOUT_MS = 5_000;
const PURE_PROBE_TIMEOUT_CAP_MS = 5_000;
const DARWIN_DIRECT_PROBE_TIMEOUT_FLOOR_MS = 1_500;
const DARWIN_DIRECT_PROBE_TIMEOUT_CAP_MS = 3_000;

export type CliProbeMode = "direct" | "shell";

export interface CliIdentity {
  home: string;
  user: string;
  logname: string;
  source: "env_user" | "env_logname" | "os_user" | "home" | "fallback";
  homeDerivedUser: string | null;
}

export interface RegisteredVault {
  name: string;
  path?: string;
}

export interface CliRuntimeContext {
  env: Record<string, string>;
  binary: string;
  cwd: string;
}

export interface CliProbeCommandResult {
  result: BackendResult;
  mode: CliProbeMode;
  binary: string;
  args: string[];
}

export interface CliCommandAttemptRecord {
  command: string;
  args: string[];
  success: boolean;
  mode?: CliProbeMode;
  binary?: string;
  durationMs?: number;
  outputPreview?: string;
  error?: string;
  errorCode?: string | null;
  diagnostics?: Record<string, unknown>;
}

export interface CliVersionDetection {
  parsedVersion: [number, number, number];
  sourceCommand: "version" | "--version" | "app_bundle";
  output: string;
  diagnostics: CliCommandAttemptRecord[];
}

export interface CliReadinessSummary {
  requestedVaultName: string | null;
  requestedVaultPath: string | null;
  launchAttempted: boolean;
  readinessStatus: "ready" | "launched_and_ready" | "timeout" | "failed" | "skipped";
  readinessCommand: string[];
  launchCommand: string[];
  readinessAttempts: number;
  durationMs: number;
  error?: string;
  attempts: CliCommandAttemptRecord[];
}

function deriveUserFromHome(home: string): string | null {
  const normalized = home.trim().replace(/\/+$/, "");
  if (!normalized) {
    return null;
  }

  const parent = path.dirname(normalized);
  const base = path.basename(normalized);
  if (!base || base === "." || base === path.sep) {
    return null;
  }

  if (parent === "/Users" || parent === "/home") {
    return base;
  }

  return null;
}

function isRootMismatch(candidate: string | undefined, homeDerivedUser: string | null): boolean {
  return candidate === "root" && !!homeDerivedUser && homeDerivedUser !== "root";
}

function currentStringEnv(baseEnv: NodeJS.ProcessEnv): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(baseEnv)) {
    if (typeof value === "string") {
      env[key] = value;
    }
  }
  return env;
}

function previewOutput(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, 500);
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function attemptFromProbe(result: CliProbeCommandResult, command: string, output: string): CliCommandAttemptRecord {
  return {
    command,
    args: result.args,
    success: true,
    mode: result.mode,
    binary: result.binary,
    durationMs: result.result.durationMs,
    outputPreview: previewOutput(output),
  };
}

function attemptFromError(command: string, args: string[], error: unknown): CliCommandAttemptRecord {
  const appError = error instanceof AppError ? error : null;
  return {
    command,
    args,
    success: false,
    error: String(error),
    errorCode: appError?.code ?? null,
    diagnostics: appError?.diagnostics,
  };
}

export function resolveCliIdentity(baseEnv: NodeJS.ProcessEnv = process.env): CliIdentity {
  const home = (baseEnv.HOME && baseEnv.HOME.trim()) || os.homedir();
  const homeDerivedUser = deriveUserFromHome(home);
  const envUser = baseEnv.USER?.trim();
  const envLogname = baseEnv.LOGNAME?.trim();
  const osUser = (() => {
    try {
      return os.userInfo().username.trim();
    } catch {
      return "";
    }
  })();

  if (envUser && !isRootMismatch(envUser, homeDerivedUser)) {
    return {
      home,
      user: envUser,
      logname: !isRootMismatch(envLogname, homeDerivedUser) && envLogname ? envLogname : envUser,
      source: "env_user",
      homeDerivedUser,
    };
  }

  if (envLogname && !isRootMismatch(envLogname, homeDerivedUser)) {
    return {
      home,
      user: envLogname,
      logname: envLogname,
      source: "env_logname",
      homeDerivedUser,
    };
  }

  if (osUser && !isRootMismatch(osUser, homeDerivedUser)) {
    return {
      home,
      user: osUser,
      logname: osUser,
      source: "os_user",
      homeDerivedUser,
    };
  }

  if (homeDerivedUser) {
    return {
      home,
      user: homeDerivedUser,
      logname: homeDerivedUser,
      source: "home",
      homeDerivedUser,
    };
  }

  return {
    home,
    user: "unknown",
    logname: "unknown",
    source: "fallback",
    homeDerivedUser,
  };
}

export function buildCliEnv(baseEnv: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const env = currentStringEnv(baseEnv);
  const identity = resolveCliIdentity(baseEnv);
  const basePath = (env.PATH && env.PATH.trim()) || "";
  const mergedPath = [...basePath.split(path.delimiter).filter(Boolean), ...EXTRA_PATH_ENTRIES];

  return {
    ...env,
    HOME: identity.home,
    USER: identity.user,
    LOGNAME: identity.logname,
    PATH: Array.from(new Set(mergedPath)).join(path.delimiter),
  };
}

export function isExecutable(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function resolveBinaryFromPath(binaryName: string, pathValue: string): string | null {
  for (const candidateDir of pathValue.split(path.delimiter)) {
    if (!candidateDir) {
      continue;
    }
    const candidate = path.join(candidateDir, binaryName);
    if (isExecutable(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function resolveCliBinaryPath(configuredBinary: string, env: Record<string, string>): string {
  const configured = configuredBinary.trim();
  const envOverride = (env.OBSIDIAN_CLI_BINARY || "").trim();

  if (envOverride && path.isAbsolute(envOverride) && isExecutable(envOverride)) {
    return envOverride;
  }

  if (path.isAbsolute(configured) && isExecutable(configured)) {
    return configured;
  }

  if (configured.includes(path.sep)) {
    const resolved = path.resolve(configured);
    if (isExecutable(resolved)) {
      return resolved;
    }
  }

  if (process.platform === "darwin" && isExecutable(MAC_OBSIDIAN_CLI_PATH)) {
    return MAC_OBSIDIAN_CLI_PATH;
  }

  if (env.PATH) {
    const fromPath = resolveBinaryFromPath(configured, env.PATH);
    if (fromPath) {
      return fromPath;
    }
  }

  return configured;
}

export function buildCliRuntime(binary: string, baseEnv: NodeJS.ProcessEnv = process.env, cwd?: string): CliRuntimeContext {
  const env = buildCliEnv(baseEnv);
  return {
    env,
    binary: resolveCliBinaryPath(binary, env),
    cwd: cwd || env.HOME || process.cwd(),
  };
}

export function parseCliVaultList(raw: string): RegisteredVault[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, maybePath] = line.split("\t", 2);
      return {
        name: name.trim(),
        path: maybePath?.trim() || undefined,
      };
    })
    .filter((entry) => entry.name.length > 0);
}

export function parseCliVersion(raw: string): [number, number, number] | null {
  const match = raw.trim().match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return null;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

async function runCliDirect(runtime: CliRuntimeContext, args: string[], timeoutMs: number): Promise<CliProbeCommandResult> {
  const result = await runCli({
    binary: runtime.binary,
    args,
    timeoutMs,
    env: runtime.env,
    cwd: runtime.cwd,
  });
  return {
    result,
    mode: "direct",
    binary: runtime.binary,
    args,
  };
}

function resolveDarwinDirectProbeTimeoutMs(timeoutMs: number): number {
  return Math.max(DARWIN_DIRECT_PROBE_TIMEOUT_FLOOR_MS, Math.min(timeoutMs, DARWIN_DIRECT_PROBE_TIMEOUT_CAP_MS));
}

export function resolvePureProbeTimeoutMs(timeoutMs: number): number {
  return Math.max(MIN_PROBE_TIMEOUT_MS, Math.min(timeoutMs, PURE_PROBE_TIMEOUT_CAP_MS));
}

export async function runCliProbeCommand(
  runtime: CliRuntimeContext,
  args: string[],
  timeoutMs: number
): Promise<CliProbeCommandResult> {
  if (process.platform === "darwin") {
    try {
      return await runCliDirect(runtime, args, resolveDarwinDirectProbeTimeoutMs(timeoutMs));
    } catch {
      const shellBinary = process.env.SHELL || "/bin/zsh";
      const command = `${shellEscape(runtime.binary)} ${args.map(shellEscape).join(" ")}`;
      const result = await runCli({
        binary: shellBinary,
        args: ["-lc", command],
        timeoutMs,
        env: runtime.env,
        cwd: runtime.cwd,
      });
      return {
        result,
        mode: "shell",
        binary: runtime.binary,
        args,
      };
    }
  }

  return await runCliDirect(runtime, args, timeoutMs);
}

function resolveObsidianInfoPlist(binaryPath: string): string | null {
  const contentsDir = path.dirname(path.dirname(binaryPath));
  const plistPath = path.join(contentsDir, "Info.plist");
  return fs.existsSync(plistPath) ? plistPath : null;
}

export async function detectCliVersion(runtime: CliRuntimeContext, timeoutMs: number): Promise<CliVersionDetection> {
  const attempts: Array<{ args: string[]; sourceCommand: "version" | "--version" }> = [
    { args: ["version"], sourceCommand: "version" },
    { args: ["--version"], sourceCommand: "--version" },
  ];

  const diagnostics: CliCommandAttemptRecord[] = [];

  for (const attempt of attempts) {
    try {
      const result = await runCliProbeCommand(runtime, attempt.args, timeoutMs);
      const output = `${result.result.stdout}\n${result.result.stderr}`.trim();
      const parsedVersion = parseCliVersion(output);
      diagnostics.push(attemptFromProbe(result, attempt.sourceCommand, output));
      if (parsedVersion) {
        return {
          parsedVersion,
          sourceCommand: attempt.sourceCommand,
          output,
          diagnostics,
        };
      }
    } catch (error) {
      diagnostics.push(attemptFromError(attempt.sourceCommand, attempt.args, error));
    }
  }

  if (process.platform === "darwin") {
    const infoPlist = resolveObsidianInfoPlist(runtime.binary);
    if (infoPlist) {
      const args = ["-extract", "CFBundleShortVersionString", "raw", "-o", "-", infoPlist];
      try {
        const result = await runCli({
          binary: "/usr/bin/plutil",
          args,
          timeoutMs,
          env: runtime.env,
          cwd: runtime.cwd,
        });
        const output = `${result.stdout}\n${result.stderr}`.trim();
        const parsedVersion = parseCliVersion(output);
        diagnostics.push({
          command: "bundle_version",
          args,
          success: true,
          binary: "/usr/bin/plutil",
          durationMs: result.durationMs,
          outputPreview: previewOutput(output),
          diagnostics: {
            source: "app_bundle",
          },
        });
        if (parsedVersion) {
          return {
            parsedVersion,
            sourceCommand: "app_bundle",
            output,
            diagnostics,
          };
        }
      } catch (error) {
        diagnostics.push(attemptFromError("bundle_version", args, error));
      }
    }
  }

  throw new Error(`Unable to parse semantic version from CLI output. diagnostics=${JSON.stringify(diagnostics)}`);
}

export function readinessCommandForVault(vaultName: string | null): string[] {
  if (vaultName && vaultName.trim()) {
    return [`vault=${vaultName.trim()}`, "vault", "info=name"];
  }
  return ["vault", "info=name"];
}

function isReadinessOutputValid(output: string, targetVaultName: string | null): boolean {
  const normalizedOutput = output.trim();
  if (!normalizedOutput) {
    return false;
  }

  if (!targetVaultName || !targetVaultName.trim()) {
    return true;
  }

  return normalizedOutput.includes(targetVaultName.trim());
}

function launchArgs(targetVaultName: string | null, targetVaultPath: string | null): string[] {
  if (targetVaultPath && targetVaultPath.trim()) {
    return ["-a", "Obsidian", targetVaultPath.trim()];
  }
  if (targetVaultName && targetVaultName.trim()) {
    return ["-a", "Obsidian", "--args", `vault=${targetVaultName.trim()}`];
  }
  return ["-a", "Obsidian"];
}

export async function ensureCliLaunchAndReadiness(
  runtime: CliRuntimeContext,
  opts: {
    targetVaultName: string | null;
    targetVaultPath?: string | null;
    launchTimeoutMs: number;
    readinessPollIntervalMs: number;
    readinessAttemptTimeoutMs: number;
  }
): Promise<CliReadinessSummary> {
  const startedAt = Date.now();
  const readinessArgs = readinessCommandForVault(opts.targetVaultName);
  const summary: CliReadinessSummary = {
    requestedVaultName: opts.targetVaultName,
    requestedVaultPath: opts.targetVaultPath || null,
    launchAttempted: false,
    readinessStatus: "skipped",
    readinessCommand: readinessArgs,
    launchCommand: [MAC_OPEN_BINARY, ...launchArgs(opts.targetVaultName, opts.targetVaultPath || null)],
    readinessAttempts: 0,
    durationMs: 0,
    attempts: [],
  };

  try {
    const ready = await runCliProbeCommand(runtime, readinessArgs, opts.readinessAttemptTimeoutMs);
    const output = `${ready.result.stdout}\n${ready.result.stderr}`;
    if (!isReadinessOutputValid(output, opts.targetVaultName)) {
      throw new AppError(ERROR_CODES.CLI_EXIT_NONZERO, "Obsidian CLI readiness probe returned no vault identity.", true, {
        readinessArgs,
        outputPreview: previewOutput(output),
        requestedVaultName: opts.targetVaultName,
      });
    }
    summary.readinessAttempts = 1;
    summary.durationMs = Date.now() - startedAt;
    summary.readinessStatus = "ready";
    summary.attempts.push(attemptFromProbe(ready, "readiness_before_launch", output));
    return summary;
  } catch (error) {
    summary.readinessAttempts = 1;
    summary.attempts.push(attemptFromError("readiness_before_launch", readinessArgs, error));
  }

  if (process.platform !== "darwin") {
    summary.durationMs = Date.now() - startedAt;
    summary.readinessStatus = "failed";
    summary.error = "Automatic app launch is only implemented for macOS in this stability phase.";
    throw new AppError(ERROR_CODES.CLI_TIMEOUT, "Obsidian readiness check failed and automatic launch is unavailable on this platform.", true, {
      summary,
    });
  }

  summary.launchAttempted = true;
  const args = launchArgs(opts.targetVaultName, opts.targetVaultPath || null);
  try {
    const launchResult = await runCli({
      binary: MAC_OPEN_BINARY,
      args,
      timeoutMs: Math.min(opts.launchTimeoutMs, 5_000),
      env: runtime.env,
      cwd: runtime.cwd,
    });
    summary.attempts.push({
      command: "launch_via_open",
      args,
      success: true,
      binary: MAC_OPEN_BINARY,
      durationMs: launchResult.durationMs,
    });
  } catch (error) {
    summary.durationMs = Date.now() - startedAt;
    summary.readinessStatus = "failed";
    summary.error = String(error);
    summary.attempts.push(attemptFromError("launch_via_open", args, error));
    throw new AppError(ERROR_CODES.CLI_EXIT_NONZERO, "Failed to launch Obsidian via LaunchServices.", true, {
      summary,
    });
  }

  const deadline = Date.now() + opts.launchTimeoutMs;
  while (Date.now() <= deadline) {
    try {
      const ready = await runCliProbeCommand(runtime, readinessArgs, opts.readinessAttemptTimeoutMs);
      const output = `${ready.result.stdout}\n${ready.result.stderr}`;
      if (!isReadinessOutputValid(output, opts.targetVaultName)) {
        throw new AppError(ERROR_CODES.CLI_EXIT_NONZERO, "Obsidian CLI readiness probe returned no vault identity.", true, {
          readinessArgs,
          outputPreview: previewOutput(output),
          requestedVaultName: opts.targetVaultName,
        });
      }
      summary.readinessAttempts += 1;
      summary.durationMs = Date.now() - startedAt;
      summary.readinessStatus = "launched_and_ready";
      summary.attempts.push(attemptFromProbe(ready, "readiness_after_launch", output));
      return summary;
    } catch (error) {
      summary.readinessAttempts += 1;
      summary.attempts.push(attemptFromError("readiness_after_launch", readinessArgs, error));
      summary.error = String(error);
      if (Date.now() >= deadline) {
        break;
      }
      await sleep(opts.readinessPollIntervalMs);
    }
  }

  summary.durationMs = Date.now() - startedAt;
  summary.readinessStatus = "timeout";
  throw new AppError(ERROR_CODES.CLI_TIMEOUT, "Obsidian launch readiness timed out.", true, {
    summary,
  });
}
