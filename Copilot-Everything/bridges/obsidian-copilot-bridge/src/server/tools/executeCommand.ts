import { createHash } from "node:crypto";
import { z } from "zod";
import type { RuntimeContext } from "../context";
import type { BackendId, ToolResult } from "../../types";
import { executeBackendOperation } from "./common";
import { AppError } from "../errors";
import { ERROR_CODES } from "../errorCodes";
import { auditLog } from "../../observability/auditLog";

/** The launcher refuses a longer id (its MAX_COMMAND_ID_CHARS); this bridge refuses it first, and audits that. */
export const MAX_COMMAND_ID_CHARS = 200;

const schema = z.object({
  vault: z.string().min(1).optional(),
  id: z.string().min(1),
});

// Security (audit DT-2): execute_command runs Obsidian commands inside the renderer, and a RunJS-style plugin
// or a destructive command is one id away. Since 2026-11-25 the AUTHORITATIVE allow-list is the launcher's
// (obsidian-bridge-launcher src/commandPolicy.ts): its commands.execute refuses any other id, whatever this
// bridge sends, and audits the refusal. The checks here run first and are audited here: the id must be at most
// MAX_COMMAND_ID_CHARS long and have the "<plugin-id>:<command>" shape, the known-dangerous classes are refused
// early, and a non-empty config.security.executeCommandAllowlist narrows the launcher's list further (it can
// never widen it). When the launcher refuses an id these checks let through, that refusal is audited here too,
// as ALLOWLIST_DENY with reason "launcher_refused", so the SIEM rule on ALLOWLIST_DENY (100601) sees it.
export const COMMAND_ID_SHAPE = /^[a-z0-9_-]+:[a-z0-9_-]+$/i;
const DENIED_COMMAND_CLASSES: Array<{ pattern: RegExp; deniedClass: string }> = [
  { pattern: /^runjs:/i, deniedClass: "runjs:" }, // RunJS — arbitrary JavaScript execution in-process
  { pattern: /^app:delete\b/i, deniedClass: "app:delete" }, // destructive file/folder deletion
];

/**
 * What the audit log may say about a refused id: its length and sha256, never its text. A command-shaped id
 * can still carry prose (hyphens join words, for up to 200 characters), audit.jsonl feeds the SIEM, and personal
 * text must never land there. The reason word says why it was refused, and a known-dangerous class is named
 * ("runjs:", "app:delete") without the rest of the id.
 */
function describeId(id: string, deniedClass?: string): Record<string, unknown> {
  return {
    idLength: id.length,
    idSha256: createHash("sha256").update(id, "utf8").digest("hex"),
    ...(deniedClass ? { deniedClass } : {}),
  };
}

function emitDeny(requestId: string, id: string, reason: string, deniedClass?: string): void {
  auditLog.emit({
    eventType: "ALLOWLIST_DENY",
    requestId,
    tool: "obsidian_execute_command",
    ...describeId(id, deniedClass),
    result: "failure",
    source: "obsidian-copilot-bridge",
    reason,
  });
}

function deny(requestId: string, id: string, reason: string, message: string, deniedClass?: string): never {
  emitDeny(requestId, id, reason, deniedClass);
  throw new AppError(ERROR_CODES.COMMAND_NOT_ALLOWED, message);
}

function assertCommandAllowed(runtime: RuntimeContext, id: string, requestId: string): void {
  // The known-dangerous class is read first, so a probe padded past the length limit or bent out of the
  // command shape is still named for the SIEM.
  const deniedClass = DENIED_COMMAND_CLASSES.find(({ pattern }) => pattern.test(id))?.deniedClass;
  if (id.length > MAX_COMMAND_ID_CHARS) {
    deny(requestId, id, "too_long", `A command id is at most ${MAX_COMMAND_ID_CHARS} characters.`, deniedClass);
  }
  if (!COMMAND_ID_SHAPE.test(id)) {
    deny(requestId, id, "bad_shape", `Command '${id}' is not a '<plugin-id>:<command>' id.`, deniedClass);
  }
  if (deniedClass) {
    deny(requestId, id, "denied_pattern", `Command '${id}' is blocked by the bridge security policy.`, deniedClass);
  }
  // Typed directly off ServerConfig — no cast. The cast this replaced was what let the key
  // go missing from the zod schema unnoticed: it type-checked while the loader silently
  // stripped the value, so the allowlist branch below was unreachable dead code.
  const allow = runtime.config.security.executeCommandAllowlist;
  if (Array.isArray(allow) && allow.length > 0 && !allow.includes(id)) {
    deny(requestId, id, "not_in_allowlist", `Command '${id}' is not in executeCommandAllowlist.`);
  }
}

/** The launcher reports whether the command ran: false when Obsidian has no such command or its check declined. */
function parseExecuted(stdout: string): boolean {
  try {
    return (JSON.parse(stdout) as { executed?: unknown }).executed === true;
  } catch {
    return false;
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

  const result = await executeBackendOperation(
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
    (stdout) => ({ executed: parseExecuted(stdout), id: payload.id }),
    "interactive"
  );

  if (
    !result.ok &&
    result.error.code === ERROR_CODES.COMMAND_NOT_ALLOWED &&
    result.error.diagnostics?.launcherReason === "command_refused"
  ) {
    emitDeny(requestId, payload.id, "launcher_refused");
  }
  return result;
}
