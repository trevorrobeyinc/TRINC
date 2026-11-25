import { describe, expect, it } from "vitest";
import { obsidianHealthTool } from "../server/tools/obsidianHealth";

// obsidian_health's shape since 2026-11-25: a launcherIpc block (never restApi), and a diagnosis for each way
// the launcher pipe can be unavailable.

function runtimeWith(capability: Record<string, unknown> | undefined) {
  return {
    selector: {
      refresh: async () => ({
        epochId: 1,
        refreshedAt: "2026-11-25T00:00:00.000Z",
        operationMap: {},
        reasons: {},
        capabilities: capability ? { launcherIpc: capability } : {},
      }),
    },
    config: { transport: { mode: "uds" } },
    tokenEntropyBits: 256,
    metrics: { snapshot: () => ({}) },
    scheduler: { snapshot: () => ({}) },
  } as never;
}

function down(constraint: string) {
  return {
    backend: "launcherIpc",
    available: false,
    supportedOps: [],
    reliabilityScore: 0,
    p95MsByOp: {},
    constraints: [constraint],
  };
}

async function report(capability: Record<string, unknown> | undefined) {
  const result = await obsidianHealthTool(runtimeWith(capability), "req-1");
  if (!result.ok) throw new Error("obsidian_health always answers ok");
  return result.data as Record<string, any>;
}

describe("obsidianHealthTool", () => {
  it("reports a launcherIpc block and no restApi block", async () => {
    const data = await report({
      backend: "launcherIpc",
      available: true,
      supportedOps: ["read_note"],
      reliabilityScore: 0.99,
      p95MsByOp: {},
      constraints: [],
      diagnostics: { vault: "V", launcherVersion: "0.2.0" },
    });
    expect(data.status).toBe("healthy");
    expect(data.launcherIpc).toMatchObject({ available: true, channel: expect.stringMatching(/fd-3 pipe/) });
    expect(data.restApi).toBeUndefined();
    expect(data.diagnosis).toBeUndefined();
  });

  it("diagnoses each way the pipe can be unavailable", async () => {
    const cases: Array<[string, string]> = [
      ["launcher_ipc_missing: BRIDGE_IPC_FD is not set", "config"],
      ["launcher_too_old: obsidian-bridge-launcher does not serve vault.info", "plugin"],
      ["vault_mismatch: the launcher serves the vault at /a, not this bridge's vault /b", "config"],
      ["vault_unverified: the launcher did not report its vault folder", "config"],
      ["probe_failed:launcher IPC timeout: method=vault.info timeoutMs=3000", "connectivity"],
      ["something else entirely", "unknown"],
    ];
    for (const [constraint, category] of cases) {
      const data = await report(down(constraint));
      expect(data.status).toBe("down");
      expect(data.diagnosis.category).toBe(category);
      expect(data.diagnosis.rawConstraints).toEqual([constraint]);
    }
  });

  it("words the launcher deploy as an operator step, naming no script or command for the calling agent", async () => {
    const data = await report(down("launcher_too_old: obsidian-bridge-launcher lacks vault.read"));
    const fixes = (data.diagnosis.suggestedFixes as string[]).join("\n");
    expect(fixes).toMatch(/^Operator step:/);
    expect(fixes).not.toMatch(/\bbash\b|--apply|deploy\.sh|\bops\/|\.sh\b/);
  });

  it("tells a bridge started in a terminal to stop there first, and one with an unusable pipe to restart", async () => {
    const outside = await report(down("launcher_ipc_missing: BRIDGE_IPC_FD is not set, so this bridge was not spawned"));
    const [first] = outside.diagnosis.suggestedFixes as string[];
    expect(first).toMatch(/^If this bridge \(pid \d+\) runs in a terminal/);
    expect(first).toContain(`pid ${process.pid}`);
    expect(first).toContain("bridge-restart.sh started is replaced");
    const unusable = await report(down("launcher_ipc_missing: fd 7 from BRIDGE_IPC_FD could not be opened"));
    expect(unusable.diagnosis.summary).toMatch(/set but unusable/);
    expect((unusable.diagnosis.suggestedFixes as string[])[0]).toMatch(/Restart bridge/);
  });
});
