import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { z } from "zod";
import type { BackendId, Operation, ToolResult } from "../../types";
import { buildArgs } from "../../cli/buildArgs";
import {
  buildCliRuntime,
  detectCliVersion as detectSharedCliVersion,
  ensureCliLaunchAndReadiness,
  parseCliVaultList,
  resolveCliBinaryPath,
  resolveCliIdentity,
  resolvePureProbeTimeoutMs,
  runCliProbeCommand,
  type CliRuntimeContext,
} from "../../cli/runtimeSupport";

type Surface = "CLI" | "MCP" | "IDE" | "RAYCAST";
type TransportMode = "http" | "uds" | "pipe";
type ValidationContract = "bridge_contract" | "full_direct_cli";

type Endpoint =
  | {
      mode: "http";
      host: string;
      port: number;
      basePath: string;
    }
  | {
      mode: "uds" | "pipe";
      socketPath: string;
      basePath: string;
    };

interface RoutingSnapshot {
  epochId: number;
  refreshedAt?: number;
  operationMap: Record<Operation, BackendId | null>;
  reasons: Record<Operation, string>;
}

interface HealthPayload {
  backends: {
    cli: { capabilities: { available?: boolean } & Record<string, unknown> };
  };
  routing: RoutingSnapshot;
  security: {
    transportMode: TransportMode;
    corsDisabled: boolean;
    replayGuardEnabled: boolean;
    tokenEntropyBits: number;
  };
  metrics: Record<string, unknown>;
}

interface RequestResult {
  statusCode: number;
  bodyText: string;
  headers: http.IncomingHttpHeaders;
}

interface ToolCallResponse<T> {
  statusCode: number;
  result: ToolResult<T>;
  rawBody: string;
  headers: http.IncomingHttpHeaders;
}

interface RunContext {
  vaultPath: string;
  vaultName: string;
  cliBin: string;
  cliRuntime?: CliRuntimeContext;
  token: string;
  endpoint: Endpoint;
  transportMode: TransportMode;
  runId: string;
  runRoot: string;
  runRootAbsolute: string;
  runBaseAbsolute: string;
  runBaseBefore: string[];
  health: HealthPayload;
  baselineRoutingMap: Record<Operation, BackendId | null>;
  baselineEpochId: number;
  baselineMetrics: MetricsSnapshot | null;
  markerKeysByNote: Map<string, Set<string>>;
  helpText: string;
}

interface DirectCliReadinessResult {
  launchAttempted: boolean;
  readinessAttempts: number;
  durationMs: number;
  status: "warm_ready" | "cold_launch_ready";
}

interface MetricsSnapshot {
  counters: Record<string, number>;
  latencyByOp?: Record<string, unknown>;
  errorRate1m: number;
  errorRate5m: number;
  queue: {
    depth: number;
    interactiveDepth: number;
    mutatingDepth: number;
    activeWorkers: number;
    overflowCount: number;
    timeoutCount: number;
    p95WaitMs: number;
  };
}

const MIN_CLI_VERSION: readonly [number, number, number] = [1, 12, 4];
const CLI_LAUNCH_TIMEOUT_MS = 20_000;
const CLI_LAUNCH_POLL_INTERVAL_MS = 500;
const DEFAULT_EXECUTE_COMMAND_ID = "app:go-back";
const METADATA_NOISE = new Set([".DS_Store", "Thumbs.db", "desktop.ini"]);
const OPERATIONS: Operation[] = ["open_vault", "create_note", "append_note", "read_note", "search_notes", "execute_command"];

const toolMetaSchema = z
  .object({
    requestId: z.string().min(1),
    durationMs: z.number().finite(),
    backendUsed: z.literal("cli").optional(),
    epochId: z.number().int().optional(),
    consistencyHint: z.string().optional(),
  })
  .strict();

const toolErrorSchema = z
  .object({
    code: z.string().min(1),
    message: z.string().min(1),
    retryable: z.boolean(),
    diagnostics: z.record(z.unknown()).optional(),
  })
  .strict();

const toolResultSchema = z.discriminatedUnion("ok", [
  z
    .object({
      ok: z.literal(true),
      data: z.unknown(),
      meta: toolMetaSchema,
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      error: toolErrorSchema,
      meta: toolMetaSchema,
    })
    .strict(),
]);

const routingSnapshotSchema: z.ZodType<RoutingSnapshot> = z
  .object({
    epochId: z.number().int(),
    refreshedAt: z.number().int().optional(),
    operationMap: z.object({
      open_vault: z.literal("cli").nullable(),
      create_note: z.literal("cli").nullable(),
      append_note: z.literal("cli").nullable(),
      read_note: z.literal("cli").nullable(),
      search_notes: z.literal("cli").nullable(),
      execute_command: z.literal("cli").nullable(),
    }),
    reasons: z.object({
      open_vault: z.string(),
      create_note: z.string(),
      append_note: z.string(),
      read_note: z.string(),
      search_notes: z.string(),
      execute_command: z.string(),
    }),
  })
  .strict();

const healthSchema: z.ZodType<HealthPayload> = z
  .object({
    backends: z
      .object({
        cli: z.object({ capabilities: z.object({ available: z.boolean().optional() }).passthrough() }).strict(),
      })
      .strict(),
    routing: routingSnapshotSchema,
    security: z
      .object({
        transportMode: z.enum(["http", "uds", "pipe"]),
        corsDisabled: z.boolean(),
        replayGuardEnabled: z.boolean(),
        tokenEntropyBits: z.number().int(),
      })
      .strict(),
    metrics: z.record(z.unknown()),
  })
  .strict();

const openVaultDataSchema = z.object({ opened: z.boolean(), vault: z.string().min(1) }).strict();
const createNoteDataSchema = z.object({ created: z.boolean(), path: z.string().min(1) }).strict();
const appendNoteDataSchema = z
  .object({ appended: z.boolean(), path: z.string().min(1), idempotencyState: z.string().min(1) })
  .strict();
const readNoteDataSchema = z.object({ path: z.string().min(1), content: z.string(), revision: z.string().optional() }).strict();
const searchNotesDataSchema = z
  .object({
    query: z.string(),
    matches: z.array(
      z
        .object({
          path: z.string().min(1),
          line: z.number().int().optional(),
          text: z.string().optional(),
        })
        .strict()
    ),
  })
  .strict();
const executeCommandDataSchema = z.object({ executed: z.boolean(), id: z.string().min(1) }).strict();

const metricsSchema: z.ZodType<MetricsSnapshot> = z
  .object({
    counters: z.record(z.number()),
    latencyByOp: z.record(z.unknown()).optional(),
    errorRate1m: z.number(),
    errorRate5m: z.number(),
    queue: z
      .object({
        depth: z.number().int(),
        interactiveDepth: z.number().int(),
        mutatingDepth: z.number().int(),
        activeWorkers: z.number().int(),
        overflowCount: z.number().int(),
        timeoutCount: z.number().int(),
        p95WaitMs: z.number(),
      })
      .strict(),
  })
  .passthrough();

const raycastToolResultSchema = z.discriminatedUnion("ok", [
  z
    .object({
      ok: z.literal(true),
      data: z.unknown(),
      meta: z
        .object({
          requestId: z.string(),
          durationMs: z.number(),
          backendUsed: z.literal("cli").optional(),
          epochId: z.number().int().optional(),
          consistencyHint: z.string().optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      error: z
        .object({
          code: z.string(),
          message: z.string(),
          retryable: z.boolean(),
          diagnostics: z.record(z.unknown()).optional(),
        })
        .strict(),
      meta: z
        .object({
          requestId: z.string(),
          durationMs: z.number(),
          backendUsed: z.literal("cli").optional(),
          epochId: z.number().int().optional(),
          consistencyHint: z.string().optional(),
        })
        .strict(),
    })
    .strict(),
]);

function debugValuePreview(value: unknown): string {
  if (typeof value === "string") {
    return value.slice(0, 500);
  }
  try {
    return JSON.stringify(value).slice(0, 500);
  } catch {
    return String(value).slice(0, 500);
  }
}

function logZodInputPreview(context: string, value: unknown): void {
  console.log(
    JSON.stringify({
      phase: "DEBUG",
      step: "zod_input_preview",
      context,
      typeofInput: Array.isArray(value) ? "array" : typeof value,
      preview: debugValuePreview(value),
    })
  );
}

function zodParseWithDebug<T>(schema: z.ZodType<T>, value: unknown, context: string): T {
  logZodInputPreview(context, value);
  return schema.parse(value);
}

function zodSafeParseWithDebug<T>(schema: z.ZodType<T>, value: unknown, context: string): z.SafeParseReturnType<unknown, T> {
  logZodInputPreview(context, value);
  return schema.safeParse(value);
}

function warningBanner(): void {
  const line = "=".repeat(108);
  console.warn(`\n${line}`);
  console.warn("LIVE COMMUNICATION + CLI VALIDATION MODE (EXISTING MCP SERVER REQUIRED)");
  console.warn("Writes are isolated to cpbh-comm-cli-test/<timestamp>/ and script aborts on first failure.");
  console.warn(`${line}\n`);
}

function logStep(input: {
  phase: string;
  surface: Surface;
  step: string;
  status: "success" | "failure";
  backendUsed?: string | null;
  epochId?: number | null;
  routingReason?: string | null;
  consistencyHint?: string | null;
  transportMode: TransportMode;
  diagnostics?: unknown;
}): void {
  const payload: Record<string, unknown> = {
    phase: input.phase,
    surface: input.surface,
    step: input.step,
    backendUsed: input.backendUsed ?? null,
    epochId: input.epochId ?? null,
    routingReason: input.routingReason ?? null,
    consistencyHint: input.consistencyHint ?? null,
    transportMode: input.transportMode,
    status: input.status,
  };
  if (input.diagnostics !== undefined) {
    payload.diagnostics = input.diagnostics;
  }
  console.log(JSON.stringify(payload));
}

function failNow(input: {
  phase: string;
  surface: Surface;
  step: string;
  transportMode: TransportMode;
  backendUsed?: string | null;
  epochId?: number | null;
  routingReason?: string | null;
  consistencyHint?: string | null;
  message: string;
  diagnostics?: unknown;
}): never {
  logStep({
    phase: input.phase,
    surface: input.surface,
    step: input.step,
    status: "failure",
    backendUsed: input.backendUsed,
    epochId: input.epochId,
    routingReason: input.routingReason,
    consistencyHint: input.consistencyHint,
    transportMode: input.transportMode,
    diagnostics: {
      message: input.message,
      ...(input.diagnostics !== undefined ? { details: input.diagnostics } : {}),
    },
  });
  throw new Error(`[${input.phase}/${input.step}] ${input.message}`);
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function ensureAbsolutePath(rawPath: string, label: string): string {
  const absolute = path.resolve(rawPath);
  if (!path.isAbsolute(absolute)) {
    throw new Error(`${label} must be an absolute path.`);
  }
  return absolute;
}

function parseEndpointFromEnv(): Endpoint {
  const httpUrl = process.env.OBSIDIAN_LIVE_MCP_HTTP_URL?.trim();
  const udsPath = process.env.OBSIDIAN_LIVE_MCP_UDS_PATH?.trim();
  const pipeName = process.env.OBSIDIAN_LIVE_MCP_PIPE_NAME?.trim();

  const configured = [Boolean(httpUrl), Boolean(udsPath), Boolean(pipeName)].filter(Boolean).length;
  if (configured !== 1) {
    throw new Error(
      "Set exactly one MCP endpoint env var: OBSIDIAN_LIVE_MCP_HTTP_URL or OBSIDIAN_LIVE_MCP_UDS_PATH or OBSIDIAN_LIVE_MCP_PIPE_NAME"
    );
  }

  if (httpUrl) {
    const parsed = new URL(httpUrl);
    if (parsed.protocol !== "http:") {
      throw new Error(`OBSIDIAN_LIVE_MCP_HTTP_URL must use http://, got ${httpUrl}`);
    }
    return {
      mode: "http",
      host: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : 80,
      basePath: parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/$/, ""),
    };
  }

  if (udsPath) {
    return {
      mode: "uds",
      socketPath: ensureAbsolutePath(udsPath, "OBSIDIAN_LIVE_MCP_UDS_PATH"),
      basePath: "",
    };
  }

  const normalizedPipe = pipeName!.startsWith("\\\\.\\pipe\\") ? pipeName! : `\\\\.\\pipe\\${pipeName!}`;
  return {
    mode: "pipe",
    socketPath: normalizedPipe,
    basePath: "",
  };
}

function parseValidationContract(): ValidationContract {
  const raw = (process.env.OBSIDIAN_LIVE_VALIDATION_CONTRACT || "bridge_contract").trim().toLowerCase();
  if (raw === "full_direct_cli") {
    return "full_direct_cli";
  }
  return "bridge_contract";
}

function executeCommandId(): string {
  const raw = (process.env.OBSIDIAN_LIVE_EXECUTE_COMMAND_ID || "").trim();
  return raw || DEFAULT_EXECUTE_COMMAND_ID;
}

function buildBodyHash(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex");
}

async function runProcess(
  binary: string,
  args: string[],
  timeoutMs: number,
  allowFailure = false,
  options?: {
    env?: Record<string, string>;
    cwd?: string;
  }
): Promise<{ stdout: string; stderr: string; code: number; durationMs: number }> {
  return await new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const child = spawn(binary, args, {
      shell: false,
      windowsHide: true,
      cwd: options?.cwd,
      env: options?.env
        ? {
            ...process.env,
            ...options.env,
          }
        : process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Process timed out after ${timeoutMs}ms: ${binary} ${args.join(" ")}`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.once("close", (code) => {
      clearTimeout(timer);
      const exitCode = code ?? -1;
      if (exitCode !== 0 && !allowFailure) {
        reject(
          new Error(
            `Process exited non-zero (${exitCode}): ${binary} ${args.join(" ")} stdout=${stdout} stderr=${stderr}`
          )
        );
        return;
      }
      resolve({ stdout, stderr, code: exitCode, durationMs: Date.now() - startedAt });
    });
  });
}

function getCliRuntime<T extends Pick<RunContext, "cliBin"> & { cliRuntime?: CliRuntimeContext }>(ctx: T): CliRuntimeContext {
  if (!ctx.cliRuntime || ctx.cliRuntime.binary !== ctx.cliBin) {
    ctx.cliRuntime = buildCliRuntime(ctx.cliBin, process.env);
  }
  return ctx.cliRuntime;
}

async function runCliProcess(
  ctx: Pick<RunContext, "cliBin"> & { cliRuntime?: CliRuntimeContext },
  args: string[],
  timeoutMs: number,
  allowFailure = false
): Promise<{ stdout: string; stderr: string; code: number; durationMs: number }> {
  const runtime = getCliRuntime(ctx);
  return await runProcess(runtime.binary, args, timeoutMs, allowFailure, {
    env: runtime.env,
    cwd: runtime.cwd,
  });
}

async function isObsidianRunning(): Promise<boolean> {
  if (process.platform === "win32") {
    const result = await runProcess("cmd", ["/c", "tasklist", "/FI", "IMAGENAME eq Obsidian.exe"], 8_000, true);
    return /Obsidian\.exe/i.test(result.stdout);
  }

  const result = await runProcess("pgrep", ["-x", "Obsidian"], 5_000, true);
  return result.code === 0;
}

async function ensureCliReadiness(
  ctx: Pick<RunContext, "cliBin" | "cliRuntime" | "vaultName" | "vaultPath" | "transportMode">,
  phase: string,
  step: string
): Promise<DirectCliReadinessResult> {
  try {
    const summary = await ensureCliLaunchAndReadiness(getCliRuntime(ctx), {
      targetVaultName: ctx.vaultName,
      targetVaultPath: ctx.vaultPath,
      launchTimeoutMs: CLI_LAUNCH_TIMEOUT_MS,
      readinessPollIntervalMs: CLI_LAUNCH_POLL_INTERVAL_MS,
      readinessAttemptTimeoutMs: resolvePureProbeTimeoutMs(CLI_LAUNCH_TIMEOUT_MS),
    });
    const diagnostics: DirectCliReadinessResult = {
      launchAttempted: summary.launchAttempted,
      readinessAttempts: summary.readinessAttempts,
      durationMs: summary.durationMs,
      status: summary.launchAttempted ? "cold_launch_ready" : "warm_ready",
    };
    logStep({
      phase,
      surface: "CLI",
      step,
      status: "success",
      backendUsed: "cli-direct",
      epochId: null,
      routingReason: "direct_cli_readiness",
      consistencyHint: null,
      transportMode: ctx.transportMode,
      diagnostics: {
        readinessArgs: summary.readinessCommand,
        requestedVaultPath: summary.requestedVaultPath,
        launchCommand: summary.launchCommand,
        attempts: summary.attempts,
        ...diagnostics,
      },
    });
    return diagnostics;
  } catch (error) {
    const details =
      typeof error === "object" && error && "diagnostics" in error
        ? (error as { diagnostics?: unknown }).diagnostics
        : undefined;
    failNow({
      phase,
      surface: "CLI",
      step,
      transportMode: ctx.transportMode,
      message: error instanceof Error ? error.message : "CLI readiness failed.",
      diagnostics: details,
    });
  }
}

async function runCliAppCommand(
  ctx: Pick<RunContext, "cliBin" | "cliRuntime" | "vaultName" | "vaultPath" | "transportMode">,
  phase: string,
  step: string,
  args: string[],
  timeoutMs: number,
  allowFailure = false
): Promise<{ stdout: string; stderr: string; code: number; durationMs: number }> {
  await ensureCliReadiness(ctx, phase, `${step}_readiness`);
  return await runCliProcess(ctx, args, timeoutMs, allowFailure);
}

function isSemverAtLeast(actual: [number, number, number], minimum: readonly [number, number, number]): boolean {
  if (actual[0] !== minimum[0]) {
    return actual[0] > minimum[0];
  }
  if (actual[1] !== minimum[1]) {
    return actual[1] > minimum[1];
  }
  return actual[2] >= minimum[2];
}

function resolveVaultAbsolute(vaultPath: string, relativePath: string): string {
  const vaultAbsolute = path.resolve(vaultPath);
  const absolute = path.resolve(vaultAbsolute, relativePath);
  if (!absolute.startsWith(vaultAbsolute)) {
    throw new Error(`Path escaped vault root: ${relativePath}`);
  }
  return absolute;
}

function ensureRunRootDirectory(ctx: RunContext, phase: string, step: string): string {
  const absoluteRunRoot = resolveVaultAbsolute(ctx.vaultPath, ctx.runRoot);
  if (!fs.existsSync(absoluteRunRoot)) {
    fs.mkdirSync(absoluteRunRoot, { recursive: true });
  }

  if (!fs.existsSync(absoluteRunRoot) || !fs.statSync(absoluteRunRoot).isDirectory()) {
    failNow({
      phase,
      surface: "CLI",
      step,
      transportMode: ctx.transportMode,
      message: "Run root directory is missing after mkdir.",
      diagnostics: {
        runRoot: ctx.runRoot,
        absoluteRunRoot,
      },
    });
  }

  logStep({
    phase,
    surface: "CLI",
    step,
    status: "success",
    backendUsed: "filesystem",
    epochId: null,
    routingReason: "prepare_parent_directory",
    consistencyHint: null,
    transportMode: ctx.transportMode,
    diagnostics: {
      runRoot: ctx.runRoot,
      absoluteRunRoot,
    },
  });

  return absoluteRunRoot;
}

async function verifyCliCreatePersistence(
  ctx: RunContext,
  phase: string,
  notePath: string,
  expectedContent: string
): Promise<void> {
  const readArgs = buildArgs("read_note", {
    vault: ctx.vaultName,
    path: notePath,
  });
  const readResult = await runCliAppCommand(ctx, phase, "create_note_cli_disk_readback", readArgs, 25_000);
  if (!readResult.stdout.includes(expectedContent)) {
    failNow({
      phase,
      surface: "CLI",
      step: "create_note_cli_readback",
      transportMode: ctx.transportMode,
      message: "CLI read after create did not include expected content.",
      diagnostics: {
        notePath,
        expectedContent,
        stdoutPreview: readResult.stdout.slice(-500),
      },
    });
  }

  logStep({
    phase,
    surface: "CLI",
    step: "create_note_cli_readback",
    status: "success",
    backendUsed: "cli-direct",
    epochId: null,
    routingReason: "direct_cli_verify_create",
    consistencyHint: null,
    transportMode: ctx.transportMode,
    diagnostics: {
      notePath,
      args: readArgs,
    },
  });

  const noteAbsolute = resolveVaultAbsolute(ctx.vaultPath, notePath);
  if (!fs.existsSync(noteAbsolute)) {
    failNow({
      phase,
      surface: "CLI",
      step: "create_note_cli_disk_check",
      transportMode: ctx.transportMode,
      message: "CLI create succeeded but note file does not exist on disk.",
      diagnostics: {
        notePath,
        noteAbsolute,
      },
    });
  }

  logStep({
    phase,
    surface: "CLI",
    step: "create_note_cli_disk_check",
    status: "success",
    backendUsed: "filesystem",
    epochId: null,
    routingReason: "direct_cli_verify_create",
    consistencyHint: null,
    transportMode: ctx.transportMode,
    diagnostics: {
      notePath,
      noteAbsolute,
    },
  });
}

async function detectCliVersion(
  ctx: Pick<RunContext, "cliBin"> & { cliRuntime?: CliRuntimeContext }
): Promise<{
  parsedVersion: [number, number, number];
  sourceCommand: "version" | "--version" | "app_bundle";
  output: string;
  diagnostics: Array<{ command: string; code: number | null; outputPreview: string; error?: string }>;
}> {
  const detection = await detectSharedCliVersion(getCliRuntime(ctx), resolvePureProbeTimeoutMs(CLI_LAUNCH_TIMEOUT_MS));
  return {
    parsedVersion: detection.parsedVersion,
    sourceCommand: detection.sourceCommand,
    output: detection.output,
    diagnostics: detection.diagnostics.map((attempt) => ({
      command: attempt.command,
      code: attempt.success ? 0 : null,
      outputPreview: attempt.outputPreview || attempt.error || "",
      ...(attempt.error ? { error: attempt.error } : {}),
    })),
  };
}

function listTree(baseAbsolute: string): string[] {
  if (!fs.existsSync(baseAbsolute)) {
    return [];
  }

  const out: string[] = [];
  const walk = (current: string): void => {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      if (METADATA_NOISE.has(entry.name)) {
        continue;
      }
      const absolute = path.resolve(current, entry.name);
      const relative = path.relative(baseAbsolute, absolute).replace(/\\/g, "/");
      if (!relative) {
        continue;
      }
      out.push(entry.isDirectory() ? `${relative}/` : relative);
      if (entry.isDirectory()) {
        walk(absolute);
      }
    }
  };

  walk(baseAbsolute);
  out.sort((a, b) => a.localeCompare(b));
  return out;
}

function markerRegexForKey(key: string): RegExp {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`<!-- cpbh-idem:v1 key=${escaped} op=append_note sha256=([a-f0-9]{64}) ts=[^>]+ -->`, "g");
}

function countMarkers(content: string, keys: Iterable<string>): number {
  let total = 0;
  for (const key of keys) {
    total += [...content.matchAll(markerRegexForKey(key))].length;
  }
  return total;
}

function assertUtf8NoCrlf(contentBuffer: Buffer, phase: string, step: string, ctx: RunContext): string {
  const text = contentBuffer.toString("utf8");
  const roundTrip = Buffer.from(text, "utf8");

  if (!roundTrip.equals(contentBuffer)) {
    failNow({
      phase,
      surface: "CLI",
      step,
      transportMode: ctx.transportMode,
      message: "UTF-8 round-trip failed.",
    });
  }

  if (text.includes("\r\n")) {
    failNow({
      phase,
      surface: "CLI",
      step,
      transportMode: ctx.transportMode,
      message: "CRLF detected in note content.",
    });
  }

  return text;
}

function normalizeOperationMap(map: Record<Operation, BackendId | null>): Record<Operation, BackendId | null> {
  return {
    open_vault: map.open_vault,
    create_note: map.create_note,
    append_note: map.append_note,
    read_note: map.read_note,
    search_notes: map.search_notes,
    execute_command: map.execute_command,
  };
}

function diffOperationMap(
  before: Record<Operation, BackendId | null>,
  after: Record<Operation, BackendId | null>
): Partial<Record<Operation, { before: BackendId | null; after: BackendId | null }>> {
  const changed: Partial<Record<Operation, { before: BackendId | null; after: BackendId | null }>> = {};
  for (const operation of OPERATIONS) {
    if (before[operation] !== after[operation]) {
      changed[operation] = {
        before: before[operation],
        after: after[operation],
      };
    }
  }
  return changed;
}

async function request(
  endpoint: Endpoint,
  method: "GET" | "POST",
  requestPath: string,
  headers: Record<string, string>,
  body?: string,
  timeoutMs = 20_000
): Promise<RequestResult> {
  return await new Promise((resolve, reject) => {
    const payload = body ?? "";
    const normalizedPath = `${endpoint.basePath}${requestPath}`;

    const options: http.RequestOptions =
      endpoint.mode === "http"
        ? {
            host: endpoint.host,
            port: endpoint.port,
            method,
            path: normalizedPath,
            headers: {
              ...headers,
              ...(payload ? { "Content-Length": String(Buffer.byteLength(payload)) } : {}),
            },
          }
        : {
            socketPath: endpoint.socketPath,
            method,
            path: normalizedPath,
            headers: {
              ...headers,
              ...(payload ? { "Content-Length": String(Buffer.byteLength(payload)) } : {}),
            },
          };

    const req = http.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      res.on("end", () => {
        resolve({
          statusCode: res.statusCode ?? 0,
          headers: res.headers,
          bodyText: Buffer.concat(chunks).toString("utf8"),
        });
      });
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Request timeout: ${method} ${normalizedPath}`));
    });

    req.once("error", reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

async function callTool<TInput, TOutput>(
  endpoint: Endpoint,
  token: string,
  payload: {
    tool: string;
    operation: Operation;
    input: TInput;
    backendHint?: BackendId;
    epochId?: number;
  },
  overrides?: {
    token?: string;
    nonce?: string;
    timestampMs?: number;
    bodyHash?: string;
  }
): Promise<ToolCallResponse<TOutput>> {
  const body = JSON.stringify(payload);
  const nonce = overrides?.nonce ?? randomUUID();
  const timestampMs = overrides?.timestampMs ?? Date.now();

  const response = await request(
    endpoint,
    "POST",
    "/mcp/tool",
    {
      "Content-Type": "application/json",
      "X-MCP-Token": overrides?.token ?? token,
      "X-MCP-Nonce": nonce,
      "X-MCP-Timestamp": String(timestampMs),
      "X-MCP-Body-Sha256": overrides?.bodyHash ?? buildBodyHash(body),
    },
    body
  );

  const rawPreview = response.bodyText.slice(0, 1_000);
  console.log(
    JSON.stringify({
      phase: "DEBUG",
      step: "raw_mcp_response",
      tool: payload.tool,
      operation: payload.operation,
      statusCode: response.statusCode,
      transportMode: endpoint.mode,
      rawBody: rawPreview,
    })
  );

  let parsedRaw: unknown;
  try {
    parsedRaw = JSON.parse(response.bodyText);
  } catch (error) {
    console.log(
      JSON.stringify({
        phase: "DEBUG",
        step: "raw_mcp_response_parse_failure",
        tool: payload.tool,
        operation: payload.operation,
        statusCode: response.statusCode,
        transportMode: endpoint.mode,
        rawBody: rawPreview,
        diagnostics: {
          error: String(error instanceof Error ? error.message : error),
        },
      })
    );
    throw new Error(
      `Failed to parse MCP response JSON for tool=${payload.tool} operation=${payload.operation}. rawBody=${rawPreview}`
    );
  }

  if (typeof parsedRaw !== "object" || parsedRaw === null || Array.isArray(parsedRaw)) {
    console.log(
      JSON.stringify({
        phase: "DEBUG",
        step: "raw_mcp_response_envelope_type_failure",
        tool: payload.tool,
        operation: payload.operation,
        statusCode: response.statusCode,
        transportMode: endpoint.mode,
        rawBody: rawPreview,
        diagnostics: {
          parsedType: Array.isArray(parsedRaw) ? "array" : typeof parsedRaw,
        },
      })
    );
    throw new Error(
      `MCP response envelope is not an object for tool=${payload.tool} operation=${payload.operation}. rawBody=${rawPreview}`
    );
  }

  const envelopeCandidate = parsedRaw as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(envelopeCandidate, "ok") || !Object.prototype.hasOwnProperty.call(envelopeCandidate, "meta")) {
    console.log(
      JSON.stringify({
        phase: "DEBUG",
        step: "raw_mcp_response_envelope_shape_failure",
        tool: payload.tool,
        operation: payload.operation,
        statusCode: response.statusCode,
        transportMode: endpoint.mode,
        rawBody: rawPreview,
        diagnostics: {
          keys: Object.keys(envelopeCandidate),
        },
      })
    );
    throw new Error(
      `MCP response envelope missing required keys for tool=${payload.tool} operation=${payload.operation}. rawBody=${rawPreview}`
    );
  }

  const envelopeValidation = zodSafeParseWithDebug(
    toolResultSchema,
    parsedRaw,
    `toolResultSchema:${payload.tool}:${payload.operation}`
  );
  if (!envelopeValidation.success) {
    console.log(
      JSON.stringify({
        phase: "DEBUG",
        step: "raw_mcp_response_envelope_schema_failure",
        tool: payload.tool,
        operation: payload.operation,
        statusCode: response.statusCode,
        transportMode: endpoint.mode,
        rawBody: rawPreview,
        diagnostics: {
          issues: envelopeValidation.error.issues,
        },
      })
    );
    throw new Error(
      `MCP response envelope schema validation failed for tool=${payload.tool} operation=${payload.operation}. rawBody=${rawPreview}`
    );
  }

  const parsed = envelopeValidation.data as ToolResult<TOutput>;

  return {
    statusCode: response.statusCode,
    result: parsed,
    rawBody: response.bodyText,
    headers: response.headers,
  };
}

async function callHealth(ctx: RunContext, phase: string, surface: Surface, step: string): Promise<HealthPayload> {
  const response = await callTool<{}, unknown>(ctx.endpoint, ctx.token, {
    tool: "obsidian_health",
    operation: "read_note",
    input: {},
  });

  if (!response.result.ok) {
    failNow({
      phase,
      surface,
      step,
      transportMode: ctx.transportMode,
      backendUsed: response.result.meta.backendUsed ?? null,
      epochId: response.result.meta.epochId ?? null,
      routingReason: "health",
      consistencyHint: response.result.meta.consistencyHint ?? null,
      message: `obsidian_health failed: ${response.result.error.code}`,
      diagnostics: response.result.error,
    });
  }

  const health = zodParseWithDebug(healthSchema, response.result.data, `healthSchema:${phase}:${step}`);
  zodParseWithDebug(raycastToolResultSchema, response.result, `raycastToolResultSchema:${phase}:${step}`);

  logStep({
    phase,
    surface,
    step,
    status: "success",
    backendUsed: response.result.meta.backendUsed ?? "health",
    epochId: health.routing.epochId,
    routingReason: "health",
    consistencyHint: response.result.meta.consistencyHint ?? null,
    transportMode: ctx.transportMode,
    diagnostics: {
      transportMode: health.security.transportMode,
      routing: health.routing.operationMap,
    },
  });

  ctx.health = health;
  return health;
}

function readCurrentEpochIdFromDiagnostics(diagnostics: unknown): number | null {
  if (!diagnostics || typeof diagnostics !== "object" || Array.isArray(diagnostics)) {
    return null;
  }

  const value = (diagnostics as Record<string, unknown>).currentEpochId;
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

async function refreshRoutingAfterStale(
  ctx: RunContext,
  phase: string,
  step: string,
  operation: Operation,
  response: ToolCallResponse<unknown>
): Promise<void> {
  const currentEpochId = response.result.ok ? null : readCurrentEpochIdFromDiagnostics(response.result.error.diagnostics);

  logStep({
    phase,
    surface: "MCP",
    step: `${step}_stale_epoch_retry`,
    status: "success",
    backendUsed: response.result.meta.backendUsed ?? null,
    epochId: response.result.meta.epochId ?? null,
    routingReason: ctx.health.routing.reasons[operation] ?? "unknown",
    consistencyHint: response.result.meta.consistencyHint ?? null,
    transportMode: ctx.transportMode,
    diagnostics: {
      requestedEpochId: ctx.health.routing.epochId,
      currentEpochId,
      message: "Refreshing routing after BACKEND_SELECTION_STALE and retrying once.",
    },
  });

  const fresh = await callHealth(ctx, phase, "MCP", `${step}_refresh_after_stale`);
  if (currentEpochId !== null && fresh.routing.epochId !== currentEpochId) {
    logStep({
      phase,
      surface: "MCP",
      step: `${step}_refresh_epoch_mismatch`,
      status: "success",
      backendUsed: "health",
      epochId: fresh.routing.epochId,
      routingReason: "routing_refresh_after_stale",
      consistencyHint: null,
      transportMode: ctx.transportMode,
      diagnostics: {
        staleResponseCurrentEpochId: currentEpochId,
        refreshedEpochId: fresh.routing.epochId,
      },
    });
  }
}

function backendExpectedForRead(
  routingMap: Record<Operation, BackendId | null>,
  consistencyHint: string | undefined
): Set<BackendId | null> {
  const allowed = new Set<BackendId | null>([routingMap.read_note]);
  if (consistencyHint?.includes("read-after-write") && routingMap.append_note) {
    allowed.add(routingMap.append_note);
  }
  return allowed;
}

function assertBackendUsedMatches(
  operation: Operation,
  backendUsed: string | undefined,
  consistencyHint: string | undefined,
  routingMap: Record<Operation, BackendId | null>,
  phase: string,
  step: string,
  surface: Surface,
  ctx: RunContext
): void {
  const actual = backendUsed ?? null;
  if (operation === "read_note") {
    const allowed = backendExpectedForRead(routingMap, consistencyHint);
    if (!allowed.has(actual as BackendId | null)) {
      failNow({
        phase,
        surface,
        step,
        transportMode: ctx.transportMode,
        backendUsed: actual,
        epochId: ctx.health.routing.epochId,
        routingReason: ctx.health.routing.reasons.read_note,
        consistencyHint: consistencyHint ?? null,
        message: "Unexpected backendUsed for read_note.",
        diagnostics: {
          expected: [...allowed],
          actual,
        },
      });
    }
    return;
  }

  const expected = routingMap[operation];
  if (expected !== null && actual !== expected) {
    failNow({
      phase,
      surface,
      step,
      transportMode: ctx.transportMode,
      backendUsed: actual,
      epochId: ctx.health.routing.epochId,
      routingReason: ctx.health.routing.reasons[operation],
      consistencyHint: consistencyHint ?? null,
      message: "Unexpected backendUsed for operation.",
      diagnostics: {
        operation,
        expected,
        actual,
      },
    });
  }
}

async function callRoutedToolSuccess<TInput, TOutput>(
  ctx: RunContext,
  args: {
    phase: string;
    surface: Surface;
    step: string;
    tool: string;
    operation: Operation;
    input: TInput;
    outputSchema: z.ZodType<TOutput>;
    allowStaleRetry?: boolean;
  }
): Promise<{ data: TOutput; meta: ToolResult<TOutput>["meta"] }> {
  const allowStaleRetry = args.allowStaleRetry !== false;
  const backendHint = ctx.health.routing.operationMap[args.operation] ?? undefined;
  const epochId = ctx.health.routing.epochId;
  const routingReason = ctx.health.routing.reasons[args.operation] ?? "unknown";

  const response = await callTool<TInput, TOutput>(ctx.endpoint, ctx.token, {
    tool: args.tool,
    operation: args.operation,
    input: args.input,
    backendHint: backendHint ?? undefined,
    epochId,
  });

  zodParseWithDebug(raycastToolResultSchema, response.result, `raycastToolResultSchema:${args.phase}:${args.step}`);

  if (!response.result.ok) {
    if (response.result.error.code === "BACKEND_SELECTION_STALE" && allowStaleRetry) {
      await refreshRoutingAfterStale(ctx, args.phase, args.step, args.operation, response as ToolCallResponse<unknown>);
      return await callRoutedToolSuccess(ctx, {
        ...args,
        step: `${args.step}_retry_after_stale`,
        allowStaleRetry: false,
      });
    }

    failNow({
      phase: args.phase,
      surface: args.surface,
      step: args.step,
      transportMode: ctx.transportMode,
      backendUsed: response.result.meta.backendUsed ?? null,
      epochId: response.result.meta.epochId ?? null,
      routingReason,
      consistencyHint: response.result.meta.consistencyHint ?? null,
      message: `MCP tool failed: ${response.result.error.code}`,
      diagnostics: {
        statusCode: response.statusCode,
        error: response.result.error,
      },
    });
  }

  const parsedData = zodParseWithDebug(
    args.outputSchema,
    response.result.data,
    `outputSchema:${args.tool}:${args.operation}:${args.phase}:${args.step}`
  );

  if (response.statusCode !== 200) {
    failNow({
      phase: args.phase,
      surface: args.surface,
      step: args.step,
      transportMode: ctx.transportMode,
      backendUsed: response.result.meta.backendUsed ?? null,
      epochId: response.result.meta.epochId ?? null,
      routingReason,
      consistencyHint: response.result.meta.consistencyHint ?? null,
      message: "Expected HTTP 200 for successful MCP tool call.",
      diagnostics: {
        statusCode: response.statusCode,
      },
    });
  }

  assertBackendUsedMatches(
    args.operation,
    response.result.meta.backendUsed,
    response.result.meta.consistencyHint,
    ctx.health.routing.operationMap,
    args.phase,
    args.step,
    args.surface,
    ctx
  );

  logStep({
    phase: args.phase,
    surface: args.surface,
    step: args.step,
    status: "success",
    backendUsed: response.result.meta.backendUsed ?? null,
    epochId: response.result.meta.epochId ?? null,
    routingReason,
    consistencyHint: response.result.meta.consistencyHint ?? null,
    transportMode: ctx.transportMode,
  });

  return {
    data: parsedData,
    meta: response.result.meta,
  };
}

async function callRoutedToolExpectedError<TInput>(
  ctx: RunContext,
  args: {
    phase: string;
    surface: Surface;
    step: string;
    tool: string;
    operation: Operation;
    input: TInput;
    expectedCode: string;
    allowStaleRetry?: boolean;
  }
): Promise<void> {
  const allowStaleRetry = args.allowStaleRetry !== false;
  const backendHint = ctx.health.routing.operationMap[args.operation] ?? undefined;
  const epochId = ctx.health.routing.epochId;
  const routingReason = ctx.health.routing.reasons[args.operation] ?? "unknown";

  const response = await callTool<TInput, unknown>(ctx.endpoint, ctx.token, {
    tool: args.tool,
    operation: args.operation,
    input: args.input,
    backendHint: backendHint ?? undefined,
    epochId,
  });

  zodParseWithDebug(raycastToolResultSchema, response.result, `raycastToolResultSchema:${args.phase}:${args.step}`);

  if (!response.result.ok && response.result.error.code === "BACKEND_SELECTION_STALE" && allowStaleRetry && args.expectedCode !== "BACKEND_SELECTION_STALE") {
    await refreshRoutingAfterStale(ctx, args.phase, args.step, args.operation, response as ToolCallResponse<unknown>);
    await callRoutedToolExpectedError(ctx, {
      ...args,
      step: `${args.step}_retry_after_stale`,
      allowStaleRetry: false,
    });
    return;
  }

  if (response.result.ok || response.result.error.code !== args.expectedCode) {
    failNow({
      phase: args.phase,
      surface: args.surface,
      step: args.step,
      transportMode: ctx.transportMode,
      backendUsed: response.result.meta.backendUsed ?? null,
      epochId: response.result.meta.epochId ?? null,
      routingReason,
      consistencyHint: response.result.meta.consistencyHint ?? null,
      message: `Expected error code ${args.expectedCode}.`,
      diagnostics: {
        statusCode: response.statusCode,
        result: response.result,
      },
    });
  }

  logStep({
    phase: args.phase,
    surface: args.surface,
    step: args.step,
    status: "success",
    backendUsed: response.result.meta.backendUsed ?? null,
    epochId: response.result.meta.epochId ?? null,
    routingReason,
    consistencyHint: response.result.meta.consistencyHint ?? null,
    transportMode: ctx.transportMode,
    diagnostics: {
      expectedErrorCode: args.expectedCode,
      statusCode: response.statusCode,
    },
  });
}

function recordMarkerKey(ctx: RunContext, notePath: string, key: string): void {
  const set = ctx.markerKeysByNote.get(notePath) ?? new Set<string>();
  set.add(key);
  ctx.markerKeysByNote.set(notePath, set);
}

function verifyDiskState(ctx: RunContext, phase: string, step: string, notePath: string, expectedIncludes: string[]): string {
  const noteAbsolute = resolveVaultAbsolute(ctx.vaultPath, notePath);
  if (!fs.existsSync(noteAbsolute)) {
    failNow({
      phase,
      surface: "CLI",
      step,
      transportMode: ctx.transportMode,
      message: `Expected note file to exist on disk: ${notePath}`,
    });
  }

  const raw = fs.readFileSync(noteAbsolute);
  const content = assertUtf8NoCrlf(raw, phase, step, ctx);

  for (const needle of expectedIncludes) {
    if (!content.includes(needle)) {
      failNow({
        phase,
        surface: "CLI",
        step,
        transportMode: ctx.transportMode,
        message: `Expected note content missing segment: ${needle}`,
        diagnostics: {
          notePath,
        },
      });
    }
  }

  const keys = ctx.markerKeysByNote.get(notePath) ?? new Set<string>();
  const markerCount = countMarkers(content, keys);
  if (markerCount !== keys.size) {
    failNow({
      phase,
      surface: "CLI",
      step,
      transportMode: ctx.transportMode,
      message: "Idempotency marker count mismatch in disk verification.",
      diagnostics: {
        notePath,
        expected: keys.size,
        actual: markerCount,
      },
    });
  }

  for (const key of keys) {
    const occurrences = [...content.matchAll(markerRegexForKey(key))].length;
    if (occurrences !== 1) {
      failNow({
        phase,
        surface: "CLI",
        step,
        transportMode: ctx.transportMode,
        message: "Detected duplicate idempotency marker for key.",
        diagnostics: {
          notePath,
          key,
          occurrences,
        },
      });
    }
  }

  const sha256 = createHash("sha256").update(content, "utf8").digest("hex");

  logStep({
    phase,
    surface: "CLI",
    step,
    status: "success",
    backendUsed: "filesystem-verify",
    epochId: ctx.health.routing.epochId,
    routingReason: "disk_integrity",
    consistencyHint: "n/a",
    transportMode: ctx.transportMode,
    diagnostics: {
      notePath,
      markerCount,
      sha256,
    },
  });

  return content;
}

async function getMetrics(ctx: RunContext): Promise<MetricsSnapshot> {
  const response = await request(ctx.endpoint, "GET", "/metrics", {}, undefined);
  if (response.statusCode !== 200) {
    throw new Error(`Metrics endpoint failed with ${response.statusCode}: ${response.bodyText}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(response.bodyText);
  } catch (error) {
    throw new Error(`Failed to parse metrics JSON: ${String(error)} body=${response.bodyText}`);
  }

  return zodParseWithDebug(metricsSchema, parsed, "metricsSchema:getMetrics");
}

async function getMetricsOptional(
  ctx: RunContext,
  phase: string,
  step: string
): Promise<MetricsSnapshot | null> {
  const response = await request(ctx.endpoint, "GET", "/metrics", {}, undefined);
  const routeMissing = response.statusCode === 404 || /route not found/i.test(response.bodyText);

  if (routeMissing) {
    logStep({
      phase,
      surface: "MCP",
      step,
      status: "success",
      backendUsed: "metrics",
      epochId: ctx.health.routing.epochId,
      routingReason: "metrics_optional",
      consistencyHint: null,
      transportMode: ctx.transportMode,
      diagnostics: {
        skipped: true,
        reason: "metrics_endpoint_not_exposed",
        statusCode: response.statusCode,
      },
    });
    return null;
  }

  if (response.statusCode !== 200) {
    failNow({
      phase,
      surface: "MCP",
      step,
      transportMode: ctx.transportMode,
      message: "Metrics endpoint returned unexpected status.",
      diagnostics: {
        statusCode: response.statusCode,
        body: response.bodyText.slice(0, 1_000),
      },
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(response.bodyText);
  } catch (error) {
    failNow({
      phase,
      surface: "MCP",
      step,
      transportMode: ctx.transportMode,
      message: "Failed to parse /metrics JSON body.",
      diagnostics: {
        error: String(error instanceof Error ? error.message : error),
        bodyPreview: response.bodyText.slice(0, 1_000),
      },
    });
  }

  return zodParseWithDebug(metricsSchema, parsed, `metricsSchema:${phase}:${step}`);
}

function sumCountersByPrefix(counters: Record<string, number>, prefix: string): number {
  return Object.entries(counters)
    .filter(([name]) => name.startsWith(prefix))
    .reduce((acc, [, value]) => acc + value, 0);
}

function sumFailureCountersByCodePrefix(counters: Record<string, number>, codePrefix: string): number {
  return Object.entries(counters)
    .filter(([name]) => name.startsWith("failures_total") && name.includes(`code=${codePrefix}`))
    .reduce((acc, [, value]) => acc + value, 0);
}

function routingReason(ctx: RunContext, operation: Operation): string {
  return ctx.health.routing.reasons[operation] ?? "unknown";
}

async function assertRoutingStable(ctx: RunContext, phase: string, step: string): Promise<void> {
  const current = await callHealth(ctx, phase, "MCP", step);
  const changed = diffOperationMap(ctx.baselineRoutingMap, current.routing.operationMap);
  if (Object.keys(changed).length > 0) {
    failNow({
      phase,
      surface: "MCP",
      step,
      transportMode: ctx.transportMode,
      backendUsed: "health",
      epochId: current.routing.epochId,
      routingReason: "routing_stability",
      consistencyHint: null,
      message: "routing.operationMap changed unexpectedly.",
      diagnostics: {
        baselineEpochId: ctx.baselineEpochId,
        currentEpochId: current.routing.epochId,
        changed,
      },
    });
  }
}

async function preflightCli(ctx: Omit<RunContext, "health" | "baselineRoutingMap" | "baselineEpochId" | "baselineMetrics">): Promise<void> {
  const phase = "PHASE_0_CLI_PREFLIGHT";
  const runtime = buildCliRuntime(ctx.cliBin, process.env);
  ctx.cliBin = resolveCliBinaryPath(ctx.cliBin, runtime.env);
  ctx.cliRuntime = buildCliRuntime(ctx.cliBin, process.env);
  const directCliIdentity = resolveCliIdentity(process.env);

  logStep({
    phase,
    surface: "CLI",
    step: "cli_environment",
    status: "success",
    backendUsed: "cli-direct",
    epochId: null,
    routingReason: "preflight",
    consistencyHint: null,
    transportMode: ctx.transportMode,
    diagnostics: directCliIdentity,
  });

  let version: Awaited<ReturnType<typeof detectCliVersion>>;
  try {
    version = await detectCliVersion(ctx);
  } catch (error) {
    failNow({
      phase,
      surface: "CLI",
      step: "cli_version",
      transportMode: ctx.transportMode,
      message: "Unable to parse semantic version from CLI output.",
      diagnostics: {
        error: String(error instanceof Error ? error.message : error),
      },
    });
  }

  if (!isSemverAtLeast(version.parsedVersion, MIN_CLI_VERSION)) {
    failNow({
      phase,
      surface: "CLI",
      step: "cli_version",
      transportMode: ctx.transportMode,
      message: `Obsidian CLI version ${version.parsedVersion.join(".")} is below required ${MIN_CLI_VERSION.join(".")}.`,
      diagnostics: {
        sourceCommand: version.sourceCommand,
        outputPreview: version.output.slice(0, 400),
        attempts: version.diagnostics,
      },
    });
  }

  logStep({
    phase,
    surface: "CLI",
    step: "cli_version",
    status: "success",
    backendUsed: "cli-direct",
    epochId: null,
    routingReason: "preflight",
    consistencyHint: null,
    transportMode: ctx.transportMode,
    diagnostics: {
      version: version.parsedVersion.join("."),
      sourceCommand: version.sourceCommand,
    },
  });

  await ensureCliReadiness(ctx, phase, "cli_readiness");

  const runningBeforeHelp = await isObsidianRunning();
  let helpResult:
    | {
        stdout: string;
        stderr: string;
        code: number;
        durationMs: number;
        mode: string;
      }
    | null = null;
  let helpError: Error | null = null;
  try {
    const probe = await runCliProbeCommand(getCliRuntime(ctx), ["help"], resolvePureProbeTimeoutMs(CLI_LAUNCH_TIMEOUT_MS));
    helpResult = {
      stdout: probe.result.stdout,
      stderr: probe.result.stderr,
      code: probe.result.statusCode,
      durationMs: probe.result.durationMs,
      mode: probe.mode,
    };
  } catch (error) {
    helpError = error instanceof Error ? error : new Error(String(error));
  }
  const runningAfterHelp = await isObsidianRunning();
  const helpText = helpResult ? `${helpResult.stdout}\n${helpResult.stderr}` : "";
  ctx.helpText = helpText;

  const helpWarnings: string[] = [];
  let missingHelpMarkers: string[] = [];
  if (helpError) {
    helpWarnings.push("HELP_PROBE_FAILED");
  } else if (helpResult) {
    if (helpResult.code !== 0) {
      helpWarnings.push("HELP_EXIT_NONZERO");
    }
    if (helpResult.durationMs > 3_000) {
      helpWarnings.push("HELP_SLOW");
    }
    if (!runningBeforeHelp && runningAfterHelp) {
      helpWarnings.push("HELP_LAUNCHED_GUI");
    }

    const stderrLooksLikeError = /\b(error|failed|invalid|unknown|not found|exception)\b/i.test(helpResult.stderr);
    if (stderrLooksLikeError) {
      helpWarnings.push("HELP_STDERR_ERROR_TEXT");
    }

    const guiIndicators = [/loading updated app package/i, /installer is out of date/i];
    const indicatorHits = guiIndicators.filter((pattern) => pattern.test(helpText)).map((pattern) => pattern.toString());
    if (indicatorHits.length > 0) {
      helpWarnings.push("HELP_GUI_INDICATORS");
    }

    if (helpResult.stdout.trim()) {
      const helpChecks = [/usage\s*:/i, /command/i];
      missingHelpMarkers = helpChecks.filter((pattern) => !pattern.test(helpResult.stdout)).map((pattern) => pattern.toString());
      if (missingHelpMarkers.length > 0) {
        helpWarnings.push("HELP_USAGE_MARKERS_MISSING");
      }
    }
  }

  if (helpError || !helpResult || helpResult.code !== 0 || !helpResult.stdout.trim() || missingHelpMarkers.length > 0) {
    failNow({
      phase,
      surface: "CLI",
      step: "cli_help",
      transportMode: ctx.transportMode,
      message: "Raw direct CLI help did not complete successfully.",
      diagnostics: {
        code: helpResult?.code ?? null,
        durationMs: helpResult?.durationMs ?? null,
        runningBeforeHelp,
        runningAfterHelp,
        warnings: helpWarnings,
        missingHelpMarkers,
        error: helpError ? String(helpError.message) : null,
        stdoutPreview: helpResult?.stdout.slice(0, 400) ?? "",
        stderrPreview: helpResult?.stderr.slice(0, 400) ?? "",
      },
    });
  }

  logStep({
    phase,
    surface: "CLI",
    step: "cli_help",
    status: "success",
    backendUsed: "cli-direct",
    epochId: null,
    routingReason: "preflight",
    consistencyHint: null,
    transportMode: ctx.transportMode,
    diagnostics: {
      code: helpResult?.code ?? null,
      durationMs: helpResult?.durationMs ?? null,
      stdoutEmpty: helpResult ? helpResult.stdout.trim().length === 0 : true,
      runningBeforeHelp,
      runningAfterHelp,
      warnings: helpWarnings,
      error: helpError ? String(helpError) : null,
      mode: helpResult?.mode ?? null,
    },
  });

  let vaultsResult:
    | {
        stdout: string;
        stderr: string;
        code: number;
        durationMs: number;
        mode: string;
      }
    | null = null;
  try {
    const probe = await runCliProbeCommand(getCliRuntime(ctx), ["vaults", "verbose"], resolvePureProbeTimeoutMs(CLI_LAUNCH_TIMEOUT_MS));
    vaultsResult = {
      stdout: probe.result.stdout,
      stderr: probe.result.stderr,
      code: probe.result.statusCode,
      durationMs: probe.result.durationMs,
      mode: probe.mode,
    };
  } catch (error) {
    failNow({
      phase,
      surface: "CLI",
      step: "cli_vault_registration",
      transportMode: ctx.transportMode,
      message: "Failed to verify raw direct CLI vault registration.",
      diagnostics: {
        error: String(error instanceof Error ? error.message : error),
      },
    });
  }

  const registeredVaultsOutput = `${vaultsResult.stdout}\n${vaultsResult.stderr}`.trim();
  const registeredVaults = parseCliVaultList(registeredVaultsOutput);
  const matchedVault = registeredVaults.find((entry) => entry.name === ctx.vaultName);
  if (!matchedVault) {
    failNow({
      phase,
      surface: "CLI",
      step: "cli_vault_registration",
      transportMode: ctx.transportMode,
      message: "Required vault is not registered with raw direct Obsidian CLI.",
      diagnostics: {
        requiredVaultName: ctx.vaultName,
        outputPreview: registeredVaultsOutput.slice(0, 400),
        registeredVaults,
      },
    });
  }

  const pathMatches =
    !matchedVault.path || path.resolve(matchedVault.path) === path.resolve(ctx.vaultPath);
  if (!pathMatches) {
    failNow({
      phase,
      surface: "CLI",
      step: "cli_vault_registration",
      transportMode: ctx.transportMode,
      message: "Raw direct Obsidian CLI registered the required vault name to a different path.",
      diagnostics: {
        requiredVaultName: ctx.vaultName,
        expectedVaultPath: ctx.vaultPath,
        registeredVault: matchedVault,
      },
    });
  }

  logStep({
    phase,
    surface: "CLI",
    step: "cli_vault_registration",
    status: "success",
    backendUsed: "cli-direct",
    epochId: null,
    routingReason: "preflight",
    consistencyHint: null,
    transportMode: ctx.transportMode,
    diagnostics: {
      requiredVaultName: ctx.vaultName,
      expectedVaultPath: ctx.vaultPath,
      registeredVault: matchedVault,
      registeredVaultCount: registeredVaults.length,
      mode: vaultsResult.mode,
    },
  });
}

async function phase1DirectCliBaseline(ctx: RunContext): Promise<{ baselineNotePath: string }> {
  const phase = "PHASE_1_DIRECT_CLI";
  const baselineNotePath = `${ctx.runRoot}/baseline-note.md`;

  ensureRunRootDirectory(ctx, phase, "ensure_parent_directory");

  const createArgs = buildArgs("create_note", {
    vault: ctx.vaultName,
    path: baselineNotePath,
    content: "CLI baseline start",
    overwrite: true,
  });
  await runCliAppCommand(ctx, phase, "create_note_cli", createArgs, 25_000);

  logStep({
    phase,
    surface: "CLI",
    step: "create_note_cli",
    status: "success",
    backendUsed: "cli-direct",
    epochId: null,
    routingReason: "direct_cli",
    consistencyHint: null,
    transportMode: ctx.transportMode,
    diagnostics: {
      notePath: baselineNotePath,
      args: createArgs,
    },
  });

  await verifyCliCreatePersistence(ctx, phase, baselineNotePath, "CLI baseline start");

  const appendArgs = buildArgs("append_note", {
    vault: ctx.vaultName,
    path: baselineNotePath,
    content: "CLI baseline append",
  });
  await runCliAppCommand(ctx, phase, "append_note_cli", appendArgs, 25_000);

  logStep({
    phase,
    surface: "CLI",
    step: "append_note_cli",
    status: "success",
    backendUsed: "cli-direct",
    epochId: null,
    routingReason: "direct_cli",
    consistencyHint: null,
    transportMode: ctx.transportMode,
    diagnostics: {
      notePath: baselineNotePath,
      args: appendArgs,
    },
  });

  verifyDiskState(ctx, phase, "read_disk_baseline", baselineNotePath, ["CLI baseline start", "CLI baseline append"]);

  const searchSupported = /\bsearch\b/i.test(ctx.helpText);
  if (!searchSupported) {
    logStep({
      phase,
      surface: "CLI",
      step: "search_cli",
      status: "success",
      backendUsed: "cli-direct",
      epochId: null,
      routingReason: "direct_cli",
      consistencyHint: null,
      transportMode: ctx.transportMode,
      diagnostics: {
        skipped: true,
        reason: "CLI help output does not advertise search command.",
      },
    });
    return { baselineNotePath };
  }

  const searchArgs = buildArgs("search_notes", {
    vault: ctx.vaultName,
    query: "CLI baseline append",
    path: ctx.runRoot,
    limit: 50,
    format: "json",
  });
  const searchResult = await runCliAppCommand(ctx, phase, "search_cli", searchArgs, 25_000, true);
  if (searchResult.code !== 0) {
    failNow({
      phase,
      surface: "CLI",
      step: "search_cli",
      transportMode: ctx.transportMode,
      message: "CLI search returned non-zero exit code.",
      diagnostics: {
        code: searchResult.code,
        stdout: searchResult.stdout,
        stderr: searchResult.stderr,
      },
    });
  }

  const searchText = `${searchResult.stdout}\n${searchResult.stderr}`.trim();
  const searchHit =
    searchText.includes(baselineNotePath) || searchText.includes(path.basename(baselineNotePath));

  if (!searchHit) {
    failNow({
      phase,
      surface: "CLI",
      step: "search_cli",
      transportMode: ctx.transportMode,
      message: "CLI search output did not contain expected note path text.",
      diagnostics: {
        baselineNotePath,
        outputPreview: searchText.slice(0, 1_000),
      },
    });
  }

  logStep({
    phase,
    surface: "CLI",
    step: "search_cli",
    status: "success",
    backendUsed: "cli-direct",
    epochId: null,
    routingReason: "direct_cli",
    consistencyHint: null,
    transportMode: ctx.transportMode,
    diagnostics: {
      outputLength: searchText.length,
      outputPreview: searchText.slice(0, 500),
    },
  });

  return { baselineNotePath };
}

async function phase2McpValidation(ctx: RunContext): Promise<void> {
  const phase = "PHASE_2_MCP";
  ensureRunRootDirectory(ctx, phase, "ensure_parent_directory");

  const health = await callHealth(ctx, phase, "MCP", "obsidian_health");
  if (health.backends.cli.capabilities.available !== true) {
    failNow({
      phase,
      surface: "MCP",
      step: "obsidian_health",
      transportMode: ctx.transportMode,
      backendUsed: "health",
      epochId: health.routing.epochId,
      routingReason: "health",
      consistencyHint: null,
      message: "CLI backend is unavailable.",
      diagnostics: {
        backends: health.backends,
      },
    });
  }

  if (health.routing.operationMap.open_vault !== "cli") {
    failNow({
      phase,
      surface: "MCP",
      step: "obsidian_health",
      transportMode: ctx.transportMode,
      backendUsed: "health",
      epochId: health.routing.epochId,
      routingReason: "health",
      consistencyHint: null,
      message: "open_vault is not routed to cli.",
      diagnostics: {
        operationMap: health.routing.operationMap,
      },
    });
  }

  const requiredOps: Operation[] = ["open_vault", "create_note", "append_note", "read_note", "search_notes", "execute_command"];
  const missingOps = requiredOps.filter((operation) => !(operation in health.routing.operationMap));
  if (missingOps.length > 0) {
    failNow({
      phase,
      surface: "MCP",
      step: "obsidian_health",
      transportMode: ctx.transportMode,
      message: "routing.operationMap is missing required operations.",
      diagnostics: {
        missingOps,
        operationMap: health.routing.operationMap,
      },
    });
  }

  if (!Number.isInteger(health.routing.epochId)) {
    failNow({
      phase,
      surface: "MCP",
      step: "obsidian_health",
      transportMode: ctx.transportMode,
      message: "routing.epochId is not an integer.",
      diagnostics: {
        epochId: health.routing.epochId,
      },
    });
  }

  if (health.security.tokenEntropyBits < 128) {
    failNow({
      phase,
      surface: "MCP",
      step: "obsidian_health",
      transportMode: ctx.transportMode,
      message: "tokenEntropyBits is below 128.",
      diagnostics: {
        tokenEntropyBits: health.security.tokenEntropyBits,
      },
    });
  }

  ctx.baselineRoutingMap = normalizeOperationMap(health.routing.operationMap);
  ctx.baselineEpochId = health.routing.epochId;

  await callRoutedToolSuccess(ctx, {
    phase,
    surface: "MCP",
    step: "open_vault",
    tool: "obsidian_open_vault",
    operation: "open_vault",
    input: {
      vault: ctx.vaultName,
      path: `${ctx.runRoot}/baseline-note.md`,
    },
    outputSchema: openVaultDataSchema,
  });

  for (let i = 0; i < 3; i += 1) {
    await assertRoutingStable(ctx, phase, `routing_stability_check_${i + 1}`);
  }

  const baselineMetrics = await getMetricsOptional(ctx, phase, "baseline_metrics");
  ctx.baselineMetrics = baselineMetrics;

  if (baselineMetrics) {
    logStep({
      phase,
      surface: "MCP",
      step: "baseline_metrics",
      status: "success",
      backendUsed: "metrics",
      epochId: ctx.health.routing.epochId,
      routingReason: "metrics",
      consistencyHint: null,
      transportMode: ctx.transportMode,
      diagnostics: baselineMetrics,
    });
  }

  const wrongToken = await callTool<{}, unknown>(
    ctx.endpoint,
    ctx.token,
    {
      tool: "obsidian_health",
      operation: "read_note",
      input: {},
    },
    {
      token: `${ctx.token}-invalid`,
    }
  );

  if (wrongToken.statusCode !== 401 || wrongToken.result.ok || wrongToken.result.error.code !== "AUTH_INVALID") {
    failNow({
      phase,
      surface: "MCP",
      step: "auth_wrong_token",
      transportMode: ctx.transportMode,
      message: "Wrong token auth validation failed.",
      diagnostics: {
        statusCode: wrongToken.statusCode,
        result: wrongToken.result,
      },
    });
  }

  logStep({
    phase,
    surface: "MCP",
    step: "auth_wrong_token",
    status: "success",
    backendUsed: wrongToken.result.meta.backendUsed ?? null,
    epochId: wrongToken.result.meta.epochId ?? null,
    routingReason: "auth",
    consistencyHint: wrongToken.result.meta.consistencyHint ?? null,
    transportMode: ctx.transportMode,
  });

  const replayPayload = {
    tool: "obsidian_health",
    operation: "read_note" as const,
    input: {},
  };
  const replayNonce = randomUUID();
  const replayTimestamp = Date.now();

  const replayFirst = await callTool(ctx.endpoint, ctx.token, replayPayload, {
    nonce: replayNonce,
    timestampMs: replayTimestamp,
  });
  if (!replayFirst.result.ok) {
    failNow({
      phase,
      surface: "MCP",
      step: "auth_replay_seed",
      transportMode: ctx.transportMode,
      message: "Replay seed request unexpectedly failed.",
      diagnostics: replayFirst,
    });
  }

  logStep({
    phase,
    surface: "MCP",
    step: "auth_replay_seed",
    status: "success",
    backendUsed: replayFirst.result.meta.backendUsed ?? null,
    epochId: replayFirst.result.meta.epochId ?? null,
    routingReason: "auth",
    consistencyHint: replayFirst.result.meta.consistencyHint ?? null,
    transportMode: ctx.transportMode,
  });

  const replaySecond = await callTool(ctx.endpoint, ctx.token, replayPayload, {
    nonce: replayNonce,
    timestampMs: replayTimestamp,
  });

  if (replaySecond.statusCode !== 401 || replaySecond.result.ok || replaySecond.result.error.code !== "AUTH_REPLAY_DETECTED") {
    failNow({
      phase,
      surface: "MCP",
      step: "auth_replay_reject",
      transportMode: ctx.transportMode,
      message: "Replay attack was not rejected.",
      diagnostics: replaySecond,
    });
  }

  logStep({
    phase,
    surface: "MCP",
    step: "auth_replay_reject",
    status: "success",
    backendUsed: replaySecond.result.meta.backendUsed ?? null,
    epochId: replaySecond.result.meta.epochId ?? null,
    routingReason: "auth",
    consistencyHint: replaySecond.result.meta.consistencyHint ?? null,
    transportMode: ctx.transportMode,
  });

  const staleTimestamp = await callTool(ctx.endpoint, ctx.token, replayPayload, {
    timestampMs: Date.now() - 5 * 60_000,
  });

  if (staleTimestamp.statusCode !== 401 || staleTimestamp.result.ok || staleTimestamp.result.error.code !== "AUTH_TIMESTAMP_INVALID") {
    failNow({
      phase,
      surface: "MCP",
      step: "auth_invalid_timestamp",
      transportMode: ctx.transportMode,
      message: "Invalid timestamp was not rejected.",
      diagnostics: staleTimestamp,
    });
  }

  logStep({
    phase,
    surface: "MCP",
    step: "auth_invalid_timestamp",
    status: "success",
    backendUsed: staleTimestamp.result.meta.backendUsed ?? null,
    epochId: staleTimestamp.result.meta.epochId ?? null,
    routingReason: "auth",
    consistencyHint: staleTimestamp.result.meta.consistencyHint ?? null,
    transportMode: ctx.transportMode,
  });

  const badBodyHash = await callTool(ctx.endpoint, ctx.token, replayPayload, {
    bodyHash: "0".repeat(64),
  });

  if (badBodyHash.statusCode !== 401 || badBodyHash.result.ok || badBodyHash.result.error.code !== "AUTH_REPLAY_DETECTED") {
    failNow({
      phase,
      surface: "MCP",
      step: "auth_invalid_body_hash",
      transportMode: ctx.transportMode,
      message: "Invalid body hash was not rejected.",
      diagnostics: badBodyHash,
    });
  }

  logStep({
    phase,
    surface: "MCP",
    step: "auth_invalid_body_hash",
    status: "success",
    backendUsed: badBodyHash.result.meta.backendUsed ?? null,
    epochId: badBodyHash.result.meta.epochId ?? null,
    routingReason: "auth",
    consistencyHint: badBodyHash.result.meta.consistencyHint ?? null,
    transportMode: ctx.transportMode,
  });
}

async function phase3ExecuteCommandValidation(ctx: RunContext): Promise<void> {
  const phase = "PHASE_3_EXECUTE_COMMAND";
  const commandId = executeCommandId();

  const result = await callRoutedToolSuccess(ctx, {
    phase,
    surface: "MCP",
    step: "execute_command",
    tool: "obsidian_execute_command",
    operation: "execute_command",
    input: {
      vault: ctx.vaultName,
      id: commandId,
    },
    outputSchema: executeCommandDataSchema,
  });

  if (result.data.executed !== true || result.data.id !== commandId) {
    failNow({
      phase,
      surface: "MCP",
      step: "execute_command",
      transportMode: ctx.transportMode,
      backendUsed: result.meta.backendUsed ?? null,
      epochId: result.meta.epochId ?? null,
      routingReason: routingReason(ctx, "execute_command"),
      consistencyHint: result.meta.consistencyHint ?? null,
      message: "execute_command result payload did not match expectation.",
      diagnostics: {
        expectedCommandId: commandId,
        result: result.data,
      },
    });
  }
}

async function phase3CliMcpParity(ctx: RunContext): Promise<{ parityNotePath: string }> {
  const phase = "PHASE_3_CLI_MCP_PARITY";
  const parityNotePath = `${ctx.runRoot}/parity-note.md`;

  ensureRunRootDirectory(ctx, phase, "ensure_parent_directory");

  await runCliAppCommand(
    ctx,
    phase,
    "create_note_cli",
    buildArgs("create_note", {
      vault: ctx.vaultName,
      path: parityNotePath,
      content: "CLI parity start",
      overwrite: true,
    }),
    25_000
  );

  logStep({
    phase,
    surface: "CLI",
    step: "create_note_cli",
    status: "success",
    backendUsed: "cli-direct",
    epochId: null,
    routingReason: "direct_cli",
    consistencyHint: null,
    transportMode: ctx.transportMode,
    diagnostics: {
      notePath: parityNotePath,
    },
  });

  await verifyCliCreatePersistence(ctx, phase, parityNotePath, "CLI parity start");

  const readViaMcp = await callRoutedToolSuccess(ctx, {
    phase,
    surface: "MCP",
    step: "read_note_mcp",
    tool: "obsidian_read_note",
    operation: "read_note",
    input: {
      vault: ctx.vaultName,
      vaultRoot: ctx.vaultPath,
      path: parityNotePath,
    },
    outputSchema: readNoteDataSchema,
  });

  if (!readViaMcp.data.content.includes("CLI parity start")) {
    failNow({
      phase,
      surface: "MCP",
      step: "read_note_mcp",
      transportMode: ctx.transportMode,
      backendUsed: readViaMcp.meta.backendUsed ?? null,
      epochId: readViaMcp.meta.epochId ?? null,
      routingReason: routingReason(ctx, "read_note"),
      consistencyHint: readViaMcp.meta.consistencyHint ?? null,
      message: "MCP read did not return CLI-created content.",
    });
  }

  const mcpAppendKey = randomUUID();
  recordMarkerKey(ctx, parityNotePath, mcpAppendKey);
  await callRoutedToolSuccess(ctx, {
    phase,
    surface: "MCP",
    step: "append_note_mcp",
    tool: "obsidian_append_note",
    operation: "append_note",
    input: {
      vault: ctx.vaultName,
      vaultRoot: ctx.vaultPath,
      path: parityNotePath,
      content: "MCP parity append",
      idempotencyKey: mcpAppendKey,
    },
    outputSchema: appendNoteDataSchema,
  });

  const cliRead = await runCliAppCommand(
    ctx,
    phase,
    "read_note_cli",
    buildArgs("read_note", {
      vault: ctx.vaultName,
      path: parityNotePath,
    }),
    25_000
  );

  if (!cliRead.stdout.includes("MCP parity append")) {
    failNow({
      phase,
      surface: "CLI",
      step: "read_note_cli",
      transportMode: ctx.transportMode,
      message: "CLI read did not include MCP append content.",
      diagnostics: {
        stdoutPreview: cliRead.stdout.slice(-500),
      },
    });
  }

  logStep({
    phase,
    surface: "CLI",
    step: "read_note_cli",
    status: "success",
    backendUsed: "cli-direct",
    epochId: null,
    routingReason: "direct_cli",
    consistencyHint: null,
    transportMode: ctx.transportMode,
  });

  await runCliAppCommand(
    ctx,
    phase,
    "append_note_cli",
    buildArgs("append_note", {
      vault: ctx.vaultName,
      path: parityNotePath,
      content: "CLI parity append",
    }),
    25_000
  );

  logStep({
    phase,
    surface: "CLI",
    step: "append_note_cli",
    status: "success",
    backendUsed: "cli-direct",
    epochId: null,
    routingReason: "direct_cli",
    consistencyHint: null,
    transportMode: ctx.transportMode,
  });

  const finalRead = await callRoutedToolSuccess(ctx, {
    phase,
    surface: "MCP",
    step: "read_note_mcp_after_cli",
    tool: "obsidian_read_note",
    operation: "read_note",
    input: {
      vault: ctx.vaultName,
      vaultRoot: ctx.vaultPath,
      path: parityNotePath,
    },
    outputSchema: readNoteDataSchema,
  });

  if (!finalRead.data.content.includes("CLI parity append") || !finalRead.data.content.includes("MCP parity append")) {
    failNow({
      phase,
      surface: "MCP",
      step: "read_note_mcp_after_cli",
      transportMode: ctx.transportMode,
      backendUsed: finalRead.meta.backendUsed ?? null,
      epochId: finalRead.meta.epochId ?? null,
      routingReason: routingReason(ctx, "read_note"),
      consistencyHint: finalRead.meta.consistencyHint ?? null,
      message: "Parity content mismatch between CLI and MCP.",
    });
  }

  if (!readViaMcp.data.revision || !finalRead.data.revision || readViaMcp.data.revision === finalRead.data.revision) {
    failNow({
      phase,
      surface: "MCP",
      step: "revision_progression",
      transportMode: ctx.transportMode,
      backendUsed: finalRead.meta.backendUsed ?? null,
      epochId: finalRead.meta.epochId ?? null,
      routingReason: routingReason(ctx, "read_note"),
      consistencyHint: finalRead.meta.consistencyHint ?? null,
      message: "Revision did not advance across parity writes.",
      diagnostics: {
        before: readViaMcp.data.revision,
        after: finalRead.data.revision,
      },
    });
  }

  verifyDiskState(ctx, phase, "disk_verification", parityNotePath, ["CLI parity start", "MCP parity append", "CLI parity append"]);
  await assertRoutingStable(ctx, phase, "routing_stability_after_parity");

  return { parityNotePath };
}

async function phase4IdeSimulation(ctx: RunContext): Promise<{ ideNotePath: string }> {
  const phase = "PHASE_4_IDE_SIM";
  const ideNotePath = `${ctx.runRoot}/ide-sim-note.md`;

  await callRoutedToolSuccess(ctx, {
    phase,
    surface: "IDE",
    step: "create_note",
    tool: "obsidian_create_note",
    operation: "create_note",
    input: {
      vault: ctx.vaultName,
      vaultRoot: ctx.vaultPath,
      path: ideNotePath,
      content: "IDE simulation start",
      overwrite: true,
    },
    outputSchema: createNoteDataSchema,
  });

  const appendKey = randomUUID();
  recordMarkerKey(ctx, ideNotePath, appendKey);
  await callRoutedToolSuccess(ctx, {
    phase,
    surface: "IDE",
    step: "append_note",
    tool: "obsidian_append_note",
    operation: "append_note",
    input: {
      vault: ctx.vaultName,
      vaultRoot: ctx.vaultPath,
      path: ideNotePath,
      content: "IDE simulated append",
      idempotencyKey: appendKey,
    },
    outputSchema: appendNoteDataSchema,
  });

  const read = await callRoutedToolSuccess(ctx, {
    phase,
    surface: "IDE",
    step: "read_note",
    tool: "obsidian_read_note",
    operation: "read_note",
    input: {
      vault: ctx.vaultName,
      vaultRoot: ctx.vaultPath,
      path: ideNotePath,
    },
    outputSchema: readNoteDataSchema,
  });

  if (!read.data.content.includes("IDE simulated append")) {
    failNow({
      phase,
      surface: "IDE",
      step: "read_note",
      transportMode: ctx.transportMode,
      backendUsed: read.meta.backendUsed ?? null,
      epochId: read.meta.epochId ?? null,
      routingReason: routingReason(ctx, "read_note"),
      consistencyHint: read.meta.consistencyHint ?? null,
      message: "IDE read did not include appended content.",
    });
  }

  await callRoutedToolSuccess(ctx, {
    phase,
    surface: "IDE",
    step: "search_notes",
    tool: "obsidian_search_notes",
    operation: "search_notes",
    input: {
      vault: ctx.vaultName,
      query: "IDE simulated append",
      path: ctx.runRoot,
      limit: 25,
    },
    outputSchema: searchNotesDataSchema,
  });

  verifyDiskState(ctx, phase, "disk_verification", ideNotePath, ["IDE simulation start", "IDE simulated append"]);
  await assertRoutingStable(ctx, phase, "routing_stability_after_ide");

  return { ideNotePath };
}

async function phase5RaycastSimulation(ctx: RunContext): Promise<{ raycastNotePath: string }> {
  const phase = "PHASE_5_RAYCAST_SIM";
  const raycastNotePath = `${ctx.runRoot}/raycast-sim-note.md`;

  await callRoutedToolSuccess(ctx, {
    phase,
    surface: "RAYCAST",
    step: "create_note",
    tool: "obsidian_create_note",
    operation: "create_note",
    input: {
      vault: ctx.vaultName,
      vaultRoot: ctx.vaultPath,
      path: raycastNotePath,
      content: "Raycast simulation start",
      overwrite: true,
    },
    outputSchema: createNoteDataSchema,
  });

  const appendKey = randomUUID();
  recordMarkerKey(ctx, raycastNotePath, appendKey);
  await callRoutedToolSuccess(ctx, {
    phase,
    surface: "RAYCAST",
    step: "append_note",
    tool: "obsidian_append_note",
    operation: "append_note",
    input: {
      vault: ctx.vaultName,
      vaultRoot: ctx.vaultPath,
      path: raycastNotePath,
      content: "Raycast simulated append",
      idempotencyKey: appendKey,
    },
    outputSchema: appendNoteDataSchema,
  });

  await callRoutedToolSuccess(ctx, {
    phase,
    surface: "RAYCAST",
    step: "read_note",
    tool: "obsidian_read_note",
    operation: "read_note",
    input: {
      vault: ctx.vaultName,
      vaultRoot: ctx.vaultPath,
      path: raycastNotePath,
    },
    outputSchema: readNoteDataSchema,
  });

  await callRoutedToolSuccess(ctx, {
    phase,
    surface: "RAYCAST",
    step: "search_notes",
    tool: "obsidian_search_notes",
    operation: "search_notes",
    input: {
      vault: ctx.vaultName,
      query: "Raycast simulated append",
      path: ctx.runRoot,
      limit: 25,
    },
    outputSchema: searchNotesDataSchema,
  });

  await callRoutedToolExpectedError(ctx, {
    phase,
    surface: "RAYCAST",
    step: "append_missing_idempotency_key",
    tool: "obsidian_append_note",
    operation: "append_note",
    input: {
      vault: ctx.vaultName,
      vaultRoot: ctx.vaultPath,
      path: raycastNotePath,
      content: "Invalid append without idempotency key",
    },
    expectedCode: "IDEMPOTENCY_KEY_REQUIRED_FOR_RETRY",
  });

  verifyDiskState(ctx, phase, "disk_verification", raycastNotePath, ["Raycast simulation start", "Raycast simulated append"]);
  await assertRoutingStable(ctx, phase, "routing_stability_after_raycast");

  return { raycastNotePath };
}

async function phase6CrossSurfaceConsistency(ctx: RunContext, parityNotePath: string): Promise<void> {
  const phase = "PHASE_6_CROSS_SURFACE";

  const staleRead = await callRoutedToolSuccess(ctx, {
    phase,
    surface: "IDE",
    step: "capture_stale_revision",
    tool: "obsidian_read_note",
    operation: "read_note",
    input: {
      vault: ctx.vaultName,
      vaultRoot: ctx.vaultPath,
      path: parityNotePath,
    },
    outputSchema: readNoteDataSchema,
  });

  if (!staleRead.data.revision) {
    failNow({
      phase,
      surface: "IDE",
      step: "capture_stale_revision",
      transportMode: ctx.transportMode,
      backendUsed: staleRead.meta.backendUsed ?? null,
      epochId: staleRead.meta.epochId ?? null,
      routingReason: routingReason(ctx, "read_note"),
      consistencyHint: staleRead.meta.consistencyHint ?? null,
      message: "read_note did not return a revision.",
    });
  }

  await runCliAppCommand(
    ctx,
    phase,
    "append_via_cli",
    buildArgs("append_note", {
      vault: ctx.vaultName,
      path: parityNotePath,
      content: "Cross-surface CLI append",
    }),
    25_000
  );

  logStep({
    phase,
    surface: "CLI",
    step: "append_via_cli",
    status: "success",
    backendUsed: "cli-direct",
    epochId: null,
    routingReason: "direct_cli",
    consistencyHint: null,
    transportMode: ctx.transportMode,
  });

  const mcpKey = randomUUID();
  recordMarkerKey(ctx, parityNotePath, mcpKey);
  await callRoutedToolSuccess(ctx, {
    phase,
    surface: "MCP",
    step: "append_via_mcp",
    tool: "obsidian_append_note",
    operation: "append_note",
    input: {
      vault: ctx.vaultName,
      vaultRoot: ctx.vaultPath,
      path: parityNotePath,
      content: "Cross-surface MCP append",
      idempotencyKey: mcpKey,
    },
    outputSchema: appendNoteDataSchema,
  });

  const rayRead = await callRoutedToolSuccess(ctx, {
    phase,
    surface: "RAYCAST",
    step: "read_via_raycast",
    tool: "obsidian_read_note",
    operation: "read_note",
    input: {
      vault: ctx.vaultName,
      vaultRoot: ctx.vaultPath,
      path: parityNotePath,
    },
    outputSchema: readNoteDataSchema,
  });

  if (!rayRead.data.content.includes("Cross-surface CLI append") || !rayRead.data.content.includes("Cross-surface MCP append")) {
    failNow({
      phase,
      surface: "RAYCAST",
      step: "read_via_raycast",
      transportMode: ctx.transportMode,
      backendUsed: rayRead.meta.backendUsed ?? null,
      epochId: rayRead.meta.epochId ?? null,
      routingReason: routingReason(ctx, "read_note"),
      consistencyHint: rayRead.meta.consistencyHint ?? null,
      message: "Cross-surface content mismatch.",
    });
  }

  await callRoutedToolExpectedError(ctx, {
    phase,
    surface: "IDE",
    step: "stale_revision_reject",
    tool: "obsidian_append_note",
    operation: "append_note",
    input: {
      vault: ctx.vaultName,
      vaultRoot: ctx.vaultPath,
      path: parityNotePath,
      content: "Stale revision append should fail",
      idempotencyKey: randomUUID(),
      expectedRevision: staleRead.data.revision,
    },
    expectedCode: "REVISION_CONFLICT",
  });

  const rayAppendKey = randomUUID();
  recordMarkerKey(ctx, parityNotePath, rayAppendKey);
  await callRoutedToolSuccess(ctx, {
    phase,
    surface: "RAYCAST",
    step: "append_via_raycast",
    tool: "obsidian_append_note",
    operation: "append_note",
    input: {
      vault: ctx.vaultName,
      vaultRoot: ctx.vaultPath,
      path: parityNotePath,
      content: "Cross-surface Raycast append",
      idempotencyKey: rayAppendKey,
    },
    outputSchema: appendNoteDataSchema,
  });

  verifyDiskState(ctx, phase, "disk_verification", parityNotePath, [
    "Cross-surface CLI append",
    "Cross-surface MCP append",
    "Cross-surface Raycast append",
  ]);

  await assertRoutingStable(ctx, phase, "routing_stability_after_cross_surface");
}

async function phase7RoutingAndHysteresis(ctx: RunContext, notePath: string, searchQuery: string): Promise<void> {
  const phase = "PHASE_7_ROUTING_HYSTERESIS";

  for (let i = 0; i < 6; i += 1) {
    await callRoutedToolSuccess(ctx, {
      phase,
      surface: "IDE",
      step: `read_probe_${i + 1}`,
      tool: "obsidian_read_note",
      operation: "read_note",
      input: {
        vault: ctx.vaultName,
        vaultRoot: ctx.vaultPath,
        path: notePath,
      },
      outputSchema: readNoteDataSchema,
    });

    await callRoutedToolSuccess(ctx, {
      phase,
      surface: "RAYCAST",
      step: `search_probe_${i + 1}`,
      tool: "obsidian_search_notes",
      operation: "search_notes",
      input: {
        vault: ctx.vaultName,
        query: searchQuery,
        path: ctx.runRoot,
        limit: 20,
      },
      outputSchema: searchNotesDataSchema,
    });

    const fresh = await callHealth(ctx, phase, "MCP", `health_probe_${i + 1}`);
    const changed = diffOperationMap(ctx.baselineRoutingMap, fresh.routing.operationMap);
    if (Object.keys(changed).length > 0) {
      failNow({
        phase,
        surface: "MCP",
        step: `health_probe_${i + 1}`,
        transportMode: ctx.transportMode,
        backendUsed: "health",
        epochId: fresh.routing.epochId,
        routingReason: "routing_stability",
        consistencyHint: null,
        message: "routing.operationMap flipped unexpectedly during stability probes.",
        diagnostics: {
          changed,
          baselineEpochId: ctx.baselineEpochId,
          currentEpochId: fresh.routing.epochId,
        },
      });
    }
  }
}

async function phase8MetricsValidation(ctx: RunContext): Promise<void> {
  const phase = "PHASE_8_METRICS";
  const metrics = await getMetricsOptional(ctx, phase, "metrics_fetch");

  if (!metrics || !ctx.baselineMetrics) {
    logStep({
      phase,
      surface: "MCP",
      step: "metrics_validation",
      status: "success",
      backendUsed: "metrics",
      epochId: ctx.health.routing.epochId,
      routingReason: "metrics_optional",
      consistencyHint: null,
      transportMode: ctx.transportMode,
      diagnostics: {
        skipped: true,
        reason: "metrics_endpoint_not_exposed",
      },
    });
    return;
  }

  const baselineRequests = sumCountersByPrefix(ctx.baselineMetrics.counters, "requests_total");
  const currentRequests = sumCountersByPrefix(metrics.counters, "requests_total");

  const baselineCliTimeoutFailures = sumFailureCountersByCodePrefix(ctx.baselineMetrics.counters, "CLI_TIMEOUT");
  const currentCliTimeoutFailures = sumFailureCountersByCodePrefix(metrics.counters, "CLI_TIMEOUT");

  const baselineAuthFailures = sumFailureCountersByCodePrefix(ctx.baselineMetrics.counters, "AUTH_");
  const currentAuthFailures = sumFailureCountersByCodePrefix(metrics.counters, "AUTH_");

  if (metrics.queue.depth !== 0) {
    failNow({
      phase,
      surface: "MCP",
      step: "queue_depth",
      transportMode: ctx.transportMode,
      message: "Queue depth is non-zero at end of run.",
      diagnostics: metrics.queue,
    });
  }

  if (metrics.errorRate1m >= 0.05) {
    failNow({
      phase,
      surface: "MCP",
      step: "failure_rate",
      transportMode: ctx.transportMode,
      message: "errorRate1m is above threshold (<5%).",
      diagnostics: {
        errorRate1m: metrics.errorRate1m,
      },
    });
  }

  if (currentRequests <= baselineRequests) {
    failNow({
      phase,
      surface: "MCP",
      step: "requests_total",
      transportMode: ctx.transportMode,
      message: "requests_total did not increase during validation.",
      diagnostics: {
        baselineRequests,
        currentRequests,
      },
    });
  }

  if (currentCliTimeoutFailures > baselineCliTimeoutFailures) {
    failNow({
      phase,
      surface: "MCP",
      step: "cli_timeout_spikes",
      transportMode: ctx.transportMode,
      message: "Detected CLI_TIMEOUT failures in metrics.",
      diagnostics: {
        baselineCliTimeoutFailures,
        currentCliTimeoutFailures,
      },
    });
  }

  if (currentAuthFailures > baselineAuthFailures) {
    failNow({
      phase,
      surface: "MCP",
      step: "auth_failures",
      transportMode: ctx.transportMode,
      message: "Detected AUTH_* failures recorded in metrics.",
      diagnostics: {
        baselineAuthFailures,
        currentAuthFailures,
      },
    });
  }

  logStep({
    phase,
    surface: "MCP",
    step: "metrics_validation",
    status: "success",
    backendUsed: "metrics",
    epochId: ctx.health.routing.epochId,
    routingReason: "metrics",
    consistencyHint: null,
    transportMode: ctx.transportMode,
    diagnostics: metrics,
  });
}

async function phase9Cleanup(ctx: RunContext): Promise<void> {
  const phase = "PHASE_9_CLEANUP";

  if (fs.existsSync(ctx.runRootAbsolute)) {
    fs.rmSync(ctx.runRootAbsolute, { recursive: true, force: true });
  }

  if (fs.existsSync(ctx.runRootAbsolute)) {
    failNow({
      phase,
      surface: "CLI",
      step: "remove_run_directory",
      transportMode: ctx.transportMode,
      message: "Failed to remove run directory.",
      diagnostics: {
        runRoot: ctx.runRoot,
      },
    });
  }

  const after = listTree(ctx.runBaseAbsolute);
  if (JSON.stringify(after) !== JSON.stringify(ctx.runBaseBefore)) {
    failNow({
      phase,
      surface: "CLI",
      step: "cleanup_verification",
      transportMode: ctx.transportMode,
      message: "cpbh-comm-cli-test tree changed outside expected cleanup.",
      diagnostics: {
        before: ctx.runBaseBefore,
        after,
      },
    });
  }

  logStep({
    phase,
    surface: "CLI",
    step: "cleanup_verification",
    status: "success",
    backendUsed: "filesystem-cleanup",
    epochId: ctx.health.routing.epochId,
    routingReason: "cleanup",
    consistencyHint: "n/a",
    transportMode: ctx.transportMode,
  });
}

async function main(): Promise<void> {
  if (process.env.OBSIDIAN_LIVE_TEST !== "1") {
    throw new Error("Abort: OBSIDIAN_LIVE_TEST must be exactly '1'.");
  }

  warningBanner();

  const vaultPath = ensureAbsolutePath(requireEnv("OBSIDIAN_LIVE_VAULT_PATH"), "OBSIDIAN_LIVE_VAULT_PATH");
  const cliBin = requireEnv("OBSIDIAN_LIVE_CLI_BIN");
  const token = requireEnv("OBSIDIAN_LIVE_MCP_TOKEN");
  const endpoint = parseEndpointFromEnv();
  const validationContract = parseValidationContract();

  if (!fs.existsSync(vaultPath) || !fs.statSync(vaultPath).isDirectory()) {
    throw new Error(`OBSIDIAN_LIVE_VAULT_PATH is not an existing directory: ${vaultPath}`);
  }

  const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
  const runRoot = `cpbh-comm-cli-test/${runId}`;
  const runRootAbsolute = resolveVaultAbsolute(vaultPath, runRoot);
  const runBaseAbsolute = resolveVaultAbsolute(vaultPath, "cpbh-comm-cli-test");
  const runBaseBefore = listTree(runBaseAbsolute);

  const ctxBase = {
    vaultPath,
    vaultName: (process.env.OBSIDIAN_LIVE_VAULT_NAME || path.basename(vaultPath)).trim(),
    cliBin,
    token,
    endpoint,
    transportMode: endpoint.mode,
    runId,
    runRoot,
    runRootAbsolute,
    runBaseAbsolute,
    runBaseBefore,
    markerKeysByNote: new Map<string, Set<string>>(),
    helpText: "",
  };

  if (validationContract === "full_direct_cli") {
    await preflightCli(ctxBase);
  } else {
    logStep({
      phase: "PHASE_0_CLI_PREFLIGHT",
      surface: "CLI",
      step: "direct_cli_preflight_skipped",
      status: "success",
      backendUsed: "skipped",
      epochId: null,
      routingReason: "bridge_contract",
      consistencyHint: null,
      transportMode: ctxBase.transportMode,
      diagnostics: {
        skipped: true,
        reason: "Raw direct CLI validation is outside the bridge-backed stable contract for this pass.",
      },
    });
  }

  const bootstrapHealth: HealthPayload = {
    backends: {
      cli: { capabilities: { available: false } },
    },
    routing: {
      epochId: 0,
      operationMap: {
        open_vault: null,
        create_note: null,
        append_note: null,
        read_note: null,
        search_notes: null,
        execute_command: null,
      },
      reasons: {
        open_vault: "bootstrap",
        create_note: "bootstrap",
        append_note: "bootstrap",
        read_note: "bootstrap",
        search_notes: "bootstrap",
        execute_command: "bootstrap",
      },
    },
    security: {
      transportMode: endpoint.mode,
      corsDisabled: true,
      replayGuardEnabled: true,
      tokenEntropyBits: 0,
    },
    metrics: {},
  };

  const ctx: RunContext = {
    ...ctxBase,
    health: bootstrapHealth,
    baselineRoutingMap: normalizeOperationMap(bootstrapHealth.routing.operationMap),
    baselineEpochId: 0,
    baselineMetrics: null,
  };

  await phase2McpValidation(ctx);
  await phase3ExecuteCommandValidation(ctx);
  let baselineNotePath: string | null = null;
  let parityNotePath: string | null = null;

  if (validationContract === "full_direct_cli") {
    const baseline = await phase1DirectCliBaseline(ctx);
    baselineNotePath = baseline.baselineNotePath;
    const parity = await phase3CliMcpParity(ctx);
    parityNotePath = parity.parityNotePath;
  }

  await phase4IdeSimulation(ctx);
  const { raycastNotePath } = await phase5RaycastSimulation(ctx);

  if (validationContract === "full_direct_cli" && parityNotePath) {
    await phase6CrossSurfaceConsistency(ctx, parityNotePath);
      await phase7RoutingAndHysteresis(ctx, parityNotePath, "Cross-surface");
  } else {
    logStep({
      phase: "PHASE_6_CROSS_SURFACE",
      surface: "CLI",
      step: "direct_cli_cross_surface_skipped",
      status: "success",
      backendUsed: "skipped",
      epochId: ctx.health.routing.epochId,
      routingReason: "bridge_contract",
      consistencyHint: null,
      transportMode: ctx.transportMode,
      diagnostics: {
        skipped: true,
        reason: "Direct CLI cross-surface checks are optional diagnostics outside the bridge-backed stable contract.",
      },
    });
    await phase7RoutingAndHysteresis(ctx, raycastNotePath, "Raycast simulated append");
  }

  await phase8MetricsValidation(ctx);
  await phase9Cleanup(ctx);

  logStep({
    phase: "SUMMARY",
    surface: "MCP",
    step: "communication_cli_validation_complete",
    status: "success",
    backendUsed: "summary",
    epochId: ctx.health.routing.epochId,
    routingReason: "complete",
    consistencyHint: "n/a",
    transportMode: ctx.transportMode,
    diagnostics: {
      runId: ctx.runId,
      runRoot: ctx.runRoot,
      baselineNotePath,
      parityNotePath,
      validationContract,
      executeCommandId: executeCommandId(),
      routedNotePath: raycastNotePath,
    },
  });
}

void main().catch((error) => {
  const endpoint = (() => {
    try {
      return parseEndpointFromEnv().mode;
    } catch {
      return "http" as TransportMode;
    }
  })();

  logStep({
    phase: "SUMMARY",
    surface: "MCP",
    step: "communication_cli_validation",
    status: "failure",
    backendUsed: null,
    epochId: null,
    routingReason: "fatal",
    consistencyHint: null,
    transportMode: endpoint,
    diagnostics: {
      message: String(error instanceof Error ? error.message : error),
      stack: error instanceof Error ? error.stack : undefined,
    },
  });
  process.exit(1);
});
