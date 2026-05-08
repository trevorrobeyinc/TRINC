import { z } from "zod";
import type { RuntimeContext } from "../context";
import type { BackendId, ToolResult } from "../../types";
import { executeBackendOperation } from "./common";

const schema = z.object({
  vault: z.string().min(1).optional(),
  id: z.string().min(1),
});

export async function executeCommandTool(
  runtime: RuntimeContext,
  requestId: string,
  epochId: number | undefined,
  backendHint: BackendId | undefined,
  input: unknown
): Promise<ToolResult<{ executed: boolean; id: string }>> {
  const payload = schema.parse(input);

  return await executeBackendOperation(
    runtime,
    {
      requestId,
      operation: "execute_command",
      epochId,
      backendHint,
      input: {
        vault: payload.vault,
        id: payload.id,
      },
    },
    () => ({ executed: true, id: payload.id }),
    "interactive"
  );
}
