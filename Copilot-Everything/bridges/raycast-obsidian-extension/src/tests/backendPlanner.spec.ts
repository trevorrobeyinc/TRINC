import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { BackendPlanner } from "@/api/mcp/backendPlanner.service";

describe("BackendPlanner", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      text: async () =>
        JSON.stringify({
          ok: true,
          data: {
            status: "healthy",
            routing: {
              epochId: 10,
              refreshedAt: Date.now(),
              operationMap: {
                open_vault: "restApi",
                create_note: "restApi",
                append_note: "restApi",
                read_note: "restApi",
                search_notes: "restApi",
                execute_command: "restApi",
              },
              reasons: {
                open_vault: "score",
                create_note: "score",
                append_note: "score",
                read_note: "score",
                search_notes: "score",
                execute_command: "score",
              },
            },
            security: {
              transportMode: "https",
              corsDisabled: true,
              replayGuardEnabled: true,
              tokenEntropyBits: 140,
            },
            metrics: {},
          },
          meta: { requestId: "x", durationMs: 0 },
        }),
    } as never);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns operation route with epoch and no backend hint", async () => {
    const planner = new BackendPlanner();
    const route = await planner.routeFor("create_note");
    expect(route.epochId).toBe(10);
    expect(route.operation).toBe("create_note");
    expect(route).not.toHaveProperty("backendHint");
  });

  it("never serializes backendHint onto the wire", async () => {
    const planner = new BackendPlanner();
    await planner.callRouted("obsidian_create_note", "create_note", { vault: "v", path: "n.md" });

    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    // Call 0 is the obsidian_health refresh, call 1 is the routed tool call.
    expect(fetchMock.mock.calls.length).toBe(2);
    for (const call of fetchMock.mock.calls) {
      const body = JSON.parse((call[1] as { body: string }).body);
      expect(body).not.toHaveProperty("backendHint");
    }

    const toolBody = JSON.parse((fetchMock.mock.calls[1][1] as { body: string }).body);
    expect(toolBody.tool).toBe("obsidian_create_note");
    expect(toolBody.epochId).toBe(10);
  });
});
