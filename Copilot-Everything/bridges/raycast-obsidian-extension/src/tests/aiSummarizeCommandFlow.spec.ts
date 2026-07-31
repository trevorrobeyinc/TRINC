import { beforeEach, describe, expect, it, vi } from "vitest";
import { open } from "@raycast/api";
import { execFile } from "node:child_process";
import {
  getRefreshPromptRegistryCommandCandidates,
  getSummarizeCommandCandidates,
} from "@/api/copilot/commandIds";
import { hybridReadNote } from "@/api/mcp/hybridObsidian.service";
import { getVaultsFromPreferencesOrObsidianJson } from "@/obsidian/internal/obsidian";
import { runAiSummarizeCommand } from "@/tools/aiSummarizeCommandFlow";
import { executeCommand } from "@/utils/restApiClient";

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

// The flow dispatches Obsidian commands through the Local REST API client
// (POST /commands/{id}/), not the Obsidian CLI binary — mock at that seam.
vi.mock("@/utils/restApiClient", () => ({
  executeCommand: vi.fn(),
}));

describe("runAiSummarizeCommand", () => {
  const mockReadNote = vi.mocked(hybridReadNote);
  const mockVaults = vi.mocked(getVaultsFromPreferencesOrObsidianJson);
  const mockOpen = vi.mocked(open);
  const mockExecFile = vi.mocked(execFile);
  const mockExecuteCommand = vi.mocked(executeCommand);
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
    mockExecuteCommand.mockResolvedValue(undefined);
    mockExecFileImplementation((file) => {
      if (file === "/usr/bin/osascript") {
        return { error: null };
      }
      return { error: null };
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
    // The preferred headless candidate succeeds first try, so exactly one dispatch happens.
    expect(mockExecuteCommand).toHaveBeenCalledTimes(1);
    expect(mockExecuteCommand).toHaveBeenCalledWith("copilot:summarize-to-note");
    expect(result.normalizedPath).toBe("");
    expect(result.openedUri).toBe("");
    expect(result.usedCommandId).toBe("copilot:summarize-to-note");
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
      activationDelayMs: 0,
    });

    const openedUri =
      "obsidian://open?path=%2FUsers%2Fmyhome%2FMy%20Digital%20Garden%2FInbox%2FTest%20Note.md";

    expect(mockReadNote).toHaveBeenCalledWith({
      vault: "My Digital Garden",
      vaultRoot: "/Users/myhome/My Digital Garden",
      path: "Inbox/Test Note.md",
    });
    expect(mockOpen).toHaveBeenCalledWith(openedUri);
    expect(result.normalizedPath).toBe("Inbox/Test Note.md");
    expect(result.openedUri).toBe(openedUri);
  });

  it("rejects when summarize is missing even after the prompt-registry refresh", async () => {
    const summarizeIds = new Set(getSummarizeCommandCandidates());
    mockExecuteCommand.mockImplementation(async (commandId: string) => {
      if (summarizeIds.has(commandId)) {
        throw new Error("Command was not found");
      }
    });

    await expect(runAiSummarizeCommand({ activationDelayMs: 0 })).rejects.toThrow("was not found");

    // The refresh fallback really ran, and the preferred summarize candidate was
    // attempted on both passes (before and after the refresh).
    expect(mockExecuteCommand).toHaveBeenCalledWith(getRefreshPromptRegistryCommandCandidates()[0]);
    const preferredAttempts = mockExecuteCommand.mock.calls.filter(
      ([commandId]) => commandId === "copilot:summarize-to-note"
    );
    expect(preferredAttempts).toHaveLength(2);
  });

  it("refreshes prompts and retries summarize when the summarize commands are initially missing", async () => {
    let refreshed = false;
    const summarizeIds = new Set(getSummarizeCommandCandidates());
    const refreshIds = new Set(getRefreshPromptRegistryCommandCandidates());
    mockExecuteCommand.mockImplementation(async (commandId: string) => {
      if (refreshIds.has(commandId)) {
        refreshed = true;
        return;
      }
      if (summarizeIds.has(commandId) && !refreshed) {
        throw new Error("Command was not found");
      }
    });

    const result = await runAiSummarizeCommand({ activationDelayMs: 0 });

    expect(mockExecuteCommand).toHaveBeenCalledWith(getRefreshPromptRegistryCommandCandidates()[0]);
    expect(result.usedCommandId).toBe("copilot:summarize-to-note");
  });
});
