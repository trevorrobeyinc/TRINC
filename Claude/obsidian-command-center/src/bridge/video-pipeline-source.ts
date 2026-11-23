// Pure validation of video_pipeline_run's input. Split out of mcp-bridge-server.ts on 2026-11-16,
// when a FOLDER of videos became valid input, so test/video-pipeline-source.test.ts can exercise
// it under node --test. Kept free of `obsidian` imports for that reason.
//
// Since phase 4 of retiring Raycast (2026-11-20) the Copilot agent downloads a link first with the
// copilot-video-download skill and passes the file it prints, or the course folder. Since 2026-11-22 one
// kind of link is taken here: a video page on the approved list (src/video/downie-sites.ts), which the
// pipeline hands to Downie. Every other link is still refused with the pointer to the skill.
//
// Security posture: the source is the only caller-controlled value of video_pipeline_run besides two
// booleans. A path leaves here canonical, naming an existing video file or folder, and the pipeline hands
// it to a fixed transcriber as one argv element (execFile, no shell). A link leaves here rebuilt from
// checked parts, and is checked again right before Downie is opened. Nothing here runs anything.

import { readdirSync, realpathSync, statSync } from "node:fs";
import * as path from "node:path";
import { approveDownieLink, APPROVED_SITE_LIST, type ApprovedLink } from "../video/downie-sites.ts";

export const VIDEO_FILE_EXTENSIONS = [".mp4", ".mkv", ".webm", ".mov", ".m4v"];

/** The skill script that downloads every other link; one given to video_pipeline_run is refused with it. */
export const VIDEO_DOWNLOAD_SCRIPT =
  "/Users/myhome/My Digital Garden/copilot/skills/copilot-video-download/video-download.sh";

export const LINK_REFUSAL =
  `video_pipeline_run takes a local video file or folder, or a link to one of these: ${APPROVED_SITE_LIST}. ` +
  `Download any other link first with the copilot-video-download skill (${VIDEO_DOWNLOAD_SCRIPT}), then pass ` +
  "the file it prints or the course folder.";

/** Added to the reason when a listed site's link is not one of its video pages. */
export const LINK_SHAPE_HINT =
  "Pass the link of the video's own page. If there is none, the user can save the video in Downie themselves " +
  "and you pass the file from /Users/myhome/Movies/Downie.";

export type VideoPipelineSource =
  | { kind: "link"; source: string; link: ApprovedLink }
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
      "videoUrl is required — an absolute local video file path, an absolute path to a folder of videos, or a " +
        `link to one of these: ${APPROVED_SITE_LIST}.`
    );
  }
  // Explicit NUL reject (previously only incidentally rejected by existsSync, with a mangled message).
  if (value.includes("\0")) {
    throw new Error("videoUrl contains a null byte.");
  }
  if (/^https?:\/\//i.test(value)) {
    const approval = approveDownieLink(value);
    if (approval.ok) return { kind: "link", source: approval.link.url, link: approval.link };
    throw new Error(
      approval.kind === "refused"
        ? `${approval.reason[0].toUpperCase()}${approval.reason.slice(1)}. ${LINK_SHAPE_HINT}`
        : LINK_REFUSAL
    );
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
