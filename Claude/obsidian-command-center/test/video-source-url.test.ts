// Unit tests for src/video/source-url.ts (phase 4, 2026-11-20). Run: npm test
// The `.url` file sits in a folder an agent can write and its URL lands in a note and in YAML, so every
// refusal is pinned here, and so is the one shape that is accepted.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { normalizeSummaryFrontmatter } from "../src/video/notes.ts";
import { parseSourceUrl, readSourceUrl, sourceUrlFileFor } from "../src/video/source-url.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE_URL_MODULE = pathToFileURL(join(HERE, "..", "src", "video", "source-url.ts")).href;

/** A FIFO at `at`, made through the system call (test/support/make-named-pipe.py explains why). */
function makeNamedPipe(at: string): void {
  execFileSync("/usr/bin/python3", ["-I", join(HERE, "support", "make-named-pipe.py"), at]);
}

const LESSON = "https://www.linkedin.com/learning/networking-foundations/what-is-a-network?u=57878161";

function withDir(fn: (dir: string) => void): void {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "cc-video-source-url-")));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The file the download script writes (yt-dlp --write-url-link): CRLF line endings. */
const shortcut = (url: string) => `[InternetShortcut]\r\nURL=${url}\r\n`;

test("the .url file sits next to the video under the video's base name", () => {
  assert.equal(sourceUrlFileFor("/v/Course/Lesson 1.mp4"), "/v/Course/Lesson 1.url");
  assert.equal(sourceUrlFileFor("/v/Talk-2026-11-20T10-12-29-703Z.mkv"), "/v/Talk-2026-11-20T10-12-29-703Z.url");
});

test("a CRLF InternetShortcut gives its https URL and says where it came from", () =>
  withDir((dir) => {
    writeFileSync(join(dir, "Lesson 1.url"), shortcut(LESSON));
    assert.deepEqual(readSourceUrl(join(dir, "Lesson 1.mp4")), {
      url: LESSON,
      logLine: `source URL from Lesson 1.url: ${LESSON}`,
    });
  }));

test("an LF-only file and a missing [InternetShortcut] header are read too", () =>
  withDir((dir) => {
    writeFileSync(join(dir, "a.url"), `URL=${LESSON}\n`);
    assert.equal(readSourceUrl(join(dir, "a.mp4")).url, LESSON);
  }));

test("no .url file means no URL, and one log line saying so", () =>
  withDir((dir) => {
    assert.deepEqual(readSourceUrl(join(dir, "Mine.mp4")), {
      url: "",
      logLine: "no source URL: no Mine.url next to the video",
    });
  }));

test("a symlinked .url is ignored, even when it points at a valid shortcut", () =>
  withDir((dir) => {
    writeFileSync(join(dir, "elsewhere.url"), shortcut(LESSON));
    symlinkSync(join(dir, "elsewhere.url"), join(dir, "Lesson.url"));
    assert.deepEqual(readSourceUrl(join(dir, "Lesson.mp4")), {
      url: "",
      logLine: "no source URL: Lesson.url is a symbolic link, which is ignored",
    });
  }));

test("a FIFO next to the video is refused, without opening it", () =>
  withDir((dir) => {
    makeNamedPipe(join(dir, "Piped.url"));
    assert.deepEqual(readSourceUrl(join(dir, "Piped.mp4")), {
      url: "",
      logLine: "no source URL: Piped.url is not a regular file",
    });
  }));

// The race the open closes (2026-11-20): the folder is agent-writable, so the file the lstat saw can be
// swapped before the read. `beforeOpen` lands the swap exactly there.
test("a symlink swapped in after the lstat is refused by O_NOFOLLOW, not followed", () =>
  withDir((dir) => {
    writeFileSync(join(dir, "Lesson.url"), shortcut("https://example.com/the-real-lesson"));
    writeFileSync(join(dir, "elsewhere.url"), shortcut("https://evil.example/planted"));
    symlinkSync(join(dir, "elsewhere.url"), join(dir, "staged-link"));
    const read = readSourceUrl(join(dir, "Lesson.mp4"), {
      beforeOpen: () => renameSync(join(dir, "staged-link"), join(dir, "Lesson.url")),
    });
    assert.deepEqual(read, { url: "", logLine: "no source URL: Lesson.url is a symbolic link, which is ignored" });
  }));

test("a FIFO swapped in after the lstat is refused without blocking (checked in a child with a timeout)", () =>
  withDir((dir) => {
    writeFileSync(join(dir, "Lesson.url"), shortcut("https://example.com/the-real-lesson"));
    makeNamedPipe(join(dir, "staged-pipe"));
    // A regression to a blocking open would hang this thread for ever, so the read runs in a child
    // process the test can kill: a hang then FAILS the test instead of stalling the suite.
    const child = spawnSync(
      process.execPath,
      [
        "--experimental-strip-types",
        "--no-warnings",
        "--input-type=module",
        "-e",
        [
          `import { renameSync } from "node:fs";`,
          `import { readSourceUrl } from ${JSON.stringify(SOURCE_URL_MODULE)};`,
          `const { PIPE, URLFILE, VIDEO } = process.env;`,
          `const read = readSourceUrl(VIDEO, { beforeOpen: () => renameSync(PIPE, URLFILE) });`,
          `process.stdout.write(JSON.stringify(read));`,
        ].join("\n"),
      ],
      {
        env: { ...process.env, PIPE: join(dir, "staged-pipe"), URLFILE: join(dir, "Lesson.url"), VIDEO: join(dir, "Lesson.mp4") },
        encoding: "utf-8",
        timeout: 15_000,
      }
    );
    assert.equal(child.error, undefined, `the read blocked or failed: ${child.error?.message}`);
    assert.equal(child.status, 0, child.stderr);
    assert.deepEqual(JSON.parse(child.stdout), { url: "", logLine: "no source URL: Lesson.url is not a regular file" });
  }));

test("every read closes its descriptor, on the accepted path and on each refusal after the open", () =>
  withDir((dir) => {
    writeFileSync(join(dir, "Good.url"), shortcut("https://example.com/lesson"));
    writeFileSync(join(dir, "NoLine.url"), "[InternetShortcut]\r\n");
    const openDescriptors = () => readdirSync("/dev/fd").length;
    const before = openDescriptors();
    for (let i = 0; i < 40; i++) {
      readSourceUrl(join(dir, "Good.mp4"));
      readSourceUrl(join(dir, "NoLine.mp4"));
    }
    assert.equal(openDescriptors(), before, "a descriptor leaked");
  }));

test("a file grown past 4 KB, or removed, after the lstat is refused by the checks on the open file", () =>
  withDir((dir) => {
    writeFileSync(join(dir, "Lesson.url"), shortcut("https://example.com/the-real-lesson"));
    writeFileSync(join(dir, "staged-big"), shortcut("https://example.com/x") + "x".repeat(5000));
    assert.equal(
      readSourceUrl(join(dir, "Lesson.mp4"), { beforeOpen: () => renameSync(join(dir, "staged-big"), join(dir, "Lesson.url")) }).logLine,
      "no source URL: Lesson.url is larger than 4096 bytes"
    );
    writeFileSync(join(dir, "Gone.url"), shortcut("https://example.com/x"));
    assert.deepEqual(readSourceUrl(join(dir, "Gone.mp4"), { beforeOpen: () => rmSync(join(dir, "Gone.url")) }), {
      url: "",
      logLine: "no source URL: no Gone.url next to the video",
    });
  }));

test("a folder named like the .url file, and a file over 4 KB, are refused", () =>
  withDir((dir) => {
    mkdirSync(join(dir, "Folder.url"));
    assert.equal(readSourceUrl(join(dir, "Folder.mp4")).logLine, "no source URL: Folder.url is not a regular file");
    writeFileSync(join(dir, "Big.url"), shortcut(LESSON) + "x".repeat(4097));
    assert.equal(readSourceUrl(join(dir, "Big.mp4")).logLine, "no source URL: Big.url is larger than 4096 bytes");
  }));

test("a file with no URL= line, or with two, gives no URL", () =>
  withDir((dir) => {
    writeFileSync(join(dir, "None.url"), "[InternetShortcut]\r\nIconIndex=0\r\n");
    assert.equal(readSourceUrl(join(dir, "None.mp4")).logLine, "no source URL: None.url has no URL= line");
    writeFileSync(join(dir, "Two.url"), `URL=${LESSON}\r\nURL=https://evil.example/\r\n`);
    assert.equal(readSourceUrl(join(dir, "Two.mp4")).logLine, "no source URL: Two.url has 2 URL= lines");
  }));

test("only an https URL is accepted", () => {
  for (const raw of ["http://example.com/v", "file:///Users/me/v.mp4", "javascript:alert(1)", "ftp://example.com/v"]) {
    const parsed = parseSourceUrl(raw);
    assert.ok("problem" in parsed, raw);
  }
  assert.deepEqual(parseSourceUrl("http://example.com/v"), { problem: "its URL is not https (http:)" });
  assert.deepEqual(parseSourceUrl("not a url at all"), { problem: "its URL holds whitespace, control or format characters" });
  assert.deepEqual(parseSourceUrl("https//missing-colon"), { problem: "its URL does not parse" });
});

test("whitespace, control and format characters, credentials and over-long URLs are refused", () => {
  const refusals: Array<[string, string]> = [
    ["", "its URL= line is empty"],
    ["https://example.com/a b", "its URL holds whitespace, control or format characters"],
    ["https://example.com/a\tb", "its URL holds whitespace, control or format characters"],
    ["https://example.com/‮evil", "its URL holds whitespace, control or format characters"],
    ["https://example.com/\u0007", "its URL holds whitespace, control or format characters"],
    ["https://user:pass@example.com/v", "its URL carries a user name or password"],
    [`https://example.com/${"a".repeat(2049)}`, "its URL is longer than 2048 characters"],
  ];
  for (const [raw, problem] of refusals) {
    assert.deepEqual(parseSourceUrl(raw), { problem }, JSON.stringify(raw));
  }
});

test("the parser's normalized href is what is kept: quotes and non-ASCII come out percent-encoded", () => {
  assert.deepEqual(parseSourceUrl('https://example.com/a"b'), { url: "https://example.com/a%22b" });
  assert.deepEqual(parseSourceUrl("https://example.com/café"), { url: "https://example.com/caf%C3%A9" });
  assert.deepEqual(parseSourceUrl("HTTPS://Example.COM/x"), { url: "https://example.com/x" });
});

test("an accepted URL cannot break the summary's YAML frontmatter", () => {
  const note = "---\ntitle: Lesson transcription\nsource:\ncreated:\n---\n\n# Lesson transcription\n";
  const facts = (sourceUrl: string) => ({ title: "Lesson", sourceUrl, createdDate: "2026-11-20" });
  const plain = parseSourceUrl("https://example.com/watch?v=x#t=1m");
  assert.ok("url" in plain);
  const plainOut = normalizeSummaryFrontmatter(note, facts(plain.url));
  assert.ok(plainOut.kind === "changed" && plainOut.content.includes("\nsource: https://example.com/watch?v=x#t=1m\n"));
  const quoted = parseSourceUrl("https://example.com/it's");
  assert.ok("url" in quoted);
  const quotedOut = normalizeSummaryFrontmatter(note, facts(quoted.url));
  assert.ok(quotedOut.kind === "changed" && quotedOut.content.includes(`\nsource: "https://example.com/it's"\n`));
  // The frontmatter block keeps exactly its keys, one per line: no URL can add a line.
  const lines = quotedOut.kind === "changed" ? quotedOut.content.split("\n---")[0].split("\n") : [];
  assert.deepEqual(lines.map((l) => l.split(":")[0]), ["---", "title", "source", "created"]);
});
