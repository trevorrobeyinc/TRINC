const refreshPromptRegistryCommandCandidates = [
  "copilot:refresh-prompts",
  "copilot:refresh-custom-prompts",
  "copilot:refresh-prompt-registry",
] as const;

const summarizeCommandCandidates = [
  // Headless "-to-note" variant (Copilot fork, 2026-07-06): runs the Summarize template with NO
  // modal and writes "<note basename> — Summarize.md" into the plugin's customCommandNoteFolder
  // (default Copilot Summaries). Preferred; the modal variants below are fallbacks.
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
