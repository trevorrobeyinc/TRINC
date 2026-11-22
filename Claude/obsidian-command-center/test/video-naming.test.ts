// Unit tests for src/video/naming.ts. Run: npm test
// Ported 2026-11-19 from the Raycast extension's src/tests/videoTitle.spec.ts, plus the new
// Obsidian-safe names and the folder rules.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeVaultRelativeFolder,
  noteTitlesFor,
  obsidianSafeName,
  stripDownieDisambiguationSuffix,
  stripRunTimestamp,
  summaryNotePathFor,
  transcriptPathsFor,
} from "../src/video/naming.ts";

test("stripRunTimestamp removes the trailing -<ISO run timestamp> the output template appended", () => {
  assert.equal(stripRunTimestamp("My Great Lecture-2026-06-30T12-34-56-789Z"), "My Great Lecture");
  assert.equal(stripRunTimestamp("Part 1 - Intro to OB-2026-01-02T03-04-05-006Z"), "Part 1 - Intro to OB");
  assert.equal(
    stripRunTimestamp("organizational behavior in context-2026-06-30T00-00-00-000Z"),
    "organizational behavior in context"
  );
});

test("stripRunTimestamp leaves a clean name alone and only strips a timestamp at the very end", () => {
  assert.equal(stripRunTimestamp("Already Clean Title"), "Already Clean Title");
  assert.equal(
    stripRunTimestamp("Recorded 2026-06-30T12-00-00-000Z Session"),
    "Recorded 2026-06-30T12-00-00-000Z Session"
  );
});

test("stripDownieDisambiguationSuffix strips the re-download suffix, with and without a counter", () => {
  assert.equal(
    stripDownieDisambiguationSuffix("K-means clustering | LinkedIn Learning -  - 2026-08-19 03-58-00_0"),
    "K-means clustering | LinkedIn Learning"
  );
  assert.equal(
    stripDownieDisambiguationSuffix("The internet of things | LinkedIn Learning -  - 2026-07-31 16-54-58"),
    "The internet of things | LinkedIn Learning"
  );
});

test("stripDownieDisambiguationSuffix keeps names without it, and dashes and dates in a real title", () => {
  assert.equal(stripDownieDisambiguationSuffix("Common algorithms | LinkedIn Learning"), "Common algorithms | LinkedIn Learning");
  assert.equal(
    stripDownieDisambiguationSuffix("Standup - 2026-08-19 recap - part 2"),
    "Standup - 2026-08-19 recap - part 2"
  );
});

test("obsidianSafeName turns the colons Obsidian refuses into dashes and drops leading dots", () => {
  assert.equal(obsidianSafeName("Lecture 3: Networks"), "Lecture 3 - Networks");
  assert.equal(obsidianSafeName("Meeting at 12:30"), "Meeting at 12-30");
  assert.equal(obsidianSafeName("a\\b"), "a-b");
  assert.equal(obsidianSafeName(".hidden talk"), "hidden talk");
  assert.equal(obsidianSafeName("..."), "Untitled video");
});

test("obsidianSafeName passes every title the Raycast runner could already write through unchanged", () => {
  for (const title of [
    "Add social media to your marketing mix | LinkedIn Learning",
    "2.1.1 Introduction to Networking",
    "C# basics (part 2) — ünïcode",
    "Lesson 10 - Wrap up",
  ]) {
    assert.equal(obsidianSafeName(title), title);
  }
});

test("noteTitlesFor names a local video from its file name, without the extension", () => {
  assert.deepEqual(noteTitlesFor("/Users/me/Movies/Lesson 2 - Basics.mkv", ""), {
    baseName: "Lesson 2 - Basics",
    noteTitle: "Lesson 2 - Basics",
  });
});

test("noteTitlesFor keeps a run timestamp in the base name only, and strips Downie's suffix from both", () => {
  assert.deepEqual(noteTitlesFor("/v/My Lecture-2026-06-30T12-34-56-789Z.mp4", ""), {
    baseName: "My Lecture-2026-06-30T12-34-56-789Z",
    noteTitle: "My Lecture",
  });
  assert.equal(
    noteTitlesFor("/v/K-means clustering | LinkedIn Learning -  - 2026-08-19 03-58-00_0.mp4", "").noteTitle,
    "K-means clustering | LinkedIn Learning"
  );
});

test("noteTitlesFor derives a name from the URL for a generic yt-dlp title, and leaves it alone without one", () => {
  assert.equal(
    noteTitlesFor("/v/Videoplayer-2026-06-30T00-00-00-000Z.mp4", "https://example.com/course/organizational_behavior.mp4")
      .noteTitle,
    "organizational behavior"
  );
  assert.equal(noteTitlesFor("/v/Videoplayer.mp4", "").noteTitle, "Videoplayer");
});

test("normalizeVaultRelativeFolder falls back, tidies slashes, and keeps a folder inside the vault", () => {
  assert.equal(normalizeVaultRelativeFolder(undefined, "Video Downloads"), "Video Downloads");
  assert.equal(normalizeVaultRelativeFolder("   ", "Video Downloads"), "Video Downloads");
  assert.equal(normalizeVaultRelativeFolder("Media/Videos/", "x"), "Media/Videos");
  assert.equal(normalizeVaultRelativeFolder("/Media//Videos", "x"), "Media/Videos");
  assert.equal(normalizeVaultRelativeFolder("./Media", "x"), "Media");
  assert.equal(normalizeVaultRelativeFolder(".", "Video Downloads"), "Video Downloads");
});

test("normalizeVaultRelativeFolder refuses a folder outside the vault or a hidden one", () => {
  assert.throws(() => normalizeVaultRelativeFolder("../Elsewhere", "x"), /must stay inside the vault/);
  assert.throws(() => normalizeVaultRelativeFolder("Media/../../x", "x"), /must stay inside the vault/);
  assert.throws(() => normalizeVaultRelativeFolder(".obsidian/plugins", "x"), /must not be a hidden folder/);
  assert.throws(() => normalizeVaultRelativeFolder("Media/.transcripts", "x"), /must not be a hidden folder/);
});

test("summary, transcript and transcription-note paths follow the Raycast runner's layout", () => {
  assert.equal(summaryNotePathFor("Copilot Summaries", "Solo talk"), "Copilot Summaries/Solo talk summary.md");
  assert.deepEqual(transcriptPathsFor("Video Downloads", "Solo talk"), {
    transcriptRelativePath: "Video Downloads/.transcripts/Solo talk.txt",
    sourceNotePath: "Video Downloads/Solo talk transcription.md",
  });
});
