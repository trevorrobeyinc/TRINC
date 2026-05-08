import { CustomCommand } from "@/commands/type";

function normalizeCommandTitle(title: string): string {
  return title.trim().toLowerCase();
}

export function isWholeNoteRewriteCommand(command: CustomCommand): boolean {
  // Scope this behavior to the summarize command until we formalize a broader frontmatter contract.
  return normalizeCommandTitle(command.title) === "summarize";
}

export function shouldAutoReplaceActiveNote(command: CustomCommand, selectedText: string): boolean {
  return isWholeNoteRewriteCommand(command) && selectedText.trim().length === 0;
}
