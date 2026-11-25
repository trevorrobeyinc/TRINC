import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { AppError } from "../server/errors";
import { ERROR_CODES } from "../server/errorCodes";
import { SOCKET_NAMES, socketPathFor } from "../server/udsListener";
import type { ServerConfig, TransportMode } from "./types";

/** Startup error when "http" or "https" is the effective transport mode (bridges-uds, D4). */
export const TCP_TRANSPORT_REMOVED = "TCP transport was removed on 2026-11-24 (bridges-uds); start with --transport=uds";

// zod 4: a missing section uses `.prefault({})`, which parses `{}` through the section's
// schema so its inner defaults (port 8798, the timeouts, the queue sizes, ...) still apply.
// `.default({})` would return the bare `{}` and drop every one of them; it is what zod 3's
// `.default({})` meant. Pinned by src/tests/configLoader.spec.ts.
//
// transport.udsPath and transport.tls are no longer schema keys (zod strips unknown keys): the
// socket path is always socketPathFor("vault-bridge.sock") and the socket carries no TLS.
// loadConfig() writes one stderr note for each when a config file still sets it. mode still
// accepts "http" so an old config parses; loadConfig() then refuses it as the effective mode
// unless --transport=uds overrides it.
const schema = z.object({
  transport: z
    .object({
      mode: z.enum(["http", "uds", "pipe"]).optional(),
      host: z
        .string()
        .default("127.0.0.1")
        .refine(
          (h) =>
            process.env.OBSIDIAN_BRIDGE_ALLOW_NONLOOPBACK === "1" ||
            h === "127.0.0.1" ||
            h === "::1" ||
            h === "localhost",
          {
            message:
              "transport.host must be loopback (127.0.0.1/::1/localhost); set OBSIDIAN_BRIDGE_ALLOW_NONLOOPBACK=1 to override (audit TB-1)",
          }
        ),
      port: z.number().int().min(1).max(65535).default(8798),
      pipeName: z.string().default("obsidian-mcp-bridge"),
    })
    .prefault({}),
  cliStability: z
    .object({
      requiredVaultNames: z.array(z.string().min(1)).min(1).default(["My Digital Garden"]),
    })
    .prefault({}),
  timeouts: z
    .object({
      openVaultMs: z.number().int().min(1000).default(25000),
      createNoteMs: z.number().int().min(1000).default(20000),
      appendNoteMs: z.number().int().min(1000).default(20000),
      readNoteMs: z.number().int().min(1000).default(15000),
      searchNotesMs: z.number().int().min(1000).default(20000),
    })
    .prefault({}),
  queue: z
    .object({
      capacity: z.number().int().min(1).default(256),
      workerConcurrency: z.number().int().min(1).default(4),
    })
    .prefault({}),
  allowedVaultRoots: z.array(z.string()).min(1),
  security: z.object({
    authToken: z.string().min(22),
    replayWindowSeconds: z.number().int().min(10).max(300).default(60),
    nonceTtlSeconds: z.number().int().min(10).max(600).default(120),
    rateLimitPerMinute: z.number().int().min(1).default(600),
    globalRateLimitPerMinute: z.number().int().min(1).default(2400),
    // Strict allowlist for obsidian_execute_command. EMPTY (the default) means
    // "denylist mode" — see DENIED_COMMAND_PATTERNS in server/tools/executeCommand.ts.
    // This key MUST be declared here: zod's `z.object()` STRIPS unknown keys on parse,
    // so before it existed an operator could add `executeCommandAllowlist` to the config
    // JSON, get no error, and silently receive no allowlist at all — a false sense of
    // lockdown, which is worse than knowingly running the denylist.
    executeCommandAllowlist: z.array(z.string()).default([]),
  }),
  logging: z
    .object({
      level: z.enum(["error", "warn", "info", "debug", "trace"]).default("info"),
      file: z.string().default(path.resolve(process.cwd(), "logs/obsidian-mcp.log")),
      slowThresholdMs: z
        .object({
          open_vault: z.number().int().min(1).default(5000),
          create_note: z.number().int().min(1).default(3000),
          append_note: z.number().int().min(1).default(3000),
          read_note: z.number().int().min(1).default(1500),
          search_notes: z.number().int().min(1).default(1500),
          execute_command: z.number().int().min(1).default(3000),
        })
        .prefault({}),
    })
    .prefault({}),
  readOnlyMode: z.boolean().default(false),
});

function resolveConfigPath(): string {
  const envPath = process.env.OBSIDIAN_MCP_CONFIG;
  if (envPath) {
    return path.resolve(envPath);
  }

  // Prefer package-local local overrides, then shared config.
  const candidates = [
    path.resolve(process.cwd(), "config/obsidian-cli-mcp.local.json"),
    path.resolve(process.cwd(), "config/obsidian-cli-mcp.json"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  // Return primary expected path for downstream error message.
  return candidates[0];
}

function ensureStrongToken(token: string): number {
  // Security (audit AR-2): true entropy CANNOT be measured from the string itself — it is a
  // property of how the token was generated. The old formula floor(log2(unique^len)) credited
  // length as entropy (so "ab" repeated passed) and overflowed to Infinity for long tokens.
  // Instead, reject obviously-weak tokens via length + character diversity and require the
  // token to be CSPRNG-generated.
  const length = token.length;
  const unique = new Set(token).size;
  const MIN_LENGTH = 32; // ~>=24 random bytes once hex/base64-encoded
  const MIN_DISTINCT = 12; // rejects low-diversity / repeated-pattern strings
  if (length < MIN_LENGTH || unique < MIN_DISTINCT) {
    throw new AppError(
      ERROR_CODES.AUTH_TOKEN_WEAK,
      `MCP auth token is too weak (length=${length}, distinct chars=${unique}). ` +
        "Generate it with a CSPRNG (>=24 random bytes, e.g. `openssl rand -hex 32`)."
    );
  }
  // Conservative reporting estimate ONLY (not a security guarantee): per-char entropy is
  // bounded by log2(distinct) and capped at 6 bits/char; no Math.pow (cannot overflow).
  return Math.floor(length * Math.min(Math.log2(unique), 6));
}

function defaultTransportMode(): "uds" | "pipe" {
  return process.platform === "win32" ? "pipe" : "uds";
}

/**
 * The mode a --transport=<mode> argument asks for: "uds" or "pipe", and "http" for both "http" and
 * "https" (the removed TCP transport, which loadConfig refuses). Any other value is ignored.
 */
export function parseTransportArg(argv: readonly string[]): "http" | "uds" | "pipe" | null {
  const arg = argv.find((value) => value.startsWith("--transport="));
  if (!arg) {
    return null;
  }
  const mode = arg.slice("--transport=".length);
  if (mode === "http" || mode === "https") {
    return "http";
  }
  if (mode === "uds" || mode === "pipe") {
    return mode;
  }
  return null;
}

/**
 * The command line wins over the config file (the launcher passes --transport=uds, and a config
 * that still says "http" must not stop it). The effective mode must be "uds" on macOS and Linux;
 * Windows keeps its named pipe. TCP is refused everywhere.
 */
function effectiveTransportMode(configured: "http" | "uds" | "pipe" | undefined, argv: readonly string[]): TransportMode {
  const mode = parseTransportArg(argv) ?? configured ?? defaultTransportMode();
  if (mode === "http") {
    throw new AppError(ERROR_CODES.INTERNAL_ERROR, TCP_TRANSPORT_REMOVED);
  }
  if (mode === "pipe" && process.platform !== "win32") {
    throw new AppError(
      ERROR_CODES.INTERNAL_ERROR,
      `transport mode "pipe" is Windows-only; on ${process.platform} the bridge serves only on its Unix socket (start with --transport=uds)`
    );
  }
  return mode;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** One note per transport key the config file still sets but the bridge no longer reads. */
function noteIgnoredTransportKeys(parsed: unknown, socketPath: string, note: (line: string) => void): void {
  const transport = isRecord(parsed) && isRecord(parsed.transport) ? parsed.transport : {};
  if (transport.udsPath !== undefined && transport.udsPath !== socketPath) {
    note(
      `obsidian-copilot-bridge: config transport.udsPath (${JSON.stringify(transport.udsPath)}) is ignored; ` +
        `the bridge always serves on ${socketPath} (bridges-uds, 2026-11-24)`
    );
  }
  if (transport.tls !== undefined) {
    note(
      "obsidian-copilot-bridge: config transport.tls is ignored; the bridge has no TCP listener and serves " +
        "plain HTTP/1.1 only on its private Unix socket (bridges-uds, 2026-11-24)"
    );
  }
}

function noteToStderr(line: string): void {
  process.stderr.write(`${line}\n`);
}

export interface LoadConfigOptions {
  /** Command-line arguments; a --transport=<mode> argument overrides transport.mode from the config file. */
  argv?: readonly string[];
  /** Receives each one-line note about an ignored config key (default: stderr). */
  note?: (line: string) => void;
}

export function loadConfig(
  options: LoadConfigOptions = {}
): { config: ServerConfig; tokenEntropyBits: number; configPath: string } {
  const configPath = resolveConfigPath();
  if (!fs.existsSync(configPath)) {
    throw new AppError(
      ERROR_CODES.INTERNAL_ERROR,
      `Missing config file at ${configPath}. Copy mcp-server/config/obsidian-cli-mcp.local.json.example first.`
    );
  }

  const raw = fs.readFileSync(configPath, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new AppError(ERROR_CODES.INTERNAL_ERROR, `Invalid JSON config at ${configPath}: ${String(error)}`);
  }

  const parsedConfig = schema.parse(parsed);
  const udsPath = socketPathFor(SOCKET_NAMES.vaultBridge);
  noteIgnoredTransportKeys(parsed, udsPath, options.note ?? noteToStderr);
  const mode = effectiveTransportMode(parsedConfig.transport.mode, options.argv ?? []);
  const cfg = { ...parsedConfig, transport: { ...parsedConfig.transport, mode, udsPath } } as ServerConfig;
  const tokenEntropyBits = ensureStrongToken(cfg.security.authToken);

  return {
    config: cfg,
    tokenEntropyBits,
    configPath,
  };
}
