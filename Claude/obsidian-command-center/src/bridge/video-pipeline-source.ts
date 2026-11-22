// Pure validation of video_pipeline_run's input. Split out of mcp-bridge-server.ts on 2026-11-16,
// when a FOLDER of videos became valid input, so test/video-pipeline-source.test.ts can exercise
// it under node --test. Kept free of `obsidian` imports for that reason.
//
// Since phase 4 of retiring Raycast and Downie (2026-11-20) a link is refused: the Copilot agent
// downloads it first with the copilot-video-download skill and passes the file it prints, or the
// course folder. Only local files and folders reach Command Center's built-in pipeline (src/video/).
//
// Security posture: the source is the only caller-controlled value of video_pipeline_run. It leaves
// here as a canonical absolute path to an existing video file or folder, which the pipeline hands to
// a fixed transcriber as one argv element (execFile, no shell). Nothing here runs it.

import { readdirSync, realpathSync, statSync } from "node:fs";
import * as path from "node:path";

export const VIDEO_FILE_EXTENSIONS = [".mp4", ".mkv", ".webm", ".mov", ".m4v"];

/** The skill script that downloads a link; a link given to video_pipeline_run is refused with it. */
export const VIDEO_DOWNLOAD_SCRIPT =
  "/Users/myhome/My Digital Garden/copilot/skills/copilot-video-download/video-download.sh";

export const LINK_REFUSAL =
  "video_pipeline_run takes a local video file or folder, not a link: download it first with the " +
  `copilot-video-download skill (${VIDEO_DOWNLOAD_SCRIPT}), then pass the file it prints or the course folder.`;

export type VideoPipelineSource =
  | { kind: "file"; source: string }
  | { kind: "folder"; source: string; videoCount: number };

function hasVideoExtension(name: string): boolean {
  return VIDEO_FILE_EXTENSIONS.includes(path.extname(name).toLowerCase());
}

/**
 * How many videos folder mode will find in `folder`: files directly inside it (symlinks followed)
 * with a video extension, hidden files excluded, which also drops the `._<name>.mp4` AppleDouble
 * twins macOS writes on exFAT and FAT drives. Mirrors listFolderVideos in src/video/folder-batch.ts,
 * so a folder accepted here is one the pipeline can work through.
 */
export function countFolderVideos(folder: string): number {
  let count = 0;
  for (const name of readdirSync(folder)) {
    if (name.startsWith(".") || !hasVideoExtension(name)) continue;
    try {
      if (statSync(path.join(folder, name)).isFile()) count += 1;
    } catch {
      // A dangling symlink, or a file that vanished between readdir and stat.
    }
  }
  return count;
}

export function resolveVideoPipelineSource(raw: unknown): VideoPipelineSource {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) {
    throw new Error(
      "videoUrl is required — an absolute local video file path, or an absolute path to a folder of videos."
    );
  }
  // Explicit NUL reject (previously only incidentally rejected by existsSync, with a mangled message).
  if (value.includes("\0")) {
    throw new Error("videoUrl contains a null byte.");
  }
  if (/^https?:\/\//i.test(value)) {
    throw new Error(LINK_REFUSAL);
  }
  const localPath = value.startsWith("file://")
    ? decodeURIComponent(value.slice("file://".length))
    : value;
  if (!path.isAbsolute(localPath)) {
    throw new Error("Local video paths must be absolute.");
  }

  let isDirectory = false;
  let found = false;
  try {
    isDirectory = statSync(localPath).isDirectory();
    found = true;
  } catch {
    // Missing: reported below, after the extension check, as before folders were accepted.
  }

  // Canonicalize: resolve symlinks and any ../ segments so the extension receives one true path.
  if (isDirectory) {
    const canonical = realpathSync(localPath);
    const videoCount = countFolderVideos(canonical);
    if (videoCount === 0) {
      throw new Error(
        `No videos (${VIDEO_FILE_EXTENSIONS.join(", ")}) directly inside ${canonical}; subfolders are not searched.`
      );
    }
    return { kind: "folder", source: canonical, videoCount };
  }
  if (!hasVideoExtension(localPath)) {
    throw new Error(`Local file must be a video (${VIDEO_FILE_EXTENSIONS.join(", ")}) or a folder of videos.`);
  }
  if (!found) {
    throw new Error(`Local video file does not exist: ${localPath}`);
  }
  // Re-assert the extension on the canonical leaf: a video-named symlink could otherwise smuggle
  // a non-video target.
  const canonical = realpathSync(localPath);
  if (!hasVideoExtension(canonical)) {
    throw new Error(`Local file must be a video (${VIDEO_FILE_EXTENSIONS.join(", ")}).`);
  }
  return { kind: "file", source: canonical };
}
