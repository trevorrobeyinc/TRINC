import { UserSystemPrompt } from "@/system-prompts/type";

export const EMPTY_SYSTEM_PROMPT: UserSystemPrompt = {
  title: "",
  content: "",
  createdMs: 0,
  modifiedMs: 0,
  lastUsedMs: 0,
};

// System prompt frontmatter property constants
export const COPILOT_SYSTEM_PROMPT_CREATED = "copilot-mcp-system-prompt-created";
export const COPILOT_SYSTEM_PROMPT_MODIFIED = "copilot-mcp-system-prompt-modified";
export const COPILOT_SYSTEM_PROMPT_LAST_USED = "copilot-mcp-system-prompt-last-used";
export const COPILOT_SYSTEM_PROMPT_DEFAULT = "copilot-mcp-system-prompt-default";
