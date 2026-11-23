// The Downie hand-off (2026-11-22, the operator's "Yes, build it"): open an approved link in Downie 4,
// wait for the finished video in Downie's own folder, and give its path to the pipeline. Ported from the
// retired Raycast extension's videoTranscribeFlow.ts (dispatchDownieDirect, dispatchDownieUge,
// waitForNewStableVideo, metadataMentionsUrl) and downieLinkedInNames.ts.
//
// What it does NOT do, on purpose:
//   - It never reads Downie's settings, history, cache or sign-ins, only file names and sizes in Downie's
//     folder and the small details file Downie writes beside a download.
//   - It never moves, renames or deletes a file in Downie's folder: the video stays the operator's.
//   - It is not a way to open anything else: openInDownie checks the link against the approved list
//     again, right before the one fixed program is run with one argument.
//
// Two ways, and what each needs from the operator:
//   automatic  Downie fetches the page by itself. Nothing to do.
//   guided     Downie's window opens on the page; the operator presses play, then +. Downie saves nothing
//              until + is pressed, so the run waits and says so (DOWNIE_GUIDED_STEPS).
//
// Differences from the Raycast lane: a new file is found by comparing the folder with how it looked before
// the hand-off (not by file time, which Spotlight or Finder can touch); the file stays where Downie put it
// (the old lane moved it into its own folder and deleted it later); the guided wait is 30 minutes, not 12,
// because it starts before the operator has signed in; and a signed-out LinkedIn is handled by opening the
// link again (replace_waiting) instead of reading Downie's history database.
//
// Pure: Node builtins and this folder's modules, tested by test/video-downie.test.ts.

import { existsSync } from "node:fs";
import { lstat, mkdir, readdir, readFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { Clock } from "./copilot-summary.ts";
import { approveDownieLink, type ApprovedLink } from "./downie-sites.ts";
import { hasVideoExtension } from "./folder-batch.ts";
import { stripDownieDisambiguationSuffix } from "./naming.ts";
import type { RunLogger } from "./run-log.ts";
import { execFileAsync, type ExecFn } from "./transcribe.ts";

/** The one program this module runs. A constant, never a setting. */
export const OPEN_BINARY = "/usr/bin/open";
export const DOWNIE_APP = "/Applications/Downie 4.app";

export const DOWNIE_POLL_MS = 4_000;
export const DOWNIE_AUTOMATIC_WAIT_MS = 3 * 60_000;
export const DOWNIE_GUIDED_WAIT_MS = 30 * 60_000;
/** A file that is new but still settling at the deadline gets this much longer. */
export const DOWNIE_SETTLING_EXTRA_MS = 60_000;
/** A finished file whose details do not name the link is taken only after this long without a better one. */
export const DOWNIE_UNMATCHED_GRACE_MS = 20_000;
/** Equal sizes in a row, after the first look, that make a file finished. */
const STABLE_CONFIRMATIONS = 2;
const DETAILS_MAX_BYTES = 64 * 1024;

// Run-log lines video_pipeline_status reads (src/bridge/video-pipeline-status.ts).
export const WAITING_FOR_USER = "WAITING FOR USER:";
export const DOWNIE_FILE_DETECTED = "downie file detected:";
export const DOWNIE_UNMATCHED = "downie file not matched to the link:";

/** What the operator does in Downie's window. The controls are Downie 4's own; nothing else is needed. */
export const DOWNIE_GUIDED_STEPS: readonly string[] = [
  "In the Downie window that opened on the page, sign in if it asks.",
  "Press play on the video and let it run a few seconds: many sites load the video only then.",
  "Look at the right-hand column (if it is hidden, click Downloads in that window's toolbar). Find the row whose " +
    "second line says HLS Stream or Direct Downloader (if there are several, the one named master or index) and " +
    "press its +. Nothing is saved until + is pressed.",
  "That is all: the run sees the finished file and goes on by itself.",
  "If signing in left you on another page, ask for the link to be opened again.",
];

/** Where Downie saves (its Destination since 2026-11-03). */
export function defaultDownieFolder(home: string = os.homedir()): string {
  return path.join(home, "Movies", "Downie");
}

export function downieInstalled(exists: (candidate: string) => boolean = existsSync): boolean {
  return exists(DOWNIE_APP);
}

export type DownieMode = "automatic" | "guided";

/** The address that makes Downie open `link`. Only ever called with an approved link. */
export function downieAddress(link: ApprovedLink, mode: DownieMode): string {
  const address = `downie://XUOpenURL?url=${encodeURIComponent(link.url)}`;
  return mode === "guided" ? `${address}&action=open_in_uge` : address;
}

/**
 * Open one approved link in Downie. The link is checked again here, at the last step before a program
 * runs, so no caller can get another address past the list. Plain `open <address>`: the `-a`/`-b` forms
 * hand the address over as a document, which Downie ignores (Raycast-era finding).
 */
export async function openInDownie(rawLink: string, mode: DownieMode, exec: ExecFn = execFileAsync): Promise<void> {
  const approval = approveDownieLink(rawLink);
  if (!approval.ok) {
    throw new Error(`Refused to open a link that is not on the approved list: ${approval.reason}.`);
  }
  try {
    await exec(OPEN_BINARY, [downieAddress(approval.link, mode)], {
      env: { ...process.env, PATH: "/usr/bin:/bin:/usr/sbin:/sbin" },
      maxBuffer: 64 * 1024,
      timeout: 15_000,
    });
  } catch (error) {
    throw new Error(`Downie could not be opened: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ─── Watching Downie's folder ────────────────────────────────────────────────────────────────────

/** A file's identity and size. Not its time: a tag, a Finder edit or a touch changes that on an old film. */
interface FileFacts {
  ino: number;
  size: number;
}

/** Every video in the folder, by name. A symbolic link, a folder, a hidden file or an empty one is not one. */
export async function listDownieVideos(folder: string): Promise<Map<string, FileFacts>> {
  const found = new Map<string, FileFacts>();
  for (const name of await readdir(folder).catch(() => [] as string[])) {
    if (name.startsWith(".") || !hasVideoExtension(name)) continue;
    const stat = await lstat(path.join(folder, name)).catch(() => null);
    if (stat?.isFile()) found.set(name, { ino: stat.ino, size: stat.size });
  }
  return found;
}

/**
 * True when a download's details file names the page of the link. Field-agnostic, because Downie's file
 * is not documented: every string in it is searched for the page (for Kaltura, the entry id), so a query
 * string, another host spelling or JSON's escaped slashes cannot break the match.
 */
export function detailsNameLink(detailsText: string, pageTokens: readonly string[]): boolean {
  const tokens = pageTokens.filter((token) => token.length >= 2);
  const strings: string[] = [];
  const collect = (value: unknown): void => {
    if (typeof value === "string") strings.push(value);
    else if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === "object") Object.values(value).forEach(collect);
  };
  try {
    collect(JSON.parse(detailsText));
  } catch {
    strings.push(detailsText.replace(/\\\//g, "/"));
  }
  // The token must end where the page's name ends: "/watch/criminal-law" is not "/watch/criminal-law-2".
  return strings.some((value) =>
    tokens.some((token) => {
      for (let at = value.indexOf(token); at >= 0; at = value.indexOf(token, at + 1)) {
        const next = value[at + token.length];
        if (next === undefined || !/[A-Za-z0-9._~-]/.test(next)) return true;
      }
      return false;
    })
  );
}

/** Text of the details file beside `videoPath` (`<base>.json`), or "". */
async function readDetails(videoPath: string): Promise<string> {
  const base = path.basename(videoPath, path.extname(videoPath));
  const file = path.join(path.dirname(videoPath), `${base}.json`);
  try {
    const stat = await lstat(file);
    return stat.isFile() && stat.size <= DETAILS_MAX_BYTES ? await readFile(file, "utf-8") : "";
  } catch {
    return "";
  }
}

/** Nothing finished in time. `folder` is where the operator can still point the pipeline at the file. */
export class DownieTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DownieTimeoutError";
  }
}

export interface DownieDownload {
  file: string;
  /** False when the file's details did not name the link (it was simply the one new finished video). */
  matched: boolean;
}

export interface DownieWaitParams {
  folder: string;
  /** The folder as it looked before the hand-off. */
  before: ReadonlyMap<string, FileFacts>;
  pageTokens: readonly string[];
  timeoutMs: number;
  clock: Clock;
  /** Throws when the run was stopped or replaced. Called before every look. */
  checkpoint: () => Promise<void>;
  signal?: AbortSignal;
}

/** Sleep that ends early when the run is stopped, so a replaced or unloaded run lets go at once. */
async function sleepUnlessStopped(clock: Clock, ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal) {
    await clock.sleep(ms);
    return;
  }
  if (signal.aborted) return;
  let onAbort: () => void = () => undefined;
  const stopped = new Promise<void>((resolve) => {
    onAbort = resolve;
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    await Promise.race([clock.sleep(ms), stopped]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

/**
 * Wait for a video that was not in the folder before and whose size has stopped changing. The one whose
 * details name the link is taken at once. Any other finished one is taken only after a grace period with
 * no match, because the operator may be saving something else from Downie at the same time.
 */
export async function waitForDownieVideo(params: DownieWaitParams): Promise<DownieDownload> {
  const { folder, before, clock } = params;
  const deadline = clock.now() + params.timeoutMs;
  const sizes = new Map<string, { size: number; equalLooks: number }>();
  const finishedAt = new Map<string, number>();

  for (;;) {
    await sleepUnlessStopped(clock, DOWNIE_POLL_MS, params.signal);
    await params.checkpoint();

    const now = clock.now();
    const present = await listDownieVideos(folder);
    const fresh: string[] = [];
    for (const [name, facts] of present) {
      const old = before.get(name);
      if (old && old.ino === facts.ino && old.size === facts.size) continue;
      fresh.push(name);
      const last = sizes.get(name);
      const equalLooks = last && last.size === facts.size && facts.size > 0 ? last.equalLooks + 1 : 0;
      sizes.set(name, { size: facts.size, equalLooks });
      if (equalLooks >= STABLE_CONFIRMATIONS) {
        if (!finishedAt.has(name)) finishedAt.set(name, now);
      } else {
        finishedAt.delete(name);
      }
    }
    for (const name of [...finishedAt.keys()]) {
      if (!present.has(name)) finishedAt.delete(name);
    }

    const finished = [...finishedAt.entries()].sort((left, right) => left[1] - right[1] || left[0].localeCompare(right[0]));
    for (const [name] of finished) {
      const file = path.join(folder, name);
      if (detailsNameLink(await readDetails(file), params.pageTokens)) return { file, matched: true };
    }
    const unmatched = finished.find(([, since]) => now - since >= DOWNIE_UNMATCHED_GRACE_MS);
    if (unmatched) return { file: path.join(folder, unmatched[0]), matched: false };

    if (now >= deadline + (fresh.length > 0 ? DOWNIE_SETTLING_EXTRA_MS : 0)) {
      throw new DownieTimeoutError(`Downie saved no video in ${folder} within ${Math.round(params.timeoutMs / 60_000)} min`);
    }
  }
}

// ─── The whole hand-off ──────────────────────────────────────────────────────────────────────────

export interface DownieHandOffParams {
  link: ApprovedLink;
  folder: string;
  log: RunLogger;
  clock: Clock;
  checkpoint: () => Promise<void>;
  signal?: AbortSignal;
  /** Tells the operator on screen (an Obsidian notice). Never required. */
  notify?: (message: string) => void;
  // Test seams.
  exec?: ExecFn;
  appExists?: (candidate: string) => boolean;
}

/** Open the link in Downie and wait for its video. Throws when none arrives, saying what to do next. */
export async function downloadThroughDownie(params: DownieHandOffParams): Promise<DownieDownload> {
  const { link, folder, log } = params;
  if (!downieInstalled(params.appExists)) {
    throw new Error(`Downie 4 is not installed (${DOWNIE_APP}), so ${link.siteName} links cannot be downloaded.`);
  }
  await mkdir(folder, { recursive: true });
  const before = await listDownieVideos(folder);
  const wait = (timeoutMs: number) =>
    waitForDownieVideo({
      folder,
      before,
      pageTokens: link.pageTokens,
      timeoutMs,
      clock: params.clock,
      checkpoint: params.checkpoint,
      signal: params.signal,
    });
  const landed = async (download: DownieDownload): Promise<DownieDownload> => {
    await log(`${DOWNIE_FILE_DETECTED} ${download.file}`);
    if (!download.matched) {
      await log(
        `${DOWNIE_UNMATCHED} it was the one new finished video in Downie's folder; check that it is the right one`
      );
    }
    params.notify?.(`Downie saved the video from ${link.host}. Transcribing it now.`);
    return download;
  };

  if (link.firstTry === "automatic") {
    await params.checkpoint();
    await openInDownie(link.url, "automatic", params.exec);
    await log(`downie hand-off (automatic): ${link.host}`);
    params.notify?.(`Command Center handed a ${link.siteName} link to Downie (${link.host}).`);
    try {
      return await landed(await wait(DOWNIE_AUTOMATIC_WAIT_MS));
    } catch (error) {
      if (!(error instanceof DownieTimeoutError)) throw error;
      await log(`downie automatic try: ${error.message}; opening the guided window`);
    }
  }

  await params.checkpoint();
  await openInDownie(link.url, "guided", params.exec);
  await log(`downie hand-off (guided): ${link.host}`);
  await log(`${WAITING_FOR_USER} Downie's window is open on ${link.host}; press play on the video, then + in the right-hand column`);
  params.notify?.(`Downie opened ${link.host}. Press play on the video, then + in the right-hand column.`);
  try {
    return await landed(await wait(DOWNIE_GUIDED_WAIT_MS));
  } catch (error) {
    if (!(error instanceof DownieTimeoutError)) throw error;
    throw new DownieTimeoutError(
      `${error.message}. Nothing is saved until + is pressed in Downie's right-hand column. Once Downie has the ` +
        "video, run the pipeline on that file; to try again, run the link again"
    );
  }
}

// ─── Naming ──────────────────────────────────────────────────────────────────────────────────────

const KNOWN_ACRONYMS = new Set([
  "ai", "api", "aws", "b2b", "b2c", "cipp", "crm", "css", "gdpr", "gpt", "hipaa", "html", "iot",
  "kpi", "kpis", "llm", "llms", "ml", "pmp", "roi", "seo", "sql", "ui", "ux",
]); // prettier-ignore

/**
 * "weighing-the-connections" → "Weighing the connections". LinkedIn writes lesson titles in sentence case,
 * so only acronyms need restoring. LinkedIn's long numeric id goes; a short trailing number stays, since it
 * is as likely to be part of the title ("part-2").
 */
export function lessonTitleFromSlug(slug: string): string {
  const words = slug
    .replace(/-\d{5,}$/, "")
    .split("-")
    .filter(Boolean)
    .map((word) => (KNOWN_ACRONYMS.has(word.toLowerCase()) ? word.toUpperCase() : word.toLowerCase()));
  if (words.length === 0) return "";
  const first = words[0];
  words[0] = first === first.toUpperCase() ? first : first.charAt(0).toUpperCase() + first.slice(1);
  return words.join(" ");
}

/** Long and without a space: a stream token, which is what Downie's LinkedIn rule names its files. */
function looksLikeStreamToken(baseName: string): boolean {
  return baseName.length >= 40 && !/\s/.test(baseName);
}

/**
 * The path the notes are named from. The file itself keeps its own name. A LinkedIn file named after its
 * stream token takes the lesson's title; a guided LinkedIn file loses the " | LinkedIn Learning" its page
 * title ends with; and a "|" becomes "-" anywhere, because it breaks [[links]] to the note.
 */
export function pathForNaming(videoFile: string, link: ApprovedLink): string {
  const ext = path.extname(videoFile);
  let base = stripDownieDisambiguationSuffix(path.basename(videoFile, ext));
  if (link.site === "linkedin") {
    base = base.replace(/\s*\|\s*LinkedIn Learning\s*$/i, "");
    if (looksLikeStreamToken(base)) {
      base = lessonTitleFromSlug(link.pageTokens[0]?.split("/").pop() ?? "") || base;
    }
  }
  base = base.replace(/\s*\|\s*/g, " - ").trim();
  return path.join(path.dirname(videoFile), `${base || path.basename(videoFile, ext)}${ext}`);
}
