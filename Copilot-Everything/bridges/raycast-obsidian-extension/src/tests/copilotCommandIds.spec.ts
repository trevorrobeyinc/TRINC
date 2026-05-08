import { describe, expect, it } from "vitest";
import {
  getCopilotCommandId,
  getPromptCommandId,
  getRefreshPromptRegistryCommandCandidates,
  getSummarizeCommandCandidates,
} from "@/api/copilot/commandIds";

describe("copilot command ids", () => {
  it("encodes prompt titles with the plugin command contract", () => {
    expect(getPromptCommandId("Summarize")).toBe("copilot:summarize");
    expect(getPromptCommandId("My Prompt.md")).toBe("copilot:my%20prompt");
  });

  it("normalizes copilot prefixes and whitespace", () => {
    expect(getCopilotCommandId(" copilot: Refresh Prompts ")).toBe("copilot:refresh%20prompts");
  });

  it("exposes known refresh and summarize command candidates", () => {
    expect(getRefreshPromptRegistryCommandCandidates()).toContain("copilot:refresh-prompts");
    expect(getSummarizeCommandCandidates()[0]).toBe("copilot:summarize");
  });
});
