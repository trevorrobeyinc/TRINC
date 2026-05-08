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
            backends: {
              cli: { capabilities: { available: true } },
            },
            routing: {
              epochId: 10,
              refreshedAt: Date.now(),
              operationMap: {
                open_vault: "cli",
                create_note: "cli",
                append_note: "cli",
                read_note: "cli",
                search_notes: "cli",
                execute_command: "cli",
              },
              reasons: {
                open_vault: "required:cli",
                create_note: "score",
                append_note: "score",
                read_note: "score",
                search_notes: "score",
                execute_command: "score",
              },
            },
            security: {
              transportMode: "http",
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

  it("returns operation route with backend and epoch", async () => {
    const planner = new BackendPlanner();
    const route = await planner.routeFor("create_note");
    expect(route.backendHint).toBe("cli");
    expect(route.epochId).toBe(10);
  });
});
