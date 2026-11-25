import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import { createHash } from "node:crypto";

// The audit sink is a process singleton that reads TREVCLAW_AUDIT_LOG when its module loads. vi.hoisted runs
// before every import below, so the sink points at a temp file: tests must never write the real audit trail
// that OSSEC tails.
const { auditFile, executeBackendOperationMock } = vi.hoisted(() => {
  const file = `${process.env.TMPDIR ?? "/tmp"}/execute-command-audit-${process.pid}-${Date.now()}.jsonl`;
  process.env.TREVCLAW_AUDIT_LOG = file;
  return { auditFile: file, executeBackendOperationMock: vi.fn() };
});

vi.mock("../server/tools/common", async () => {
  const actual = await vi.importActual<typeof import("../server/tools/common")>("../server/tools/common");
  return { ...actual, executeBackendOperation: executeBackendOperationMock };
});

import { executeCommandTool } from "../server/tools/executeCommand";
import { AppError } from "../server/errors";
import { ERROR_CODES } from "../server/errorCodes";

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

function runtime(allowlist: string[] = []) {
  return { config: { security: { executeCommandAllowlist: allowlist } } } as never;
}

function denials(): Array<Record<string, unknown>> {
  if (!fs.existsSync(auditFile)) return [];
  return fs
    .readFileSync(auditFile, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>)
    .filter((event) => event.eventType === "ALLOWLIST_DENY");
}

async function refusedCode(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    return (error as AppError).code;
  }
  throw new Error("expected a refusal");
}

beforeEach(() => {
  executeBackendOperationMock.mockReset();
  fs.rmSync(auditFile, { force: true });
});

afterAll(() => {
  fs.rmSync(auditFile, { force: true });
});

describe("executeCommandTool", () => {
  it("refuses an id without the command shape and audits it by length and sha256, never its text", async () => {
    const prose = "a private sentence, not a command";
    expect(await refusedCode(executeCommandTool(runtime(), "req-1", 1, undefined, { id: prose }))).toBe(
      ERROR_CODES.COMMAND_NOT_ALLOWED
    );
    const [event] = denials();
    expect(event).toMatchObject({
      reason: "bad_shape",
      idLength: prose.length,
      idSha256: createHash("sha256").update(prose, "utf8").digest("hex"),
    });
    expect(event.operation).toBeUndefined();
    expect(fs.readFileSync(auditFile, "utf8")).not.toContain("private");
    expect(executeBackendOperationMock).not.toHaveBeenCalled();
  });

  it("refuses a denied class and a command outside a configured narrowing, naming the class but never the id", async () => {
    await refusedCode(executeCommandTool(runtime(), "req-2", 1, undefined, { id: "runjs:jane-doe-notes" }));
    await refusedCode(
      executeCommandTool(runtime(["command-center:run-workflow"]), "req-3", 1, undefined, {
        id: "command-center:toggle-pipeline-sidebar",
      })
    );
    const [denied, narrowed] = denials();
    expect(denied).toMatchObject({ reason: "denied_pattern", deniedClass: "runjs:", idSha256: sha256("runjs:jane-doe-notes") });
    expect(narrowed).toMatchObject({ reason: "not_in_allowlist", idLength: "command-center:toggle-pipeline-sidebar".length });
    expect(denied.operation).toBeUndefined();
    expect(narrowed.operation).toBeUndefined();
    expect(fs.readFileSync(auditFile, "utf8")).not.toMatch(/jane|toggle-pipeline/);
  });

  it("audits the launcher's refusal as ALLOWLIST_DENY launcher_refused and returns its failure unchanged", async () => {
    const failure = {
      ok: false,
      error: {
        code: ERROR_CODES.COMMAND_NOT_ALLOWED,
        message: "that command is not on the launcher's allow-list",
        retryable: false,
        diagnostics: { launcherMethod: "commands.execute", launcherReason: "command_refused" },
      },
      meta: { requestId: "req-4", durationMs: 1 },
    };
    executeBackendOperationMock.mockResolvedValue(failure);
    const result = await executeCommandTool(runtime(), "req-4", 1, undefined, { id: "command-center:cancel-workflow" });
    expect(result).toBe(failure);
    expect(denials()).toEqual([
      expect.objectContaining({
        reason: "launcher_refused",
        idSha256: sha256("command-center:cancel-workflow"),
        requestId: "req-4",
        source: "obsidian-copilot-bridge",
      }),
    ]);
    expect(denials()[0].operation).toBeUndefined();
  });

  it("does not audit a launcher failure that is not a command refusal", async () => {
    executeBackendOperationMock.mockResolvedValue({
      ok: false,
      error: { code: ERROR_CODES.LAUNCHER_IPC_TIMEOUT, message: "timeout", retryable: false, diagnostics: {} },
      meta: { requestId: "req-7", durationMs: 1 },
    });
    await executeCommandTool(runtime(), "req-7", 1, undefined, { id: "command-center:run-workflow" });
    expect(denials()).toEqual([]);
  });

  it("audits nothing when the command runs", async () => {
    executeBackendOperationMock.mockImplementation(async (_runtime, request, transform) => ({
      ok: true,
      data: transform(JSON.stringify({ executed: true })),
      meta: { requestId: request.requestId, durationMs: 1 },
    }));
    const result = await executeCommandTool(runtime(), "req-5", 1, undefined, { id: "command-center:run-workflow" });
    expect(result).toMatchObject({ ok: true, data: { executed: true, id: "command-center:run-workflow" } });
    expect(denials()).toEqual([]);
  });

  it("refuses an id longer than the launcher accepts, audits it by digest, and still names a padded runjs: probe", async () => {
    for (const id of [`a:${"b".repeat(200)}`, `runjs:${"x".repeat(300)}`]) {
      expect(await refusedCode(executeCommandTool(runtime(), "req-6", 1, undefined, { id }))).toBe(ERROR_CODES.COMMAND_NOT_ALLOWED);
    }
    expect(denials().map((e) => [e.reason, e.idLength, e.deniedClass])).toEqual([
      ["too_long", 202, undefined],
      ["too_long", 306, "runjs:"],
    ]);
    expect(denials().every((e) => e.operation === undefined)).toBe(true);
    expect(fs.readFileSync(auditFile, "utf8")).not.toMatch(/bbbbbbbb|xxxxxxxx/);
    expect(executeBackendOperationMock).not.toHaveBeenCalled();
  });

  it("names the app:delete class, and a runjs: probe bent out of the command shape", async () => {
    await refusedCode(executeCommandTool(runtime(), "req-8", 1, undefined, { id: "app:delete-file" }));
    await refusedCode(executeCommandTool(runtime(), "req-9", 1, undefined, { id: "runjs:a b/c" }));
    expect(denials().map((e) => [e.reason, e.deniedClass])).toEqual([
      ["denied_pattern", "app:delete"],
      ["bad_shape", "runjs:"],
    ]);
  });

  it("never writes the refused id's text for a launcher refusal", async () => {
    executeBackendOperationMock.mockResolvedValue({
      ok: false,
      error: {
        code: ERROR_CODES.COMMAND_NOT_ALLOWED,
        message: "refused",
        retryable: false,
        diagnostics: { launcherMethod: "commands.execute", launcherReason: "command_refused" },
      },
      meta: { requestId: "req-10", durationMs: 1 },
    });
    await executeCommandTool(runtime(), "req-10", 1, undefined, { id: "command-center:smoke-refusal" });
    expect(denials()).toHaveLength(1);
    expect(fs.readFileSync(auditFile, "utf8")).not.toContain("smoke-refusal");
  });
});
