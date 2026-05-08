import { shouldAutoReplaceActiveNote, isWholeNoteRewriteCommand } from "@/commands/commandBehavior";
import type { CustomCommand } from "@/commands/type";

function createCommand(title: string): CustomCommand {
  return {
    title,
    content: "{}",
    showInContextMenu: true,
    showInSlashMenu: true,
    order: 0,
    modelKey: "",
    lastUsedMs: 0,
  };
}

describe("commandBehavior", () => {
  it("treats Summarize as a whole-note rewrite command", () => {
    expect(isWholeNoteRewriteCommand(createCommand("Summarize"))).toBe(true);
    expect(isWholeNoteRewriteCommand(createCommand(" summarize "))).toBe(true);
  });

  it("auto-replaces the active note only when Summarize is invoked without a selection", () => {
    const summarize = createCommand("Summarize");

    expect(shouldAutoReplaceActiveNote(summarize, "")).toBe(true);
    expect(shouldAutoReplaceActiveNote(summarize, "   ")).toBe(true);
    expect(shouldAutoReplaceActiveNote(summarize, "Selected text")).toBe(false);
    expect(shouldAutoReplaceActiveNote(createCommand("Fix grammar and spelling"), "")).toBe(false);
  });
});
