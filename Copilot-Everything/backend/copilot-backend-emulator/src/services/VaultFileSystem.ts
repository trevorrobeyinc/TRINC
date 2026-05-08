import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, extname } from "node:path";

const SKIP_DIRS = new Set([
  ".obsidian", ".trash", "node_modules", ".git",
  ".venv", ".venv311", ".github", ".learnings",
  ".obsidian-integration-reference",
]);
const CACHE_TTL_MS = 60_000;

export class VaultFileSystem {
  private cachedFiles: string[] | null = null;
  private cacheTimestamp = 0;

  constructor(private readonly vaultRoot: string) {}

  /**
   * Recursively list all .md files in the vault.
   * Results are cached for 60 seconds.
   * Returns relative paths (e.g. "Ideas/Emergence.md").
   */
  async listFiles(): Promise<string[]> {
    if (this.cachedFiles && Date.now() - this.cacheTimestamp < CACHE_TTL_MS) {
      return this.cachedFiles;
    }

    const files: string[] = [];
    await this.walk(this.vaultRoot, files);
    files.sort();

    this.cachedFiles = files;
    this.cacheTimestamp = Date.now();
    return files;
  }

  async readFile(relativePath: string): Promise<string> {
    return readFile(join(this.vaultRoot, relativePath), "utf-8");
  }

  async stat(relativePath: string): Promise<{ mtime: Date; size: number }> {
    const s = await stat(join(this.vaultRoot, relativePath));
    return { mtime: s.mtime, size: s.size };
  }

  /**
   * Extract [[wikilinks]] from markdown content.
   * Handles [[link]], [[link|alias]], and [[link#heading]] forms.
   * Returns normalized link targets (without alias or heading).
   */
  extractWikilinks(content: string): string[] {
    const links: string[] = [];
    const re = /\[\[([^\]]+)\]\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      let target = m[1];
      // Strip alias: [[target|display]]
      const pipeIdx = target.indexOf("|");
      if (pipeIdx !== -1) target = target.slice(0, pipeIdx);
      // Strip heading: [[target#heading]]
      const hashIdx = target.indexOf("#");
      if (hashIdx !== -1) target = target.slice(0, hashIdx);
      target = target.trim();
      if (target) links.push(target);
    }
    return links;
  }

  /** Invalidate the file list cache (e.g. after known vault changes). */
  invalidateCache(): void {
    this.cachedFiles = null;
    this.cacheTimestamp = 0;
  }

  private async walk(dir: string, out: string[]): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return; // permission errors, missing dirs
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) {
          await this.walk(join(dir, entry.name), out);
        }
      } else if (entry.isFile() && extname(entry.name) === ".md") {
        out.push(relative(this.vaultRoot, join(dir, entry.name)));
      }
    }
  }
}
