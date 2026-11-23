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
  LINK_SHAPE_HINT,
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

// Phase 4 (2026-11-20): a link Downie is not used for is refused with a pointer to the skill that
// downloads it. The pointer is the agent's whole recovery, so it is checked word for word.
test("a link to any other site is refused, pointing at the download skill and its script", () => {
  for (const link of [
    "  https://www.youtube.com/watch?v=x  ",
    "http://example.com/v.mp4",
    "https://attacker.example/?notes=secret",
    "http://www.linkedin.com/learning/c/l",
    "HTTPS://user:pass@www.linkedin.com/learning/c/l",
  ]) {
    assert.throws(() => resolveVideoPipelineSource(link), { message: LINK_REFUSAL });
  }
  assert.equal(
    LINK_REFUSAL,
    "video_pipeline_run takes a local video file or folder, or a link to one of these: LinkedIn Learning lessons, " +
      "the school's Kaltura videos and Strayer library films. Download any other link first with the " +
      "copilot-video-download skill (/Users/myhome/My Digital Garden/copilot/skills/copilot-video-download/video-download.sh), " +
      "then pass the file it prints or the course folder."
  );
  assert.ok(VIDEO_DOWNLOAD_SCRIPT.endsWith("/copilot/skills/copilot-video-download/video-download.sh"));
});

// 2026-11-22: a link on the approved list is a run; the list itself is tested in video-downie-sites.test.ts.
test("an approved link leaves rebuilt, with its site; a listed site's other pages are refused with the reason", () => {
  const resolved = resolveVideoPipelineSource(" HTTPS://www.linkedin.com/learning/c/l?u=12&resume=false#x ");
  assert.equal(resolved.kind, "link");
  assert.equal(resolved.source, "https://www.linkedin.com/learning/c/l?u=12");
  assert.equal(resolved.kind === "link" && resolved.link.siteName, "LinkedIn Learning");
  assert.throws(() => resolveVideoPipelineSource("https://www.linkedin.com/learning/some-course"), {
    message:
      "This LinkedIn Learning link cannot be handed to Downie: it names a whole course; pass the link of one lesson. " +
      LINK_SHAPE_HINT,
  });
  assert.throws(() => resolveVideoPipelineSource("https://login.libdatab.strayer.edu/login?url=https://a.com/x"), /not a film page/);
  // A Downie address, or any other scheme, is never a link: it is read as a path, and is not an absolute one.
  assert.throws(() => resolveVideoPipelineSource("downie://XUOpenURL?url=https://www.linkedin.com/learning/c/l"), /must be absolute/);
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
