// Run log and run marker of the video pipeline, ported on 2026-11-19 (phase 3 of
// ~/.claude/plans/in-a-new-session-sharded-valley.md) from the Raycast extension
// ~/Code/raycast-obsidian-bridge-fork/src/tools/videoTranscribeFlow.ts (appendRunLog, the run marker,
// findUnterminatedPreviousRun).
//
// The FILES are shared with the Raycast runner on purpose, and so are the line formats:
//   - the run log `~/.local/share/raycast-obsidian/video-transcribe.log` is what video_pipeline_status
//     parses (src/bridge/video-pipeline-status.ts). The old folder name is kept deliberately: the status
//     tool and the Copilot skill both read this one file, and it holds every earlier run.
//   - the run marker `~/.local/share/raycast-obsidian/current-run` names the ONE run allowed to carry on.
//     Every run claims it at RUN START and checks it at its waits. Since phase 4 nothing dispatches the
//     Raycast runner, but it stays installed until phase 7 and can still be started by hand from Raycast;
//     the marker keeps such a run and a Command Center run from racing over Obsidian's active note.
//
// Unlike the extension, the run id is passed explicitly (createRunLogger) instead of riding an
// AsyncLocalStorage: inside Obsidian's renderer the timers are the browser's, and an explicit id needs no
// async-context propagation to be right.
//
// Pure: Node builtins only, no `obsidian` import, so test/video-run-log.test.ts runs it under node --test.
// Every path is a parameter, so a test never touches the operator's real log or marker.

import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

const STATE_DIR_SEGMENTS = [".local", "share", "raycast-obsidian"];

/** The run log both backends write and video_pipeline_status reads. */
export function defaultRunLogPath(home: string = os.homedir()): string {
  return path.join(home, ...STATE_DIR_SEGMENTS, "video-transcribe.log");
}

/** The marker naming the one live run. */
export function defaultRunMarkerPath(home: string = os.homedir()): string {
  return path.join(home, ...STATE_DIR_SEGMENTS, "current-run");
}

/**
 * A run id: the run's start time with `:` and `.` made filename-safe, the same stamp the Raycast
 * runner uses ("2026-11-16T11-31-46-580Z"), so a log line and a leftover scratch folder always match.
 */
export function newRunId(now: Date = new Date()): string {
  return now.toISOString().replace(/[:.]/g, "-");
}

/** Appends one line to the run log. Never throws: logging must never break a run. */
export type RunLogger = (line: string) => Promise<void>;

/**
 * A logger whose lines read `<ISO time> [run <id>] <message>`, the format video_pipeline_status parses.
 * Two runs can be alive at once (a Raycast run and a built-in one), so every line carries its run's id.
 */
export function createRunLogger(
  logPath: string,
  runId: string,
  now: () => Date = () => new Date()
): RunLogger {
  return async (line: string) => {
    try {
      await mkdir(path.dirname(logPath), { recursive: true });
      await appendFile(logPath, `${now().toISOString()} [run ${runId}] ${line}\n`, "utf-8");
    } catch {
      // Never let logging break the run.
    }
  };
}

/** Thrown inside a run that another run has replaced. Never routes to a fallback. */
export class SupersededRunError extends Error {
  readonly currentRunId: string;
  constructor(currentRunId: string) {
    super(`superseded by run ${currentRunId}`);
    this.name = "SupersededRunError";
    this.currentRunId = currentRunId;
  }
}

/** Record `runId` as the one live run (atomic rename, so a reader never sees a half-written id). */
export async function claimCurrentRun(runId: string, markerPath: string): Promise<void> {
  await mkdir(path.dirname(markerPath), { recursive: true });
  const tempPath = `${markerPath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, runId, "utf-8");
  await rename(tempPath, markerPath);
}

/**
 * The id of the run that replaced `runId`, or null while `runId` is still the live run. "Different"
 * rather than "newer" on purpose: if two near-simultaneous claims land out of order, exactly one run
 * (whichever the marker names) survives. A missing or unreadable marker means nothing replaced us.
 */
export async function supersedingRunId(runId: string, markerPath: string): Promise<string | null> {
  try {
    const current = (await readFile(markerPath, "utf-8")).trim();
    return current && current !== runId ? current : null;
  } catch {
    return null;
  }
}

/** Throw SupersededRunError when another run has claimed the marker. */
export async function throwIfSuperseded(runId: string, markerPath: string): Promise<void> {
  const current = await supersedingRunId(runId, markerPath);
  if (current) {
    throw new SupersededRunError(current);
  }
}

/**
 * The previous run's RUN START line when that run never logged RUN SUCCESS, RUN FAIL or RUN
 * SUPERSEDED, else null. Called before this run's RUN START, so the new run can leave an honest
 * breadcrumb about a run that was killed mid-flight (a Raycast re-dispatch, a plugin reload).
 */
export async function findUnterminatedPreviousRun(logPath: string): Promise<string | null> {
  try {
    const lines = (await readFile(logPath, "utf-8")).trimEnd().split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].includes("RUN START")) {
        const terminated = lines
          .slice(i + 1)
          .some((l) => l.includes("RUN SUCCESS") || l.includes("RUN FAIL") || l.includes("RUN SUPERSEDED"));
        return terminated ? null : lines[i];
      }
    }
    return null;
  } catch {
    return null;
  }
}
