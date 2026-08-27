const refreshPromptRegistryCommandCandidates = [
  "copilot:refresh-prompts",
  "copilot:refresh-custom-prompts",
  "copilot:refresh-prompt-registry",
] as const;

const summarizeCommandCandidates = [
  // Headless "-to-note" variants (Copilot fork, 2026-07-06): run a custom prompt with NO modal
  // and write "<note basename> — <command title>.md" into the plugin's customCommandNoteFolder
  // (default Copilot Summaries). Super-Summarize (2026-08-27) is the ONE canonical summary
  // prompt shared with the Contextual Wiki Definitions plugin and the video pipeline; the
  // legacy Summarize ids stay as fallbacks so a missing super note degrades gracefully.
  "copilot:super-summarize-to-note",
  "copilot:summarize-to-note",
  "copilot:summarize",
  "copilot:summarize-active-note",
  "copilot:summarize.md",
] as const;

function normalizeCommandTitle(value: string): string {
  return value
    .trim()
    .replace(/^copilot:\s*/i, "")
    .replace(/\.md$/i, "")
    .replace(/\s+/g, " ");
}

export function getCopilotCommandId(title: string): string {
  const normalized = normalizeCommandTitle(title);
  if (!normalized) {
    throw new Error("Copilot command title is required.");
  }
  return `copilot:${encodeURIComponent(normalized.toLowerCase())}`;
}

export function getPromptCommandId(promptTitle: string): string {
  return getCopilotCommandId(promptTitle);
}

export function getRefreshPromptRegistryCommandCandidates(): string[] {
  return [...refreshPromptRegistryCommandCandidates];
}

export function getSummarizeCommandCandidates(): string[] {
  // Keep the headless -to-note variant first; dedupe since getCopilotCommandId("Summarize")
  // resolves to the same "copilot:summarize" already present in the fallback list.
  return [...new Set([...summarizeCommandCandidates, getCopilotCommandId("Summarize")])];
}
