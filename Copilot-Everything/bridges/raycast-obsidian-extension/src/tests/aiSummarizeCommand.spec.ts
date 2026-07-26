import { beforeEach, describe, expect, it, vi } from "vitest";
import { showToast, Toast } from "@raycast/api";
import { runAiSummarizeCommand } from "@/tools/aiSummarizeCommandFlow";
import Command from "@/aiSummarizeCommand";

vi.mock("@/tools/aiSummarizeCommandFlow", () => ({
  runAiSummarizeCommand: vi.fn(),
}));

describe("aiSummarizeCommand", () => {
  const mockRunAiSummarizeCommand = vi.mocked(runAiSummarizeCommand);
  const mockShowToast = vi.mocked(showToast);

  beforeEach(() => {
    vi.clearAllMocks();
    mockRunAiSummarizeCommand.mockResolvedValue({
      normalizedPath: "",
      usedCommandId: "copilot:summarize",
      vault: {
        name: "My Digital Garden",
        key: "/Users/myhome/My Digital Garden",
        path: "/Users/myhome/My Digital Garden",
      },
      openedUri: "",
    });
  });

  it("triggers summarize for the active note without rendering a form", async () => {
    await Command();

    expect(mockRunAiSummarizeCommand).toHaveBeenCalledWith({});
    expect(mockShowToast.mock.calls[0]?.[0]).toMatchObject({
      style: Toast.Style.Animated,
      title: "Triggering summarize prompt...",
    });
    expect(mockShowToast.mock.calls.at(-1)?.[0]).toMatchObject({
      style: Toast.Style.Success,
      title: "Summarization triggered",
      message: "Active note via copilot:summarize",
    });
  });
});
