import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { AppError } from "../server/errors";
import { ERROR_CODES } from "../server/errorCodes";
import type { ServerConfig } from "./types";

const schema = z.object({
  transport: z
    .object({
      mode: z.enum(["http", "https", "uds", "pipe"]).optional(),
      host: z.string().default("127.0.0.1"),
      port: z.number().int().min(1).max(65535).default(8799),
      udsPath: z.string().default("/tmp/raycast-obsidian-mcp.sock"),
      pipeName: z.string().default("raycast-obsidian-mcp"),
      tls: z
        .object({
          certPath: z.string().default(""),
          keyPath: z.string().default(""),
        })
        .default({}),
    })
    .default({}),
  obsidianCliBinary: z.string().default("obsidian"),
  cliStability: z
    .object({
      probeTimeoutMs: z.number().int().min(1000).default(20_000),
      launchTimeoutMs: z.number().int().min(1000).default(20_000),
      readinessPollIntervalMs: z.number().int().min(100).default(500),
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
      file: z.string().default(path.resolve(process.cwd(), "logs/raycast-obsidian-mcp.log")),
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

  const candidates = [
    path.resolve(process.cwd(), "config/raycast-obsidian-mcp.local.json"),
    path.resolve(process.cwd(), "config/raycast-obsidian-mcp.json"),
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
  const unique = new Set(token).size;
  const entropyEstimate = Math.floor(Math.log2(Math.pow(unique || 1, token.length)));
  if (entropyEstimate < 128) {
    throw new AppError(
      ERROR_CODES.AUTH_TOKEN_WEAK,
      "MCP auth token does not meet the minimum estimated entropy requirement (128 bits)."
    );
  }
  return entropyEstimate;
}

function defaultTransportMode(): "uds" | "pipe" {
  return process.platform === "win32" ? "pipe" : "uds";
}

export function loadConfig(): { config: ServerConfig; tokenEntropyBits: number; configPath: string } {
  const configPath = resolveConfigPath();
  if (!fs.existsSync(configPath)) {
    throw new AppError(
      ERROR_CODES.INTERNAL_ERROR,
      `Missing config file at ${configPath}. Copy config/obsidian-cli-mcp.local.json.example to config/raycast-obsidian-mcp.local.json first.`
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
  if (cfg.transport.mode === "https") {
    if (!cfg.transport.tls.certPath || !cfg.transport.tls.keyPath) {
      throw new AppError(
        ERROR_CODES.INTERNAL_ERROR,
        `transport.mode is "https" but transport.tls.certPath / transport.tls.keyPath are not set in ${configPath}.`
      );
    }
  }
  const tokenEntropyBits = ensureStrongToken(cfg.security.authToken);

  return {
    config: cfg,
    tokenEntropyBits,
    configPath,
  };
}
