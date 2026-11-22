// Unit tests for src/bridge/video-pipeline-source.ts. Run: npm test
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import {
  countFolderVideos,
  LINK_REFUSAL,
  resolveVideoPipelineSource,
  VIDEO_DOWNLOAD_SCRIPT,
} from "../src/bridge/video-pipeline-source.ts";

let root = "";
// Canonical, as the resolver returns it (macOS's tmpdir sits behind the /var -> /private/var link).
let canonicalRoot = "";

function file(relativePath: string): string {
  const fullPath = path.join(root, relativePath);
  mkdirSync(path.dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, "bytes");
  return fullPath;
}

before(() => {
  root = mkdtempSync(path.join(tmpdir(), "video-pipeline-source-"));
  canonicalRoot = realpathSync(root);
});

after(() => {
  rmSync(root, { recursive: true, force: true });
});

// Phase 4 (2026-11-20): Raycast's download lanes are gone, so a link is refused with a pointer to
// the skill that downloads it. The pointer is the agent's whole recovery, so it is checked word for word.
test("an http(s) link is refused, pointing at the download skill and its script", () => {
  for (const link of ["  https://www.youtube.com/watch?v=x  ", "http://example.com/v.mp4", "HTTPS://www.linkedin.com/learning/x"]) {
    assert.throws(() => resolveVideoPipelineSource(link), { message: LINK_REFUSAL });
  }
  assert.equal(
    LINK_REFUSAL,
    "video_pipeline_run takes a local video file or folder, not a link: download it first with the " +
      "copilot-video-download skill (/Users/myhome/My Digital Garden/copilot/skills/copilot-video-download/video-download.sh), " +
      "then pass the file it prints or the course folder."
  );
  assert.ok(VIDEO_DOWNLOAD_SCRIPT.endsWith("/copilot/skills/copilot-video-download/video-download.sh"));
});

test("a local video file resolves to its canonical path", () => {
  file("single/Talk.mp4");
  assert.deepEqual(resolveVideoPipelineSource(path.join(root, "single", "..", "single", "Talk.mp4")), {
    kind: "file",
    source: path.join(canonicalRoot, "single", "Talk.mp4"),
  });
});

test("a folder resolves to its canonical path and counts only the videos the runner will take", () => {
  file("course/Lesson 1.mp4");
  file("course/Lesson 2.MKV");
  file("course/._Lesson 1.mp4"); // AppleDouble twin on an exFAT drive
  file("course/.hidden.mov");
  file("course/notes.txt");
  file("course/deeper/Lesson 3.mp4"); // subfolders are not searched
  symlinkSync(file("elsewhere/Bonus.webm"), path.join(root, "course", "Bonus.webm"));
  symlinkSync(path.join(root, "gone.mp4"), path.join(root, "course", "Dangling.mp4"));

  assert.equal(countFolderVideos(path.join(root, "course")), 3);
  assert.deepEqual(resolveVideoPipelineSource(`${path.join(root, "course")}/`), {
    kind: "folder",
    source: path.join(canonicalRoot, "course"),
    videoCount: 3,
  });
});

test("a file:// URL naming a folder is decoded", () => {
  file("with space/Clip.mov");
  const resolved = resolveVideoPipelineSource(pathToFileURL(path.join(root, "with space")).href);
  assert.equal(resolved.kind, "folder");
  assert.equal(resolved.source, path.join(canonicalRoot, "with space"));
});

test("a folder without videos directly inside is refused", () => {
  file("empty/readme.md");
  file("empty/sub/clip.mp4");
  assert.throws(
    () => resolveVideoPipelineSource(path.join(root, "empty")),
    /^Error: No videos \(\.mp4, \.mkv, \.webm, \.mov, \.m4v\) directly inside .*; subfolders are not searched\.$/
  );
});

test("the old refusals still hold for anything that is not a video or a folder", () => {
  file("other/notes.txt");
  assert.throws(() => resolveVideoPipelineSource(""), /videoUrl is required/);
  assert.throws(() => resolveVideoPipelineSource("relative/clip.mp4"), /must be absolute/);
  assert.throws(() => resolveVideoPipelineSource("ftp://host/clip.mp4"), /must be absolute/);
  assert.throws(() => resolveVideoPipelineSource(`${root}/a\0b.mp4`), /null byte/);
  assert.throws(() => resolveVideoPipelineSource(path.join(root, "other", "notes.txt")), /must be a video/);
  assert.throws(() => resolveVideoPipelineSource(path.join(root, "missing.mp4")), /does not exist/);
});

test("a video-named symlink to a non-video is still refused", () => {
  symlinkSync(file("smuggle/payload.txt"), path.join(root, "smuggle", "looks-like.mp4"));
  assert.throws(() => resolveVideoPipelineSource(path.join(root, "smuggle", "looks-like.mp4")), /must be a video/);
});
