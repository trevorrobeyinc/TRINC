import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const { executeBackendOperationMock } = vi.hoisted(() => ({ executeBackendOperationMock: vi.fn() }));

vi.mock("../server/tools/common", async () => {
  const actual = await vi.importActual<typeof import("../server/tools/common")>("../server/tools/common");
  return { ...actual, executeBackendOperation: executeBackendOperationMock };
});

import { appendNoteTool } from "../server/tools/appendNote";
import { createNoteTool } from "../server/tools/createNote";
import { AppError } from "../server/errors";
import { ERROR_CODES } from "../server/errorCodes";

// append_note sends the path its guard checked, as create_note and read_note do: the launcher re-checks what it
// is sent (and does not trim), and the write lock and read pins are keyed on it. Until 2026-11-25 it sent the
// client's raw text to both the append and its reconciliation read.

const root = fs.mkdtempSync(path.join(os.tmpdir(), "append-guarded-"));

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function freshLedger() {
  return {
    get: () => null,
    start: () => ({ state: "STARTED" }),
    ambiguous: vi.fn(),
    forgetUnwritten: vi.fn(),
    commit: vi.fn(),
    reconcile: vi.fn(),
  };
}

function runtimeWith(ledger: ReturnType<typeof freshLedger>) {
  return {
    config: { readOnlyMode: false, allowedVaultRoots: [root] },
    ledger,
    selector: { currentSnapshot: () => ({ epochId: 1 }) },
  } as never;
}

describe("appendNoteTool", () => {
  beforeEach(() => {
    executeBackendOperationMock.mockReset();
  });

  it("sends the guarded path to the append, and confirms it with a tail read of the same path", async () => {
    const sent: Array<{ operation: string; path: unknown; tailChars?: unknown }> = [];
    let written = "";
    executeBackendOperationMock.mockImplementation(async (_runtime, request, transform) => {
      sent.push({ operation: request.operation, path: request.input.path, tailChars: request.input.tailChars });
      if (request.operation === "append_note") written = String(request.input.content);
      return {
        ok: true,
        data: transform(request.operation === "read_note" ? written : ""),
        meta: { requestId: request.requestId, durationMs: 0 },
      };
    });
    const ledger = freshLedger();
    const runtime = runtimeWith(ledger);

    const raw = `  Projects${String.fromCharCode(92)}log.md  `;
    const result = await appendNoteTool(runtime, "req-1", 1, undefined, {
      vault: "V",
      vaultRoot: root,
      path: raw,
      content: "x",
      idempotencyKey: "key-1",
    });

    expect(result).toMatchObject({ ok: true, data: { path: "Projects/log.md", idempotencyState: "COMMITTED" } });
    expect(sent).toEqual([
      { operation: "append_note", path: "Projects/log.md", tailChars: undefined },
      { operation: "read_note", path: "Projects/log.md", tailChars: 16_384 },
    ]);
    expect(ledger.commit).toHaveBeenCalledTimes(1);
  });

  it("marks the key ambiguous when the launcher times out, because the append may have landed", async () => {
    executeBackendOperationMock.mockResolvedValue({
      ok: false,
      error: { code: ERROR_CODES.LAUNCHER_IPC_TIMEOUT, message: "launcher IPC timeout", retryable: true },
      meta: { requestId: "req-2", durationMs: 15_000 },
    });
    const ledger = freshLedger();
    const result = await appendNoteTool(runtimeWith(ledger), "req-2", 1, undefined, {
      vault: "V",
      vaultRoot: root,
      path: "log.md",
      content: "x",
      idempotencyKey: "key-2",
    });
    expect(result.ok).toBe(false);
    expect(ledger.ambiguous).toHaveBeenCalledWith("append_note", "key-2", "launcher IPC timeout");
  });

  // What becomes of the key when the append itself fails (2026-11-27). Forgotten only when the failure proves the
  // note untouched; the rest stay ambiguous, so a same-key retry reconciles instead of appending a second time.
  async function keyAfter(error: { code: string; diagnostics?: Record<string, unknown> }) {
    executeBackendOperationMock.mockResolvedValue({
      ok: false,
      error: { message: `failed: ${error.code}`, retryable: false, ...error },
      meta: { requestId: "req-k", durationMs: 0 },
    });
    const ledger = freshLedger();
    const result = await appendNoteTool(runtimeWith(ledger), "req-k", 1, undefined, {
      vault: "V",
      vaultRoot: root,
      path: "log.md",
      content: "x",
      idempotencyKey: "key-k",
    });
    expect(result.ok).toBe(false);
    const forgotten = ledger.forgetUnwritten.mock.calls;
    const ambiguous = ledger.ambiguous.mock.calls;
    if (forgotten.length === 1 && ambiguous.length === 0) {
      expect(forgotten[0]).toEqual(["append_note", "key-k"]);
      return "forgotten";
    }
    if (ambiguous.length === 1 && forgotten.length === 0) {
      expect(ambiguous[0]).toEqual(["append_note", "key-k", `failed: ${error.code}`]);
      return "ambiguous";
    }
    return `forgotten ${forgotten.length}, ambiguous ${ambiguous.length}`;
  }

  it("forgets the key when the selector refused before any backend ran", async () => {
    expect(await keyAfter({ code: ERROR_CODES.NO_CAPABLE_BACKEND })).toBe("forgotten");
    expect(await keyAfter({ code: ERROR_CODES.BACKEND_SELECTION_STALE })).toBe("forgotten");
  });

  it("forgets the key when the request never left the bridge, and only then for an unavailable pipe", async () => {
    expect(await keyAfter({ code: ERROR_CODES.LAUNCHER_IPC_UNAVAILABLE, diagnostics: { requestSent: false } })).toBe("forgotten");
    expect(
      await keyAfter({
        code: ERROR_CODES.LAUNCHER_IPC_UNAVAILABLE,
        diagnostics: { launcherMethod: "vault.append", launcherReason: "closed" },
      })
    ).toBe("ambiguous");
    expect(await keyAfter({ code: ERROR_CODES.LAUNCHER_IPC_UNAVAILABLE, diagnostics: { requestSent: true } })).toBe("ambiguous");
  });

  it("keeps the four timeout codes ambiguous", async () => {
    for (const code of [
      ERROR_CODES.CLI_TIMEOUT,
      ERROR_CODES.CLI_EXIT_NONZERO,
      ERROR_CODES.QUEUE_TIMEOUT,
      ERROR_CODES.LAUNCHER_IPC_TIMEOUT,
    ]) {
      expect(await keyAfter({ code, diagnostics: { launcherMethod: "vault.append", launcherReason: "timeout" } }), code).toBe(
        "ambiguous"
      );
    }
  });

  it("forgets the key when the launcher refused with a reason its append raises only before writing", async () => {
    const refusals: Array<[string, string]> = [
      [ERROR_CODES.PATH_INVALID, "path_refused"],
      [ERROR_CODES.INTERNAL_ERROR, "invalid_params"],
      [ERROR_CODES.PAYLOAD_TOO_LARGE, "too_large"],
    ];
    for (const [code, launcherReason] of refusals) {
      expect(await keyAfter({ code, diagnostics: { launcherMethod: "vault.append", launcherReason } }), launcherReason).toBe(
        "forgotten"
      );
    }
  });

  it("keeps the key ambiguous for any other launcher reason, including one it has never seen", async () => {
    const others: Array<[string, unknown]> = [
      [ERROR_CODES.LAUNCHER_IPC_UNAVAILABLE, "closed"],
      [ERROR_CODES.LAUNCHER_IPC_UNAVAILABLE, "unavailable"],
      [ERROR_CODES.NOTE_NOT_FOUND, "not_found"],
      [ERROR_CODES.ALREADY_EXISTS, "already_exists"],
      [ERROR_CODES.COMMAND_NOT_ALLOWED, "command_refused"],
      [ERROR_CODES.INTERNAL_ERROR, "disk_full"],
      [ERROR_CODES.INTERNAL_ERROR, ""],
    ];
    for (const [code, launcherReason] of others) {
      expect(
        await keyAfter({ code, diagnostics: { launcherMethod: "vault.append", launcherReason } }),
        String(launcherReason)
      ).toBe("ambiguous");
    }
  });

  it("keeps the key ambiguous for a failure that may have come after the write", async () => {
    // A write that threw in the renderer (no launcher reason), an unreadable answer, anything unexpected.
    expect(await keyAfter({ code: ERROR_CODES.INTERNAL_ERROR, diagnostics: { launcherMethod: "vault.append" } })).toBe("ambiguous");
    expect(await keyAfter({ code: ERROR_CODES.INTERNAL_ERROR })).toBe("ambiguous");
  });

  it("refuses a body over the byte limit (under the character limit) as PAYLOAD_TOO_LARGE, before the key is started or anything sent", async () => {
    const accented = String.fromCodePoint(0xe9).repeat(8 * 1024 * 1024);
    const ledger = freshLedger();
    const start = vi.spyOn(ledger, "start");
    try {
      await appendNoteTool(runtimeWith(ledger), "req-3", 1, undefined, {
        vault: "V",
        vaultRoot: root,
        path: "log.md",
        idempotencyKey: "key-3",
        content: accented,
      });
      throw new Error("expected a refusal");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe(ERROR_CODES.PAYLOAD_TOO_LARGE);
    }
    expect(start).not.toHaveBeenCalled();
    expect(executeBackendOperationMock).not.toHaveBeenCalled();
  });

  it("refuses an idempotency key over 256 characters before anything is sent", async () => {
    await expect(
      appendNoteTool(runtimeWith(freshLedger()), "req-3", 1, undefined, {
        vault: "V",
        vaultRoot: root,
        path: "log.md",
        content: "x",
        idempotencyKey: "k".repeat(257),
      })
    ).rejects.toThrow();
    expect(executeBackendOperationMock).not.toHaveBeenCalled();
  });
});

describe("createNoteTool", () => {
  beforeEach(() => {
    executeBackendOperationMock.mockReset();
  });

  it("refuses a body over 16 MiB of UTF-8 as PAYLOAD_TOO_LARGE before anything is made on disk or sent", async () => {
    const accented = String.fromCodePoint(0xe9).repeat(8 * 1024 * 1024 + 1);
    try {
      await createNoteTool(runtimeWith(freshLedger()), "req-4", 1, undefined, {
        vault: "V",
        vaultRoot: root,
        path: "Big/note.md",
        content: accented,
      });
      throw new Error("expected a refusal");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe(ERROR_CODES.PAYLOAD_TOO_LARGE);
    }
    expect(executeBackendOperationMock).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(root, "Big"))).toBe(false);
  });

  it("accepts a body of exactly 16 MiB of UTF-8", async () => {
    executeBackendOperationMock.mockImplementation(async (_runtime, request, transform) => ({
      ok: true,
      data: transform(""),
      meta: { requestId: request.requestId, durationMs: 0 },
    }));
    const result = await createNoteTool(runtimeWith(freshLedger()), "req-5", 1, undefined, {
      vault: "V",
      vaultRoot: root,
      path: "Exact/note.md",
      content: "x".repeat(16 * 1024 * 1024),
    });
    expect(result.ok).toBe(true);
    expect(executeBackendOperationMock).toHaveBeenCalledTimes(1);
  });
});
