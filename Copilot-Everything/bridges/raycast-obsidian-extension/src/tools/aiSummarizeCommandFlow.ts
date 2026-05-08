import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { open } from "@raycast/api";
import { existsSync } from "node:fs";
import { getRefreshPromptRegistryCommandCandidates, getSummarizeCommandCandidates } from "@/api/copilot/commandIds";
import { hybridReadNote } from "@/api/mcp/hybridObsidian.service";
import { getVaultsFromPreferencesOrObsidianJson } from "@/obsidian/internal/obsidian";

const execFileAsync = promisify(execFile);
const OBSIDIAN_BINARY_CANDIDATES = [
  "/Applications/Obsidian.app/Contents/MacOS/obsidian",
  "/opt/homebrew/bin/obsidian",
  "/usr/local/bin/obsidian",
];

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

function resolveObsidianBinary(): string {
  const binary = OBSIDIAN_BINARY_CANDIDATES.find((candidate) => existsSync(candidate));
  if (!binary) {
    throw new Error("Obsidian CLI binary was not found.");
  }
  return binary;
}

async function runObsidianCliCommand(vaultName: string, commandId: string): Promise<void> {
  await execFileAsync(resolveObsidianBinary(), [`vault=${vaultName}`, "command", `id=${commandId}`], {
    timeout: 20_000,
  });
}

export async function triggerSummarizePrompt(vaultName: string): Promise<string> {
  for (const commandId of getSummarizeCommandCandidates()) {
    try {
      await runObsidianCliCommand(vaultName, commandId);
      return commandId;
    } catch {
      // Try next known summarize command id.
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
      await runObsidianCliCommand(vault.name, commandId);
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
    await new Promise((resolve) => setTimeout(resolve, params.openDelayMs ?? 1200));
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
