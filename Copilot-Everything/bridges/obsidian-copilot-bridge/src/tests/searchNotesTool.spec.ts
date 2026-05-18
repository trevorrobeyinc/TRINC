import { beforeEach, describe, expect, it, vi } from "vitest";

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

describe("searchNotesTool", () => {
  beforeEach(() => {
    executeBackendOperationMock.mockReset();
  });

  it("returns an empty match list when the CLI reports no matches", async () => {
    executeBackendOperationMock.mockImplementation(async (_runtime, _request, transform) => ({
      ok: true,
      data: transform("No matches found.\n"),
      meta: {
        requestId: "req-1",
        durationMs: 0,
        backendUsed: "restApi",
      },
    }));

    const result = await searchNotesTool({} as never, "req-1", 1, "restApi", {
      vault: "My Digital Garden",
      query: "missing phrase",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected ok result.");
    }
    expect(result.data).toEqual({
      query: "missing phrase",
      matches: [],
    });
  });

  it("returns an empty match list when warnings precede the no-match response", async () => {
    executeBackendOperationMock.mockImplementation(async (_runtime, _request, transform) => ({
      ok: true,
      data: transform("warning: still warming up\nNo matches found.\n"),
      meta: {
        requestId: "req-2",
        durationMs: 0,
        backendUsed: "restApi",
      },
    }));

    const result = await searchNotesTool({} as never, "req-2", 1, "restApi", {
      vault: "My Digital Garden",
      query: "missing phrase",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected ok result.");
    }
    expect(result.data).toEqual({
      query: "missing phrase",
      matches: [],
    });
  });
});
