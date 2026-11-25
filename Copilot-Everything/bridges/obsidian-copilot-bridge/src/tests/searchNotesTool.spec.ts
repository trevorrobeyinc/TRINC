import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const { executeBackendOperationMock } = vi.hoisted(() => ({
  executeBackendOperationMock: vi.fn(),
}));

vi.mock("../server/tools/common", async () => {
  const actual = await vi.importActual<typeof import("../server/tools/common")>("../server/tools/common");
  return {
    ...actual,
    executeBackendOperation: executeBackendOperationMock,
  };
});

import { searchNotesTool } from "../server/tools/searchNotes";
import { AppError } from "../server/errors";
import { ERROR_CODES } from "../server/errorCodes";

// What LauncherIpcBackend hands the transform since 2026-11-25: the launcher's results as a JSON array of
// { path, text? } (the CLI-era "No matches found." text no longer reaches this tool). A folder is normalised and
// guarded here before the launcher sees it.

const root = fs.mkdtempSync(path.join(os.tmpdir(), "search-folder-"));
const runtime = { config: { allowedVaultRoots: [root] } } as never;

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function answering(stdout: string) {
  executeBackendOperationMock.mockImplementation(async (_runtime, request, transform) => ({
    ok: true,
    data: transform(stdout),
    meta: { requestId: request.requestId, durationMs: 0, backendUsed: "launcherIpc" },
  }));
}

describe("searchNotesTool", () => {
  beforeEach(() => {
    executeBackendOperationMock.mockReset();
  });

  it("returns an empty match list when the launcher finds nothing", async () => {
    answering("[]");
    const result = await searchNotesTool(runtime, "req-1", 1, "launcherIpc", {
      vault: "My Digital Garden",
      query: "missing phrase",
    });
    expect(result).toMatchObject({ ok: true, data: { query: "missing phrase", matches: [] } });
  });

  it("passes through matches with and without context text, sending the folder as the guard normalised it", async () => {
    answering(JSON.stringify([{ path: "A.md", text: "...a match..." }, { path: "Notes/b.md" }]));
    const result = await searchNotesTool(runtime, "req-2", 1, "launcherIpc", {
      vault: "My Digital Garden",
      query: "match",
      path: " ./Notes/ ",
      limit: 2,
    });
    expect(result).toMatchObject({
      ok: true,
      data: { query: "match", matches: [{ path: "A.md", text: "...a match..." }, { path: "Notes/b.md" }] },
    });
    expect(executeBackendOperationMock.mock.calls[0][1].input).toMatchObject({ query: "match", path: "Notes", limit: 2 });
  });

  it("sends no folder for the vault root, however it is spelled", async () => {
    answering("[]");
    for (const folder of ["/", ".", "./", "  "]) {
      await searchNotesTool(runtime, "req-3", 1, "launcherIpc", { vault: "V", query: "q", path: folder });
    }
    for (const call of executeBackendOperationMock.mock.calls) {
      expect(call[1].input.path).toBeUndefined();
    }
  });

  it("refuses a folder its guard refuses as PATH_INVALID, before the launcher is asked", async () => {
    for (const folder of ["a//b", "../outside", "Notes/.obsidian"]) {
      try {
        await searchNotesTool(runtime, "req-4", 1, "launcherIpc", { vault: "V", query: "q", path: folder });
        throw new Error(`expected ${folder} to be refused`);
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).code, folder).toBe(ERROR_CODES.PATH_INVALID);
      }
    }
    expect(executeBackendOperationMock).not.toHaveBeenCalled();
  });

  it("refuses a blank query, an over-long query and an over-long folder before the launcher is asked", async () => {
    for (const input of [{ query: "   " }, { query: "q".repeat(1025) }, { query: "q", path: "f".repeat(1025) }]) {
      await expect(searchNotesTool(runtime, "req-5", 1, "launcherIpc", { vault: "V", ...input })).rejects.toThrow();
    }
    expect(executeBackendOperationMock).not.toHaveBeenCalled();
  });
});
