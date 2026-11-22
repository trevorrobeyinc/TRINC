// A downloaded video's page URL, read from the `<video base>.url` file the copilot-video-download
// script writes next to it (yt-dlp --write-url-link, phase 4, 2026-11-20). It closes the gap the
// phase-3 port left: Command Center is given only a path, so without this a downloaded video's
// summary had no `source:`. The Raycast runner knew the URL because it did the download itself.
//
// The file is an InternetShortcut: `[InternetShortcut]` then `URL=<webpage_url>`, CRLF line endings.
// Grab mode writes none, and a video the operator already had has none either.
//
// The URL ends up in a note's text and in YAML frontmatter, and the file sits in a folder an agent
// can write, so the read is strict and never fails a run: a regular file only, opened once with
// O_NOFOLLOW | O_NONBLOCK and checked with fstat on that descriptor (so a symlink or FIFO swapped in
// after a first lstat is refused, without blocking), at most 4 KB, one `URL=` line holding an https
// URL that parses, with no whitespace, control or format characters, no user:password@, at most 2048
// characters. What is kept is the parser's normalized `href` (percent-encoded), never the raw text.
// Anything else is no URL, with the reason for the run log.
//
// Pure: Node builtins only, tested by test/video-source-url.test.ts.

import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, type Stats } from "node:fs";
import * as path from "node:path";

export const SOURCE_URL_MAX_FILE_BYTES = 4096;
export const SOURCE_URL_MAX_LENGTH = 2048;

/** The video's page URL ("" when there is none), and the one run-log line that says why. */
export interface SourceUrlRead {
  url: string;
  logLine: string;
}

/** `<video base>.url`, next to the video. */
export function sourceUrlFileFor(videoFile: string): string {
  return path.join(path.dirname(videoFile), `${path.basename(videoFile, path.extname(videoFile))}.url`);
}

/** The https URL in one `URL=` value, normalized, or the reason it was refused. */
export function parseSourceUrl(raw: string): { url: string } | { problem: string } {
  if (!raw) return { problem: "its URL= line is empty" };
  if (raw.length > SOURCE_URL_MAX_LENGTH) return { problem: `its URL is longer than ${SOURCE_URL_MAX_LENGTH} characters` };
  if (/[\s\p{Cc}\p{Cf}]/u.test(raw)) return { problem: "its URL holds whitespace, control or format characters" };
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { problem: "its URL does not parse" };
  }
  if (parsed.protocol !== "https:") return { problem: `its URL is not https (${parsed.protocol})` };
  if (parsed.username || parsed.password) return { problem: "its URL carries a user name or password" };
  if (parsed.href.length > SOURCE_URL_MAX_LENGTH) return { problem: `its URL is longer than ${SOURCE_URL_MAX_LENGTH} characters` };
  return { url: parsed.href };
}

/**
 * Read the source URL for `videoFile`. Synchronous on purpose: folder mode's planner names each
 * summary note from it (the generic-title rule) before anything runs, through a synchronous callback,
 * and the file is at most 4 KB. Never throws.
 *
 * The lstat checks give the clear messages; the OPEN is what decides, because the folder is
 * agent-writable and the file can be swapped between the two. O_NOFOLLOW refuses a symlink that
 * appeared after the lstat (ELOOP), O_NONBLOCK keeps a FIFO swapped in from blocking Obsidian's main
 * thread on open, fstat on that same descriptor requires a regular file within the cap, and the read
 * takes at most one byte more than the cap, so nothing can make it read without end.
 *
 * @param seams Tests only: `beforeOpen` runs between the lstat checks and the open, where a swap lands.
 */
export function readSourceUrl(videoFile: string, seams: { beforeOpen?: () => void } = {}): SourceUrlRead {
  const file = sourceUrlFileFor(videoFile);
  const name = path.basename(file);
  const none = (why: string): SourceUrlRead => ({ url: "", logLine: `no source URL: ${why}` });
  const tooLarge = () => none(`${name} is larger than ${SOURCE_URL_MAX_FILE_BYTES} bytes`);
  let stat: Stats;
  try {
    stat = lstatSync(file);
  } catch {
    return none(`no ${name} next to the video`);
  }
  if (stat.isSymbolicLink()) return none(`${name} is a symbolic link, which is ignored`);
  if (!stat.isFile()) return none(`${name} is not a regular file`);
  if (stat.size > SOURCE_URL_MAX_FILE_BYTES) return tooLarge();
  seams.beforeOpen?.();

  let fd: number;
  try {
    fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ELOOP") return none(`${name} is a symbolic link, which is ignored`);
    if (code === "ENOENT") return none(`no ${name} next to the video`);
    return none(`${name} could not be opened (${code ?? String(error)})`);
  }
  let text: string;
  try {
    const opened = fstatSync(fd);
    if (!opened.isFile()) return none(`${name} is not a regular file`);
    if (opened.size > SOURCE_URL_MAX_FILE_BYTES) return tooLarge();
    const buffer = Buffer.alloc(SOURCE_URL_MAX_FILE_BYTES + 1);
    let total = 0;
    while (total < buffer.length) {
      const read = readSync(fd, buffer, total, buffer.length - total, null);
      if (read === 0) break;
      total += read;
    }
    if (total > SOURCE_URL_MAX_FILE_BYTES) return tooLarge();
    text = buffer.subarray(0, total).toString("utf-8");
  } catch (error) {
    return none(`${name} could not be read (${error instanceof Error ? error.message : String(error)})`);
  } finally {
    try {
      closeSync(fd);
    } catch {
      // Already closed or invalid: nothing to release.
    }
  }
  const lines = text.split(/\r?\n/).filter((line) => line.startsWith("URL="));
  if (lines.length === 0) return none(`${name} has no URL= line`);
  if (lines.length > 1) return none(`${name} has ${lines.length} URL= lines`);
  const parsed = parseSourceUrl(lines[0].slice("URL=".length));
  if ("problem" in parsed) return none(`${name}: ${parsed.problem}`);
  return { url: parsed.url, logLine: `source URL from ${name}: ${parsed.url}` };
}
