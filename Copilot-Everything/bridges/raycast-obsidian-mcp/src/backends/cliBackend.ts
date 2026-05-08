import fs from "node:fs";
import path from "node:path";
import { buildArgs } from "../cli/buildArgs";
import { runCli } from "../cli/runner";
import {
  buildCliEnv as buildSharedCliEnv,
  buildCliRuntime as buildSharedCliRuntime,
  detectCliVersion as detectSharedCliVersion,
  ensureCliLaunchAndReadiness as ensureSharedCliLaunchAndReadiness,
  parseCliVaultList as parseSharedCliVaultList,
  parseCliVersion as parseSharedCliVersion,
  resolveCliBinaryPath as resolveSharedCliBinaryPath,
  resolvePureProbeTimeoutMs as resolveSharedPureProbeTimeoutMs,
  runCliProbeCommand as runSharedCliProbeCommand,
  type CliProbeCommandResult as SharedProbeCommandResult,
  type CliRuntimeContext as SharedCliRuntimeContext,
} from "../cli/runtimeSupport";
import type { Backend, BackendCapabilities } from "./backend";
import type { BackendResult, ExecutionContext, Operation } from "../types";
import type { ServerConfig } from "../config/types";
import { guardVaultRelativePath } from "../fs/pathGuard";
import { AppError } from "../server/errors";
import { ERROR_CODES } from "../server/errorCodes";

const SUPPORTED_OPS: Operation[] = ["open_vault", "create_note", "append_note", "read_note", "search_notes", "execute_command"];
const MIN_PROBE_TIMEOUT_MS = 5_000;
const MIN_LAUNCH_TIMEOUT_MS = 1_000;
const MIN_POLL_INTERVAL_MS = 100;
const READINESS_PROBE_FLOOR_MS = 1_500;
const READINESS_PROBE_CAP_MS = 5_000;

export type CliProbeMode = "direct" | "shell";

export interface CliCommandAttempt {
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

export interface CliVaultRegistrationStatus {
  name: string;
  registered: boolean;
  path?: string;
}

export interface CliLaunchDiagnostics {
  requestedVaultName: string | null;
  requestedVaultPath?: string | null;
  launchAttempted: boolean;
  readinessStatus: "ready" | "launched_and_ready" | "timeout" | "failed" | "skipped";
  readinessCommand: string[];
  launchCommand: string[];
  readinessAttempts: number;
  durationMs: number;
  error?: string;
}

export interface CliProbeWarning {
  code: string;
  message: string;
  diagnostics?: Record<string, unknown>;
}

export interface CliProbeDiagnostics {
  scope: "current-stack-macos";
  resolvedBinaryPath: string;
  parsedVersion: string | null;
  parsedVersionSource: "version" | "--version" | "app_bundle" | null;
  probeCommands: CliCommandAttempt[];
  warnings: CliProbeWarning[];
  requiredVaults: CliVaultRegistrationStatus[];
  launch: CliLaunchDiagnostics;
  timeouts: {
    probeTimeoutMs: number;
    launchTimeoutMs: number;
    readinessPollIntervalMs: number;
  };
  lastFailure?: {
    code: string;
    message: string;
    diagnostics?: Record<string, unknown>;
  };
}

function timeoutForOperation(config: ServerConfig, operation: Operation): number {
  switch (operation) {
    case "open_vault":
      return config.timeouts.openVaultMs;
    case "create_note":
      return config.timeouts.createNoteMs;
    case "append_note":
      return config.timeouts.appendNoteMs;
    case "read_note":
      return config.timeouts.readNoteMs;
    case "search_notes":
      return config.timeouts.searchNotesMs;
    case "execute_command":
      return config.timeouts.openVaultMs;
    default:
      return 15_000;
  }
}

function ensureVaultPathInput(input: Record<string, unknown>, config: ServerConfig): void {
  const relPath = typeof input.path === "string" ? input.path : undefined;
  const vaultRoot = typeof input.vaultRoot === "string" ? input.vaultRoot : undefined;
  if (!relPath || !vaultRoot) {
    return;
  }

  guardVaultRelativePath(vaultRoot, relPath);

  const normalizedRoots = config.allowedVaultRoots.map((root) => fs.realpathSync.native(root));
  const inputRoot = fs.realpathSync.native(vaultRoot);
  if (!normalizedRoots.includes(inputRoot)) {
    throw new AppError(ERROR_CODES.PATH_OUTSIDE_VAULT, "Vault root is not in allowedVaultRoots.", false, {
      inputRoot,
    });
  }
}

export function parseVersion(raw: string): [number, number, number] | null {
  return parseSharedCliVersion(raw);
}

function previewOutput(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, 500);
}

export function buildProbeEnv(): Record<string, string> {
  return buildSharedCliEnv(process.env);
}

export function resolveObsidianCliBinary(config: ServerConfig, env: Record<string, string>): string {
  return resolveSharedCliBinaryPath(config.obsidianCliBinary, env);
}

function buildCliRuntimeContext(config: ServerConfig): SharedCliRuntimeContext {
  return buildSharedCliRuntime(config.obsidianCliBinary, process.env);
}

function resolveConfiguredTimeout(rawOverride: string | undefined, configured: number, min: number): number {
  const candidate = Number(rawOverride ?? configured);
  if (!Number.isFinite(candidate)) {
    return configured;
  }
  return Math.max(min, Math.floor(candidate));
}

export function resolveProbeTimeoutMs(config: ServerConfig): number {
  return resolveConfiguredTimeout(process.env.OBSIDIAN_CLI_PROBE_TIMEOUT_MS, config.cliStability.probeTimeoutMs, MIN_PROBE_TIMEOUT_MS);
}

function resolveLaunchTimeoutMs(config: ServerConfig): number {
  return resolveConfiguredTimeout(process.env.OBSIDIAN_CLI_LAUNCH_TIMEOUT_MS, config.cliStability.launchTimeoutMs, MIN_LAUNCH_TIMEOUT_MS);
}

function resolveReadinessPollIntervalMs(config: ServerConfig): number {
  return resolveConfiguredTimeout(
    process.env.OBSIDIAN_CLI_READINESS_POLL_INTERVAL_MS,
    config.cliStability.readinessPollIntervalMs,
    MIN_POLL_INTERVAL_MS
  );
}

function resolveReadinessAttemptTimeoutMs(config: ServerConfig): number {
  return Math.max(
    READINESS_PROBE_FLOOR_MS,
    Math.min(resolveProbeTimeoutMs(config), READINESS_PROBE_CAP_MS)
  );
}

function buildInitialDiagnostics(config: ServerConfig, runtime: SharedCliRuntimeContext): CliProbeDiagnostics {
  return {
    scope: "current-stack-macos",
    resolvedBinaryPath: runtime.binary,
    parsedVersion: null,
    parsedVersionSource: null,
    probeCommands: [],
    warnings: [],
    requiredVaults: config.cliStability.requiredVaultNames.map((name) => ({
      name,
      registered: false,
    })),
    launch: {
      requestedVaultName: config.cliStability.requiredVaultNames[0] ?? null,
      launchAttempted: false,
      readinessStatus: "skipped",
      readinessCommand: [],
      launchCommand: [],
      readinessAttempts: 0,
      durationMs: 0,
    },
    timeouts: {
      probeTimeoutMs: resolveProbeTimeoutMs(config),
      launchTimeoutMs: resolveLaunchTimeoutMs(config),
      readinessPollIntervalMs: resolveReadinessPollIntervalMs(config),
    },
  };
}

function pushAttempt(diagnostics: CliProbeDiagnostics, attempt: CliCommandAttempt): void {
  diagnostics.probeCommands.push(attempt);
}

function attemptFromProbe(result: SharedProbeCommandResult, command: string, output: string): CliCommandAttempt {
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

function attemptFromError(command: string, args: string[], error: unknown): CliCommandAttempt {
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

function resolvePureProbeTimeoutMs(timeoutMs: number): number {
  return resolveSharedPureProbeTimeoutMs(timeoutMs);
}

async function runCliProbeCommand(runtime: SharedCliRuntimeContext, args: string[], timeoutMs: number): Promise<SharedProbeCommandResult> {
  return await runSharedCliProbeCommand(runtime, args, timeoutMs);
}

function isVersionAtLeast(version: [number, number, number], min: [number, number, number]): boolean {
  if (version[0] !== min[0]) {
    return version[0] > min[0];
  }
  if (version[1] !== min[1]) {
    return version[1] > min[1];
  }
  return version[2] >= min[2];
}

export function parseVaultsVerbose(raw: string): Array<{ name: string; path?: string }> {
  return parseSharedCliVaultList(raw);
}

async function verifyRequiredVaultRegistrations(
  config: ServerConfig,
  runtime: SharedCliRuntimeContext,
  diagnostics: CliProbeDiagnostics,
  probeTimeoutMs: number
): Promise<void> {
  const args = ["vaults", "verbose"];
  try {
    const probe = await runCliProbeCommand(runtime, args, probeTimeoutMs);
    const output = `${probe.result.stdout}\n${probe.result.stderr}`.trim();
    pushAttempt(diagnostics, attemptFromProbe(probe, "vaults_verbose", output));

    const discovered = parseVaultsVerbose(output);
    diagnostics.requiredVaults = config.cliStability.requiredVaultNames.map((requiredName) => {
      const match = discovered.find((entry) => entry.name === requiredName);
      return {
        name: requiredName,
        registered: Boolean(match),
        path: match?.path,
      };
    });

    const missing = diagnostics.requiredVaults.filter((entry) => !entry.registered);
    if (missing.length > 0) {
      throw new AppError(ERROR_CODES.VAULT_NOT_FOUND, "Required vault is not registered with the Obsidian CLI.", false, {
        requiredVaultNames: config.cliStability.requiredVaultNames,
        missingVaultNames: missing.map((entry) => entry.name),
        discoveredVaults: discovered,
      });
    }
  } catch (error) {
    if (!(error instanceof AppError && error.code === ERROR_CODES.VAULT_NOT_FOUND)) {
      pushAttempt(diagnostics, attemptFromError("vaults_verbose", args, error));
    }
    throw error;
  }
}

function syncLaunchDiagnosticsFromSummary(diagnostics: CliProbeDiagnostics, summary: Record<string, unknown>): void {
  diagnostics.launch = {
    ...diagnostics.launch,
    requestedVaultName: typeof summary.requestedVaultName === "string" ? summary.requestedVaultName : diagnostics.launch.requestedVaultName,
    requestedVaultPath: typeof summary.requestedVaultPath === "string" ? summary.requestedVaultPath : null,
    launchAttempted: Boolean(summary.launchAttempted),
    readinessStatus:
      summary.readinessStatus === "ready" ||
      summary.readinessStatus === "launched_and_ready" ||
      summary.readinessStatus === "timeout" ||
      summary.readinessStatus === "failed" ||
      summary.readinessStatus === "skipped"
        ? summary.readinessStatus
        : diagnostics.launch.readinessStatus,
    readinessCommand: Array.isArray(summary.readinessCommand)
      ? summary.readinessCommand.filter((value): value is string => typeof value === "string")
      : diagnostics.launch.readinessCommand,
    launchCommand: Array.isArray(summary.launchCommand)
      ? summary.launchCommand.filter((value): value is string => typeof value === "string")
      : diagnostics.launch.launchCommand,
    readinessAttempts: typeof summary.readinessAttempts === "number" ? summary.readinessAttempts : diagnostics.launch.readinessAttempts,
    durationMs: typeof summary.durationMs === "number" ? summary.durationMs : diagnostics.launch.durationMs,
    error: typeof summary.error === "string" ? summary.error : undefined,
  };
}

async function ensureLaunchAndReadiness(
  config: ServerConfig,
  runtime: SharedCliRuntimeContext,
  targetVaultName: string | null,
  diagnostics: CliProbeDiagnostics,
  targetVaultPath?: string | null
): Promise<void> {
  try {
    const summary = await ensureSharedCliLaunchAndReadiness(runtime, {
      targetVaultName,
      targetVaultPath: targetVaultPath || null,
      launchTimeoutMs: diagnostics.timeouts.launchTimeoutMs,
      readinessPollIntervalMs: diagnostics.timeouts.readinessPollIntervalMs,
      readinessAttemptTimeoutMs: resolveReadinessAttemptTimeoutMs(config),
    });
    syncLaunchDiagnosticsFromSummary(diagnostics, summary as unknown as Record<string, unknown>);
    for (const attempt of summary.attempts) {
      pushAttempt(diagnostics, attempt);
    }
  } catch (error) {
    const summary = error instanceof AppError && error.diagnostics && typeof error.diagnostics === "object"
      ? (error.diagnostics as Record<string, unknown>).summary
      : null;
    if (summary && typeof summary === "object") {
      syncLaunchDiagnosticsFromSummary(diagnostics, summary as Record<string, unknown>);
      const attempts = (summary as { attempts?: CliCommandAttempt[] }).attempts;
      if (Array.isArray(attempts)) {
        for (const attempt of attempts) {
          pushAttempt(diagnostics, attempt);
        }
      }
    }
    throw error;
  }
}

function determineProbeVaultName(config: ServerConfig): string | null {
  return config.cliStability.requiredVaultNames[0] ?? path.basename(config.allowedVaultRoots[0] ?? "");
}

function determineExecutionVaultName(config: ServerConfig, input: Record<string, unknown>): string | null {
  const requestedVault = typeof input.vault === "string" ? input.vault.trim() : "";
  if (requestedVault) {
    return requestedVault;
  }
  return determineProbeVaultName(config);
}

function buildFailureConstraints(error: unknown): string[] {
  const appError = error instanceof AppError ? error : null;
  if (appError) {
    return [`probe_failed:${appError.code}:${appError.message}`];
  }
  return [`probe_failed:${String(error)}`];
}

function setLastFailure(diagnostics: CliProbeDiagnostics, error: unknown): void {
  if (error instanceof AppError) {
    diagnostics.lastFailure = {
      code: error.code,
      message: error.message,
      diagnostics: error.diagnostics,
    };
    return;
  }
  diagnostics.lastFailure = {
    code: ERROR_CODES.INTERNAL_ERROR,
    message: String(error),
  };
}

function pushNonBlockingWarning(
  diagnostics: CliProbeDiagnostics,
  code: string,
  message: string,
  details?: Record<string, unknown>
): void {
  diagnostics.warnings.push({
    code,
    message,
    diagnostics: details,
  });
}

export class CliBackend implements Backend {
  readonly id = "cli" as const;
  private readonly config: ServerConfig;

  constructor(config: ServerConfig) {
    this.config = config;
  }

  async probe(): Promise<BackendCapabilities> {
    const runtime = buildCliRuntimeContext(this.config);
    const diagnostics = buildInitialDiagnostics(this.config, runtime);
    const pureProbeTimeoutMs = resolvePureProbeTimeoutMs(diagnostics.timeouts.probeTimeoutMs);

    try {
      const version = await detectSharedCliVersion(runtime, pureProbeTimeoutMs);
      for (const attempt of version.diagnostics) {
        pushAttempt(diagnostics, attempt);
      }
      const parsedVersion = version.parsedVersion;
      diagnostics.parsedVersion = parsedVersion.join(".");
      diagnostics.parsedVersionSource = version.sourceCommand;

      if (!isVersionAtLeast(parsedVersion, [1, 12, 4])) {
        throw new AppError(
          ERROR_CODES.CLI_VERSION_UNSUPPORTED,
          "Obsidian CLI version is unsupported; expected >=1.12.4 per troubleshooting guidance.",
          false,
          {
            parsedVersion: diagnostics.parsedVersion,
            attempts: diagnostics.probeCommands.filter((attempt) => attempt.command === "version" || attempt.command === "--version"),
          }
        );
      }

      try {
        const helpProbe = await runCliProbeCommand(runtime, ["help"], pureProbeTimeoutMs);
        pushAttempt(diagnostics, attemptFromProbe(helpProbe, "help", helpProbe.result.stdout || helpProbe.result.stderr));
      } catch (error) {
        pushAttempt(diagnostics, attemptFromError("help", ["help"], error));
        pushNonBlockingWarning(diagnostics, "HELP_PROBE_FAILED", "Help probe failed but was treated as non-blocking.", {
          error: String(error),
        });
      }

      await verifyRequiredVaultRegistrations(this.config, runtime, diagnostics, pureProbeTimeoutMs);
      const probeVaultName = determineProbeVaultName(this.config);
      const probeVaultPath =
        diagnostics.requiredVaults.find((entry) => entry.name === probeVaultName)?.path ??
        this.config.allowedVaultRoots[0] ??
        null;
      await ensureLaunchAndReadiness(this.config, runtime, probeVaultName, diagnostics, probeVaultPath);

      return {
        backend: "cli",
        available: true,
        supportedOps: SUPPORTED_OPS,
        reliabilityScore: 0.97,
        p95MsByOp: {
          open_vault: 2000,
          create_note: 1500,
          append_note: 1200,
          read_note: 800,
          search_notes: 1300,
          execute_command: 1500,
        },
        constraints: [
          "Bridge-backed macOS CLI lane validated for current production stack.",
          "Required vault registration verified.",
          "App launch and readiness verified.",
        ],
        diagnostics: diagnostics as unknown as Record<string, unknown>,
      };
    } catch (error) {
      setLastFailure(diagnostics, error);
      return {
        backend: "cli",
        available: false,
        supportedOps: [],
        reliabilityScore: 0,
        p95MsByOp: {},
        lastErrorAt: new Date().toISOString(),
        constraints: buildFailureConstraints(error),
        diagnostics: diagnostics as unknown as Record<string, unknown>,
      };
    }
  }

  async execute(operation: Operation, input: unknown, ctx: ExecutionContext): Promise<BackendResult> {
    const payload = (input as Record<string, unknown>) ?? {};
    ensureVaultPathInput(payload, this.config);

    const timeoutMs = timeoutForOperation(this.config, operation);
    const args = buildArgs(operation, payload);
    const runtime = buildCliRuntimeContext(this.config);
    const diagnostics = buildInitialDiagnostics(this.config, runtime);
    const readinessVaultName = determineExecutionVaultName(this.config, payload);
    const readinessVaultPath = typeof payload.vaultRoot === "string" ? payload.vaultRoot : null;
    await ensureLaunchAndReadiness(this.config, runtime, readinessVaultName, diagnostics, readinessVaultPath);

    const result = await runCli({
      binary: runtime.binary,
      args,
      timeoutMs,
      env: runtime.env,
      cwd: runtime.cwd,
    });

    if (operation === "create_note" && typeof payload.path === "string" && typeof payload.vaultRoot === "string") {
      guardVaultRelativePath(payload.vaultRoot, payload.path);
    }

    return {
      ...result,
      durationMs: result.durationMs || (Date.now() - ctx.now),
    };
  }
}
