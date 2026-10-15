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
  const terminal = run.some((l) => l.includes("RUN SUCCESS"))
    ? "success"
    : run.some((l) => l.includes("RUN FAIL"))
      ? "failed"
      : "running";
  const summaryLine = run.find((l) => l.includes("summary written via"));
  const urlMatch = run[0].match(/url=(.+)$/);
  const runId = run[0].match(RUN_LINE)?.[1];
  // What actually transcribed the audio (the transcriber's own report), and what the pipeline
  // asked for. Read from the whole run, not recentLines: by the end of a run the engine line
  // has scrolled out of the last 8. Both are absent for subtitle-sourced runs and for runs
  // before 2026-10-15.
  const transcriber = runMessageValue(run, runId, TRANSCRIPTION_ENGINE);
  const transcriptionRequested = runMessageValue(run, runId, TRANSCRIPTION_REQUESTED);

  return {
    status: terminal,
    startedAt: run[0].slice(0, 24).trim(),
    ...(urlMatch ? { videoUrl: urlMatch[1] } : {}),
    latest: run[run.length - 1],
    ...(summaryLine ? { summary: summaryLine } : {}),
    ...(transcriber ? { transcriber } : {}),
    ...(transcriptionRequested ? { transcriptionRequested } : {}),
    recentLines: run.slice(-8),
  };
}
