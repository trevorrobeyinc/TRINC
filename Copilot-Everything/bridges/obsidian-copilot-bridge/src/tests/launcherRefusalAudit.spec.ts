import { afterAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";

// The audit sink is a process singleton that reads TREVCLAW_AUDIT_LOG when its module loads. vi.hoisted runs
// before every import below, so the sink points at a temp file: tests must never write the real audit trail
// that OSSEC tails.
const { auditFile } = vi.hoisted(() => {
  const file = `${process.env.TMPDIR ?? "/tmp"}/launcher-refusal-audit-${process.pid}-${Date.now()}.jsonl`;
  process.env.TREVCLAW_AUDIT_LOG = file;
  return { auditFile: file };
});

import { executeCommandTool } from "../server/tools/executeCommand";
import { BackendSelector } from "../backends/backendSelector";
import { LauncherIpcBackend, REQUIRED_LAUNCHER_METHODS } from "../backends/launcherIpcBackend";
import { LauncherIpcError } from "../server/launcherIpc";
import { Metrics } from "../observability/metrics";
import { createWriteLocker, ReadAfterWritePins } from "../server/context";
import { ERROR_CODES } from "../server/errorCodes";

// End to end, without mocks between the tool and the pipe: the launcher refuses a command, LauncherIpcBackend
// maps the refusal (launcherReason "command_refused"), executeBackendOperation turns it into a failure, and
// executeCommandTool audits it as ALLOWLIST_DENY reason launcher_refused. A renamed or dropped diagnostics key
// anywhere on that path fails this test.

afterAll(() => {
  fs.rmSync(auditFile, { force: true });
});

function launcherThatRefusesCommands() {
  return {
    async request<T>(method: string): Promise<T> {
      if (method === "vault.info") {
        return { vault: "V", version: "0.2.0", methods: ["vault.info", ...REQUIRED_LAUNCHER_METHODS] } as T;
      }
      if (method === "commands.execute") {
        throw new LauncherIpcError("that command is not on the launcher's allow-list", "command_refused");
      }
      throw new LauncherIpcError(`unknown launcher IPC method: ${method}`);
    },
  };
}

describe("a launcher refusal through the real backend path", () => {
  it("fails the call with COMMAND_NOT_ALLOWED and writes exactly one ALLOWLIST_DENY launcher_refused", async () => {
    const selector = new BackendSelector({ launcherIpc: new LauncherIpcBackend(launcherThatRefusesCommands()) });
    await selector.refresh(true);
    const runtime = {
      config: {
        security: { executeCommandAllowlist: [] },
        timeouts: { openVaultMs: 25_000, createNoteMs: 20_000, appendNoteMs: 20_000, readNoteMs: 15_000, searchNotesMs: 20_000 },
        logging: { slowThresholdMs: { execute_command: 3_000 } },
      },
      selector,
      metrics: new Metrics(),
      logger: { warn: () => undefined, info: () => undefined },
      withWriteLock: createWriteLocker(),
      readPins: new ReadAfterWritePins(),
    } as never;

    const result = await executeCommandTool(runtime, "req-e2e", undefined, undefined, { id: "command-center:smoke-refusal" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(ERROR_CODES.COMMAND_NOT_ALLOWED);
    expect(result.error.diagnostics).toEqual({ launcherMethod: "commands.execute", launcherReason: "command_refused" });

    const denials = fs
      .readFileSync(auditFile, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .filter((event) => event.eventType === "ALLOWLIST_DENY");
    expect(denials).toHaveLength(1);
    expect(denials[0]).toMatchObject({ reason: "launcher_refused", requestId: "req-e2e", source: "obsidian-copilot-bridge" });
    expect(denials[0].operation).toBeUndefined();
  });
});
