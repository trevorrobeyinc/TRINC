// Folder mode, ported on 2026-11-19 from the Raycast extension's src/tools/localVideoBatch.ts (added
// there 2026-11-16): a folder of videos already on disk goes through the pipeline as ONE run, one
// video after another. One run, not one per file, because two live runs race over Obsidian's active
// note in the summary lane.
//
// The rules are the extension's, unchanged: the videos directly inside the folder (no subfolders, no
// hidden files), in natural name order; a video whose summary note already exists is skipped; two
// videos that would write the same summary note go to the first one only. The per-video work is
// injected (FolderBatchHooks.processVideo), so this file holds the rules and the loop only.
//
// The run log lines `VIDEO <n>/<total> START|DONE|FAILED|SKIPPED` are what video_pipeline_status
// counts (src/bridge/video-pipeline-status.ts), so their format must not change.
//
// Pure: Node builtins only, tested by test/video-folder-batch.test.ts.

import { readdir, stat } from "node:fs/promises";
import * as path from "node:path";

/** Containers the pipeline transcribes; src/bridge/video-pipeline-source.ts accepts the same list. */
export const LOCAL_VIDEO_EXTENSIONS = [".mp4", ".mkv", ".webm", ".mov", ".m4v"] as const;

export function hasVideoExtension(filePath: string): boolean {
  return (LOCAL_VIDEO_EXTENSIONS as readonly string[]).includes(path.extname(filePath).toLowerCase());
}

/**
 * True for a file name folder mode transcribes. Hidden files never are: macOS writes an AppleDouble
 * twin, `._<name>.mp4`, next to every file it copies onto an exFAT or FAT drive, and that twin carries
 * the video's extension but holds only metadata.
 */
export function isFolderVideoName(name: string): boolean {
  return !name.startsWith(".") && hasVideoExtension(name);
}

/** True when `candidate` is a folder (symlinks followed). A missing path is not a folder. */
export async function isDirectoryPath(candidate: string): Promise<boolean> {
  try {
    return (await stat(candidate)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * The videos directly inside `folder`, as absolute paths, in natural name order ("Lesson 2" before
 * "Lesson 10"), so a numbered course runs in course order. Download leftovers (.part, .crdownload)
 * carry no video extension and drop out on their own.
 */
export async function listFolderVideos(folder: string): Promise<string[]> {
  const videos: string[] = [];
  for (const name of await readdir(folder)) {
    if (!isFolderVideoName(name)) {
      continue;
    }
    const fullPath = path.join(folder, name);
    try {
      if ((await stat(fullPath)).isFile()) {
        videos.push(fullPath);
      }
    } catch {
      // Vanished between readdir and stat, or a dangling symlink: not a video to transcribe.
    }
  }
  return videos.sort((left, right) =>
    path.basename(left).localeCompare(path.basename(right), undefined, { numeric: true })
  );
}

export interface FolderBatchItem {
  /** Absolute path of the video. */
  video: string;
  /** Title of the video's summary note: "<title> summary.md". */
  title: string;
  /** Why the run leaves this video alone; undefined when it gets transcribed. */
  skip?: string;
}

/**
 * Decide, before anything runs, which videos the run transcribes.
 *
 * - A video whose summary note already exists is skipped, so running the same folder again picks up
 *   only what is new or what failed last time, and never overwrites a summary the operator may have
 *   edited. To redo a video, delete its summary note and run the folder again.
 * - Two videos that would write the same summary note (`talk.mp4` and `talk.mkv`) cannot both have
 *   it: the first in order wins. Compared case-insensitively, as the Mac's default disk compares names.
 */
export async function planFolderBatch(
  videos: readonly string[],
  noteTitleOf: (video: string) => string,
  summaryExists: (title: string) => boolean | Promise<boolean>
): Promise<FolderBatchItem[]> {
  const firstVideoForTitle = new Map<string, string>();
  const plan: FolderBatchItem[] = [];
  for (const video of videos) {
    const title = noteTitleOf(video);
    const earlier = firstVideoForTitle.get(title.toLowerCase());
    if (earlier) {
      plan.push({ video, title, skip: `same summary note as ${path.basename(earlier)}` });
      continue;
    }
    firstVideoForTitle.set(title.toLowerCase(), video);
    plan.push({ video, title, skip: (await summaryExists(title)) ? "summary already in the vault" : undefined });
  }
  return plan;
}

export interface VideoOutcome {
  video: string;
  status: "summarized" | "failed" | "skipped";
  /** The summary note's vault path, the failure reason, or the skip reason. */
  detail: string;
}

/**
 * After a video fails, decide whether the run stops instead of moving on to the next video.
 *
 * `outcomes` lists every video the run has handled so far, in order; the failure just recorded is
 * the last entry, and skipped videos come first, as status "skipped". Returning true ends the run at
 * once: the videos after this one are reported as "not reached", and running the folder again later
 * resumes there, because finished videos are skipped.
 *
 * Why it matters more in the built-in pipeline (2026-11-19): there is no paid fallback any more, so
 * when Copilot itself is down every remaining video still pays its full transcription and then a
 * 180 s summary wait before failing the same way. A summary failure's `detail` starts with
 * "Copilot summary lane failed (" and names the cause inside: "Copilot summary did not appear
 * within 180s: …", "No Copilot summarize command could be dispatched …" or "Source note never
 * became the active file …". Any other detail is the transcriber's own error for that one video.
 */
export function shouldStopBatch(outcomes: readonly VideoOutcome[]): boolean {
  // TODO(human): choose the stop policy. Until then the run always carries on to the next video.
  void outcomes;
  return false;
}

export interface FolderBatchHooks {
  /** Transcribe and summarize ONE video; resolves to its summary note's vault path. */
  processVideo: (item: FolderBatchItem, position: number, total: number) => Promise<string>;
  /** Appends one line to the run log. */
  log: (line: string) => Promise<void>;
  /** Runs before each transcribed video; throws to end the whole run (another run took over). */
  beforeVideo?: () => Promise<void>;
  /** Errors from processVideo that end the whole run rather than count as one failed video. */
  endsRun?: (error: unknown) => boolean;
  /** The one-line failure reason for the run log. */
  describeError?: (error: unknown) => string;
  /** After a failure, stop instead of moving on. Defaults to shouldStopBatch. */
  shouldStop?: (outcomes: readonly VideoOutcome[]) => boolean;
}

export interface FolderBatchResult {
  outcomes: VideoOutcome[];
  /** Videos that would have been transcribed, had the run not stopped early. */
  notReached: string[];
  stoppedEarly: boolean;
}

/**
 * Work through a planned folder, one video at a time. Each video is logged as
 * `VIDEO <n>/<total> START|DONE|FAILED|SKIPPED`, numbered by its place in the folder; skips are
 * logged first, so the counts are complete from the start.
 */
export async function runFolderBatch(
  plan: readonly FolderBatchItem[],
  hooks: FolderBatchHooks
): Promise<FolderBatchResult> {
  const total = plan.length;
  const label = (index: number) => `VIDEO ${index + 1}/${total}`;
  const describe =
    hooks.describeError ?? ((error: unknown) => (error instanceof Error ? error.message : String(error)));
  const stop = hooks.shouldStop ?? shouldStopBatch;
  const outcomes: VideoOutcome[] = [];

  for (const [index, item] of plan.entries()) {
    if (item.skip) {
      outcomes.push({ video: item.video, status: "skipped", detail: item.skip });
      await hooks.log(`${label(index)} SKIPPED (${item.skip}): ${item.video}`);
    }
  }

  for (const [index, item] of plan.entries()) {
    if (item.skip) {
      continue;
    }
    await hooks.beforeVideo?.();
    await hooks.log(`${label(index)} START: ${item.video}`);
    try {
      const summaryNotePath = await hooks.processVideo(item, index + 1, total);
      outcomes.push({ video: item.video, status: "summarized", detail: summaryNotePath });
      await hooks.log(`${label(index)} DONE: ${summaryNotePath}`);
    } catch (error) {
      if (hooks.endsRun?.(error)) {
        throw error;
      }
      const reason = describe(error);
      outcomes.push({ video: item.video, status: "failed", detail: reason });
      await hooks.log(`${label(index)} FAILED: ${reason}`);
      if (stop(outcomes)) {
        const notReached = plan
          .slice(index + 1)
          .filter((later) => !later.skip)
          .map((later) => later.video);
        return { outcomes, notReached, stoppedEarly: true };
      }
    }
  }
  return { outcomes, notReached: [], stoppedEarly: false };
}

/** "2 summarized, 1 failed, 3 skipped" (+ ", 4 not reached" when the run stopped early). */
export function countFolderBatch(result: FolderBatchResult): string {
  const count = (status: VideoOutcome["status"]) => result.outcomes.filter((o) => o.status === status).length;
  const parts = [`${count("summarized")} summarized`, `${count("failed")} failed`, `${count("skipped")} skipped`];
  if (result.notReached.length > 0) {
    parts.push(`${result.notReached.length} not reached`);
  }
  return parts.join(", ");
}
