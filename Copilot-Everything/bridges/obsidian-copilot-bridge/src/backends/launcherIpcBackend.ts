/**
 * Launcher IPC backend: the bridge's only backend since 2026-11-25.
 *
 * The six operations go to obsidian-bridge-launcher over the private fd-3 pipe the launcher created when it
 * spawned this process (BRIDGE_IPC_FD), and the launcher serves them in Obsidian's renderer through app.vault,
 * app.workspace, app.metadataCache and app.commands (its src/vaultIpc.ts). It replaces the Local REST API plugin
 * on https://127.0.0.1:27124, so the bridge needs no TCP port, API key or certificate. Every tool except
 * obsidian_health keeps its request and response shape; the README lists what a client can see change.
 *
 *   (probe)          vault.info        {}                                      -> { vault, version, methods, basePath }
 *   read_note        vault.read        { path, tailChars? }                    -> { path, content }
 *   create_note      vault.create      { path, content, contentSha256, overwrite, open, newtab }
 *                                                                              -> { path, created, opened? }
 *   append_note      vault.append      { path, content, contentSha256 }        -> { path, created }
 *   search_notes     vault.search      { query, path?, limit? }                -> { results: [{ path, text? }], total }
 *   execute_command  commands.execute  { id }                                  -> { executed, id }
 *   open_vault       workspace.open    { path?, paneType? }                    -> { opened, ... }
 *
 * tailChars is internal: append_note confirms an append by reading only the end of the note, which a whole read
 * could refuse once the note has grown past the launcher's read cap.
 *
 * The launcher decides which commands run (its src/commandPolicy.ts). A refusal comes back with a reason,
 * mapped below to this bridge's error codes, so a failed call is a failed tool result: under the REST
 * backend a 404 or a refused command still came back as ok:true with an empty body. An answer without the
 * fields this backend reads fails too, so the two halves cannot drift apart unnoticed.
 *
 * Every note body written carries its sha256 (contentSha256), and the launcher writes nothing unless the text
 * it received hashes the same, so a pipe that damaged the text fails the call instead of storing the damage.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Backend, BackendCapabilities } from "./backend";
import type { BackendResult, ExecutionContext, Operation } from "../types";
import { AppError } from "../server/errors";
import { ERROR_CODES, type ErrorCode } from "../server/errorCodes";
import { LauncherIpcError } from "../server/launcherIpc";
import { normalizeUnicodePath } from "../fs/unicodePath";
import { isCaseInsensitivePathPlatform, normalizeWindowsPathForCompare } from "../fs/windowsPathSafety";

/** The part of LauncherIpcClient this backend uses; tests pass a fake. */
export interface LauncherIpcRequester {
  request<T = unknown>(method: string, params: unknown, timeoutMs?: number): Promise<T>;
}

const SUPPORTED_OPS: Operation[] = [
  "open_vault",
  "create_note",
  "append_note",
  "read_note",
  "search_notes",
  "execute_command",
];

/** The launcher methods this backend needs. A launcher older than 0.2.0 answers none of them. */
export const REQUIRED_LAUNCHER_METHODS = [
  "vault.read",
  "vault.create",
  "vault.append",
  "vault.search",
  "workspace.open",
  "commands.execute",
] as const;

const PROBE_TIMEOUT_MS = 3_000;

/**
 * The longest a launcher call waits, whatever config.timeouts gives the operation: the REST backend's flat
 * 15 s. It sits inside Copilot's 20 s request budget, so the caller hears LAUNCHER_IPC_TIMEOUT rather than its
 * own transport timing out first, and a hung renderer holds a queue worker no longer than REST did.
 */
export const MAX_IPC_WAIT_MS = 15_000;

/** The launcher writes a note body up to this many UTF-8 bytes (its MAX_NOTE_BYTES); the tools' schemas refuse more first. */
export const MAX_NOTE_BYTES = 16 * 1024 * 1024;

/** The launcher refuses a note body longer than this many UTF-16 units (its MAX_CONTENT_CHARS). */
export const MAX_NOTE_CONTENT_CHARS = 16 * 1024 * 1024;

/** The launcher refuses a search query longer than this (its MAX_QUERY_CHARS). */
export const MAX_SEARCH_QUERY_CHARS = 1024;

/** The launcher refuses a path longer than this (its MAX_PATH_CHARS). */
export const MAX_VAULT_PATH_CHARS = 1024;

/** How much of a note append_note's confirmation reads back: its marker sits at the very end. */
export const APPEND_CONFIRM_TAIL_CHARS = 16_384;

/**
 * Refuses a note body the launcher would refuse, before anything is written or made on disk. The limit is in
 * UTF-8 bytes because the launcher writes a body only if it can read it back whole; a body over 16 Mi UTF-16
 * units is always over 16 MiB of UTF-8, so this one check covers both of its limits.
 */
export function assertBodyFits(content: string, maxBytes: number): void {
  const bytes = Buffer.byteLength(content, "utf8");
  if (bytes > maxBytes) {
    throw new AppError(
      ERROR_CODES.PAYLOAD_TOO_LARGE,
      `The note body is ${bytes} bytes of UTF-8; at most ${maxBytes} are written in one call.`,
      false,
      { bytes, maxBytes }
    );
  }
}

export const REASON_TO_CODE: Record<string, ErrorCode> = {
  not_found: ERROR_CODES.NOTE_NOT_FOUND,
  already_exists: ERROR_CODES.ALREADY_EXISTS,
  path_refused: ERROR_CODES.PATH_INVALID,
  too_large: ERROR_CODES.PAYLOAD_TOO_LARGE,
  command_refused: ERROR_CODES.COMMAND_NOT_ALLOWED,
  unavailable: ERROR_CODES.LAUNCHER_IPC_UNAVAILABLE,
  closed: ERROR_CODES.LAUNCHER_IPC_UNAVAILABLE,
  timeout: ERROR_CODES.LAUNCHER_IPC_TIMEOUT,
};

/**
 * Which failures a caller may retry: a timeout, and only for an operation that is safe to repeat (a read, a
 * search, an open, or an append, whose ledger reconciles a retry with the same key). A create or a command may
 * already have run in the renderer, which never cancels a request the bridge gave up on, and a closed pipe does
 * not come back within this bridge process.
 */
const RETRY_SAFE_OPERATIONS: ReadonlySet<Operation> = new Set<Operation>([
  "read_note",
  "search_notes",
  "open_vault",
  "append_note",
]);

function isRetryable(reason: string | undefined, operation: Operation): boolean {
  return reason === "timeout" && RETRY_SAFE_OPERATIONS.has(operation);
}

/**
 * An unavailable backend. `permanent` says it cannot recover within this bridge process (no pipe, a closed pipe,
 * an old launcher, another vault), so the selector marks the refusals it causes as not retryable.
 */
function unavailable(constraints: string[], diagnostics?: Record<string, unknown>, permanent = false): BackendCapabilities {
  return {
    backend: "launcherIpc",
    available: false,
    supportedOps: [],
    reliabilityScore: 0,
    p95MsByOp: {},
    lastErrorAt: new Date().toISOString(),
    constraints,
    ...(diagnostics ? { diagnostics } : {}),
    ...(permanent ? { permanent: true } : {}),
  };
}

/** The reason launcherIpcMissingReason() gives when the bridge was simply started without the launcher. */
const FD_NOT_SET = "BRIDGE_IPC_FD is not set";

function toAppError(operation: Operation, method: string, error: unknown): AppError {
  if (error instanceof AppError) return error;
  const message = error instanceof Error ? error.message : String(error);
  const reason = error instanceof LauncherIpcError ? error.reason : undefined;
  const code = (reason && REASON_TO_CODE[reason]) || ERROR_CODES.INTERNAL_ERROR;
  return new AppError(code, message, isRetryable(reason, operation), {
    launcherMethod: method,
    ...(reason ? { launcherReason: reason } : {}),
  });
}

/** An answer without a field this backend reads: the two halves have drifted, so the call fails loudly. */
function malformed(method: string, fields: string): AppError {
  return new AppError(ERROR_CODES.INTERNAL_ERROR, `${method} answered without ${fields}`, false, { launcherMethod: method });
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * A folder as this bridge's path guard compares one (src/fs/pathGuard.ts): its real path, NFC, and case-folded on
 * the platforms whose file systems ignore case by default (macOS and Windows).
 */
function canonicalFolder(folder: string): string {
  let resolved: string;
  try {
    resolved = fs.realpathSync.native(folder);
  } catch {
    resolved = path.resolve(folder);
  }
  const normalized = normalizeUnicodePath(resolved);
  return isCaseInsensitivePathPlatform(process.platform)
    ? normalizeWindowsPathForCompare(normalized)
    : normalized.replace(/\/+$/, "");
}

export interface LauncherIpcBackendOptions {
  /** The vault this bridge guards (allowedVaultRoots[0]). The probe refuses a launcher that serves another vault. */
  vaultRoot?: string;
  /** Why there is no pipe (launcherIpcMissingReason()), for obsidian_health. */
  missingReason?: string;
}

function done(stdout: string, startedAt: number, parsed?: unknown): BackendResult {
  return {
    statusCode: 200,
    stdout,
    stderr: "",
    durationMs: Date.now() - startedAt,
    ...(parsed === undefined ? {} : { parsed }),
  };
}

export class LauncherIpcBackend implements Backend {
  readonly id = "launcherIpc" as const;

  constructor(
    private readonly ipc: LauncherIpcRequester | null,
    private readonly options: LauncherIpcBackendOptions = {}
  ) {}

  /**
   * Under REST, the plugin's key tied this bridge to one vault. Now the tie is checked: a launcher enabled in
   * another vault would write there while this bridge's own checks (path guard, revisions) ran against its
   * configured vault. Every launcher with the vault methods reports its folder, so a missing one fails closed.
   */
  private vaultMismatch(basePath: string | undefined): string | null {
    const expected = this.options.vaultRoot;
    if (!expected) return null;
    if (!basePath) {
      return "vault_unverified: the launcher did not report its vault folder, so this bridge cannot tell that it serves its own vault";
    }
    if (canonicalFolder(basePath) === canonicalFolder(expected)) return null;
    return `vault_mismatch: the launcher serves the vault at ${basePath}, not this bridge's vault ${expected}`;
  }

  async probe(): Promise<BackendCapabilities> {
    if (!this.ipc) {
      const why = this.options.missingReason ?? FD_NOT_SET;
      const what =
        why === FD_NOT_SET
          ? "so this bridge was not spawned by obsidian-bridge-launcher"
          : "so the launcher's pipe cannot be used";
      return unavailable([`launcher_ipc_missing: ${why}, ${what} (bridge pid ${process.pid})`], undefined, true);
    }
    let info: { vault?: unknown; version?: unknown; methods?: unknown; basePath?: unknown };
    try {
      info = (await this.ipc.request("vault.info", {}, PROBE_TIMEOUT_MS)) ?? {};
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/unknown launcher IPC method/i.test(message)) {
        return unavailable(
          ["launcher_too_old: obsidian-bridge-launcher does not serve vault.info (it predates 0.2.0); redeploy it"],
          undefined,
          true
        );
      }
      // A launcher that did not answer in time may answer the next probe; a closed pipe never comes back.
      const closed = error instanceof LauncherIpcError && error.reason === "closed";
      return unavailable([`probe_failed:${message}`], undefined, closed);
    }

    const methods = Array.isArray(info.methods) ? info.methods.filter((m): m is string => typeof m === "string") : [];
    const diagnostics = {
      vault: typeof info.vault === "string" ? info.vault : undefined,
      launcherVersion: typeof info.version === "string" ? info.version : undefined,
    };
    const missing = REQUIRED_LAUNCHER_METHODS.filter((m) => !methods.includes(m));
    if (missing.length > 0) {
      return unavailable([`launcher_too_old: obsidian-bridge-launcher lacks ${missing.join(", ")}; redeploy it`], diagnostics, true);
    }
    const mismatch = this.vaultMismatch(typeof info.basePath === "string" ? info.basePath : undefined);
    if (mismatch) {
      return unavailable([mismatch], diagnostics, true);
    }
    return {
      backend: "launcherIpc",
      available: true,
      supportedOps: SUPPORTED_OPS,
      reliabilityScore: 0.99,
      p95MsByOp: {
        open_vault: 200,
        create_note: 150,
        append_note: 150,
        read_note: 50,
        search_notes: 400,
        execute_command: 200,
      },
      constraints: ["Requires Obsidian.app running obsidian-bridge-launcher, which spawned this bridge."],
      diagnostics,
    };
  }

  async execute(operation: Operation, input: unknown, ctx: ExecutionContext): Promise<BackendResult> {
    if (!this.ipc) {
      throw new AppError(
        ERROR_CODES.LAUNCHER_IPC_UNAVAILABLE,
        "No launcher IPC channel: the bridge was not spawned by obsidian-bridge-launcher.",
        false
      );
    }
    const ipc = this.ipc;
    const p = (input ?? {}) as Record<string, unknown>;
    const startedAt = Date.now();
    // Every call carries the operation's own timeout (config.timeouts), capped at MAX_IPC_WAIT_MS; the client's
    // default is only 5 s.
    const waitMs = Math.min(ctx.timeoutMs, MAX_IPC_WAIT_MS);
    const call = async <T>(method: string, params: Record<string, unknown>): Promise<T> => {
      try {
        return await ipc.request<T>(method, params, waitMs);
      } catch (error) {
        throw toAppError(operation, method, error);
      }
    };
    // A note body must be text: anything else is a bug upstream, never a silent empty write.
    const bodyOf = (value: unknown, method: string): string => {
      if (typeof value !== "string") {
        throw new AppError(ERROR_CODES.INTERNAL_ERROR, `${method} needs the note body as a string`, false);
      }
      return value;
    };

    switch (operation) {
      case "read_note": {
        const tail = typeof p.tailChars === "number" ? { tailChars: p.tailChars } : {};
        const r = await call<{ content?: unknown }>("vault.read", { path: p.path, ...tail });
        if (typeof r?.content !== "string") throw malformed("vault.read", "content");
        return done(r.content, startedAt, { content: r.content });
      }

      case "create_note": {
        const content = p.content === undefined ? "" : bodyOf(p.content, "vault.create");
        const r = await call<{ path?: unknown; created?: unknown }>("vault.create", {
          path: p.path,
          content,
          contentSha256: sha256(content),
          overwrite: p.overwrite === true,
          open: p.open === true,
          newtab: p.newtab === true,
        });
        if (typeof r?.path !== "string" || typeof r?.created !== "boolean") throw malformed("vault.create", "path and created");
        return done("", startedAt);
      }

      case "append_note": {
        const content = bodyOf(p.content, "vault.append");
        const r = await call<{ path?: unknown; created?: unknown }>("vault.append", {
          path: p.path,
          content,
          contentSha256: sha256(content),
        });
        if (typeof r?.path !== "string" || typeof r?.created !== "boolean") throw malformed("vault.append", "path and created");
        return done("", startedAt);
      }

      case "search_notes": {
        const r = await call<{ results?: unknown }>("vault.search", {
          query: p.query,
          ...(typeof p.path === "string" && p.path ? { path: p.path } : {}),
          ...(typeof p.limit === "number" ? { limit: p.limit } : {}),
        });
        if (!Array.isArray(r?.results)) throw malformed("vault.search", "results");
        return done(JSON.stringify(r.results), startedAt, r.results);
      }

      case "execute_command": {
        const r = await call<{ executed?: unknown }>("commands.execute", { id: p.id });
        if (typeof r?.executed !== "boolean") throw malformed("commands.execute", "executed");
        return done(JSON.stringify({ executed: r.executed }), startedAt, { executed: r.executed });
      }

      case "open_vault": {
        const params: Record<string, unknown> = {};
        if (typeof p.path === "string" && p.path) {
          params.path = p.path;
          if (typeof p.paneType === "string") params.paneType = p.paneType;
        }
        const r = await call<{ opened?: unknown }>("workspace.open", params);
        if (typeof r?.opened !== "boolean") throw malformed("workspace.open", "opened");
        return done("", startedAt);
      }

      default: {
        const exhaustive: never = operation;
        throw new Error(`unsupported operation: ${String(exhaustive)}`);
      }
    }
  }
}
