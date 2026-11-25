import { App, TFile, normalizePath } from "obsidian";

/**
 * Reject vault-escaping paths before any write.
 * Same gate as the Command Center bridge on command-center.sock (its only path-safety check).
 */
export function safePath(raw: string): string {
  const normalized = normalizePath(raw);
  if (normalized.startsWith("..") || normalized.includes("/../")) {
    throw new Error("Path traversal not allowed");
  }
  return normalized;
}

/** Create every missing folder along a vault-relative path. */
export async function ensureFolder(app: App, folderPath: string): Promise<void> {
  const parts = folderPath.split("/").filter(Boolean);
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    if (!app.vault.getAbstractFileByPath(current)) {
      try {
        await app.vault.createFolder(current);
      } catch (err) {
        // A concurrent create (or a case-variant folder) is fine; anything else is not.
        if (!app.vault.getAbstractFileByPath(current)) throw err;
      }
    }
  }
}

/**
 * Turn a title into a filename Obsidian accepts and links to cleanly.
 * Keeps case and spaces (vault convention is human-readable names); strips
 * characters that break filenames or wikilink syntax.
 */
export function slugify(raw: string): string {
  const cleaned = raw
    .replace(/[\\/:*?"<>|#^[\]]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/-{2,}/g, "-")
    .trim()
    .replace(/^[-. ]+|[-. ]+$/g, "");
  return (cleaned || "untitled").slice(0, 80).trim();
}

// OPERATOR DECISION — file naming policy.
// Default: bare "<slug>.<ext>", with "-2", "-3", … suffixes on collision.
// Deterministic reruns produce stable names and clean diffs. The alternative —
// "<slug>-YYYYMMDD-HHmmss.<ext>" — never collides and sorts chronologically,
// at the cost of a new file on every rerun. Swapping policies is confined to
// this function.
export function uniquePath(
  app: App,
  folder: string,
  baseName: string,
  ext: string,
  overwrite: boolean
): string {
  const dir = folder ? `${folder}/` : "";
  const candidate = safePath(`${dir}${baseName}.${ext}`);
  if (overwrite || !app.vault.getAbstractFileByPath(candidate)) return candidate;
  for (let n = 2; n < 1000; n++) {
    const next = safePath(`${dir}${baseName}-${n}.${ext}`);
    if (!app.vault.getAbstractFileByPath(next)) return next;
  }
  throw new Error(`Could not find a free filename for ${candidate}`);
}

export interface WriteResult {
  path: string;
  created: boolean;
}

/** Create or (when it already exists) overwrite a text file, parents ensured. */
export async function writeText(
  app: App,
  path: string,
  content: string
): Promise<WriteResult> {
  const safe = safePath(path);
  const existing = app.vault.getAbstractFileByPath(safe);
  if (existing instanceof TFile) {
    await app.vault.modify(existing, content);
    return { path: safe, created: false };
  }
  if (existing) throw new Error(`Path exists and is not a file: ${safe}`);
  const parent = safe.substring(0, safe.lastIndexOf("/"));
  if (parent) await ensureFolder(app, parent);
  await app.vault.create(safe, content);
  return { path: safe, created: true };
}

/** Create or overwrite a binary file (PNG etc.), parents ensured. */
export async function writeBinary(
  app: App,
  path: string,
  data: ArrayBuffer
): Promise<WriteResult> {
  const safe = safePath(path);
  const existing = app.vault.getAbstractFileByPath(safe);
  if (existing instanceof TFile) {
    await app.vault.modifyBinary(existing, data);
    return { path: safe, created: false };
  }
  if (existing) throw new Error(`Path exists and is not a file: ${safe}`);
  const parent = safe.substring(0, safe.lastIndexOf("/"));
  if (parent) await ensureFolder(app, parent);
  await app.vault.createBinary(safe, data);
  return { path: safe, created: true };
}

/** Wikilink embed string for a generated artifact. */
export function buildEmbed(path: string): string {
  return `![[${path}]]`;
}

export interface AppendEmbedResult {
  targetNote: string;
  targetNoteCreated: boolean;
}

/**
 * Append an embed (or any markdown block) to a note, creating the note with a
 * heading when it does not exist yet.
 */
export async function appendBlock(
  app: App,
  targetNote: string,
  block: string,
  caption?: string
): Promise<AppendEmbedResult> {
  let notePath = safePath(targetNote);
  if (!/\.md$/i.test(notePath)) notePath = `${notePath}.md`;

  const suffix = caption ? `\n${block}\n\n*${caption}*\n` : `\n${block}\n`;
  const existing = app.vault.getAbstractFileByPath(notePath);
  if (existing instanceof TFile) {
    const current = await app.vault.read(existing);
    const separator = current.endsWith("\n") ? "\n" : "\n\n";
    await app.vault.modify(existing, `${current}${separator}${suffix.replace(/^\n/, "")}`);
    return { targetNote: notePath, targetNoteCreated: false };
  }
  if (existing) throw new Error(`Target exists and is not a note: ${notePath}`);

  const parent = notePath.substring(0, notePath.lastIndexOf("/"));
  if (parent) await ensureFolder(app, parent);
  const basename = notePath.substring(notePath.lastIndexOf("/") + 1).replace(/\.md$/i, "");
  await app.vault.create(notePath, `# ${basename}\n${suffix}`);
  return { targetNote: notePath, targetNoteCreated: true };
}
