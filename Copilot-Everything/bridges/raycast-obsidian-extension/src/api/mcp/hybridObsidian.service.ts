import { BackendPlanner } from "./backendPlanner.service";

const planner = new BackendPlanner();

export async function hybridOpenVault(input: { vault: string; path?: string }) {
  return await planner.callRouted<typeof input, { opened: boolean; vault: string }>(
    "obsidian_open_vault",
    "open_vault",
    input
  );
}

export async function hybridCreateNote(input: {
  vault: string;
  vaultRoot: string;
  path: string;
  content?: string;
  overwrite?: boolean;
  open?: boolean;
  newtab?: boolean;
}) {
  return await planner.callRouted<typeof input, { created: boolean; path: string }>(
    "obsidian_create_note",
    "create_note",
    input
  );
}

export async function hybridAppendNote(input: {
  vault: string;
  vaultRoot: string;
  path: string;
  content: string;
  inline?: boolean;
  idempotencyKey: string;
}) {
  return await planner.callRouted<typeof input, { appended: boolean; path: string; idempotencyState: string }>(
    "obsidian_append_note",
    "append_note",
    input
  );
}

export async function hybridReadNote(input: { vault: string; vaultRoot: string; path: string }) {
  return await planner.callRouted<typeof input, { path: string; content: string; revision?: string }>(
    "obsidian_read_note",
    "read_note",
    input
  );
}

export async function hybridSearchNotes(input: {
  vault: string;
  query: string;
  path?: string;
  limit?: number;
  caseSensitive?: boolean;
}) {
  return await planner.callRouted<
    typeof input,
    { query: string; matches: Array<{ path: string; line?: number; text?: string }> }
  >("obsidian_search_notes", "search_notes", input);
}

export async function hybridExecuteCommand(input: { vault?: string; id: string }) {
  return await planner.callRouted<typeof input, { executed: boolean; id: string }>(
    "obsidian_execute_command",
    "execute_command",
    input
  );
}
