import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { AppError } from "../server/errors";
import { ERROR_CODES } from "../server/errorCodes";
import type { ServerConfig } from "./types";

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
      udsPath: z.string().default("/tmp/obsidian-mcp-bridge.sock"),
      pipeName: z.string().default("obsidian-mcp-bridge"),
      tls: z.object({
        certPath: z.string(),
        keyPath: z.string(),
      }).optional(),
    })
    .default({}),
  cliStability: z
    .object({
      requiredVaultNames: z.array(z.string().min(1)).min(1).default(["My Digital Garden"]),
    })
    .default({}),
  timeouts: z
    .object({
      openVaultMs: z.number().int().min(1000).default(25000),
      createNoteMs: z.number().int().min(1000).default(20000),
      appendNoteMs: z.number().int().min(1000).default(20000),
      readNoteMs: z.number().int().min(1000).default(15000),
      searchNotesMs: z.number().int().min(1000).default(20000),
    })
    .default({}),
  queue: z
    .object({
      capacity: z.number().int().min(1).default(256),
      workerConcurrency: z.number().int().min(1).default(4),
    })
    .default({}),
  allowedVaultRoots: z.array(z.string()).min(1),
  security: z.object({
    authToken: z.string().min(22),
    replayWindowSeconds: z.number().int().min(10).max(300).default(60),
    nonceTtlSeconds: z.number().int().min(10).max(600).default(120),
    rateLimitPerMinute: z.number().int().min(1).default(600),
    globalRateLimitPerMinute: z.number().int().min(1).default(2400),
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
        .default({}),
    })
    .default({}),
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

export function loadConfig(): { config: ServerConfig; tokenEntropyBits: number; configPath: string } {
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

  const cfg = schema.parse(parsed) as ServerConfig;
  if (!cfg.transport.mode) {
    cfg.transport.mode = defaultTransportMode();
  }
  const tokenEntropyBits = ensureStrongToken(cfg.security.authToken);

  return {
    config: cfg,
    tokenEntropyBits,
    configPath,
  };
}
