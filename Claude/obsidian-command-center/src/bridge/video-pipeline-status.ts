// Pure reader for the Raycast Video Pipeline Runner's durable run log
// (~/.local/share/raycast-obsidian/video-transcribe.log). Kept free of `obsidian` imports so
// test/video-pipeline-status.test.ts can exercise it under node --test; the bridge's
// video_pipeline_status handler only reads the file and hands the text here.
//
// Each line is `<ISO timestamp> [run <id>] <message>`; runs older than 2026-10-15 have no
// `[run <id>]` prefix.

const RUN_LINE = /^\S+\s+(?:\[run ([^\]]+)\]\s+)?(.*)$/;

const TRANSCRIPTION_ENGINE = "transcription engine:";
const TRANSCRIPTION_REQUESTED = "transcription requested:";

// The value of the run's last `<marker> <value>` message, or undefined when it has none.
//
// The marker must START the message, not merely appear in the line: the video title is echoed
// into later lines (source note, summary), so a title containing "transcription engine:" would
// otherwise be read as the engine. When the run carries an id, only that run's lines count,
// because two runs can be alive at once and their lines interleave (observed 2026-10-15).
function runMessageValue(run: string[], runId: string | undefined, marker: string): string | undefined {
  for (let i = run.length - 1; i >= 0; i--) {
    const m = run[i].match(RUN_LINE);
    if (!m) continue;
    const [, lineRunId, message] = m;
    if (runId !== undefined && lineRunId !== runId) continue;
    if (message.startsWith(marker)) {
      const value = message.slice(marker.length).trim();
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
  failures: Array<{ video: string; reason: string }>;
}

// Progress of a folder run, read from that run's own messages.
function folderBatchProgress(messages: string[], running: boolean): FolderBatchProgress {
  let total = 0;
  let skipped = 0;
  const summaries: string[] = [];
  const failures: Array<{ video: string; reason: string }> = [];
  const started = new Map<number, string>();
  let current: { position: number; video: string } | undefined;
  for (const message of messages) {
    const announced = message.match(FOLDER_MODE);
    if (announced) {
      total = Number(announced[1]);
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
      failures.push({ video: started.get(Number(position)) ?? `video ${position}`, reason: rest });
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

  return {
    status: terminal,
    startedAt: run[0].slice(0, 24).trim(),
    ...(source?.[1] === "url" ? { videoUrl: source[2] } : {}),
    ...(source?.[1] === "file" ? { file: source[2] } : {}),
    ...(isFolderRun ? { folder: source[2], batch: folderBatchProgress(own, terminal === "running") } : {}),
    latest: run[run.length - 1],
    ...(summaryLine ? { summary: summaryLine } : {}),
    ...(transcriber ? { transcriber } : {}),
    ...(transcriptionRequested ? { transcriptionRequested } : {}),
    recentLines: run.slice(-8),
  };
}
