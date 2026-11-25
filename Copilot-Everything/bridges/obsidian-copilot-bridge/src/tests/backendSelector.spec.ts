import { describe, expect, it } from "vitest";
import { BackendSelector } from "../backends/backendSelector";
import type { Backend } from "../backends/backend";
import { LauncherIpcBackend } from "../backends/launcherIpcBackend";
import { LauncherIpcError } from "../server/launcherIpc";
import { AppError } from "../server/errors";
import { ERROR_CODES } from "../server/errorCodes";

function launcherIpcBackend(available: boolean, ops: Array<"open_vault" | "read_note" | "search_notes" | "create_note" | "append_note" | "execute_command">, constraints: string[] = []): Backend {
  return {
    id: "launcherIpc",
    async probe() {
      return {
        backend: "launcherIpc",
        available,
        supportedOps: ops,
        reliabilityScore: available ? 0.99 : 0,
        p95MsByOp: { read_note: 50 },
        constraints,
        lastErrorAt: available ? undefined : new Date().toISOString(),
      } as never;
    },
    async execute() {
      throw new Error("not used");
    },
  } as Backend;
}

describe("BackendSelector (launcher IPC only)", () => {
  it("requires a launcherIpc backend to be registered", () => {
    expect(() => new BackendSelector({} as never)).toThrow(/launcherIpc backend is required/);
  });

  it("routes supported operations to launcherIpc when available", async () => {
    const selector = new BackendSelector({
      launcherIpc: launcherIpcBackend(true, ["open_vault", "read_note", "search_notes"]),
    });

    const snapshot = await selector.refresh(true);
    expect(snapshot.operationMap.open_vault).toBe("launcherIpc");
    expect(snapshot.operationMap.read_note).toBe("launcherIpc");
    expect(snapshot.reasons.read_note).toBe("launcherIpc_selected_via_priority");
  });

  it("returns null routes with reason 'no_backend_available' when launcherIpc is unavailable", async () => {
    const selector = new BackendSelector({
      launcherIpc: launcherIpcBackend(false, [], ["probe_failed:launcher IPC timeout: method=vault.info timeoutMs=3000"]),
    });

    const snapshot = await selector.refresh(true);
    expect(snapshot.operationMap.read_note).toBeNull();
    expect(snapshot.reasons.read_note).toBe("no_backend_available");
    // Capability is still surfaced for downstream diagnostics (obsidian_health uses this).
    expect(snapshot.capabilities.launcherIpc?.available).toBe(false);
    expect(snapshot.capabilities.launcherIpc?.constraints[0]).toMatch(/launcher IPC timeout/);
    await expect(selector.select("read_note")).rejects.toThrow(/launcher IPC backend is unavailable/);
  });

  it("calls a refusal retryable only when the launcher may answer later in this process", async () => {
    const timingOut = {
      async request<T>(): Promise<T> {
        throw new LauncherIpcError("launcher IPC timeout: method=vault.info timeoutMs=3000", "timeout");
      },
    };
    const retryableFor = async (backend: LauncherIpcBackend): Promise<boolean> => {
      const selector = new BackendSelector({ launcherIpc: backend });
      await selector.refresh(true);
      try {
        await selector.select("read_note");
        throw new Error("expected a refusal");
      } catch (error) {
        expect((error as AppError).code).toBe(ERROR_CODES.NO_CAPABLE_BACKEND);
        return (error as AppError).retryable;
      }
    };
    expect(await retryableFor(new LauncherIpcBackend(null))).toBe(false);
    expect(await retryableFor(new LauncherIpcBackend(timingOut))).toBe(true);
  });

  it("supports selecting launcherIpc backend explicitly", async () => {
    const selector = new BackendSelector({
      launcherIpc: launcherIpcBackend(true, ["read_note"]),
    });
    await selector.refresh(true);
    const selected = await selector.selectSpecific("read_note", "launcherIpc");
    expect(selected.id).toBe("launcherIpc");
  });
});
