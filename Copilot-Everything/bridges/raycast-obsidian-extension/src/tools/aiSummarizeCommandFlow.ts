import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { open } from "@raycast/api";
import { getRefreshPromptRegistryCommandCandidates, getSummarizeCommandCandidates } from "@/api/copilot/commandIds";
import { hybridReadNote } from "@/api/mcp/hybridObsidian.service";
import { getVaultsFromPreferencesOrObsidianJson } from "@/obsidian/internal/obsidian";
import { executeCommand } from "../utils/restApiClient";

const execFileAsync = promisify(execFile);

export interface ResolvedVault {
  name: string;
  key: string;
  path: string;
}

export async function resolvePrimaryVault(): Promise<ResolvedVault> {
  const vaults = await getVaultsFromPreferencesOrObsidianJson();
  if (vaults.length === 0) {
    throw new Error("No Obsidian vault is configured.");
  }
  return vaults[0];
}

// Trigger an Obsidian command via the Local REST API plugin's /commands/{id}/ endpoint.
// REST API operates on Obsidian's currently focused vault — the caller is responsible for
// having brought the desired vault to the front (see restoreObsidianFocus below).
async function triggerObsidianCommand(commandId: string): Promise<void> {
  await executeCommand(commandId);
}

export async function triggerSummarizePrompt(_vaultName: string): Promise<string> {
  for (const commandId of getSummarizeCommandCandidates()) {
    try {
      await triggerObsidianCommand(commandId);
      return commandId;
    } catch (error) {
      console.error(`[summarize] candidate "${commandId}" failed:`, error instanceof Error ? error.message : error);
    }
  }

  throw new Error("The Copilot Summarize prompt command was not found. Refresh prompts in Obsidian and try again.");
}

async function triggerSummarizePromptWithRefreshFallback(vault: ResolvedVault): Promise<string> {
  try {
    return await triggerSummarizePrompt(vault.name);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("was not found")) {
      throw error;
    }
  }

  for (const commandId of getRefreshPromptRegistryCommandCandidates()) {
    try {
      await triggerObsidianCommand(commandId);
      break;
    } catch {
      // Try next known refresh command id.
    }
  }
  return await triggerSummarizePrompt(vault.name);
}

async function restoreObsidianFocus(vaultName: string, activationDelayMs: number): Promise<void> {
  const activationScript = 'tell application "Obsidian" to activate';
  try {
    await execFileAsync("/usr/bin/osascript", ["-e", activationScript]);
  } catch {
    // obsidian://open is Obsidian's built-in URL handler (not Advanced URI) — safe and unauth.
    await open(`obsidian://open?vault=${encodeURIComponent(vaultName)}`);
  }
  await new Promise((resolve) => setTimeout(resolve, activationDelayMs));
}

export async function runAiSummarizeCommand(params: {
  notePath?: string;
  openDelayMs?: number;
  activationDelayMs?: number;
} = {}): Promise<{ normalizedPath: string; usedCommandId: string; vault: ResolvedVault; openedUri: string }> {
  const normalizedPath = params.notePath?.trim() ?? "";
  const vault = await resolvePrimaryVault();
  let openedUri = "";

  if (normalizedPath) {
    await hybridReadNote({
      vault: vault.name,
      vaultRoot: vault.path,
      path: normalizedPath,
    });

    openedUri = `obsidian://open?path=${encodeURIComponent(path.join(vault.path, normalizedPath))}`;
    await open(openedUri);
    // Let the note open, THEN bring Obsidian frontmost so Copilot's command sees it as the
    // active markdown editor. obsidian://open alone does not reliably focus the editor when the
    // command is launched from Raycast (which holds focus) — without the activate, copilot:summarize
    // dispatches but finds no active editor, so the seeded note is never rewritten (workflow "stops").
    await new Promise((resolve) => setTimeout(resolve, params.openDelayMs ?? 700));
    await restoreObsidianFocus(vault.name, params.activationDelayMs ?? 1500);
  } else {
    // Raycast steals focus; bring Obsidian back to the front so Copilot can act on the active note.
    await restoreObsidianFocus(vault.name, params.activationDelayMs ?? 1000);
  }

  const usedCommandId = await triggerSummarizePromptWithRefreshFallback(vault);

  return {
    normalizedPath,
    usedCommandId,
    vault,
    openedUri,
  };
}
