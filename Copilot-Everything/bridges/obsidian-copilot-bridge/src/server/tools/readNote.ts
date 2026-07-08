import { z } from "zod";
import type { RuntimeContext } from "../context";
import type { BackendId, ToolResult } from "../../types";
import { guardVaultRelativePath } from "../../fs/pathGuard";
import { executeBackendOperation } from "./common";
import { readRevision } from "../../consistency/model";
import { AppError } from "../errors";
import { ERROR_CODES } from "../errorCodes";

const schema = z.object({
  vault: z.string().min(1),
  vaultRoot: z.string().min(1),
  path: z.string().min(1),
});

export async function readNoteTool(
  runtime: RuntimeContext,
  requestId: string,
  epochId: number | undefined,
  backendHint: BackendId | undefined,
  input: unknown
): Promise<ToolResult<{ path: string; content: string; revision?: string }>> {
  const payload = schema.parse(input);
  if (!runtime.config.allowedVaultRoots.includes(payload.vaultRoot)) {
    throw new AppError(ERROR_CODES.PATH_OUTSIDE_VAULT, "vaultRoot is not in allowedVaultRoots.");
  }
  // Security (audit VW-2): pin the guard root to the server-configured vault.
  const guarded = guardVaultRelativePath(runtime.config.allowedVaultRoots[0], payload.path);

  return await executeBackendOperation(
    runtime,
    {
      requestId,
      operation: "read_note",
      epochId,
      backendHint,
      input: {
        vault: payload.vault,
        vaultRoot: payload.vaultRoot,
        path: guarded.relativePath,
        file: guarded.relativePath,
      },
    },
    (stdout) => {
      const revision = readRevision(guarded.absolutePath) ?? undefined;
      return {
        path: guarded.relativePath,
        content: stdout,
        revision,
      };
    },
    "interactive"
  );
}
