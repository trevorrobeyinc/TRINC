import fs from "node:fs";
import path from "node:path";
import { open } from "@raycast/api";
import { getFilePaths } from "@/api/file/file.service";
import {
  getPromptCommandId,
  getRefreshPromptRegistryCommandCandidates,
} from "@/api/copilot/commandIds";
import { hybridExecuteCommand } from "@/api/mcp/hybridObsidian.service";
import type { ObsidianVault } from "@/obsidian";

export interface PromptItem {
  absolutePath: string;
  relativePath: string;
  title: string;
  commandId: string;
}

function toPosixPath(value: string): string {
  return value.replace(/\\/g, "/");
}

export async function loadPromptItems(vault: ObsidianVault): Promise<PromptItem[]> {
  const promptsRoot = path.resolve(vault.path, "copilot/copilot-custom-prompts");
  if (!fs.existsSync(promptsRoot)) {
    return [];
  }

  const files = await getFilePaths({
    path: promptsRoot,
    includedFileExtensions: [".md"],
  });

  return files
    .sort((a, b) => a.localeCompare(b))
    .map((file) => {
      const title = path.basename(file, ".md");
      return {
        absolutePath: file,
        relativePath: toPosixPath(path.relative(vault.path, file)),
        title,
        commandId: getPromptCommandId(title),
      };
    });
}

export async function executeCopilotCommand(vaultName: string, commandId: string): Promise<void> {
  await hybridExecuteCommand({
    vault: vaultName,
    id: commandId,
  });
}

export async function runPrompt(vault: ObsidianVault, item: PromptItem): Promise<{ title: string; commandId: string }> {
  await executeCopilotCommand(vault.name, item.commandId);
  return {
    title: item.title,
    commandId: item.commandId,
  };
}

export async function refreshPromptRegistry(
  vault: ObsidianVault
): Promise<{ commandId: string; prompts: PromptItem[] }> {
  const allCandidates = getRefreshPromptRegistryCommandCandidates();

  for (const commandId of allCandidates) {
    try {
      await executeCopilotCommand(vault.name, commandId);
      return {
        commandId,
        prompts: await loadPromptItems(vault),
      };
    } catch {
      // Try next known refresh command id.
    }
  }

  throw new Error("No supported refresh command was found.");
}

export async function openPrompt(item: PromptItem): Promise<{ uri: string; relativePath: string }> {
  const uri = `obsidian://open?path=${encodeURIComponent(item.absolutePath)}`;
  await open(uri);
  return {
    uri,
    relativePath: item.relativePath,
  };
}
