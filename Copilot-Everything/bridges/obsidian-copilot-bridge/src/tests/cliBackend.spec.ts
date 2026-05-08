import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../server/errors";
import { ERROR_CODES } from "../server/errorCodes";
import type { ServerConfig } from "../config/types";
import { CliBackend, parseVaultsVerbose, resolveObsidianCliBinary } from "../backends/cliBackend";
import { runCli } from "../cli/runner";

vi.mock("../cli/runner", () => ({
  runCli: vi.fn(),
}));

const runCliMock = vi.mocked(runCli);

function fakeResult(stdout: string, stderr = "", durationMs = 5) {
  return {
    statusCode: 0,
    stdout,
    stderr,
    durationMs,
  };
}

describe("CliBackend", () => {
  let tempDir: string;
  let fakeBinary: string;
  let fakeVaultRoot: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cpbh-cli-backend-"));
    fakeBinary = path.join(tempDir, "obsidian");
    fakeVaultRoot = path.join(tempDir, "vault");
    fs.mkdirSync(fakeVaultRoot, { recursive: true });
    fs.writeFileSync(fakeBinary, "#!/bin/sh\nexit 0\n", "utf8");
    fs.chmodSync(fakeBinary, 0o755);
    runCliMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function makeConfig(vaultNames = ["My Digital Garden"], binaryPath = fakeBinary): ServerConfig {
    return {
      transport: {
        mode: "http",
        host: "127.0.0.1",
        port: 8798,
        udsPath: path.join(tempDir, "unused.sock"),
        pipeName: "unused-pipe",
      },
      obsidianCliBinary: binaryPath,
      cliStability: {
        probeTimeoutMs: 20_000,
        launchTimeoutMs: 3_000,
        readinessPollIntervalMs: 100,
        requiredVaultNames: vaultNames,
      },
      timeouts: {
        openVaultMs: 25_000,
        createNoteMs: 20_000,
        appendNoteMs: 20_000,
        readNoteMs: 15_000,
        searchNotesMs: 20_000,
      },
      queue: {
        capacity: 64,
        workerConcurrency: 2,
      },
      allowedVaultRoots: [fakeVaultRoot],
      security: {
        authToken: "1234567890abcdefghijklmnopqrstuvwxyzABCD",
        replayWindowSeconds: 60,
        nonceTtlSeconds: 120,
        rateLimitPerMinute: 600,
        globalRateLimitPerMinute: 2400,
      },
      logging: {
        level: "info",
        file: path.join(tempDir, "mcp.log"),
        slowThresholdMs: {
          open_vault: 5000,
          create_note: 3000,
          append_note: 3000,
          read_note: 1500,
          search_notes: 1500,
          execute_command: 3000,
        },
      },
      readOnlyMode: false,
    };
  }

  it("parses verbose vault listings", () => {
    expect(parseVaultsVerbose("My Digital Garden\t/Volumes/ExtraCurricular/My Digital Garden\nScratch\t/tmp/scratch\n")).toEqual([
      { name: "My Digital Garden", path: "/Volumes/ExtraCurricular/My Digital Garden" },
      { name: "Scratch", path: "/tmp/scratch" },
    ]);
  });

  it("resolves an explicit executable CLI binary", () => {
    const config = makeConfig();
    const resolved = resolveObsidianCliBinary(config, {
      PATH: "",
      HOME: tempDir,
      USER: "tester",
      LOGNAME: "tester",
    });
    expect(resolved).toBe(fakeBinary);
  });

  it("returns structured diagnostics for a successful preflight", async () => {
    const config = makeConfig();
    const backend = new CliBackend(config);

    runCliMock.mockImplementation(async (input) => {
      if (input.binary === "/usr/bin/open") {
        return fakeResult("");
      }
      const joined = input.args.join(" ");
      if (joined === "version") {
        return fakeResult("1.12.4 (installer 1.12.4)");
      }
      if (joined === "help") {
        return fakeResult("Usage: obsidian <command>");
      }
      if (joined === "vaults verbose") {
        return fakeResult("My Digital Garden\t/Volumes/ExtraCurricular/My Digital Garden\n");
      }
      if (joined === "vault=My Digital Garden vault info=name") {
        return fakeResult("My Digital Garden");
      }
      throw new Error(`Unexpected CLI invocation: binary=${input.binary} args=${joined}`);
    });

    const capabilities = await backend.probe();

    expect(capabilities.available).toBe(true);
    expect(capabilities.supportedOps).toEqual([
      "open_vault",
      "create_note",
      "append_note",
      "read_note",
      "search_notes",
      "execute_command",
    ]);
    expect(capabilities.diagnostics?.parsedVersion).toBe("1.12.4");
    expect(capabilities.diagnostics?.resolvedBinaryPath).toBe(fakeBinary);
    expect(capabilities.diagnostics?.requiredVaults).toEqual([
      {
        name: "My Digital Garden",
        registered: true,
        path: "/Volumes/ExtraCurricular/My Digital Garden",
      },
    ]);
    expect(capabilities.diagnostics?.launch).toMatchObject({
      requestedVaultName: "My Digital Garden",
      launchAttempted: false,
      readinessStatus: "ready",
    });
  });

  it("fails closed when the required vault is not registered", async () => {
    const config = makeConfig(["My Digital Garden"]);
    const backend = new CliBackend(config);

    runCliMock.mockImplementation(async (input) => {
      const joined = input.args.join(" ");
      if (joined === "version") {
        return fakeResult("1.12.4");
      }
      if (joined === "help") {
        return fakeResult("Usage: obsidian <command>");
      }
      if (joined === "vaults verbose") {
        return fakeResult("Other Vault\t/tmp/other\n");
      }
      throw new Error(`Unexpected CLI invocation: ${joined}`);
    });

    const capabilities = await backend.probe();

    expect(capabilities.available).toBe(false);
    expect(capabilities.constraints[0]).toContain(ERROR_CODES.VAULT_NOT_FOUND);
    expect(capabilities.diagnostics?.lastFailure).toMatchObject({
      code: ERROR_CODES.VAULT_NOT_FOUND,
    });
  });

  it("launches and polls for readiness when the app is not ready yet", async () => {
    const config = makeConfig();
    const backend = new CliBackend(config);
    let readinessFailures = 0;

    runCliMock.mockImplementation(async (input) => {
      if (input.binary === "/usr/bin/open") {
        return fakeResult("");
      }
      const joined = input.args.join(" ");
      if (joined === "version") {
        return fakeResult("1.12.4");
      }
      if (joined === "help") {
        return fakeResult("Usage: obsidian <command>");
      }
      if (joined === "vaults verbose") {
        return fakeResult("My Digital Garden\t/Volumes/ExtraCurricular/My Digital Garden\n");
      }
      if (joined === "vault=My Digital Garden vault info=name") {
        if (readinessFailures < 1) {
          readinessFailures += 1;
          throw new AppError(ERROR_CODES.CLI_EXIT_NONZERO, "not ready yet", true);
        }
        return fakeResult("My Digital Garden");
      }
      throw new Error(`Unexpected CLI invocation: binary=${input.binary} args=${joined}`);
    });

    const capabilities = await backend.probe();

    expect(capabilities.available).toBe(true);
    expect(capabilities.diagnostics?.launch).toMatchObject({
      launchAttempted: true,
      readinessStatus: "launched_and_ready",
    });
    expect(
      runCliMock.mock.calls.some(([input]) => input.binary === "/usr/bin/open" && input.args[0] === "-a")
    ).toBe(true);
  });

  it("treats empty readiness output as not ready and keeps polling", async () => {
    const config = makeConfig();
    const backend = new CliBackend(config);
    let readinessAttempts = 0;

    runCliMock.mockImplementation(async (input) => {
      if (input.binary === "/usr/bin/open") {
        return fakeResult("");
      }
      const joined = input.args.join(" ");
      if (joined === "version") {
        return fakeResult("1.12.4");
      }
      if (joined === "help") {
        return fakeResult("Usage: obsidian <command>");
      }
      if (joined === "vaults verbose") {
        return fakeResult("My Digital Garden\t/Volumes/ExtraCurricular/My Digital Garden\n");
      }
      if (joined === "vault=My Digital Garden vault info=name") {
        readinessAttempts += 1;
        if (readinessAttempts === 1) {
          return fakeResult("");
        }
        return fakeResult("My Digital Garden");
      }
      throw new Error(`Unexpected CLI invocation: binary=${input.binary} args=${joined}`);
    });

    const capabilities = await backend.probe();

    expect(capabilities.available).toBe(true);
    expect(capabilities.diagnostics?.launch).toMatchObject({
      launchAttempted: true,
      readinessStatus: "launched_and_ready",
    });
  });

  it("falls back quickly to the shell probe path on macOS when direct probe spawn times out", async () => {
    const platformSpy = vi.spyOn(process, "platform", "get").mockReturnValue("darwin");
    const config = makeConfig();
    const backend = new CliBackend(config);

    runCliMock.mockImplementation(async (input) => {
      if (input.binary === fakeBinary && input.args.join(" ") === "version") {
        expect(input.timeoutMs).toBe(3_000);
        throw new AppError(ERROR_CODES.CLI_TIMEOUT, "direct version probe timed out", true);
      }

      if (input.binary === "/bin/zsh" && input.args[0] === "-lc" && input.args[1]?.includes(`${fakeBinary}`) && input.args[1]?.includes("version")) {
        return fakeResult("1.12.4");
      }

      const joined = input.args.join(" ");
      if (joined === "help") {
        return fakeResult("Usage: obsidian <command>");
      }
      if (joined === "vaults verbose") {
        return fakeResult("My Digital Garden\t/Volumes/ExtraCurricular/My Digital Garden\n");
      }
      if (joined === "vault=My Digital Garden vault info=name") {
        return fakeResult("My Digital Garden");
      }
      throw new Error(`Unexpected CLI invocation: binary=${input.binary} args=${joined}`);
    });

    const capabilities = await backend.probe();

    expect(platformSpy).toBeDefined();
    expect(capabilities.available).toBe(true);
    expect(capabilities.diagnostics?.probeCommands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          command: "version",
          success: true,
          mode: "shell",
        }),
      ])
    );
  });

  it("falls back to the app bundle version on macOS when CLI version commands both time out", async () => {
    vi.spyOn(process, "platform", "get").mockReturnValue("darwin");
    const bundleBinary = path.join(tempDir, "Obsidian.app", "Contents", "MacOS", "obsidian");
    const infoPlist = path.join(tempDir, "Obsidian.app", "Contents", "Info.plist");
    fs.mkdirSync(path.dirname(bundleBinary), { recursive: true });
    fs.writeFileSync(bundleBinary, "#!/bin/sh\nexit 0\n", "utf8");
    fs.chmodSync(bundleBinary, 0o755);
    fs.writeFileSync(infoPlist, `<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<plist version=\"1.0\"><dict></dict></plist>\n`, "utf8");

    const config = makeConfig(["My Digital Garden"], bundleBinary);
    const backend = new CliBackend(config);

    runCliMock.mockImplementation(async (input) => {
      if (input.binary === bundleBinary || input.binary === "/bin/zsh") {
        const commandText = input.args.join(" ");
        if (commandText.includes("version")) {
          throw new AppError(ERROR_CODES.CLI_TIMEOUT, "version probe timed out", true);
        }
      }

      if (input.binary === "/usr/bin/plutil") {
        return fakeResult("1.12.4");
      }

      const joined = input.args.join(" ");
      if (joined === "help") {
        return fakeResult("Usage: obsidian <command>");
      }
      if (joined === "vaults verbose") {
        return fakeResult("My Digital Garden\t/Volumes/ExtraCurricular/My Digital Garden\n");
      }
      if (joined === "vault=My Digital Garden vault info=name") {
        return fakeResult("My Digital Garden");
      }
      throw new Error(`Unexpected CLI invocation: binary=${input.binary} args=${joined}`);
    });

    const capabilities = await backend.probe();

    expect(capabilities.available).toBe(true);
    expect(capabilities.diagnostics?.parsedVersion).toBe("1.12.4");
    expect(capabilities.diagnostics?.parsedVersionSource).toBe("app_bundle");
    expect(capabilities.diagnostics?.probeCommands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          command: "bundle_version",
          success: true,
        }),
      ])
    );
  });

  it("treats help probe failures as non-blocking when the routed CLI operations remain healthy", async () => {
    const config = makeConfig();
    const backend = new CliBackend(config);

    runCliMock.mockImplementation(async (input) => {
      const joined = input.args.join(" ");
      if (joined === "version") {
        return fakeResult("1.12.4");
      }
      if (joined === "help") {
        throw new AppError(ERROR_CODES.CLI_TIMEOUT, "help probe timed out", true);
      }
      if (joined === "vaults verbose") {
        return fakeResult("My Digital Garden\t/Volumes/ExtraCurricular/My Digital Garden\n");
      }
      if (joined === "vault=My Digital Garden vault info=name") {
        return fakeResult("My Digital Garden");
      }
      throw new Error(`Unexpected CLI invocation: binary=${input.binary} args=${joined}`);
    });

    const capabilities = await backend.probe();

    expect(capabilities.available).toBe(true);
    expect(capabilities.diagnostics?.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "HELP_PROBE_FAILED",
        }),
      ])
    );
  });

  it("ensures readiness before executing an app-dependent CLI command", async () => {
    const config = makeConfig();
    const backend = new CliBackend(config);
    let readinessFailures = 0;

    runCliMock.mockImplementation(async (input) => {
      if (input.binary === "/usr/bin/open") {
        return fakeResult("");
      }
      const joined = input.args.join(" ");
      if (joined === "vault=My Digital Garden vault info=name") {
        if (readinessFailures < 1) {
          readinessFailures += 1;
          throw new AppError(ERROR_CODES.CLI_EXIT_NONZERO, "not ready yet", true);
        }
        return fakeResult("My Digital Garden");
      }
      if (joined === "vault=My Digital Garden read file=Test.md path=Notes/Test.md") {
        return fakeResult("# Test");
      }
      throw new Error(`Unexpected CLI invocation: binary=${input.binary} args=${joined}`);
    });

    const result = await backend.execute(
      "read_note",
      {
        vault: "My Digital Garden",
        vaultRoot: fakeVaultRoot,
        path: "Notes/Test.md",
      },
      {
        requestId: "req-1",
        now: Date.now(),
        epochId: 1,
        timeoutMs: 15_000,
      }
    );

    expect(result.stdout).toBe("# Test");
    expect(
      runCliMock.mock.calls.some(([input]) => input.binary === "/usr/bin/open" && input.args[0] === "-a")
    ).toBe(true);
    expect(
      runCliMock.mock.calls.some(([input]) => input.args.join(" ") === "vault=My Digital Garden read file=Test.md path=Notes/Test.md")
    ).toBe(true);
  });
});
