const refreshPromptRegistryCommandCandidates = [
  "copilot:refresh-prompts",
  "copilot:refresh-custom-prompts",
  "copilot:refresh-prompt-registry",
] as const;

const summarizeCommandCandidates = [
  "copilot:summarize",
  "copilot:summarize-active-note",
  "copilot:summarize.md",
] as const;

function normalizeCommandTitle(value: string): string {
  return value.trim().replace(/^copilot:\s*/i, "").replace(/\.md$/i, "").replace(/\s+/g, " ");
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
  return [getCopilotCommandId("Summarize"), ...summarizeCommandCandidates];
}
