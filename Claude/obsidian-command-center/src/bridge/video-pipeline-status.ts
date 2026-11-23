// Pure reader for the video pipeline's durable run log
// (~/.local/share/raycast-obsidian/video-transcribe.log), written by the Raycast Video Pipeline Runner
// and, since 2026-11-19, by Command Center's built-in pipeline (src/video/, same line formats). Kept
// free of `obsidian` imports so test/video-pipeline-status.test.ts can exercise it under node --test;
// the bridge's video_pipeline_status handler only reads the file and hands the text here.
//
// A link run (2026-11-22, src/video/downie.ts) can wait up to half an hour for the operator to press play
// and + in Downie's window. While it does, the result carries `waitingForUser` with the exact steps.
//
// Each line is `<ISO timestamp> [run <id>] <message>`; runs older than 2026-10-15 have no
// `[run <id>]` prefix.

import {
  DOWNIE_FILE_DETECTED,
  DOWNIE_GUIDED_STEPS,
  DOWNIE_UNMATCHED,
  WAITING_FOR_USER,
} from "../video/downie.ts";

const RUN_LINE = /^\S+\s+(?:\[run ([^\]]+)\]\s+)?(.*)$/;

const TRANSCRIPTION_ENGINE = "transcription engine:";
// `transcription requested: …` before 2026-10-18; `transcription requested (parakeet|whisper): …`
// since the two lanes got their own names. Only the settings after the colon are reported.
const TRANSCRIPTION_REQUESTED = /^transcription requested(?: \([a-z]+\))?:/;
// Built-in pipeline (2026-11-19): a failed summary lane logs its reason and the transcription note it
// kept, from which the Copilot agent writes the summary itself.
const SUMMARY_ERROR = "summary error:";
const TRANSCRIPT_NOTE_KEPT = "transcript note kept:";

// The value of the run's last `<marker> <value>` message, or undefined when it has none.
//
// The marker must START the message, not merely appear in the line: the video title is echoed
// into later lines (source note, summary), so a title containing "transcription engine:" would
// otherwise be read as the engine. When the run carries an id, only that run's lines count,
// because two runs can be alive at once and their lines interleave (observed 2026-10-15).
function runMessageValue(run: string[], runId: string | undefined, marker: string | RegExp): string | undefined {
  for (let i = run.length - 1; i >= 0; i--) {
    const m = run[i].match(RUN_LINE);
    if (!m) continue;
    const [, lineRunId, message] = m;
    if (runId !== undefined && lineRunId !== runId) continue;
    const prefix =
      typeof marker === "string" ? (message.startsWith(marker) ? marker : undefined) : message.match(marker)?.[0];
    if (prefix !== undefined) {
      const value = message.slice(prefix.length).trim();
      return value || undefined;
    }
  }
  return undefined;
}

// `RUN START url=…` / `file=…` / `folder=…`: what the run was given.
const RUN_SOURCE = /RUN START (url|file|folder)=(.+)$/;
// Folder mode (2026-11-16): one line per video as the runner works through the folder, e.g.
// `VIDEO 2/5 START: <path>`, `VIDEO 2/5 DONE: <summary>`, `VIDEO 3/5 SKIPPED (<why>): <path>`.
// The reason of a SKIPPED line may hold parentheses itself ("same summary note as Talk (1).mkv"),
// hence the greedy group; only the count of SKIPPED lines is used.
const VIDEO_LINE = /^VIDEO (\d+)\/(\d+) (START|DONE|FAILED|SKIPPED)(?: \(.*\))?: (.*)$/;
const FOLDER_MODE = /^folder mode: (\d+) video\(s\)/;

interface FolderBatchProgress {
  total: number;
  summarized: number;
  failed: number;
  skipped: number;
  remaining: number;
  current?: { position: number; video: string };
  summaries: string[];
  /** `transcriptNote` is set when the video's summary failed and its transcription note was kept. */
  failures: Array<{ video: string; reason: string; transcriptNote?: string }>;
}

// Progress of a folder run, read from that run's own messages.
function folderBatchProgress(messages: string[], running: boolean): FolderBatchProgress {
  let total = 0;
  let skipped = 0;
  const summaries: string[] = [];
  const failures: Array<{ video: string; reason: string; transcriptNote?: string }> = [];
  const started = new Map<number, string>();
  // The transcription note each video's failed summary kept, by the video's position.
  const kept = new Map<number, string>();
  let current: { position: number; video: string } | undefined;
  for (const message of messages) {
    const announced = message.match(FOLDER_MODE);
    if (announced) {
      total = Number(announced[1]);
      continue;
    }
    if (current && message.startsWith(TRANSCRIPT_NOTE_KEPT)) {
      kept.set(current.position, message.slice(TRANSCRIPT_NOTE_KEPT.length).trim());
      continue;
    }
    const m = message.match(VIDEO_LINE);
    if (!m) continue;
    const [, position, of, event, rest] = m;
    total = total || Number(of);
    if (event === "START") {
      started.set(Number(position), rest);
      current = { position: Number(position), video: rest };
    } else if (event === "DONE") {
      summaries.push(rest);
      current = undefined;
    } else if (event === "FAILED") {
      const transcriptNote = kept.get(Number(position));
      failures.push({
        video: started.get(Number(position)) ?? `video ${position}`,
        reason: rest,
        ...(transcriptNote ? { transcriptNote } : {}),
      });
      current = undefined;
    } else {
      skipped += 1;
    }
  }
  return {
    total,
    summarized: summaries.length,
    failed: failures.length,
    skipped,
    remaining: Math.max(0, total - summaries.length - failures.length - skipped),
    ...(running && current ? { current } : {}),
    summaries,
    failures,
  };
}

/** The steps the operator has to take, while this run's own lines say it is waiting for them. */
function waitingForUser(run: string[], runId: string | undefined): Record<string, unknown> | undefined {
  let since: string | undefined;
  for (const line of run) {
    const m = line.match(RUN_LINE);
    if (!m || (runId !== undefined && m[1] !== runId)) continue;
    if (m[2].startsWith(WAITING_FOR_USER)) since = line.split(" ", 1)[0];
    else if (m[2].startsWith(DOWNIE_FILE_DETECTED)) since = undefined;
  }
  return since === undefined ? undefined : { in: "Downie", since, steps: DOWNIE_GUIDED_STEPS };
}

export function summarizeVideoPipelineLog(text: string): Record<string, unknown> {
  const lines = text.trimEnd().split("\n");
  let startIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].includes("RUN START")) {
      startIdx = i;
      break;
    }
  }
  if (startIdx < 0) {
    return { status: "unknown", message: "Run log exists but contains no RUN START entry." };
  }

  const run = lines.slice(startIdx);
  const runId = run[0].match(RUN_LINE)?.[1];
  // This run's own messages. With a run id, lines of another live run that interleave with this
  // one (observed 2026-10-15) are not this run's, and neither are untimestamped continuation lines
  // (a process-output block); a folder run lasts long enough for that to matter. Matched on the
  // message's START, as for the engine line, because video titles are echoed into later lines.
  const own: string[] = [];
  for (const line of run) {
    const m = line.match(RUN_LINE);
    if (m && (runId === undefined || m[1] === runId)) own.push(m[2]);
  }
  const terminal = own.some((m) => m.startsWith("RUN SUCCESS"))
    ? "success"
    : own.some((m) => m.startsWith("RUN FAIL"))
      ? "failed"
      : "running";
  const source = run[0].match(RUN_SOURCE);
  const isFolderRun = source?.[1] === "folder";
  // A folder run has one summary per video; `batch.summaries` lists them instead.
  const summaryLine = isFolderRun ? undefined : run.find((l) => l.includes("summary written via"));
  // What actually transcribed the audio (the transcriber's own report), and what the pipeline
  // asked for. Read from the whole run, not recentLines: by the end of a run the engine line
  // has scrolled out of the last 8. Both are absent for subtitle-sourced runs and for runs
  // before 2026-10-15.
  const transcriber = runMessageValue(run, runId, TRANSCRIPTION_ENGINE);
  const transcriptionRequested = runMessageValue(run, runId, TRANSCRIPTION_REQUESTED);
  // Built-in pipeline: why the summary lane failed, and the transcription note it kept for the agent
  // (also kept, with no error, when cleanup is off). In a folder run these are the LAST ones;
  // `batch.failures` carries each video's own.
  const summaryError = runMessageValue(run, runId, SUMMARY_ERROR);
  const transcriptNote = runMessageValue(run, runId, TRANSCRIPT_NOTE_KEPT);
  const waiting = terminal === "running" ? waitingForUser(run, runId) : undefined;
  const downloadNote = runMessageValue(run, runId, DOWNIE_UNMATCHED);

  return {
    status: terminal,
    ...(waiting ? { waitingForUser: waiting } : {}),
    startedAt: run[0].slice(0, 24).trim(),
    ...(source?.[1] === "url" ? { videoUrl: source[2] } : {}),
    ...(source?.[1] === "file" ? { file: source[2] } : {}),
    ...(isFolderRun ? { folder: source[2], batch: folderBatchProgress(own, terminal === "running") } : {}),
    latest: run[run.length - 1],
    ...(summaryLine ? { summary: summaryLine } : {}),
    ...(downloadNote ? { downloadNote } : {}),
    ...(summaryError ? { summaryError } : {}),
    ...(transcriptNote ? { transcriptNote } : {}),
    ...(transcriber ? { transcriber } : {}),
    ...(transcriptionRequested ? { transcriptionRequested } : {}),
    recentLines: run.slice(-8),
  };
}
