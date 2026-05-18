import { describe, expect, it } from "vitest";
import { BackendSelector } from "../backends/backendSelector";
import type { Backend } from "../backends/backend";

function restApiBackend(available: boolean, ops: Array<"open_vault" | "read_note" | "search_notes" | "create_note" | "append_note" | "execute_command">, constraints: string[] = []): Backend {
  return {
    id: "restApi",
    async probe() {
      return {
        backend: "restApi",
        available,
        supportedOps: ops,
        reliabilityScore: available ? 0.99 : 0,
        p95MsByOp: { read_note: 150 },
        constraints,
        lastErrorAt: available ? undefined : new Date().toISOString(),
      } as never;
    },
    async execute() {
      throw new Error("not used");
    },
  } as Backend;
}

describe("BackendSelector (REST-only)", () => {
  it("requires a restApi backend to be registered", () => {
    expect(() => new BackendSelector({} as never)).toThrow(/restApi backend is required/);
  });

  it("routes supported operations to restApi when available", async () => {
    const selector = new BackendSelector({
      restApi: restApiBackend(true, ["open_vault", "read_note", "search_notes"]),
    });

    const snapshot = await selector.refresh(true);
    expect(snapshot.operationMap.open_vault).toBe("restApi");
    expect(snapshot.operationMap.read_note).toBe("restApi");
    expect(snapshot.reasons.read_note).toBe("restApi_selected_via_priority");
  });

  it("returns null routes with reason 'no_backend_available' when restApi is unavailable", async () => {
    const selector = new BackendSelector({
      restApi: restApiBackend(false, [], ["probe_failed:ECONNREFUSED 127.0.0.1:27124"]),
    });

    const snapshot = await selector.refresh(true);
    expect(snapshot.operationMap.read_note).toBeNull();
    expect(snapshot.reasons.read_note).toBe("no_backend_available");
    // Capability is still surfaced for downstream diagnostics (obsidian_health uses this).
    expect(snapshot.capabilities.restApi?.available).toBe(false);
    expect(snapshot.capabilities.restApi?.constraints[0]).toMatch(/ECONNREFUSED/);
  });

  it("supports selecting restApi backend explicitly", async () => {
    const selector = new BackendSelector({
      restApi: restApiBackend(true, ["read_note"]),
    });
    await selector.refresh(true);
    const selected = await selector.selectSpecific("read_note", "restApi");
    expect(selected.id).toBe("restApi");
  });
});
