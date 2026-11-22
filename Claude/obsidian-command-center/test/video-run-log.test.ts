// Unit tests for src/video/run-log.ts. Run: npm test
// The run-marker cases are ported 2026-11-19 from the Raycast extension's
// src/tests/videoTranscribeFlow.spec.ts ("one run at a time"). Every test uses its own temp files:
// the operator's real log and marker must never be touched by a test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  claimCurrentRun,
  createRunLogger,
  defaultRunLogPath,
  defaultRunMarkerPath,
  findUnterminatedPreviousRun,
  newRunId,
  SupersededRunError,
  supersedingRunId,
  throwIfSuperseded,
} from "../src/video/run-log.ts";

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "cc-video-run-log-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("the default paths are the files the Raycast runner and video_pipeline_status already share", () => {
  assert.equal(defaultRunLogPath("/Users/me"), "/Users/me/.local/share/raycast-obsidian/video-transcribe.log");
  assert.equal(defaultRunMarkerPath("/Users/me"), "/Users/me/.local/share/raycast-obsidian/current-run");
});

test("newRunId is the run's start time made filename-safe, as the Raycast runner writes it", () => {
  assert.equal(newRunId(new Date("2026-11-16T11:31:46.580Z")), "2026-11-16T11-31-46-580Z");
});

test("createRunLogger writes `<ISO time> [run <id>] <message>` lines, creating the folder", () =>
  withTempDir(async (dir) => {
    const logPath = join(dir, "nested", "video-transcribe.log");
    const log = createRunLogger(logPath, "run-A", () => new Date("2026-11-19T01:02:03.004Z"));
    await log("RUN START file=/v/a.mp4");
    await log("RUN SUCCESS");
    assert.equal(
      await readFile(logPath, "utf-8"),
      "2026-11-19T01:02:03.004Z [run run-A] RUN START file=/v/a.mp4\n" +
        "2026-11-19T01:02:03.004Z [run run-A] RUN SUCCESS\n"
    );
  }));

test("createRunLogger never throws, even when the log cannot be written", () =>
  withTempDir(async (dir) => {
    const blocker = join(dir, "a-file");
    await writeFile(blocker, "not a folder");
    const log = createRunLogger(join(blocker, "video-transcribe.log"), "run-A");
    await log("still fine"); // resolves; the line is lost, the run is not
  }));

test("the run marker reports nothing newer when absent, or while it still names this run", () =>
  withTempDir(async (dir) => {
    const marker = join(dir, "current-run");
    assert.equal(await supersedingRunId("run-A", marker), null);
    await claimCurrentRun("run-A", marker);
    assert.equal(await supersedingRunId("run-A", marker), null);
  }));

test("the run marker names the run that claimed it after this one", () =>
  withTempDir(async (dir) => {
    const marker = join(dir, "current-run");
    await claimCurrentRun("run-A", marker);
    await claimCurrentRun("run-B", marker);
    assert.equal(await supersedingRunId("run-A", marker), "run-B");
    assert.equal(await supersedingRunId("run-B", marker), null);
    await assert.rejects(throwIfSuperseded("run-A", marker), (error: unknown) => {
      assert.ok(error instanceof SupersededRunError);
      assert.equal(error.currentRunId, "run-B");
      assert.equal(error.message, "superseded by run run-B");
      return true;
    });
    await throwIfSuperseded("run-B", marker);
  }));

test("a claim leaves no temp file behind (atomic rename)", () =>
  withTempDir(async (dir) => {
    await claimCurrentRun("run-A", join(dir, "current-run"));
    assert.deepEqual(await readdir(dir), ["current-run"]);
  }));

test("findUnterminatedPreviousRun returns the last RUN START line only when that run never ended", () =>
  withTempDir(async (dir) => {
    const logPath = join(dir, "video-transcribe.log");
    assert.equal(await findUnterminatedPreviousRun(logPath), null); // no log yet

    const open = "2026-11-19T00:00:02.000Z [run B] RUN START folder=/v";
    await writeFile(
      logPath,
      ["2026-11-19T00:00:00.000Z [run A] RUN START file=/v/a.mp4", "2026-11-19T00:00:01.000Z [run A] RUN SUCCESS", open, "2026-11-19T00:00:03.000Z [run B] VIDEO 1/2 START: /v/x.mp4"].join("\n")
    );
    assert.equal(await findUnterminatedPreviousRun(logPath), open);

    for (const terminal of ["RUN SUCCESS folder: 2 summarized, 0 failed, 0 skipped", "RUN FAIL: boom", "RUN SUPERSEDED: superseded by run C"]) {
      await writeFile(logPath, `${open}\n2026-11-19T00:00:04.000Z [run B] ${terminal}\n`);
      assert.equal(await findUnterminatedPreviousRun(logPath), null, terminal);
    }
  }));
