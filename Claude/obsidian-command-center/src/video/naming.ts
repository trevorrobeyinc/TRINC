// How a video's notes are named, ported on 2026-11-19 from the Raycast extension's
// videoTranscribeFlow.ts (stripRunTimestamp, stripDownieDisambiguationSuffix, deriveNoteBaseName,
// noteTitlesFor, summaryNotePathFor, normalizeVaultRelativeFolder).
//
// Folder mode decides "already summarized" from these names (a video is skipped when
// `<summary folder>/<title> summary.md` exists), so the names must stay byte-for-byte what the Raycast
// runner produced for every title it could write. The one addition, obsidianSafeName, only changes
// titles the Raycast runner could not put in Obsidian's index either.
//
// Pure: Node builtins only, tested by test/video-naming.test.ts.

import * as path from "node:path";

export function toPosixPath(value: string): string {
  return value.replace(/\\/g, "/");
}

/**
 * Strip the trailing -<ISO run timestamp> the Raycast runner's yt-dlp output template appended. The
 * timestamp kept per-run file names unique; the surviving summary note is titled without it.
 */
export function stripRunTimestamp(baseName: string): string {
  return baseName.replace(/-\d{4}-\d{2}-\d{2}T[0-9-]+Z$/, "");
}

/**
 * Strip Downie's re-download disambiguation suffix (" -  - 2026-08-19 03-58-00_0"), which Downie
 * appended when its destination already held a file of that name. Only note naming uses the stripped
 * form; the video on disk keeps its own name.
 */
export function stripDownieDisambiguationSuffix(baseName: string): string {
  return baseName.replace(/\s+-\s+-\s+\d{4}-\d{2}-\d{2}[ T]\d{2}-\d{2}-\d{2}(?:_\d+)?$/, "");
}

/**
 * Make a base name one Obsidian will create a note under. Obsidian refuses `:` (and `\`) in a file
 * name on macOS, where the Raycast runner fell back to a plain file write that Obsidian's index then
 * never held, so its summary lane failed on such a title. A colon followed by a space becomes " - "
 * ("Lecture 3: Networks" → "Lecture 3 - Networks"), any other one a "-"; leading dots go, because
 * Obsidian does not index a hidden note. Every other title passes through unchanged.
 */
export function obsidianSafeName(baseName: string): string {
  const safe = baseName
    .replace(/\s*:\s+/g, " - ")
    .replace(/[:\\]/g, "-")
    .replace(/^\.+/, "")
    .trim();
  return safe || "Untitled video";
}

/**
 * yt-dlp returns a generic title for some hosts (Wiley course pages: "Videoplayer"). When the title
 * looks generic, derive a readable base name from the source URL's last path segment instead,
 * keeping any trailing run timestamp. With no URL (a local file or folder) the name is unchanged.
 */
export function deriveNoteBaseName(rawBaseName: string, url: string): string {
  const tsSuffix = rawBaseName.match(/-\d{4}-\d{2}-\d{2}T[0-9-]+Z$/)?.[0] ?? "";
  const rawTitle = tsSuffix ? rawBaseName.slice(0, rawBaseName.length - tsSuffix.length) : rawBaseName;
  const looksGeneric =
    !rawTitle.replace(/\s*\(\d+\)\s*$/, "").trim() ||
    !/[a-z]/i.test(rawTitle) ||
    /^(videoplayer|video|media|player|untitled|clip|movie|stream|index|default)(\s*\(\d+\))?$/i.test(rawTitle.trim());
  if (!looksGeneric) {
    return rawBaseName;
  }
  let derived = "";
  try {
    derived = decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).pop() ?? "")
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[_+]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    derived = "";
  }
  return derived ? `${derived}${tsSuffix}` : rawBaseName;
}

/**
 * The two names a video's notes are built from: `baseName` names the per-run transcript and
 * transcription note, and `noteTitle` is the clean title the surviving summary note carries. Folder
 * mode applies the same rule to recognise a video it has already summarized.
 *
 * @param sourceUrl The video's page URL, or "" for a local file (its name is then the only title).
 */
export function noteTitlesFor(videoFile: string, sourceUrl: string): { baseName: string; noteTitle: string } {
  const rawBaseName = obsidianSafeName(
    stripDownieDisambiguationSuffix(path.basename(videoFile, path.extname(videoFile)))
  );
  const baseName = deriveNoteBaseName(rawBaseName, sourceUrl);
  return { baseName, noteTitle: stripRunTimestamp(baseName).trim() || baseName };
}

/**
 * A vault-relative folder from a setting, or `fallback` when the setting is empty. Refuses a folder
 * that would leave the vault, and a hidden one (`.obsidian/…`, `.trash`): Obsidian does not index a
 * note inside a dot-folder, so the summary lane could never find it.
 */
export function normalizeVaultRelativeFolder(folderSetting: string | undefined, fallback: string): string {
  const folderInput = folderSetting?.trim() || fallback;
  const normalized = toPosixPath(path.posix.normalize(toPosixPath(folderInput).replace(/^\/+/, "")))
    .replace(/^\.\/+/, "")
    .replace(/\/+$/, "");

  if (!normalized || normalized === ".") {
    return fallback;
  }
  if (normalized === ".." || normalized.startsWith("../") || path.posix.isAbsolute(normalized)) {
    throw new Error("Configured folder must stay inside the vault.");
  }
  if (normalized.split("/").some((segment) => segment.startsWith("."))) {
    throw new Error(`Configured folder must not be a hidden folder: ${normalized}`);
  }
  return normalized;
}

/** Vault path of the summary note for `noteTitle`: "<summary folder>/<title> summary.md". */
export function summaryNotePathFor(summaryFolder: string, noteTitle: string): string {
  return toPosixPath(path.posix.join(summaryFolder, `${noteTitle} summary.md`));
}

/** Vault paths of a video's transcript text file and its transcription note. */
export function transcriptPathsFor(
  videoFolder: string,
  baseName: string
): { transcriptRelativePath: string; sourceNotePath: string } {
  return {
    transcriptRelativePath: toPosixPath(path.posix.join(videoFolder, ".transcripts", `${baseName}.txt`)),
    sourceNotePath: toPosixPath(path.posix.join(videoFolder, `${baseName} transcription.md`)),
  };
}
