import { getCommandId } from "@/commands/commandId";

describe("getCommandId", () => {
  it("normalizes prompt titles to the registered command suffix", () => {
    expect(getCommandId("Summarize")).toBe("summarize");
    expect(getCommandId("My Prompt")).toBe("my%20prompt");
    expect(getCommandId("Prompt With/Slash")).toBe("prompt%20with%2Fslash");
  });
});
