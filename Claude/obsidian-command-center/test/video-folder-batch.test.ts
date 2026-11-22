// Unit tests for src/video/folder-batch.ts. Run: npm test
// Ported 2026-11-19, case for case, from the Raycast extension's src/tests/localVideoBatch.spec.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join } from "node:path";
import {
  countFolderBatch,
  isDirectoryPath,
  isFolderVideoName,
  listFolderVideos,
  planFolderBatch,
  runFolderBatch,
  type FolderBatchItem,
  type VideoOutcome,
} from "../src/video/folder-batch.ts";

async function withTempDir(fn: (dir: string, touch: (relative: string) => Promise<string>) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "cc-video-batch-"));
  const touch = async (relative: string) => {
    const full = join(dir, relative);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, "video bytes");
    return full;
  };
  try {
    await fn(dir, touch);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function recorder() {
  const lines: string[] = [];
  return { lines, log: async (line: string) => void lines.push(line) };
}

const item = (name: string, skip?: string): FolderBatchItem => ({ video: `/v/${name}.mp4`, title: name, skip });
const titleOf = (video: string) => basename(video, extname(video));

test("isFolderVideoName accepts every container the pipeline transcribes, in any letter case", () => {
  for (const name of ["a.mp4", "b.MKV", "c.webm", "d.mov", "e.M4V"]) {
    assert.equal(isFolderVideoName(name), true, name);
  }
});

test("isFolderVideoName refuses hidden files, AppleDouble twins and anything that is not a video", () => {
  for (const name of ["._lesson.mp4", ".hidden.mp4", "notes.txt", "lesson.mp4.part", "lesson.srt", "mp4"]) {
    assert.equal(isFolderVideoName(name), false, name);
  }
});

test("isDirectoryPath is true for a folder and false for a file or a missing path", () =>
  withTempDir(async (dir, touch) => {
    const file = await touch("one.mp4");
    assert.equal(await isDirectoryPath(dir), true);
    assert.equal(await isDirectoryPath(file), false);
    assert.equal(await isDirectoryPath(join(dir, "missing")), false);
  }));

test("listFolderVideos lists the folder's own videos in natural name order", () =>
  withTempDir(async (dir, touch) => {
    await touch("Lesson 10 - Wrap up.mp4");
    await touch("Lesson 2 - Basics.mkv");
    await touch("Lesson 1 - Intro.mov");
    assert.deepEqual((await listFolderVideos(dir)).map((p) => basename(p)), [
      "Lesson 1 - Intro.mov",
      "Lesson 2 - Basics.mkv",
      "Lesson 10 - Wrap up.mp4",
    ]);
  }));

test("listFolderVideos leaves out subfolders, hidden files, AppleDouble twins and non-videos", () =>
  withTempDir(async (dir, touch) => {
    await touch("keep.mp4");
    await touch("._keep.mp4");
    await touch(".hidden.mp4");
    await touch("notes.txt");
    await touch("still-downloading.mp4.part");
    await touch("subfolder/nested.mp4");
    await mkdir(join(dir, "looks-like-a-video.mp4")); // a folder with a video's name
    assert.deepEqual(await listFolderVideos(dir), [join(dir, "keep.mp4")]);
  }));

test("listFolderVideos follows a symlink to a video and drops a dangling one", () =>
  withTempDir(async (dir, touch) => {
    const target = await touch("elsewhere/real.mp4");
    await mkdir(join(dir, "batch"));
    await symlink(target, join(dir, "batch", "linked.mp4"));
    await symlink(join(dir, "gone.mp4"), join(dir, "batch", "dangling.mp4"));
    assert.deepEqual(await listFolderVideos(join(dir, "batch")), [join(dir, "batch", "linked.mp4")]);
  }));

test("listFolderVideos returns an empty list for a folder without videos", () =>
  withTempDir(async (dir, touch) => {
    await touch("readme.md");
    assert.deepEqual(await listFolderVideos(dir), []);
  }));

test("planFolderBatch skips a video whose summary note already exists and keeps the rest in order", async () => {
  const plan = await planFolderBatch(["/v/A.mp4", "/v/B.mp4", "/v/C.mp4"], titleOf, (title) => title === "B");
  assert.deepEqual(plan, [
    { video: "/v/A.mp4", title: "A", skip: undefined },
    { video: "/v/B.mp4", title: "B", skip: "summary already in the vault" },
    { video: "/v/C.mp4", title: "C", skip: undefined },
  ]);
});

test("planFolderBatch gives a shared summary note to the first video only, ignoring letter case", async () => {
  const plan = await planFolderBatch(["/v/talk.mkv", "/v/Talk.mp4"], titleOf, () => false);
  assert.equal(plan[0].skip, undefined);
  assert.equal(plan[1].skip, "same summary note as talk.mkv");
});

test("planFolderBatch awaits an asynchronous summary check", async () => {
  const plan = await planFolderBatch(["/v/A.mp4"], titleOf, async () => true);
  assert.equal(plan[0].skip, "summary already in the vault");
});

test("runFolderBatch logs the skips first, then runs the rest one at a time in folder order", async () => {
  const { lines, log } = recorder();
  const processed: string[] = [];
  let running = 0;
  const result = await runFolderBatch([item("A"), item("B", "summary already in the vault"), item("C")], {
    log,
    shouldStop: () => false,
    processVideo: async (planned, position, total) => {
      running += 1;
      assert.equal(running, 1, "never two videos at once");
      processed.push(`${planned.title} ${position}/${total}`);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running -= 1;
      return `Copilot Summaries/${planned.title} summary.md`;
    },
  });
  assert.deepEqual(processed, ["A 1/3", "C 3/3"]);
  assert.deepEqual(lines, [
    "VIDEO 2/3 SKIPPED (summary already in the vault): /v/B.mp4",
    "VIDEO 1/3 START: /v/A.mp4",
    "VIDEO 1/3 DONE: Copilot Summaries/A summary.md",
    "VIDEO 3/3 START: /v/C.mp4",
    "VIDEO 3/3 DONE: Copilot Summaries/C summary.md",
  ]);
  assert.equal(result.stoppedEarly, false);
  assert.equal(countFolderBatch(result), "2 summarized, 0 failed, 1 skipped");
});

test("runFolderBatch records a failed video and moves on when the policy says carry on", async () => {
  const { lines, log } = recorder();
  const result = await runFolderBatch([item("A"), item("B"), item("C")], {
    log,
    shouldStop: () => false,
    processVideo: async (planned) => {
      if (planned.title === "B") throw new Error("cannot decode");
      return `${planned.title} summary.md`;
    },
  });
  assert.deepEqual(result.outcomes.map((o) => o.status), ["summarized", "failed", "summarized"]);
  assert.ok(lines.includes("VIDEO 2/3 FAILED: cannot decode"));
  assert.equal(countFolderBatch(result), "2 summarized, 1 failed, 0 skipped");
});

test("runFolderBatch carries on by default (the stop policy is still the operator's open choice)", async () => {
  const { log } = recorder();
  const result = await runFolderBatch([item("A"), item("B")], {
    log,
    processVideo: async () => {
      throw new Error("boom");
    },
  });
  assert.deepEqual(result.outcomes.map((o) => o.status), ["failed", "failed"]);
  assert.equal(result.stoppedEarly, false);
});

test("runFolderBatch stops when the policy says so and reports the videos it never reached", async () => {
  const { log } = recorder();
  const seen: VideoOutcome[][] = [];
  let calls = 0;
  const result = await runFolderBatch([item("A"), item("B"), item("C", "summary already in the vault"), item("D")], {
    log,
    processVideo: async () => {
      calls += 1;
      throw new Error("Obsidian is closed");
    },
    shouldStop: (outcomes) => {
      seen.push([...outcomes]);
      return true;
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(seen[0].map((o) => o.status), ["skipped", "failed"]); // the failure is the last entry
  assert.equal(result.stoppedEarly, true);
  assert.deepEqual(result.notReached, ["/v/B.mp4", "/v/D.mp4"]);
  assert.equal(countFolderBatch(result), "0 summarized, 1 failed, 1 skipped, 2 not reached");
});

test("runFolderBatch ends the whole run on an error endsRun claims, without counting it as a failed video", async () => {
  class TakenOver extends Error {}
  const { lines, log } = recorder();
  await assert.rejects(
    runFolderBatch([item("A"), item("B")], {
      log,
      shouldStop: () => false,
      endsRun: (error) => error instanceof TakenOver,
      processVideo: async () => {
        throw new TakenOver("a newer run took over");
      },
    }),
    TakenOver
  );
  assert.deepEqual(lines, ["VIDEO 1/2 START: /v/A.mp4"]);
});

test("runFolderBatch lets beforeVideo end the run before the next video starts", async () => {
  const { lines, log } = recorder();
  let calls = 0;
  await assert.rejects(
    runFolderBatch([item("A"), item("B")], {
      log,
      shouldStop: () => false,
      beforeVideo: async () => {
        calls += 1;
        if (calls === 2) throw new Error("superseded");
      },
      processVideo: async (planned) => `${planned.title} summary.md`,
    }),
    /superseded/
  );
  assert.deepEqual(lines, ["VIDEO 1/2 START: /v/A.mp4", "VIDEO 1/2 DONE: A summary.md"]);
});

test("runFolderBatch uses describeError for the failure line", async () => {
  const { lines, log } = recorder();
  await runFolderBatch([item("A")], {
    log,
    shouldStop: () => false,
    describeError: () => "compact reason",
    processVideo: async () => {
      throw new Error("long\nmulti-line\nprocess output");
    },
  });
  assert.ok(lines.includes("VIDEO 1/1 FAILED: compact reason"));
});
