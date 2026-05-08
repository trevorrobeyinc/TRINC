import { z } from "zod";
import type { RuntimeContext } from "../context";
import type { BackendId, ToolResult } from "../../types";
import { guardVaultRelativePath } from "../../fs/pathGuard";
import { executeBackendOperation } from "./common";
import { readRevision } from "../../consistency/model";

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
  const guarded = guardVaultRelativePath(payload.vaultRoot, payload.path);

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
        path: payload.path,
        file: payload.path,
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
