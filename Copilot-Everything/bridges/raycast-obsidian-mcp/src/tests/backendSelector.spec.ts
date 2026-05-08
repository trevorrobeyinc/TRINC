import { describe, expect, it } from "vitest";
import { BackendSelector } from "../backends/backendSelector";
import type { Backend } from "../backends/backend";

function backend(available: boolean, ops: Array<"open_vault" | "read_note" | "search_notes">): Backend {
  return {
    id: "cli",
    async probe() {
      return {
        backend: "cli",
        available,
        supportedOps: ops,
        reliabilityScore: 0.97,
        p95MsByOp: { read_note: 120 },
        constraints: [],
      } as never;
    },
    async execute() {
      throw new Error("not used");
    },
  } as Backend;
}

describe("BackendSelector", () => {
  it("routes supported operations to cli when available", async () => {
    const selector = new BackendSelector({
      cli: backend(true, ["open_vault", "read_note", "search_notes"]),
    });

    const snapshot = await selector.refresh(true);
    expect(snapshot.operationMap.open_vault).toBe("cli");
    expect(snapshot.operationMap.read_note).toBe("cli");
  });

  it("supports selecting the cli backend explicitly", async () => {
    const selector = new BackendSelector({
      cli: backend(true, ["open_vault", "read_note", "search_notes"]),
    });
    await selector.refresh(true);
    const selected = await selector.selectSpecific("read_note", "cli");
    expect(selected.id).toBe("cli");
  });

  it("reports null routes when cli is unavailable", async () => {
    const selector = new BackendSelector({
      cli: backend(false, []),
    });

    const snapshot = await selector.refresh(true);
    expect(snapshot.operationMap.read_note).toBeNull();
    expect(snapshot.reasons.read_note).toBe("cli_unavailable");
  });
});
