import type { App, TFile } from "obsidian";

const CACHE_TTL_MS = 60_000;

/**
 * Obsidian-native replacement for the backend emulator's VaultFileSystem.
 * Uses app.vault instead of node:fs/promises.
 */
export class VaultFS {
  private cachedFiles: string[] | null = null;
  private cacheTimestamp = 0;

  constructor(private readonly app: App) {}

  /** List all .md files in the vault (cached 60s). Returns relative paths. */
  async listFiles(): Promise<string[]> {
    if (this.cachedFiles && Date.now() - this.cacheTimestamp < CACHE_TTL_MS) {
      return this.cachedFiles;
    }

    const files = this.app.vault
      .getMarkdownFiles()
      .map((f: TFile) => f.path)
      .sort();

    this.cachedFiles = files;
    this.cacheTimestamp = Date.now();
    return files;
  }

  /** Read a markdown file's content by relative path. */
  async readFile(relativePath: string): Promise<string> {
    const file = this.app.vault.getAbstractFileByPath(relativePath);
    if (!file || !("extension" in file)) {
      throw new Error(`File not found: ${relativePath}`);
    }
    return this.app.vault.read(file as TFile);
  }

  /** Get mtime and size for a file. */
  async stat(relativePath: string): Promise<{ mtime: Date; size: number }> {
    const s = await this.app.vault.adapter.stat(relativePath);
    if (!s) throw new Error(`Cannot stat: ${relativePath}`);
    return { mtime: new Date(s.mtime), size: s.size };
  }

  /**
   * Extract [[wikilinks]] from markdown content.
   * Handles [[link]], [[link|alias]], and [[link#heading]] forms.
   */
  extractWikilinks(content: string): string[] {
    const links: string[] = [];
    const re = /\[\[([^\]]+)\]\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      let target = m[1];
      const pipeIdx = target.indexOf("|");
      if (pipeIdx !== -1) target = target.slice(0, pipeIdx);
      const hashIdx = target.indexOf("#");
      if (hashIdx !== -1) target = target.slice(0, hashIdx);
      target = target.trim();
      if (target) links.push(target);
    }
    return links;
  }

  /** Invalidate the file list cache. */
  invalidateCache(): void {
    this.cachedFiles = null;
    this.cacheTimestamp = 0;
  }
}
