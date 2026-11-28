import { z } from "zod";
import type { RuntimeContext } from "../context";
import type { BackendId, ToolError, ToolResult } from "../../types";
import { AppError } from "../errors";
import { ERROR_CODES } from "../errorCodes";
import { guardVaultRelativePath, revalidateGuardedPath } from "../../fs/pathGuard";
import { buildAppendMarker, markerRegexForKey } from "../../idempotency/marker";
import { executeBackendOperation } from "./common";
import { assertExpectedRevision } from "../../consistency/model";
import {
  APPEND_CONFIRM_TAIL_CHARS,
  assertBodyFits,
  MAX_NOTE_BYTES,
  MAX_VAULT_PATH_CHARS,
} from "../../backends/launcherIpcBackend";

/** The longest idempotency key: the marker written after the content carries it whole. */
const MAX_IDEMPOTENCY_KEY_CHARS = 256;
/**
 * Room kept under the launcher's body limit for the marker that follows the content: a newline, about 141
 * characters of fixed text, and the key (at most 256 UTF-16 units, so at most 768 bytes of UTF-8).
 */
const APPEND_MARKER_ROOM_BYTES = 4096;
const MAX_APPEND_BYTES = MAX_NOTE_BYTES - APPEND_MARKER_ROOM_BYTES;

const schema = z.object({
  vault: z.string().min(1),
  vaultRoot: z.string().min(1),
  path: z.string().min(1).max(MAX_VAULT_PATH_CHARS),
  // Its size is checked right after parsing (assertBodyFits), so an oversized body is PAYLOAD_TOO_LARGE.
  content: z.string().min(1),
  inline: z.boolean().optional(),
  idempotencyKey: z.string().min(1).max(MAX_IDEMPOTENCY_KEY_CHARS).optional(),
  expectedRevision: z.string().optional(),
});

const APPEND_RECONCILIATION_ATTEMPTS = 8;
const APPEND_RECONCILIATION_DELAY_MS = 150;

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function isStaleSelectionError(error: unknown): error is AppError {
  return error instanceof AppError && error.code === ERROR_CODES.BACKEND_SELECTION_STALE;
}

/**
 * The launcher's refusals that vault.append raises only before it writes (obsidian-bridge-launcher
 * src/vaultIpc.ts). Its checks (guardPath, requireString, verifyContent, refuseTooLargeToWrite, locateNote,
 * ensureParentFolders) run before any note write on their path, and the pipe server refuses a frame that is not
 * JSON (invalid_params) or is too large (too_large) before dispatching it. A failure in the write itself is
 * Obsidian's own error and carries no reason. launcherContract.spec.ts holds the launcher to this. A reason not
 * named here, now or later, keeps the key ambiguous; "timeout" and "closed" are this bridge's own and come back on
 * requests that were sent.
 */
export const PRE_WRITE_LAUNCHER_REASONS: ReadonlySet<string> = new Set(["invalid_params", "path_refused", "too_large"]);

/**
 * Whether a failed append provably left the note untouched, so that its key can be forgotten and a retry with it
 * writes as a first attempt. Whatever is not shown to be unwritten is held as AMBIGUOUS and reconciled on retry:
 * a timeout (CLI_TIMEOUT, CLI_EXIT_NONZERO, QUEUE_TIMEOUT, LAUNCHER_IPC_TIMEOUT), a pipe that closed with the
 * request in flight, an error from the write itself (it carries no launcher reason) and an answer this bridge
 * could not read may all come after the launcher touched the note, and freeing the key there would append the
 * text twice.
 */
function failedBeforeWriting(error: ToolError): boolean {
  // The selector refuses before any backend runs: no capable backend (the cold-start window, no pipe, an old
  // launcher, another vault) or a stale routing epoch.
  if (error.code === ERROR_CODES.NO_CAPABLE_BACKEND || error.code === ERROR_CODES.BACKEND_SELECTION_STALE) {
    return true;
  }
  // The request never left this process: no launcher pipe, or one already closed (launcherIpcBackend.ts).
  if (error.diagnostics?.requestSent === false) {
    return true;
  }
  // The launcher refused it with a reason its append raises only before writing. Some clear on a retry (a file in
  // another letter case that Obsidian has not indexed yet, a body the pipe damaged), so the key must not be held.
  const reason = error.diagnostics?.launcherReason;
  return typeof reason === "string" && PRE_WRITE_LAUNCHER_REASONS.has(reason);
}

async function reconcileAppendMarker(
  runtime: RuntimeContext,
  payload: z.infer<typeof schema>,
  requestId: string,
  epochId: number | undefined,
  backendHint: BackendId | undefined,
  key: string
): Promise<boolean> {
  const readResult = await executeBackendOperation(
    runtime,
    {
      requestId: `${requestId}:reconcile`,
      operation: "read_note",
      epochId,
      backendHint,
      input: {
        vault: payload.vault,
        vaultRoot: payload.vaultRoot,
        path: payload.path,
        // Only the end of the note is needed (the marker is the last thing appended), and a tail read is not
        // capped by note size, so an append to a note that has grown large is still confirmed.
        tailChars: APPEND_CONFIRM_TAIL_CHARS,
      },
    },
    (stdout) => stdout,
    "interactive"
  );

  if (!readResult.ok) {
    if (readResult.error.code === ERROR_CODES.BACKEND_SELECTION_STALE) {
      throw new AppError(
        ERROR_CODES.BACKEND_SELECTION_STALE,
        readResult.error.message,
        readResult.error.retryable,
        readResult.error.diagnostics
      );
    }

    // The launcher looked and there is no such note, so there is no marker in it either: an answer, not a failed
    // read (the REST backend read a missing note as empty, with the same outcome). As a failed read it answered
    // retryable true, which for a note that does not exist yet stays true for good.
    if (readResult.error.code === ERROR_CODES.NOTE_NOT_FOUND) {
      return false;
    }

    throw new AppError(
      ERROR_CODES.AMBIGUOUS_WRITE_REQUIRES_DECISION,
      "Append reconciliation read failed; retry with same idempotency key.",
      true,
      { readError: readResult.error }
    );
  }

  return markerRegexForKey(key).test(readResult.data.slice(-APPEND_CONFIRM_TAIL_CHARS));
}

/**
 * Await the append marker, converting a wait failure into an ambiguous-ledger
 * entry and rethrowing (a stale-selection error propagates untouched). Shared
 * by the STARTED/AMBIGUOUS reconciliation path and the post-append path so the
 * catch behavior stays in one place.
 */
async function awaitAppendMarkerOrMarkAmbiguous(
  runtime: RuntimeContext,
  payload: z.infer<typeof schema>,
  requestId: string,
  epochId: number | undefined,
  backendHint: BackendId | undefined,
  key: string
): Promise<boolean> {
  try {
    return await waitForAppendMarker(runtime, payload, requestId, epochId, backendHint, key);
  } catch (error) {
    if (isStaleSelectionError(error)) {
      throw error;
    }
    runtime.ledger.ambiguous("append_note", key, String(error));
    throw error;
  }
}

async function waitForAppendMarker(
  runtime: RuntimeContext,
  payload: z.infer<typeof schema>,
  requestId: string,
  epochId: number | undefined,
  backendHint: BackendId | undefined,
  key: string
): Promise<boolean> {
  let lastError: unknown;

  for (let attempt = 0; attempt < APPEND_RECONCILIATION_ATTEMPTS; attempt += 1) {
    try {
      const found = await reconcileAppendMarker(
        runtime,
        payload,
        requestId,
        epochId,
        backendHint,
        key
      );
      if (found) {
        return true;
      }
    } catch (error) {
      lastError = error;
    }

    if (attempt < APPEND_RECONCILIATION_ATTEMPTS - 1) {
      await sleep(APPEND_RECONCILIATION_DELAY_MS);
    }
  }

  if (lastError) {
    throw lastError;
  }

  return false;
}

export async function appendNoteTool(
  runtime: RuntimeContext,
  requestId: string,
  epochId: number | undefined,
  backendHint: BackendId | undefined,
  input: unknown
): Promise<ToolResult<{ appended: boolean; path: string; idempotencyState: string }>> {
  if (runtime.config.readOnlyMode) {
    throw new AppError(ERROR_CODES.NO_CAPABLE_BACKEND, "Server is in read-only mode.");
  }

  const parsed = schema.parse(input);
  // Before the ledger starts the key: a refused body leaves no STARTED entry behind.
  assertBodyFits(parsed.content, MAX_APPEND_BYTES);
  if (!runtime.config.allowedVaultRoots.includes(parsed.vaultRoot)) {
    throw new AppError(ERROR_CODES.PATH_OUTSIDE_VAULT, "vaultRoot is not in allowedVaultRoots.");
  }
  // Security (audit VW-2): pin the guard root to the server-configured vault.
  const guarded = guardVaultRelativePath(runtime.config.allowedVaultRoots[0], parsed.path);
  assertExpectedRevision(guarded.absolutePath, parsed.expectedRevision);
  // The append and its reconciliation reads send the path the guard checked (NFC, '/' separators, trimmed), as
  // create_note and read_note do, never the client's raw text: the launcher re-checks what it is sent, and the
  // write lock and read pins are keyed on it.
  const payload = { ...parsed, path: guarded.relativePath };

  if (!payload.idempotencyKey) {
    throw new AppError(
      ERROR_CODES.IDEMPOTENCY_KEY_REQUIRED_FOR_RETRY,
      "append_note requires idempotencyKey in hardened mode."
    );
  }

  const key = payload.idempotencyKey;
  const prior = runtime.ledger.get("append_note", key);
  const existing = prior ?? runtime.ledger.start("append_note", key);
  const hadExistingEntry = prior !== null;

  if (existing.state === "COMMITTED" || existing.state === "RECONCILED") {
    return {
      ok: true,
      data: {
        appended: true,
        path: guarded.relativePath,
        idempotencyState: existing.state,
      },
      meta: {
        requestId,
        durationMs: 0,
        backendUsed: backendHint,
        epochId: runtime.selector.currentSnapshot().epochId,
        consistencyHint: "strict-fifo-per-note",
      },
    };
  }

  if (hadExistingEntry && (existing.state === "STARTED" || existing.state === "AMBIGUOUS")) {
    const found = await awaitAppendMarkerOrMarkAmbiguous(
      runtime,
      payload,
      requestId,
      epochId,
      backendHint,
      key
    );

    if (found) {
      runtime.ledger.reconcile(
        "append_note",
        key,
        JSON.stringify({ appended: true, path: guarded.relativePath, idempotencyState: "RECONCILED" })
      );
      return {
        ok: true,
        data: {
          appended: true,
          path: guarded.relativePath,
          idempotencyState: "RECONCILED",
        },
        meta: {
          requestId,
          durationMs: 0,
          backendUsed: backendHint,
          epochId: runtime.selector.currentSnapshot().epochId,
          consistencyHint: "strict-fifo-per-note",
        },
      };
    }

    throw new AppError(
      ERROR_CODES.AMBIGUOUS_WRITE_REQUIRES_DECISION,
      "Ambiguous append state with no marker found; manual decision required before replay.",
      false
    );
  }

  const marker = buildAppendMarker(key, payload.content);
  const contentWithMarker = `${payload.content}\n${marker}`;

  const result = await executeBackendOperation(
    runtime,
    {
      requestId,
      operation: "append_note",
      epochId,
      backendHint,
      input: {
        vault: payload.vault,
        vaultRoot: payload.vaultRoot,
        path: payload.path,
        content: contentWithMarker,
        inline: payload.inline,
      },
    },
    () => ({
      appended: true,
      path: guarded.relativePath,
      idempotencyState: "STARTED",
    }),
    "mutating"
  );

  if (!result.ok) {
    if (failedBeforeWriting(result.error)) {
      // Nothing reached the note, so the key is free again. Kept as STARTED (until 2026-11-27) it sent every later
      // call with this key to reconciliation, which looks for a marker that can never appear and answers
      // AMBIGUOUS_WRITE_REQUIRES_DECISION, retryable false, for good: the ledger is durable.
      runtime.ledger.forgetUnwritten("append_note", key);
    } else {
      runtime.ledger.ambiguous("append_note", key, result.error.message);
    }
    return result;
  }

  const found = await awaitAppendMarkerOrMarkAmbiguous(
    runtime,
    payload,
    requestId,
    epochId,
    backendHint,
    key
  );

  if (!found) {
    runtime.ledger.ambiguous("append_note", key, "marker_not_found");
    throw new AppError(
      ERROR_CODES.AMBIGUOUS_WRITE_REQUIRES_DECISION,
      "Append marker not found during reconciliation; retry with same idempotency key."
    );
  }

  revalidateGuardedPath(guarded);
  runtime.ledger.commit("append_note", key, JSON.stringify(result.data));
  result.data.idempotencyState = "COMMITTED";
  return result;
}
