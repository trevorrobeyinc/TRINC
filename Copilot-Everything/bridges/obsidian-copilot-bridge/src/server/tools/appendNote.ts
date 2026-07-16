import { z } from "zod";
import type { RuntimeContext } from "../context";
import type { BackendId, ToolResult } from "../../types";
import { AppError } from "../errors";
import { ERROR_CODES } from "../errorCodes";
import { guardVaultRelativePath, revalidateGuardedPath } from "../../fs/pathGuard";
import { buildAppendMarker, markerRegexForKey } from "../../idempotency/marker";
import { executeBackendOperation } from "./common";
import { assertExpectedRevision } from "../../consistency/model";

const schema = z.object({
  vault: z.string().min(1),
  vaultRoot: z.string().min(1),
  path: z.string().min(1),
  content: z.string().min(1),
  inline: z.boolean().optional(),
  idempotencyKey: z.string().min(1).optional(),
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

    throw new AppError(
      ERROR_CODES.AMBIGUOUS_WRITE_REQUIRES_DECISION,
      "Append reconciliation read failed; retry with same idempotency key.",
      true,
      { readError: readResult.error }
    );
  }

  return markerRegexForKey(key).test(readResult.data.slice(-16_384));
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

  const payload = schema.parse(input);
  if (!runtime.config.allowedVaultRoots.includes(payload.vaultRoot)) {
    throw new AppError(ERROR_CODES.PATH_OUTSIDE_VAULT, "vaultRoot is not in allowedVaultRoots.");
  }
  // Security (audit VW-2): pin the guard root to the server-configured vault.
  const guarded = guardVaultRelativePath(runtime.config.allowedVaultRoots[0], payload.path);
  assertExpectedRevision(guarded.absolutePath, payload.expectedRevision);

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
    if (
      result.error.code === ERROR_CODES.CLI_TIMEOUT ||
      result.error.code === ERROR_CODES.CLI_EXIT_NONZERO ||
      result.error.code === ERROR_CODES.QUEUE_TIMEOUT
    ) {
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
