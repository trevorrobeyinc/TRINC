// Pure validation of video_pipeline_run's input. Split out of mcp-bridge-server.ts on 2026-11-16,
// when a FOLDER of videos became valid input, so test/video-pipeline-source.test.ts can exercise
// it under node --test. Kept free of `obsidian` imports for that reason.
//
// Security posture (unchanged): the source is the only caller-controlled value of
// video_pipeline_run, and it travels INSIDE the URL-encoded Raycast deeplink payload. Nothing here
// runs it, and the runner only reads a folder: it never moves or deletes the files in it.

import { readdirSync, realpathSync, statSync } from "node:fs";
import * as path from "node:path";

export const VIDEO_FILE_EXTENSIONS = [".mp4", ".mkv", ".webm", ".mov", ".m4v"];

export type VideoPipelineSource =
  | { kind: "url"; source: string }
  | { kind: "file"; source: string }
  | { kind: "folder"; source: string; videoCount: number };

function hasVideoExtension(name: string): boolean {
  return VIDEO_FILE_EXTENSIONS.includes(path.extname(name).toLowerCase());
}

/**
 * How many videos the Raycast runner's folder mode will find in `folder`: files directly inside
 * it (symlinks followed) with a video extension, hidden files excluded, which also drops the
 * `._<name>.mp4` AppleDouble twins macOS writes on exFAT and FAT drives. Mirrors
 * listFolderVideos in the extension's src/tools/localVideoBatch.ts, so a folder accepted here is
 * one the runner can work through.
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
      "videoUrl is required — an http(s) video URL, an absolute local video file path, or an " +
        "absolute path to a folder of videos."
    );
  }
  // Explicit NUL reject (previously only incidentally rejected by existsSync, with a mangled message).
  if (value.includes("\0")) {
    throw new Error("videoUrl contains a null byte.");
  }
  if (/^https?:\/\//i.test(value)) {
    const parsed = new URL(value); // throws on malformed input
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error(`Unsupported URL scheme: ${parsed.protocol}`);
    }
    return { kind: "url", source: value };
  }
  const localPath = value.startsWith("file://")
    ? decodeURIComponent(value.slice("file://".length))
    : value;
  if (!path.isAbsolute(localPath)) {
    throw new Error("Local video paths must be absolute (or pass an http(s) URL).");
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
