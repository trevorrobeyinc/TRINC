import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { researchPublishTool } from "../server/tools/researchPublish";
import { EventBus } from "../server/eventBus";
import type { RuntimeContext } from "../server/context";
import type { BusEvent } from "../server/eventBus";

/**
 * Build a minimal RuntimeContext that satisfies the surface researchPublishTool
 * actually uses: config.allowedVaultRoots, config.readOnlyMode, eventBus,
 * logger.info. Other fields are stubbed and intentionally throw if touched —
 * any future change to the tool that reaches into them will fail loudly.
 */
function buildRuntime(vaultRoot: string): RuntimeContext {
  const eventBus = new EventBus();
  const events: BusEvent[] = [];
  const origPublish = eventBus.publish.bind(eventBus);
  eventBus.publish = (event: BusEvent) => {
    events.push(event);
    origPublish(event);
  };

  const noop = (..._args: unknown[]): void => {};
  const noopLogger = { info: noop, warn: noop, error: noop, debug: noop, trace: noop };

  const runtime = {
    config: {
      allowedVaultRoots: [vaultRoot],
      readOnlyMode: false,
    },
    eventBus,
    logger: noopLogger,
  } as unknown as RuntimeContext;

  // Attach the events sink for assertions.
  (runtime as unknown as { _capturedEvents: BusEvent[] })._capturedEvents = events;

  return runtime;
}

function setupTaskDir(taskId: string): { dir: string; cleanup: () => void } {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "research-publish-test-"));
  const taskDir = path.join(tmpRoot, "research-output", taskId);
  fs.mkdirSync(taskDir, { recursive: true });
  fs.writeFileSync(
    path.join(taskDir, "output.md"),
    "# Test Report\n\n[[psilocybin]] linked to [[NCT04670081]] — see [[PMID-36322843]].\n"
  );
  fs.writeFileSync(
    path.join(taskDir, "wiki-links.json"),
    JSON.stringify({
      links: [
        { type: "entity", target: "psilocybin", display: "psilocybin", count: 5 },
        { type: "NCT", target: "NCT04670081", display: "NCT04670081", count: 2 },
        { type: "PMID", target: "PMID-36322843", display: "PMID-36322843", count: 1 },
      ],
    })
  );
  return {
    dir: taskDir,
    cleanup: () => fs.rmSync(tmpRoot, { recursive: true, force: true }),
  };
}

function setupVault(): { vaultRoot: string; cleanup: () => void } {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "test-vault-"));
  // Vault root must exist & be a real path for guardVaultRelativePath to resolve it.
  return {
    vaultRoot: fs.realpathSync.native(tmpRoot),
    cleanup: () => fs.rmSync(tmpRoot, { recursive: true, force: true }),
  };
}

describe("research_publish tool", () => {
  let task: ReturnType<typeof setupTaskDir>;
  let vault: ReturnType<typeof setupVault>;

  beforeEach(() => {
    task = setupTaskDir("task-test-1");
    vault = setupVault();
  });

  afterEach(() => {
    task.cleanup();
    vault.cleanup();
  });

  it("creates main note + 3 stubs and publishes one event", async () => {
    const runtime = buildRuntime(vault.vaultRoot);
    const result = await researchPublishTool(
      runtime,
      "req-1",
      undefined,
      undefined,
      {
        taskId: "task-test-1",
        sourceDir: task.dir,
        vault: "Test Vault",
        vaultRoot: vault.vaultRoot,
      }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.data;
    expect(data.taskId).toBe("task-test-1");
    expect(data.totalLinks).toBe(3);
    expect(data.stubNotesCreated).toBe(3);

    // Main note exists at the expected vault-relative path.
    const today = new Date().toISOString().slice(0, 10);
    const expectedMain = path.join(
      vault.vaultRoot,
      "Research-Output",
      today,
      "task-test-1",
      "output.md"
    );
    expect(fs.existsSync(expectedMain)).toBe(true);
    expect(fs.readFileSync(expectedMain, "utf8")).toContain("[[psilocybin]]");

    // Stubs landed in the atlas.
    expect(
      fs.existsSync(
        path.join(vault.vaultRoot, "OpenClaw/atlas/entity/psilocybin.md")
      )
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(vault.vaultRoot, "OpenClaw/atlas/NCT/NCT04670081.md")
      )
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(vault.vaultRoot, "OpenClaw/atlas/PMID/PMID-36322843.md")
      )
    ).toBe(true);

    // Exactly one event published, on the research stream.
    const events = (runtime as unknown as { _capturedEvents: BusEvent[] })._capturedEvents;
    expect(events.length).toBe(1);
    expect(events[0].type).toBe("research_arrived");
    expect(events[0].stream).toBe("research");
    expect(events[0].taskId).toBe("task-test-1");
  });

  it("rejects unknown vault roots", async () => {
    const runtime = buildRuntime(vault.vaultRoot);
    await expect(
      researchPublishTool(runtime, "req-2", undefined, undefined, {
        taskId: "task-test-1",
        sourceDir: task.dir,
        vault: "Test Vault",
        vaultRoot: "/some/other/vault",
      })
    ).rejects.toThrow(/allowedVaultRoots/);
  });

  it("rejects when output.md is missing", async () => {
    fs.unlinkSync(path.join(task.dir, "output.md"));
    const runtime = buildRuntime(vault.vaultRoot);
    await expect(
      researchPublishTool(runtime, "req-3", undefined, undefined, {
        taskId: "task-test-1",
        sourceDir: task.dir,
        vault: "Test Vault",
        vaultRoot: vault.vaultRoot,
      })
    ).rejects.toThrow(/output\.md not found/);
  });

  it("refuses to overwrite the main note by default and accepts mode=overwrite", async () => {
    const runtime = buildRuntime(vault.vaultRoot);
    await researchPublishTool(runtime, "req-4a", undefined, undefined, {
      taskId: "task-test-1",
      sourceDir: task.dir,
      vault: "Test Vault",
      vaultRoot: vault.vaultRoot,
    });

    // Second call without overwrite should fail.
    const second = await researchPublishTool(
      runtime,
      "req-4b",
      undefined,
      undefined,
      {
        taskId: "task-test-1",
        sourceDir: task.dir,
        vault: "Test Vault",
        vaultRoot: vault.vaultRoot,
      }
    ).then(
      (r) => r,
      (e) => ({ ok: false, error: e })
    );
    expect((second as { ok: boolean }).ok).toBe(false);

    // With mode=overwrite it succeeds.
    const third = await researchPublishTool(
      runtime,
      "req-4c",
      undefined,
      undefined,
      {
        taskId: "task-test-1",
        sourceDir: task.dir,
        vault: "Test Vault",
        vaultRoot: vault.vaultRoot,
        mode: "overwrite",
      }
    );
    expect(third.ok).toBe(true);
  });

  it("tolerates missing wiki-links.json (no stubs, still emits event)", async () => {
    fs.unlinkSync(path.join(task.dir, "wiki-links.json"));
    const runtime = buildRuntime(vault.vaultRoot);
    const result = await researchPublishTool(
      runtime,
      "req-5",
      undefined,
      undefined,
      {
        taskId: "task-test-1",
        sourceDir: task.dir,
        vault: "Test Vault",
        vaultRoot: vault.vaultRoot,
      }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.totalLinks).toBe(0);
    expect(result.data.stubNotesCreated).toBe(0);
  });
});
