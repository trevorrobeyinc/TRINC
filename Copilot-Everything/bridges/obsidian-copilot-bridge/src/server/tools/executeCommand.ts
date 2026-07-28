import { z } from "zod";
import type { RuntimeContext } from "../context";
import type { BackendId, ToolResult } from "../../types";
import { executeBackendOperation } from "./common";
import { AppError } from "../errors";
import { ERROR_CODES } from "../errorCodes";
import { auditLog } from "../../observability/auditLog";

const schema = z.object({
  vault: z.string().min(1).optional(),
  id: z.string().min(1),
});

// Security (audit DT-2): execute_command can invoke ANY Obsidian command, incl.
// arbitrary-code plugins (runjs) and destructive actions. Block the dangerous
// classes by default; if config.security.executeCommandAllowlist is non-empty,
// enforce a strict allowlist instead.
const DENIED_COMMAND_PATTERNS: RegExp[] = [
  /^runjs:/i, // RunJS — arbitrary JavaScript execution in-process
  /^app:delete\b/i, // destructive file/folder deletion
];

function assertCommandAllowed(runtime: RuntimeContext, id: string, requestId: string): void {
  // Typed directly off ServerConfig — no cast. The cast this replaced was what let the key
  // go missing from the zod schema unnoticed: it type-checked while the loader silently
  // stripped the value, so the allowlist branch below was unreachable dead code.
  const allow = runtime.config.security.executeCommandAllowlist;
  if (Array.isArray(allow) && allow.length > 0) {
    if (!allow.includes(id)) {
      auditLog.emit({
        eventType: "ALLOWLIST_DENY",
        requestId,
        tool: "obsidian_execute_command",
        operation: id,
        result: "failure",
        source: "obsidian-copilot-bridge",
        reason: "not_in_allowlist",
      });
      throw new AppError(ERROR_CODES.COMMAND_NOT_ALLOWED, `Command '${id}' is not in executeCommandAllowlist.`);
    }
    return;
  }
  for (const pattern of DENIED_COMMAND_PATTERNS) {
    if (pattern.test(id)) {
      auditLog.emit({
        eventType: "ALLOWLIST_DENY",
        requestId,
        tool: "obsidian_execute_command",
        operation: id,
        result: "failure",
        source: "obsidian-copilot-bridge",
        reason: "denied_pattern",
      });
      throw new AppError(ERROR_CODES.COMMAND_NOT_ALLOWED, `Command '${id}' is blocked by the bridge security policy.`);
    }
  }
}

export async function executeCommandTool(
  runtime: RuntimeContext,
  requestId: string,
  epochId: number | undefined,
  backendHint: BackendId | undefined,
  input: unknown
): Promise<ToolResult<{ executed: boolean; id: string }>> {
  const payload = schema.parse(input);
  assertCommandAllowed(runtime, payload.id, requestId);

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
