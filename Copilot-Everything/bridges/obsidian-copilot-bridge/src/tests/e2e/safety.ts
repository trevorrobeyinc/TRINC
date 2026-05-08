import fs from "node:fs";
import path from "node:path";

export const E2E_VAULT_MARKER = ".cpbh-e2e-vault";

export function assertAbsolutePath(inputPath: string, label: string): string {
  const resolved = path.resolve(inputPath);
  if (!path.isAbsolute(resolved)) {
    throw new Error(`[E2E] ${label} must be an absolute path. Received: ${inputPath}`);
  }
  return resolved;
}

export function assertE2EVaultSafety(vaultPath: string): void {
  const absoluteVaultPath = assertAbsolutePath(vaultPath, "OBSIDIAN_E2E_VAULT_PATH");

  if (!fs.existsSync(absoluteVaultPath)) {
    throw new Error(`[E2E] Vault path does not exist: ${absoluteVaultPath}`);
  }

  const markerPath = path.resolve(absoluteVaultPath, E2E_VAULT_MARKER);
  if (!fs.existsSync(markerPath)) {
    throw new Error(
      `[E2E] Refusing to run against vault without marker file '${E2E_VAULT_MARKER}'. Expected: ${markerPath}`
    );
  }

  const markerStat = fs.statSync(markerPath);
  if (!markerStat.isFile()) {
    throw new Error(`[E2E] Vault marker path is not a regular file: ${markerPath}`);
  }
}

export function listVaultRelativeFiles(vaultPath: string): string[] {
  const absoluteVaultPath = assertAbsolutePath(vaultPath, "vaultPath");
  const files: string[] = [];

  const walk = (currentAbsoluteDir: string): void => {
    const entries = fs.readdirSync(currentAbsoluteDir, { withFileTypes: true });
    for (const entry of entries) {
      const absoluteEntryPath = path.resolve(currentAbsoluteDir, entry.name);
      const relativePath = path.relative(absoluteVaultPath, absoluteEntryPath).replace(/\\/g, "/");
      if (entry.isDirectory()) {
        walk(absoluteEntryPath);
        continue;
      }
      files.push(relativePath);
    }
  };

  walk(absoluteVaultPath);
  files.sort((a, b) => a.localeCompare(b));
  return files;
}
