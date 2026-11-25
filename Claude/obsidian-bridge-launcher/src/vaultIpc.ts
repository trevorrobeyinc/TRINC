import { createHash } from "crypto";
import type { App, PaneType, SearchResult, TAbstractFile, TFile, TFolder } from "obsidian";
import { allowedCommandIds, isCommandAllowed } from "./commandPolicy.ts";

/**
 * The vault bridge's vault operations, served in renderer scope on the launcher's private fd-3 pipe.
 *
 * Since 2026-11-25 they replace the Local REST API plugin (HTTPS on 127.0.0.1:27124) as the bridge's only
 * backend, so the bridge needs no TCP port, API key or certificate. They are built on app.vault,
 * app.workspace, app.metadataCache and app.commands, as Command Center's in-process obsidian_* tools are. They
 * keep the REST plugin's behaviour except where the bridge README's "What changed for clients" says otherwise,
 * and each method says how.
 *
 * Where the trust boundary is. The bridge is a Node process of the same user: a compromised bridge can
 * already read and write any file without asking the launcher, so the path checks below are defence in
 * depth against input that slipped past the bridge's own guard (its src/fs/pathGuard.ts), not a sandbox.
 * What only this channel can do is run Obsidian commands inside the renderer, and a RunJS-style plugin is
 * one command away from arbitrary code. So commands.execute is the boundary that matters: it runs only
 * what commandPolicy.ts allows, and every attempt is audited. That holds once the Local REST API plugin is
 * disabled: while it is enabled, its POST /commands/{id}/ runs any command for a process holding its key.
 */

export const VAULT_METHODS = [
  "vault.info",
  "vault.read",
  "vault.create",
  "vault.append",
  "vault.search",
  "workspace.open",
  "commands.execute",
] as const;

export type VaultMethod = (typeof VAULT_METHODS)[number];

export function isVaultMethod(method: unknown): method is VaultMethod {
  return typeof method === "string" && (VAULT_METHODS as readonly string[]).includes(method);
}

/** Why a method refused. It travels with the error so the bridge can map it to its own error codes. */
export type VaultIpcReason =
  | "invalid_params"
  | "path_refused"
  | "not_found"
  | "already_exists"
  | "too_large"
  | "command_refused"
  | "unavailable";

export class VaultIpcError extends Error {
  readonly reason: VaultIpcReason;
  /** A short word saying what was refused, where the reason alone would not. Never sent to the bridge. */
  readonly detail: string | undefined;

  constructor(reason: VaultIpcReason, message: string, detail?: string) {
    super(message);
    this.name = "VaultIpcError";
    this.reason = reason;
    this.detail = detail;
  }
}

/**
 * The parts of the 'obsidian' module these methods call at run time. main.ts passes the real ones; the tests
 * pass stand-ins, because the 'obsidian' package ships only type definitions and cannot load outside the app.
 */
export interface ObsidianRuntime {
  normalizePath(path: string): string;
  prepareSimpleSearch(query: string): (text: string) => SearchResult | null;
  /** `entry instanceof TFile` */
  isNote(entry: TAbstractFile | null): entry is TFile;
  /** `entry instanceof TFolder` */
  isFolder(entry: TAbstractFile | null): entry is TFolder;
}

export interface VaultDeps {
  app: App;
  obsidian: ObsidianRuntime;
  /** The launcher's security audit sink (audit.jsonl). Refusals and command attempts are recorded; note text never is. */
  audit: (event: Record<string, unknown>) => void;
  /** The launcher's manifest version, reported by vault.info so the bridge can tell an old launcher. */
  version: string;
  /** How long workspace.open waits for the index to catch up with a note already on disk (tests shorten it). */
  indexWaitMs?: number;
}

const MAX_PATH_CHARS = 1024;
const MAX_QUERY_CHARS = 1024;
export const MAX_COMMAND_ID_CHARS = 200;
/** A note body longer than this many UTF-16 units is refused before anything else is done with it. */
export const MAX_CONTENT_CHARS = 16 * 1024 * 1024;
/**
 * A note body larger than this in UTF-8 is not written, and a file larger than this on disk is not read in
 * full, so every note written in one call can be read back in one call. (A file grown past it by appends can
 * still be appended to: the bridge confirms an append with a tail read, which this cap does not limit.)
 */
export const MAX_NOTE_BYTES = 16 * 1024 * 1024;
export const MAX_READ_BYTES = MAX_NOTE_BYTES;
/** The longest tail vault.read returns when asked for one (the bridge's append confirmation reads 16,384). */
export const MAX_TAIL_CHARS = 64 * 1024;
/** vault.search returns at most this many results (the bridge's own schema caps `limit` at 500 too). */
export const MAX_SEARCH_RESULTS = 500;
/** Characters of context either side of the first match, as the REST plugin's simple search returns. */
const SEARCH_CONTEXT_CHARS = 100;
const SHA256_HEX = /^[0-9a-f]{64}$/;
const INDEX_WAIT_MS = 1500;
const INDEX_POLL_MS = 100;

/**
 * The refusals worth a security audit event: a path the bridge's own guard should already have refused, or a
 * note body the pipe damaged. Ordinary mistakes (a folder given as a note, a missing note, a file too large)
 * are answered but not audited, so a SIEM rule on LAUNCHER_VAULT_REFUSED does not page on them.
 */
const AUDITED_DETAILS: ReadonlySet<string> = new Set([
  "not_vault_relative",
  "dot_or_empty_segment",
  "config_folder",
  "content_sha256_missing",
  "content_sha256_mismatch",
]);

type Params = Record<string, unknown>;

function asParams(params: unknown): Params {
  return params !== null && typeof params === "object" && !Array.isArray(params) ? (params as Params) : {};
}

function requireString(value: unknown, field: string, maxChars: number): string {
  if (typeof value !== "string") {
    throw new VaultIpcError("invalid_params", `${field} must be a string`);
  }
  if (value.length > maxChars) {
    throw new VaultIpcError("invalid_params", `${field} is longer than ${maxChars} characters`);
  }
  return value;
}

function hasControlCharacter(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** What the audit log may say about a client string: its length and sha256, never its text. */
function digestOf(field: string, value: unknown): Record<string, unknown> {
  if (typeof value !== "string") return { [`${field}Type`]: value === null ? "null" : typeof value };
  return { [`${field}Length`]: value.length, [`${field}Sha256`]: sha256(value) };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * A vault-relative note path, or a refusal. The raw text is checked first, because normalizePath would
 * quietly turn "/x" into "x" and "a//b" into "a/b". Refused: an absolute path, a backslash, a control
 * character, and any segment that is empty or starts with "." (so ".", "..", ".obsidian", ".trash" and
 * ".git"). The vault's config folder is also refused by name, in any letter case (APFS ignores case), in case
 * it was renamed to one without a dot. The check reads the text only: a link inside the vault that points into
 * a hidden folder is caught by the bridge's guard, which resolves links, for every path the bridge sends (note
 * paths and search folders). The files a search reads are filtered by their text alone, as under REST.
 */
export function guardPath(raw: unknown, configDir: string, obsidian: Pick<ObsidianRuntime, "normalizePath">): string {
  const text = requireString(raw, "path", MAX_PATH_CHARS);
  if (!text || text.startsWith("/") || text.includes("\\") || hasControlCharacter(text)) {
    throw new VaultIpcError(
      "path_refused",
      "path must be vault-relative, with no backslash or control character",
      "not_vault_relative"
    );
  }
  if (text.split("/").some((segment) => segment === "" || segment.startsWith("."))) {
    throw new VaultIpcError(
      "path_refused",
      "path has an empty, '.' or '..' segment, or names a hidden folder such as .obsidian",
      "dot_or_empty_segment"
    );
  }
  const path = obsidian.normalizePath(text);
  const folded = path.toLowerCase();
  const config = obsidian.normalizePath(configDir).toLowerCase();
  if (folded === config || folded.startsWith(`${config}/`)) {
    throw new VaultIpcError("path_refused", "the vault's config folder is out of reach", "config_folder");
  }
  return path;
}

function isSearchablePath(path: string, configDir: string, obsidian: ObsidianRuntime): boolean {
  try {
    guardPath(path, configDir, obsidian);
    return true;
  } catch {
    return false;
  }
}

/**
 * The bridge sends the sha256 of every note body it writes, and nothing is written unless the text that
 * arrived hashes the same. A pipe that damages text (a UTF-8 sequence split across two reads and decoded in
 * halves, as this launcher's reader did until 2026-11-25) then fails the call instead of storing the damage.
 */
function verifyContent(p: Params, content: string): void {
  const expected = p.contentSha256;
  if (typeof expected !== "string" || !SHA256_HEX.test(expected)) {
    throw new VaultIpcError(
      "invalid_params",
      "contentSha256 (the lowercase hex sha256 of the content's UTF-8 bytes) is required",
      "content_sha256_missing"
    );
  }
  if (sha256(content) !== expected) {
    throw new VaultIpcError(
      "invalid_params",
      "the content arrived damaged (its sha256 does not match contentSha256), so nothing was written",
      "content_sha256_mismatch"
    );
  }
}

/** A body is written only if it can be read back whole: its UTF-8 size, not its length, is what vault.read caps. */
function refuseTooLargeToWrite(path: string, content: string): void {
  const bytes = Buffer.byteLength(content, "utf8");
  if (bytes > MAX_NOTE_BYTES) {
    throw new VaultIpcError(
      "too_large",
      `the content for ${path} is ${bytes} bytes; a note body is written up to ${MAX_NOTE_BYTES} bytes`,
      "too_large"
    );
  }
}

function refuseOversized(path: string, bytes: number | undefined): void {
  if (typeof bytes === "number" && bytes > MAX_READ_BYTES) {
    throw new VaultIpcError(
      "too_large",
      `${path} is ${bytes} bytes; vault.read serves a whole file up to ${MAX_READ_BYTES} bytes`,
      "too_large"
    );
  }
}

type LocatedNote = { kind: "indexed"; file: TFile } | { kind: "on_disk"; path: string } | { kind: "missing" };

/**
 * Finds the note a guarded path names. The REST plugin read and wrote through the vault adapter, so it found a
 * note whatever the letter case (APFS, where this vault lives, ignores case) and before Obsidian had indexed
 * it. This looks in the index first, so that writes go through app.vault and stay in step with an open
 * editor, then covers both of those cases: the one indexed entry whose path differs only in letter case (a note
 * is used, a folder refused), and a file on disk under exactly this path that is not in the index yet (a sync
 * or a script wrote it a moment ago). A not-yet-indexed file in another letter case is refused, not guessed at.
 */
async function locateNote(deps: VaultDeps, path: string): Promise<LocatedNote> {
  const { app, obsidian } = deps;
  const entry = app.vault.getAbstractFileByPath(path);
  if (obsidian.isNote(entry)) return { kind: "indexed", file: entry };
  if (entry) throw new VaultIpcError("path_refused", `${path} is a folder, not a note`, "folder_not_note");

  const lower = path.toLowerCase();
  const sameButCase = app.vault.getAllLoadedFiles().filter((candidate) => candidate.path.toLowerCase() === lower);
  if (sameButCase.length > 1) {
    throw new VaultIpcError(
      "path_refused",
      `${path} matches ${sameButCase.length} entries that differ only in letter case; give the exact path`,
      "case_ambiguous"
    );
  }
  if (sameButCase.length === 1) {
    const only = sameButCase[0];
    if (obsidian.isNote(only)) return { kind: "indexed", file: only };
    throw new VaultIpcError("path_refused", `${path} is the folder ${only.path}, not a note`, "folder_not_note");
  }

  if (await app.vault.adapter.exists(path, true)) {
    const stat = await app.vault.adapter.stat(path);
    if (stat?.type === "folder") throw new VaultIpcError("path_refused", `${path} is a folder, not a note`, "folder_not_note");
    return { kind: "on_disk", path };
  }
  if (await app.vault.adapter.exists(path)) {
    // One more look in exact case, in case a writer created the file between the two calls.
    if (await app.vault.adapter.exists(path, true)) return { kind: "on_disk", path };
    throw new VaultIpcError(
      "path_refused",
      `a file named like ${path} in another letter case is on disk but not in Obsidian's index yet; give its exact path`,
      "case_variant_unindexed"
    );
  }
  return { kind: "missing" };
}

/**
 * Creates each missing folder on the way to `path`, in order. A folder the bridge already made on disk (its
 * create_note tool does) may not be in the vault's index yet, so createFolder can fail: that is fine as
 * long as the folder exists.
 */
async function ensureParentFolders(deps: VaultDeps, path: string): Promise<void> {
  const { app, obsidian } = deps;
  const parts = path.split("/").slice(0, -1);
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    const entry = app.vault.getAbstractFileByPath(current);
    if (obsidian.isNote(entry)) {
      throw new VaultIpcError("path_refused", `${current} is a note, not a folder`, "note_not_folder");
    }
    if (entry) continue;
    try {
      await app.vault.createFolder(current);
    } catch (error) {
      if (!(await app.vault.adapter.exists(current))) throw error;
    }
  }
}

function paneTypeOf(value: unknown): PaneType | false {
  return value === "tab" || value === "split" || value === "window" ? value : false;
}

/**
 * Opens a note that is already resolved. The note is resolved first because getLeaf("tab"), ("split") and
 * ("window") create their leaf at once, and a refused open would leave it behind empty.
 */
async function openInLeaf(app: App, file: TFile, paneType: PaneType | false): Promise<void> {
  await app.workspace.getLeaf(paneType).openFile(file);
}

/**
 * The note workspace.open opens. The REST plugin's /open took link text, so besides the exact path this
 * accepts what a link would: another letter case, no ".md", or a bare note name, resolved the way Obsidian
 * resolves [[links]] (getFirstLinkpathDest, which never creates a note). A note already on disk that Obsidian
 * has not indexed yet gets a short wait for the index. Unlike the plugin, a name that resolves to nothing is
 * refused rather than created, because the bridge runs open_vault outside its per-note write lock.
 */
async function resolveNoteToOpen(deps: VaultDeps, path: string): Promise<TFile> {
  const { app, obsidian } = deps;
  const entry = app.vault.getAbstractFileByPath(path);
  if (obsidian.isNote(entry)) return entry;
  let folderOnDisk = false;
  if (!entry && (await app.vault.adapter.exists(path, true))) {
    // A file at exactly this path, not indexed yet: that is the note asked for, so wait for it rather than
    // open whichever indexed note the same text links to.
    const stat = await app.vault.adapter.stat(path);
    if (stat?.type === "folder") {
      folderOnDisk = true;
    } else {
      const waitMs = deps.indexWaitMs ?? INDEX_WAIT_MS;
      for (let waited = 0; waited < waitMs; waited += INDEX_POLL_MS) {
        await sleep(Math.min(INDEX_POLL_MS, waitMs - waited));
        const indexed = app.vault.getAbstractFileByPath(path);
        if (obsidian.isNote(indexed)) return indexed;
      }
      throw new VaultIpcError("not_found", `${path} is on disk, but Obsidian has not indexed it`);
    }
  }
  const linked = app.metadataCache.getFirstLinkpathDest(path, "");
  if (linked) return linked;
  if (entry || folderOnDisk) throw new VaultIpcError("path_refused", `${path} is a folder, not a note`, "folder_not_note");
  throw new VaultIpcError("not_found", `note not found: ${path}`);
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

/** The last `chars` characters of a text, never starting on the second half of a surrogate pair. */
function tailOf(text: string, chars: number): string {
  if (text.length <= chars) return text;
  let from = text.length - chars;
  if (isLowSurrogate(text.charCodeAt(from))) from += 1;
  return text.slice(from);
}

function tailCharsOf(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > MAX_TAIL_CHARS) {
    throw new VaultIpcError("invalid_params", `tailChars must be an integer from 1 to ${MAX_TAIL_CHARS}`);
  }
  return value;
}

/**
 * The first match, as the REST plugin's simple search reported it: the file name when the query matched
 * the name, otherwise the matched text with SEARCH_CONTEXT_CHARS either side, widened so that no surrogate
 * pair is cut in half. A match straddling the name and the text is skipped, as the plugin skips it.
 */
function firstMatchText(basename: string, offset: number, content: string, result: SearchResult): string | undefined {
  for (const [start, end] of result.matches) {
    if (end <= offset) return basename;
    if (start < offset) continue;
    let from = Math.max(start - offset - SEARCH_CONTEXT_CHARS, 0);
    let to = Math.min(end - offset + SEARCH_CONTEXT_CHARS, content.length);
    if (from > 0 && isLowSurrogate(content.charCodeAt(from))) from -= 1;
    if (to < content.length && isLowSurrogate(content.charCodeAt(to))) to += 1;
    return content.slice(from, to);
  }
  return undefined;
}

/**
 * How search_notes' `path` is read: the folder the client typed, turned into a vault-relative folder path
 * for guardPath, or null for "search the whole vault". guardPath and the folder lookup after it run on
 * whatever this returns, so it decides only which spellings mean what: it cannot let a path out of the vault.
 *
 * The REST plugin ignored `path` altogether. A folder gets written in several ways: "Research",
 * "Research/", "/Research", "./Research", "/" or "." for the root, sometimes with spaces around it.
 */
export function normalizeSearchFolder(raw: string): string | null {
  const folder = raw
    .trim()
    // "/Research", "./Research" and "/./Research" are vault-rooted spellings of "Research".
    .replace(/^(?:\.?\/+)+/, "")
    // "Research/" and "Research/." name the folder itself.
    .replace(/(?:\/\.?)+$/, "");
  // Nothing left, or only ".", is the vault root ("", "/", ".", "./"): search everything. Anything odd that is
  // left ("a//b", "../x", ".obsidian", a backslash) is refused by guardPath, and an absolute file-system path
  // becomes a folder that does not exist, which is refused as not_found.
  return folder === "" || folder === "." ? null : folder;
}

/**
 * The folder a search is narrowed to, or null for the whole vault: the spelling normalised, then guarded like
 * any path, then matched to a real folder, exactly or else the one entry whose path differs only in letter
 * case. A path that names no folder is refused rather than answered with no matches, so a mistyped folder is
 * never mistaken for a search that found nothing, and a note given as the folder is refused in any letter case.
 */
function resolveSearchFolder(deps: VaultDeps, raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  const spelled = normalizeSearchFolder(requireString(raw, "path", MAX_PATH_CHARS));
  if (spelled === null) return null;
  const { app, obsidian } = deps;
  const folder = guardPath(spelled, app.vault.configDir, obsidian);
  const entry = app.vault.getAbstractFileByPath(folder);
  if (obsidian.isFolder(entry)) return entry.path;
  if (entry) throw new VaultIpcError("path_refused", `${folder} is a note, not a folder`, "search_folder_is_note");
  const lower = folder.toLowerCase();
  const sameButCase = app.vault.getAllLoadedFiles().filter((candidate) => candidate.path.toLowerCase() === lower);
  if (sameButCase.length > 1) {
    throw new VaultIpcError(
      "path_refused",
      `${folder} matches ${sameButCase.length} entries that differ only in letter case`,
      "case_ambiguous"
    );
  }
  if (sameButCase.length === 1) {
    const only = sameButCase[0];
    if (obsidian.isFolder(only)) return only.path;
    throw new VaultIpcError("path_refused", `${folder} is the note ${only.path}, not a folder`, "search_folder_is_note");
  }
  throw new VaultIpcError("not_found", `no folder ${folder} in the vault`);
}

/**
 * The REST plugin's simple search: Obsidian's prepareSimpleSearch over every Markdown note, with the note's
 * name searched too, best score first. Two narrowings the plugin ignored are honoured: `path` (a folder) and
 * `limit` (MAX_SEARCH_RESULTS when absent; the plugin returned every match). caseSensitive is still not
 * supported, as before.
 */
async function searchNotes(
  deps: VaultDeps,
  p: Params
): Promise<{ results: Array<{ path: string; text?: string }>; total: number }> {
  const { app, obsidian } = deps;
  const query = requireString(p.query, "query", MAX_QUERY_CHARS).trim();
  if (!query) throw new VaultIpcError("invalid_params", "query is empty");
  const configDir = app.vault.configDir;
  const folder = resolveSearchFolder(deps, p.path);
  const limit =
    typeof p.limit === "number" && Number.isInteger(p.limit) && p.limit > 0
      ? Math.min(p.limit, MAX_SEARCH_RESULTS)
      : MAX_SEARCH_RESULTS;

  const match = obsidian.prepareSimpleSearch(query);
  const hits: Array<{ path: string; text: string | undefined; score: number }> = [];
  for (const file of app.vault.getMarkdownFiles()) {
    if (folder && !file.path.startsWith(`${folder}/`)) continue;
    if (!isSearchablePath(file.path, configDir, obsidian)) continue;
    const content = await app.vault.cachedRead(file);
    const prefix = `${file.basename}\n\n`;
    const result = match(prefix + content);
    if (!result) continue;
    hits.push({ path: file.path, text: firstMatchText(file.basename, prefix.length, content, result), score: result.score });
  }
  hits.sort((a, b) => b.score - a.score);
  return {
    results: hits.slice(0, limit).map(({ path, text }) => (text === undefined ? { path } : { path, text })),
    total: hits.length,
  };
}

/**
 * What the audit log may say about a refused id: its length and sha256, and whether Obsidian has a command by
 * that id, never its text. A command-shaped id can still carry prose (hyphens join words, and every Copilot
 * custom prompt registers copilot:<prompt-name>-to-note), and audit.jsonl feeds the SIEM. Only the allowed ids,
 * which are fixed in commandPolicy.ts, are ever written in clear.
 */
function describeRefusedId(app: App, id: string): Record<string, unknown> {
  const registry = (app as unknown as { commands?: { commands?: Record<string, unknown> } }).commands?.commands;
  const registered = !!registry && typeof registry === "object" && Object.prototype.hasOwnProperty.call(registry, id);
  return { ...digestOf("commandId", id), registered };
}

function executeCommand(deps: VaultDeps, p: Params): { executed: boolean; id: string } {
  const raw = p.id;
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_COMMAND_ID_CHARS) {
    deps.audit({ eventType: "LAUNCHER_COMMAND_REFUSED", reason: "invalid_id", ...digestOf("commandId", raw) });
    throw new VaultIpcError("invalid_params", `id must be a command id of 1 to ${MAX_COMMAND_ID_CHARS} characters`);
  }
  const id = raw;
  if (!isCommandAllowed(id)) {
    deps.audit({ eventType: "LAUNCHER_COMMAND_REFUSED", reason: "not_on_allowlist", ...describeRefusedId(deps.app, id) });
    throw new VaultIpcError(
      "command_refused",
      "that command is not on the launcher's allow-list (obsidian-bridge-launcher src/commandPolicy.ts), " +
        `which runs only: ${allowedCommandIds().join(", ")}`
    );
  }
  const registry = (deps.app as unknown as { commands?: { executeCommandById?: (commandId: string) => boolean } })
    .commands;
  if (!registry || typeof registry.executeCommandById !== "function") {
    deps.audit({ eventType: "LAUNCHER_COMMAND_EXECUTED", commandId: id, executed: false, reason: "registry_unavailable" });
    throw new VaultIpcError("unavailable", "Obsidian's command registry is not available");
  }
  let executed: boolean;
  try {
    // false: no such command, or its check callback declined (for example, no note is open).
    executed = registry.executeCommandById(id) !== false;
  } catch (error) {
    deps.audit({ eventType: "LAUNCHER_COMMAND_EXECUTED", commandId: id, executed: false, reason: "command_threw" });
    throw error;
  }
  deps.audit({ eventType: "LAUNCHER_COMMAND_EXECUTED", commandId: id, executed });
  return { executed, id };
}

/** The vault's folder on disk (FileSystemAdapter.getBasePath), so the bridge can check it serves its own vault. */
function basePathOf(app: App): string | null {
  const adapter = app.vault.adapter as unknown as { getBasePath?: () => unknown };
  if (typeof adapter.getBasePath !== "function") return null;
  const basePath = adapter.getBasePath();
  return typeof basePath === "string" ? basePath : null;
}

async function serve(method: VaultMethod, p: Params, deps: VaultDeps): Promise<unknown> {
  const { app, obsidian } = deps;
  const configDir = app.vault.configDir;

  switch (method) {
    case "vault.info":
      return { vault: app.vault.getName(), version: deps.version, methods: [...VAULT_METHODS], basePath: basePathOf(app) };

    case "vault.read": {
      // The REST plugin's GET. With tailChars only the end of the file is returned, however large it grew. Only
      // the bridge's append confirmation sends it (its read_note tool has no such field), right after an append
      // that read and rewrote the whole file anyway. A whole read is capped at MAX_READ_BYTES.
      const path = guardPath(p.path, configDir, obsidian);
      const tailChars = tailCharsOf(p.tailChars);
      const note = await locateNote(deps, path);
      if (note.kind === "missing") throw new VaultIpcError("not_found", `note not found: ${path}`);
      const notePath = note.kind === "indexed" ? note.file.path : note.path;
      if (tailChars === null) {
        const bytes = note.kind === "indexed" ? note.file.stat?.size : (await app.vault.adapter.stat(note.path))?.size;
        refuseOversized(notePath, bytes);
      }
      const content = note.kind === "indexed" ? await app.vault.read(note.file) : await app.vault.adapter.read(note.path);
      return { path: notePath, content: tailChars === null ? content : tailOf(content, tailChars) };
    }

    case "vault.create": {
      // The REST plugin's PUT: create the note and its folders, or replace it. Replacing needs overwrite=true
      // here as well as in the bridge's tool, which checks the file on disk first. Unlike the PUT, `open` and
      // `newtab` are honoured.
      const path = guardPath(p.path, configDir, obsidian);
      const content = p.content === undefined ? "" : requireString(p.content, "content", MAX_CONTENT_CHARS);
      verifyContent(p, content);
      refuseTooLargeToWrite(path, content);
      const replace = p.overwrite === true;
      const alreadyThere = (): VaultIpcError => new VaultIpcError("already_exists", `note already exists: ${path}`);
      const note = await locateNote(deps, path);
      if (note.kind !== "missing" && !replace) throw alreadyThere();
      let file: TFile | null = null;
      let created = false;
      if (note.kind === "indexed") {
        await app.vault.modify(note.file, content);
        file = note.file;
      } else if (note.kind === "on_disk") {
        await app.vault.adapter.write(note.path, content);
      } else {
        await ensureParentFolders(deps, path);
        // A sync or a script may have written the file since locateNote looked; the adapter sees it at once.
        if (await app.vault.adapter.exists(path)) {
          if (!replace) throw alreadyThere();
          await app.vault.adapter.write(path, content);
        } else {
          try {
            file = await app.vault.create(path, content);
            created = true;
          } catch (error) {
            if (!(await app.vault.adapter.exists(path))) throw error;
            if (!replace) throw alreadyThere();
            await app.vault.adapter.write(path, content);
          }
        }
      }
      const written = file ? file.path : path;
      if (p.open !== true) return { path: written, created };
      // Opening is best effort: the note is written either way, and a failed open must not report the
      // write as failed (a retry would then meet ALREADY_EXISTS).
      let opened = false;
      if (file) {
        try {
          await openInLeaf(app, file, p.newtab === true ? "tab" : false);
          opened = true;
        } catch {
          opened = false;
        }
      }
      return { path: written, created, opened };
    }

    case "vault.append": {
      // The REST plugin's POST: a newline goes in first only when the note does not already end with one,
      // and a missing note is created holding the content. (The bridge's `inline` flag never had an effect
      // on that endpoint, and it has none here.)
      const path = guardPath(p.path, configDir, obsidian);
      const content = requireString(p.content, "content", MAX_CONTENT_CHARS);
      verifyContent(p, content);
      refuseTooLargeToWrite(path, content);
      const appendTo = (data: string): string => (data.endsWith("\n") ? data : `${data}\n`) + content;
      const note = await locateNote(deps, path);
      if (note.kind === "indexed") {
        await app.vault.process(note.file, appendTo);
        return { path: note.file.path, created: false };
      }
      if (note.kind === "on_disk") {
        // Not indexed yet: the adapter works on the path, so the existing text is kept, never replaced.
        await app.vault.adapter.process(note.path, appendTo);
        return { path: note.path, created: false };
      }
      await ensureParentFolders(deps, path);
      // A writer that got there since locateNote looked keeps its text: append to it instead of creating.
      if (await app.vault.adapter.exists(path)) {
        await app.vault.adapter.process(path, appendTo);
        return { path, created: false };
      }
      try {
        const file = await app.vault.create(path, content);
        return { path: file.path, created: true };
      } catch (error) {
        if (!(await app.vault.adapter.exists(path))) throw error;
        await app.vault.adapter.process(path, appendTo);
        return { path, created: false };
      }
    }

    case "vault.search":
      return await searchNotes(deps, p);

    case "workspace.open": {
      // Without a path the vault is already open (the REST plugin answered with its status).
      if (p.path === undefined) return { opened: false, vault: app.vault.getName() };
      const path = guardPath(p.path, configDir, obsidian);
      const file = await resolveNoteToOpen(deps, path);
      await openInLeaf(app, file, paneTypeOf(p.paneType));
      return { opened: true, path: file.path };
    }

    case "commands.execute":
      return executeCommand(deps, p);

    default: {
      const exhaustive: never = method;
      throw new Error(`unhandled vault method: ${String(exhaustive)}`);
    }
  }
}

export async function serveVaultMethod(method: VaultMethod, params: unknown, deps: VaultDeps): Promise<unknown> {
  const p = asParams(params);
  try {
    return await serve(method, p, deps);
  } catch (error) {
    // Only the refusals the launcher alone can catch are security events: a path the bridge's guard should
    // have refused, or a note body the pipe damaged. They are recorded with the method, the reason, the detail
    // and a digest of the path, never its text. commands.execute audits its own refusals.
    if (
      error instanceof VaultIpcError &&
      method !== "commands.execute" &&
      error.detail !== undefined &&
      AUDITED_DETAILS.has(error.detail)
    ) {
      deps.audit({
        eventType: "LAUNCHER_VAULT_REFUSED",
        method,
        reason: error.reason,
        detail: error.detail,
        ...digestOf("path", p.path),
      });
    }
    throw error;
  }
}
