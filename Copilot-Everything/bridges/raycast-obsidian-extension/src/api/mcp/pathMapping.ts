import path from "node:path";
import type { ObsidianVault } from "@/obsidian";

export function resolveVaultForAbsolutePath(
  fullPath: string,
  vaults: ObsidianVault[]
): { vault: ObsidianVault; relativePath: string } | null {
  const match = vaults
    .filter((vault) => fullPath.startsWith(vault.path))
    .sort((a, b) => b.path.length - a.path.length)[0];

  if (!match) {
    return null;
  }

  const relativePath = path.relative(match.path, fullPath).replace(/\\/g, "/");
  return { vault: match, relativePath };
}
