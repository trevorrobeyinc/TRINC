import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { moveDownieSubtitleSidecars } from "@/tools/videoTranscribeFlow";

// Real names observed 2026-07-31 in ~/Downloads after LinkedIn Learning UGE downloads — including
// the re-download variant where Downie inserts a disambiguating suffix before the extension.
const videoName = "The internet of things | LinkedIn Learning.mp4";
const videoBase = "The internet of things | LinkedIn Learning";
const suffixedSrtName = "The internet of things | LinkedIn Learning -  - 2026-07-31 16-54-58.srt";

describe("moveDownieSubtitleSidecars", () => {
  let downloadsDir = "";
  let downieDir = "";
  let dispatchedAtMs = 0;

  beforeEach(async () => {
    const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), "downie-sidecars-"));
    downloadsDir = path.join(sandbox, "Downloads");
    downieDir = path.join(sandbox, "Save Video & Download Downie");
    await fs.mkdir(downloadsDir, { recursive: true });
    await fs.mkdir(downieDir, { recursive: true });
    dispatchedAtMs = Date.now();
  });

  afterEach(async () => {
    await fs.rm(path.dirname(downloadsDir), { recursive: true, force: true });
  });

  async function writeDownload(name: string, mtimeMs?: number): Promise<string> {
    const filePath = path.join(downloadsDir, name);
    await fs.writeFile(filePath, `content of ${name}`, "utf-8");
    if (mtimeMs !== undefined) {
      await fs.utimes(filePath, new Date(mtimeMs), new Date(mtimeMs));
    }
    return filePath;
  }

  it("moves the matching .srt beside a UGE video into the destination folder", async () => {
    const videoPath = await writeDownload(videoName);
    await writeDownload(`${videoBase}.srt`);

    const claimed = await moveDownieSubtitleSidecars(videoPath, downieDir, dispatchedAtMs);

    const expectedDest = path.join(downieDir, `${videoBase}.srt`);
    expect(claimed).toEqual([expectedDest]);
    await expect(fs.readFile(expectedDest, "utf-8")).resolves.toContain(".srt");
    // Source is gone — ~/Downloads no longer keeps an orphan.
    await expect(fs.access(path.join(downloadsDir, `${videoBase}.srt`))).rejects.toThrow();
  });

  it("canonicalizes Downie's re-download suffix so findSubtitleSidecars' exact lookup can hit", async () => {
    const videoPath = await writeDownload(videoName);
    await writeDownload(suffixedSrtName);

    const claimed = await moveDownieSubtitleSidecars(videoPath, downieDir, dispatchedAtMs);

    // The suffixed name would be invisible to findSubtitleSidecars (its fallback requires
    // "<base>." right after the base), so the mover must land it as the canonical "<base>.srt".
    expect(claimed).toEqual([path.join(downieDir, `${videoBase}.srt`)]);
    await expect(fs.access(path.join(downieDir, `${videoBase}.srt`))).resolves.toBeUndefined();
    await expect(fs.access(path.join(downloadsDir, suffixedSrtName))).rejects.toThrow();
  });

  it("never claims a stale sidecar from an earlier run (mtime-before-dispatch guard)", async () => {
    const videoPath = await writeDownload(videoName);
    const stale = await writeDownload(`${videoBase}.srt`, dispatchedAtMs - 10_000);

    const claimed = await moveDownieSubtitleSidecars(videoPath, downieDir, dispatchedAtMs);

    expect(claimed).toEqual([]);
    await expect(fs.access(stale)).resolves.toBeUndefined();
  });

  it("claims .vtt alongside .srt and leaves unrelated siblings alone", async () => {
    const videoPath = await writeDownload(videoName);
    await writeDownload(`${videoBase}.srt`);
    await writeDownload(`${videoBase}.vtt`);
    const unrelated = await writeDownload("Some Other Course.srt");

    const claimed = await moveDownieSubtitleSidecars(videoPath, downieDir, dispatchedAtMs);

    expect(claimed.sort()).toEqual(
      [path.join(downieDir, `${videoBase}.srt`), path.join(downieDir, `${videoBase}.vtt`)].sort()
    );
    await expect(fs.access(unrelated)).resolves.toBeUndefined();
    // The video itself is never treated as a sidecar.
    await expect(fs.access(videoPath)).resolves.toBeUndefined();
  });

  it("claims an already-canonical sidecar in place when source and destination coincide (direct lane)", async () => {
    // Direct Downie downloads land video + sidecar straight in the pipeline folder.
    const videoPath = path.join(downieDir, videoName);
    const sidecarPath = path.join(downieDir, `${videoBase}.srt`);
    await fs.writeFile(videoPath, "video", "utf-8");
    await fs.writeFile(sidecarPath, "subtitles", "utf-8");

    const claimed = await moveDownieSubtitleSidecars(videoPath, downieDir, dispatchedAtMs);

    // Returned for cleanup registration, and NOT destroyed by a self-targeted replace-move.
    expect(claimed).toEqual([sidecarPath]);
    await expect(fs.readFile(sidecarPath, "utf-8")).resolves.toBe("subtitles");
  });

  it("fails soft on an unreadable source folder — returns [] instead of throwing", async () => {
    const missingVideo = path.join(downloadsDir, "nope", videoName);

    await expect(moveDownieSubtitleSidecars(missingVideo, downieDir, dispatchedAtMs)).resolves.toEqual([]);
  });
});
