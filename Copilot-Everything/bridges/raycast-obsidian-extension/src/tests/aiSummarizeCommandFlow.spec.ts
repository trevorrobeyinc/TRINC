import { beforeEach, describe, expect, it, vi } from "vitest";
import { open } from "@raycast/api";
import { execFile } from "node:child_process";
import { hybridReadNote } from "@/api/mcp/hybridObsidian.service";
import { getVaultsFromPreferencesOrObsidianJson } from "@/obsidian/internal/obsidian";
import { runAiSummarizeCommand } from "@/tools/aiSummarizeCommandFlow";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => true),
}));

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("@/api/mcp/hybridObsidian.service", () => ({
  hybridReadNote: vi.fn(),
}));

vi.mock("@/obsidian/internal/obsidian", () => ({
  getVaultsFromPreferencesOrObsidianJson: vi.fn(),
}));

describe("runAiSummarizeCommand", () => {
  const mockReadNote = vi.mocked(hybridReadNote);
  const mockVaults = vi.mocked(getVaultsFromPreferencesOrObsidianJson);
  const mockOpen = vi.mocked(open);
  const mockExecFile = vi.mocked(execFile);
  const vault = {
    name: "My Digital Garden",
    key: "/Users/myhome/My Digital Garden",
    path: "/Users/myhome/My Digital Garden",
  };

  function mockExecFileImplementation(
    implementation: (file: string, args: string[]) => { error: Error | null; stdout?: string; stderr?: string }
  ) {
    mockExecFile.mockImplementation(((
      ...args: unknown[]
    ) => {
      const [file, commandArgs, optionsOrCallback, maybeCallback] = args;
      const callback = typeof maybeCallback === "function" ? maybeCallback : optionsOrCallback;
      if (typeof callback === "function") {
        const result = implementation(String(file), (commandArgs as string[]) ?? []);
        (callback as (err: Error | null, stdout: string, stderr: string) => void)(
          result.error,
          result.stdout ?? "",
          result.stderr ?? ""
        );
      }
      return {} as never;
    }) as unknown as typeof execFile);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockVaults.mockResolvedValue([vault]);
    mockExecFileImplementation((file, args) => {
      if (file === "/usr/bin/osascript") {
        return { error: null };
      }
      return { error: null, stdout: `Executed: ${args.at(-1) ?? ""}` };
    });
  });

  it("triggers summarize against the active note when no note path is provided", async () => {
    const result = await runAiSummarizeCommand({ activationDelayMs: 0 });

    expect(mockReadNote).not.toHaveBeenCalled();
    expect(mockExecFile).toHaveBeenCalledWith(
      "/usr/bin/osascript",
      ["-e", 'tell application "Obsidian" to activate'],
      expect.any(Function)
    );
    expect(mockOpen).not.toHaveBeenCalled();
    expect(mockExecFile).toHaveBeenCalledWith(
      "/Applications/Obsidian.app/Contents/MacOS/obsidian",
      ["vault=My Digital Garden", "command", "id=copilot:summarize"],
      { timeout: 20_000 },
      expect.any(Function)
    );
    expect(result.normalizedPath).toBe("");
    expect(result.openedUri).toBe("");
    expect(result.usedCommandId).toBe("copilot:summarize");
  });

  it("falls back to a vault open URI if macOS app activation fails", async () => {
    mockExecFileImplementation((file) => {
      if (file === "/usr/bin/osascript") {
        return { error: new Error("osascript failed") };
      }
      return { error: null };
    });

    await runAiSummarizeCommand({ activationDelayMs: 0 });

    expect(mockOpen).toHaveBeenCalledWith("obsidian://open?vault=My%20Digital%20Garden");
  });

  it("opens the requested note before triggering summarize when a note path is provided", async () => {
    mockReadNote.mockResolvedValue({
      path: "Inbox/Test Note.md",
      content: "# Test",
    });

    const result = await runAiSummarizeCommand({
      notePath: " Inbox/Test Note.md ",
      openDelayMs: 0,
    });

    const openedUri =
      "obsidian://open?path=%2FVolumes%2FExtraCurricular%2FMy%20Digital%20Garden%2FInbox%2FTest%20Note.md";

    expect(mockReadNote).toHaveBeenCalledWith({
      vault: "My Digital Garden",
      vaultRoot: "/Users/myhome/My Digital Garden",
      path: "Inbox/Test Note.md",
    });
    expect(mockOpen).toHaveBeenCalledWith(openedUri);
    expect(result.normalizedPath).toBe("Inbox/Test Note.md");
    expect(result.openedUri).toBe(openedUri);
  });

  it("refreshes prompts and retries only when summarize is initially missing", async () => {
    mockExecFileImplementation((file, args) => {
      if (file === "/usr/bin/osascript") {
        return { error: null };
      }

      const commandIdArg = args.at(-1) ?? "";
      if (
        commandIdArg === "id=copilot:summarize" ||
        commandIdArg === "id=copilot:summarize-active-note" ||
        commandIdArg === "id=copilot:summarize.md"
      ) {
        const error = new Error("Command was not found");
        return { error };
      }

      return { error: null, stdout: `Executed: ${commandIdArg}` };
    });

    await expect(runAiSummarizeCommand({ activationDelayMs: 0 })).rejects.toThrow("was not found");
  });

  it("refreshes prompts and retries summarize when the first command id is missing", async () => {
    let missingAttempts = 0;
    mockExecFileImplementation((file, args) => {
      if (file === "/usr/bin/osascript") {
        return { error: null };
      }

      const commandIdArg = args.at(-1) ?? "";
      if (commandIdArg === "id=copilot:summarize" && missingAttempts < 1) {
        missingAttempts += 1;
        return { error: new Error("The Copilot Summarize prompt command was not found. Refresh prompts in Obsidian and try again.") };
      }

      return { error: null, stdout: `Executed: ${commandIdArg}` };
    });

    const result = await runAiSummarizeCommand({ activationDelayMs: 0 });

    expect(result.usedCommandId).toBe("copilot:summarize");
  });
});
