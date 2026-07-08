import { z } from "zod";
import type { RuntimeContext } from "../context";
import type { BackendId, ToolResult } from "../../types";
import { executeBackendOperation } from "./common";
import { guardVaultRelativePath } from "../../fs/pathGuard";

const schema = z.object({
  vault: z.string().min(1),
  path: z.string().optional(),
  paneType: z.enum(["tab", "split", "window"]).optional(),
});

export async function openVaultTool(
  runtime: RuntimeContext,
  requestId: string,
  epochId: number | undefined,
  backendHint: BackendId | undefined,
  input: unknown
): Promise<ToolResult<{ opened: boolean; vault: string }>> {
  const payload = schema.parse(input);
  const mappedInput: Record<string, unknown> = {
    vault: payload.vault,
  };

  if (payload.path) {
    // Security (audit VW-5): confine the open path to the configured vault root.
    const guarded = guardVaultRelativePath(runtime.config.allowedVaultRoots[0], payload.path);
    mappedInput.path = guarded.relativePath;
  }
  if (payload.paneType) {
    mappedInput.paneType = payload.paneType;
  }

  return await executeBackendOperation(
    runtime,
    {
      requestId,
      operation: "open_vault",
      epochId,
      backendHint,
      input: mappedInput,
    },
    () => ({ opened: true, vault: payload.vault }),
    "interactive"
  );
}
