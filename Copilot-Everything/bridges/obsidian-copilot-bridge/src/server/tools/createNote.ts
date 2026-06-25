import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { RuntimeContext } from "../context";
import type { BackendId, ToolResult } from "../../types";
import { guardVaultRelativePath, revalidateGuardedPath } from "../../fs/pathGuard";
import { executeBackendOperation } from "./common";
import { AppError } from "../errors";
import { ERROR_CODES } from "../errorCodes";
import { assertExpectedRevision } from "../../consistency/model";

const schema = z.object({
  vault: z.string().min(1),
  vaultRoot: z.string().min(1),
  path: z.string().min(1),
  content: z.string().default(""),
  overwrite: z.boolean().optional(),
  open: z.boolean().optional(),
  newtab: z.boolean().optional(),
  expectedRevision: z.string().optional(),
});

export async function createNoteTool(
  runtime: RuntimeContext,
  requestId: string,
  epochId: number | undefined,
  backendHint: BackendId | undefined,
  input: unknown
): Promise<ToolResult<{ created: boolean; path: string }>> {
  if (runtime.config.readOnlyMode) {
    throw new AppError(ERROR_CODES.NO_CAPABLE_BACKEND, "Server is in read-only mode.");
  }

  const payload = schema.parse(input);
  if (!runtime.config.allowedVaultRoots.includes(payload.vaultRoot)) {
    throw new AppError(ERROR_CODES.PATH_OUTSIDE_VAULT, "vaultRoot is not in allowedVaultRoots.");
  }
  // Security (audit VW-2): pin the guard root to the server-configured vault, not the
  // client-supplied vaultRoot, so the bridge-side checks always run against the real vault.
  const guarded = guardVaultRelativePath(runtime.config.allowedVaultRoots[0], payload.path);
  fs.mkdirSync(path.dirname(guarded.absolutePath), { recursive: true });
  const exists = fs.existsSync(guarded.absolutePath);

  if (exists && payload.overwrite !== true) {
    throw new AppError(ERROR_CODES.ALREADY_EXISTS, "Note already exists and overwrite=false.", false, {
      path: guarded.relativePath,
    });
  }
  assertExpectedRevision(guarded.absolutePath, payload.expectedRevision);

  const mappedInput: Record<string, unknown> = {
    vault: payload.vault,
    vaultRoot: payload.vaultRoot,
    path: guarded.relativePath,
    name: path.posix.basename(
      guarded.relativePath,
      guarded.relativePath.endsWith(".md") ? ".md" : undefined
    ),
    content: payload.content,
    overwrite: payload.overwrite,
    open: payload.open,
    newtab: payload.newtab,
  };

  const result = await executeBackendOperation(
    runtime,
    {
      requestId,
      operation: "create_note",
      epochId,
      backendHint,
      input: mappedInput,
    },
    () => {
      revalidateGuardedPath(guarded);
      return { created: true, path: guarded.relativePath };
    },
    "mutating"
  );

  return result;
}
