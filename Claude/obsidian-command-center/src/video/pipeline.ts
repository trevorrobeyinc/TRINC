// The built-in video pipeline (phase 3 of ~/.claude/plans/in-a-new-session-sharded-valley.md,
// 2026-11-19): steps 4 to 9 of the Raycast "Video Pipeline Runner", run inside Obsidian for a local
// video file or a folder of them. Ported from the extension's videoTranscribeFlow.ts
// (transcribeAndSummarize, runLocalFolder, runVideoTranscribeCommandForRun), WITHOUT its download
// lanes (a URL stays on the Raycast path until phase 4) and WITHOUT its paid Anthropic fallback.
//
// One video: transcript (subtitles or the audio) → transcription note through app.vault.create →
// the Copilot fork's headless summary → frontmatter → cleanup. When the summary fails, the run ends
// `failed`, logs `summary error:` and `transcript note kept:` (video_pipeline_status reports them as
// summaryError and transcriptNote), keeps the transcription note and the video, and stops watching:
// the Copilot agent then writes the summary itself from that note.
//
// Cleanup after a successful summary (setting videoCleanupAfterSummary, on by default): the transcript
// .txt, the transcription note and the scratch folder go. So does the video itself, with its subtitle,
// metadata and thumbnail files, when it sits inside the vault's video download folder ("Video
// Downloads/"), where the download script saves: the operator's decision of 2026-11-19, "Delete
// (today's cleanup)". A video anywhere else is never touched, and nothing is deleted after a failure.
//
// Pure: Node builtins and this folder's modules, with Obsidian behind VideoVaultHost
// (src/video/obsidian-host.ts), so test/video-pipeline.test.ts drives whole runs with a fake vault.

import { existsSync, realpathSync } from "node:fs";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  CopilotSummaryError,
  readCopilotCommandNoteFolder,
  realClock,
  runCopilotSummary,
  sweepOrphanedCopilotContractNotes,
  type Clock,
  type SummaryHost,
  type SummaryTimeouts,
} from "./copilot-summary.ts";
import {
  countFolderBatch,
  hasVideoExtension,
  listFolderVideos,
  LOCAL_VIDEO_EXTENSIONS,
  planFolderBatch,
  runFolderBatch,
  type FolderBatchResult,
} from "./folder-batch.ts";
import { normalizeVaultRelativeFolder, noteTitlesFor, summaryNotePathFor, transcriptPathsFor } from "./naming.ts";
import {
  buildDeterministicTranscriptSection,
  buildVideoSourceNoteContent,
  normalizeSummaryFrontmatter,
  sourceVideoReference,
  type FrontmatterOutcome,
} from "./notes.ts";
import {
  claimCurrentRun,
  createRunLogger,
  findUnterminatedPreviousRun,
  newRunId,
  SupersededRunError,
  throwIfSuperseded,
  type RunLogger,
} from "./run-log.ts";
import {
  assertPrimaryTranscriberPresent,
  describeVideoError,
  extractProcessErrorText,
  obtainTranscript,
  type ExecFn,
  type TranscriberSettings,
} from "./transcribe.ts";

export const DEFAULT_VIDEO_FOLDER = "Video Downloads";
export const DEFAULT_SUMMARY_FOLDER = "Copilot Summaries";

/** The pipeline's settings, as stored (untrusted strings, normalized here). */
export interface VideoPipelineSettings extends TranscriberSettings {
  /** Vault folder for transcription notes, and where downloads land. Default "Video Downloads". */
  videoFolder?: string;
  /** Vault folder for summary notes. Default "Copilot Summaries". */
  summaryFolder?: string;
  /** Clean up after a successful summary. Default true. */
  cleanupAfterSummary?: boolean;
}

/** Everything the pipeline needs from Obsidian. Paths are vault-relative unless named absolute. */
export interface VideoVaultHost extends SummaryHost {
  /** Absolute path of the vault on disk. */
  vaultPath: string;
  /** Obsidian's config folder name (normally ".obsidian"). */
  configDir: string;
  /** Create the note, or overwrite it, through Obsidian, so its index holds it on return. */
  writeNote(notePath: string, content: string): Promise<void>;
  /** Rewrite a note's text through Obsidian (app.vault.process). False when the index has no such note. */
  processNote(notePath: string, fn: (content: string) => string): Promise<boolean>;
}

export type VideoRunInput = { kind: "file" | "folder"; source: string };

export interface VideoRunContext {
  host: VideoVaultHost;
  settings: VideoPipelineSettings;
  /** The run log (src/video/run-log.ts defaultRunLogPath in production). */
  logPath: string;
  /** The run marker (defaultRunMarkerPath in production). */
  markerPath: string;
  /** Parent of the per-run scratch folder; os.tmpdir() by default. */
  scratchRoot?: string;
  signal?: AbortSignal;
  // Test seams. Production leaves these unset.
  exec?: ExecFn;
  binaries?: { parakeet: readonly string[]; whisper: readonly string[] };
  binaryExists?: (candidate: string) => boolean;
  clock?: Clock;
  now?: () => Date;
  summaryTimeouts?: Partial<SummaryTimeouts>;
}

/** The summary lane failed for one video; its transcription note was kept for the agent. */
export class VideoSummaryFailedError extends Error {
  readonly transcriptNote: string;
  readonly summaryError: string;
  constructor(summaryError: string, transcriptNote: string) {
    super(
      `Copilot summary lane failed (${summaryError}); the transcription note is kept for the agent: ${transcriptNote}`
    );
    this.name = "VideoSummaryFailedError";
    this.summaryError = summaryError;
    this.transcriptNote = transcriptNote;
  }
}

/** The run was stopped from outside (the plugin unloading). */
export class VideoRunAbortedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VideoRunAbortedError";
  }
}

/** A dispatch while a built-in run is still going. */
export class VideoRunInProgressError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VideoRunInProgressError";
  }
}

/** A folder run in which at least one video failed. Its message is the run's RUN FAIL line. */
class FolderRunError extends Error {
  readonly result: FolderBatchResult;
  constructor(message: string, result: FolderBatchResult) {
    super(message);
    this.name = "FolderRunError";
    this.result = result;
  }
}

export type VideoRunOutcome =
  | { status: "success"; kind: "file"; summaryNotePath: string }
  | { status: "success"; kind: "folder"; batch: FolderBatchResult; counts: string }
  | { status: "failed"; error: string; batch?: FolderBatchResult }
  | { status: "superseded"; by: string };

export interface VideoRunHandle {
  runId: string;
  startedAt: string;
  input: VideoRunInput;
  /** Settles when the run has logged its terminal line. Never rejects. */
  done: Promise<VideoRunOutcome>;
}

/** True when `candidate` is inside `folder` (both absolute, canonical). */
export function isInsideFolder(candidate: string, folder: string): boolean {
  const relative = path.relative(folder, candidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

// Files that travel with a downloaded video: subtitles (yt-dlp --write-subs), yt-dlp's .info.json and
// the thumbnail. A yt-dlp format variant (`<name>.f137.mp4`) left by a failed merge goes too.
const COMPANION_EXTENSIONS = [".srt", ".vtt", ".ass", ".ssa", ".sub", ".lrc", ".json", ".jpg", ".jpeg", ".png", ".webp"];

/** The video and every companion file of it in its own folder: `<base>.<...>` with a companion extension. */
export async function downloadedVideoFiles(videoFile: string): Promise<string[]> {
  const dir = path.dirname(videoFile);
  const base = path.basename(videoFile, path.extname(videoFile));
  const videoName = path.basename(videoFile);
  const files = [videoFile];
  for (const name of await readdir(dir).catch(() => [] as string[])) {
    if (name === videoName || !name.startsWith(`${base}.`)) continue;
    const lower = name.toLowerCase();
    const isCompanion = COMPANION_EXTENSIONS.some((ext) => lower.endsWith(ext));
    const isFormatVariant = /\.f\d+\.[a-z0-9]+$/i.test(name) && hasVideoExtension(name);
    if (isCompanion || isFormatVariant) files.push(path.join(dir, name));
  }
  return files;
}

function canonicalOrNull(candidate: string): string | null {
  try {
    return realpathSync(candidate);
  } catch {
    return null;
  }
}

/** What a run of `input` would do, without doing any of it (video_pipeline_run's dry run). */
export async function previewVideoRun(
  input: VideoRunInput,
  settings: VideoPipelineSettings,
  vaultPath: string
): Promise<Record<string, unknown>> {
  const videoFolder = normalizeVaultRelativeFolder(settings.videoFolder, DEFAULT_VIDEO_FOLDER);
  const summaryFolder = normalizeVaultRelativeFolder(settings.summaryFolder, DEFAULT_SUMMARY_FOLDER);
  const downloadDir = canonicalOrNull(path.join(vaultPath, ...videoFolder.split("/")));
  const cleanup = settings.cleanupAfterSummary !== false;
  const deletesVideos = cleanup && downloadDir !== null && isInsideFolder(input.source, downloadDir);
  if (input.kind === "file") {
    return {
      summaryNote: summaryNotePathFor(summaryFolder, noteTitlesFor(input.source, "").noteTitle),
      deletesVideoAfterSummary: deletesVideos,
    };
  }
  const plan = await planFolderBatch(
    await listFolderVideos(input.source),
    (video) => noteTitlesFor(video, "").noteTitle,
    (title) => existsSync(path.join(vaultPath, ...summaryNotePathFor(summaryFolder, title).split("/")))
  );
  return {
    toTranscribe: plan.filter((item) => !item.skip).length,
    skipped: plan.filter((item) => item.skip).map((item) => ({ video: path.basename(item.video), reason: item.skip })),
    deletesVideosAfterSummary: deletesVideos,
  };
}

/** One run's fixed facts, worked out once at its start. */
interface RunPlan {
  ctx: VideoRunContext;
  runId: string;
  log: RunLogger;
  clock: Clock;
  vaultReal: string;
  videoFolder: string;
  summaryFolder: string;
  copilotFolder: string;
  /** Canonical absolute path of the vault's video download folder, or null when it does not exist. */
  downloadDir: string | null;
  cleanup: boolean;
  checkpoint: () => Promise<void>;
}

/** Everything after the video is on disk, for ONE video. Resolves to its summary note's vault path. */
async function transcribeAndSummarize(run: RunPlan, videoFile: string, workDir: string): Promise<string> {
  const { ctx, log, clock } = run;
  const { host } = ctx;

  await run.checkpoint();
  const transcript = await obtainTranscript(videoFile, ctx.settings, workDir, {
    log,
    exec: ctx.exec,
    exists: ctx.binaryExists,
    binaries: ctx.binaries,
    signal: ctx.signal,
  });
  await run.checkpoint();

  const { baseName, noteTitle } = noteTitlesFor(videoFile, "");
  const { transcriptRelativePath, sourceNotePath } = transcriptPathsFor(run.videoFolder, baseName);
  const transcriptAbsolutePath = path.join(host.vaultPath, ...transcriptRelativePath.split("/"));
  await mkdir(path.dirname(transcriptAbsolutePath), { recursive: true });
  await writeFile(transcriptAbsolutePath, `${transcript.text}\n`, "utf-8");

  const sourceNoteContent = buildVideoSourceNoteContent({
    title: baseName,
    sourceVideoRef: sourceVideoReference(videoFile, run.vaultReal),
    sourceUrl: `file://${videoFile}`,
    extractedAtIso: (ctx.now ?? (() => new Date()))().toISOString(),
    transcriptSection: buildDeterministicTranscriptSection({
      sourceNoteRelativePath: sourceNotePath,
      transcriptRelativePath,
      transcriptText: transcript.text,
    }),
  });
  await host.writeNote(sourceNotePath, sourceNoteContent);
  await log(`source note written: ${sourceNotePath}`);
  await log("source note writer: Obsidian (app.vault.create), indexed on write");

  const summaryNotePath = summaryNotePathFor(run.summaryFolder, noteTitle);
  const summaryPhaseStartedAtMs = clock.now();
  try {
    await runCopilotSummary({
      host,
      log,
      sourceNotePath,
      summaryNotePath,
      copilotFolder: run.copilotFolder,
      timeouts: ctx.summaryTimeouts,
      clock,
      checkpoint: run.checkpoint,
    });
  } catch (error) {
    if (error instanceof SupersededRunError || error instanceof VideoRunAbortedError || ctx.signal?.aborted) {
      throw error;
    }
    const reason = error instanceof CopilotSummaryError || error instanceof Error ? error.message : String(error);
    await log(
      `copilot summary lane FAILED (${reason}) — no fallback runs here: the run ends failed, nothing keeps ` +
        `watching for a late Copilot note, and the transcription note stays for the agent`
    );
    await log(`summary error: ${reason}`);
    await log(`transcript note kept: ${sourceNotePath}`);
    throw new VideoSummaryFailedError(reason, sourceNotePath);
  }
  await log(`summary written via obsidian-copilot: ${summaryNotePath}`);

  // The pipeline's own facts in the frontmatter. Fail-soft: the summary exists, and failing the run
  // here would have the agent write a second one.
  try {
    let outcome: FrontmatterOutcome = { kind: "unchanged" };
    const createdIso = (ctx.now ?? (() => new Date()))().toISOString();
    await host.processNote(summaryNotePath, (content) => {
      outcome = normalizeSummaryFrontmatter(content, { title: noteTitle, sourceUrl: "", createdIso });
      return outcome.kind === "changed" ? outcome.content : content;
    });
    const settled = outcome as FrontmatterOutcome;
    if (settled.kind === "no-frontmatter") {
      await log("summary note has no frontmatter block — leaving it untouched");
    } else if (settled.kind === "changed") {
      await log(`summary frontmatter normalized (${settled.changed.join(", ")}): ${summaryNotePath}`);
    }
  } catch (error) {
    await log(`summary frontmatter not normalized (${error instanceof Error ? error.message : String(error)})`);
  }

  if (run.cleanup) {
    await rm(transcriptAbsolutePath, { force: true }).catch(() => undefined);
    await host.deleteNote(sourceNotePath).catch(() => undefined);
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    if (run.downloadDir !== null && isInsideFolder(videoFile, run.downloadDir)) {
      const removed: string[] = [];
      for (const file of await downloadedVideoFiles(videoFile)) {
        try {
          await rm(file, { force: true });
          removed.push(path.basename(file));
        } catch {
          // Locked or vanished: leave it.
        }
      }
      await log(`downloaded video removed after its summary (${removed.length} file(s)): ${removed.join(", ")}`);
    }
  } else {
    await log(`transcript note kept: ${sourceNotePath}`);
  }

  // A contract note still in the fork's folder is a duplicate of the summary: not opt-out.
  await sweepOrphanedCopilotContractNotes({
    host,
    log,
    copilotFolder: run.copilotFolder,
    sourceNotePath,
    sinceMs: summaryPhaseStartedAtMs,
  });
  return summaryNotePath;
}

async function runLocalFolder(run: RunPlan, folder: string, scratchDir: string): Promise<FolderBatchResult> {
  const { log } = run;
  const videos = await listFolderVideos(folder);
  if (videos.length === 0) {
    throw new Error(
      `No videos (${LOCAL_VIDEO_EXTENSIONS.join(", ")}) directly inside ${folder}. Subfolders are not searched.`
    );
  }
  const plan = await planFolderBatch(
    videos,
    (video) => noteTitlesFor(video, "").noteTitle,
    (title) => existsSync(path.join(run.ctx.host.vaultPath, ...summaryNotePathFor(run.summaryFolder, title).split("/")))
  );
  const toTranscribe = plan.filter((item) => !item.skip).length;
  const deletes = run.cleanup && run.downloadDir !== null && isInsideFolder(folder, run.downloadDir);
  await log(
    `folder mode: ${videos.length} video(s), ${toTranscribe} to transcribe, ${videos.length - toTranscribe} ` +
      (deletes
        ? `skipped; one at a time, and each summarized video is deleted afterwards (the folder is inside ${run.videoFolder})`
        : "skipped; one at a time, and the folder's own files are never moved or deleted")
  );

  return runFolderBatch(plan, {
    log,
    beforeVideo: run.checkpoint,
    endsRun: (error) =>
      error instanceof SupersededRunError || error instanceof VideoRunAbortedError || run.ctx.signal?.aborted === true,
    describeError: describeVideoError,
    processVideo: async (item, position, total) => {
      try {
        // One scratch folder per video: the transcriber falls back to ANY .txt in its output folder.
        return await transcribeAndSummarize(run, item.video, path.join(scratchDir, String(position)));
      } catch (error) {
        const processOutput = extractProcessErrorText(error);
        if (processOutput) {
          await log(`--- process output (video ${position}/${total}) ---\n${processOutput}\n--- end process output ---`);
        }
        throw error;
      }
    },
  });
}

async function executeRun(input: VideoRunInput, ctx: VideoRunContext, runId: string, log: RunLogger): Promise<VideoRunOutcome> {
  const scratchDir = path.join(ctx.scratchRoot ?? os.tmpdir(), "command-center-video", runId);
  let cleanup = true;
  try {
    const videoFolder = normalizeVaultRelativeFolder(ctx.settings.videoFolder, DEFAULT_VIDEO_FOLDER);
    const summaryFolder = normalizeVaultRelativeFolder(ctx.settings.summaryFolder, DEFAULT_SUMMARY_FOLDER);
    cleanup = ctx.settings.cleanupAfterSummary !== false;
    const run: RunPlan = {
      ctx,
      runId,
      log,
      clock: ctx.clock ?? realClock,
      vaultReal: canonicalOrNull(ctx.host.vaultPath) ?? ctx.host.vaultPath,
      videoFolder,
      summaryFolder,
      copilotFolder: await readCopilotCommandNoteFolder(ctx.host.vaultPath, ctx.host.configDir),
      downloadDir: canonicalOrNull(path.join(ctx.host.vaultPath, ...videoFolder.split("/"))),
      cleanup,
      checkpoint: async () => {
        if (ctx.signal?.aborted) {
          throw new VideoRunAbortedError(String(ctx.signal.reason ?? "the run was stopped"));
        }
        await throwIfSuperseded(runId, ctx.markerPath);
      },
    };
    // Fail fast, before any work: a missing transcriber errors in a second, with every path it tried.
    assertPrimaryTranscriberPresent(ctx.settings, { log, exists: ctx.binaryExists, binaries: ctx.binaries });

    if (input.kind === "folder") {
      const batch = await runLocalFolder(run, input.source, scratchDir);
      const counts = countFolderBatch(batch);
      const failures = batch.outcomes.filter((outcome) => outcome.status === "failed");
      if (failures.length > 0) {
        throw new FolderRunError(
          `folder run ${batch.stoppedEarly ? "stopped" : "finished"} with failures (${counts}); ` +
            `first failure: ${path.basename(failures[0].video)}: ${failures[0].detail}`,
          batch
        );
      }
      await log(`RUN SUCCESS folder: ${counts}`);
      return { status: "success", kind: "folder", batch, counts };
    }

    if (!existsSync(input.source)) {
      throw new Error(`Local video file not found: ${input.source}`);
    }
    if (!hasVideoExtension(input.source)) {
      throw new Error(`Unsupported video type (expected ${LOCAL_VIDEO_EXTENSIONS.join(", ")}): ${input.source}`);
    }
    await log("local file mode — skipping download");
    const summaryNotePath = await transcribeAndSummarize(run, input.source, scratchDir);
    await log("RUN SUCCESS");
    return { status: "success", kind: "file", summaryNotePath };
  } catch (error) {
    if (error instanceof SupersededRunError) {
      await log(`RUN SUPERSEDED: ${error.message}; standing down, that run owns the pipeline`);
      return { status: "superseded", by: error.currentRunId };
    }
    const message =
      ctx.signal?.aborted && !(error instanceof VideoRunAbortedError)
        ? String(ctx.signal.reason ?? "the run was stopped")
        : error instanceof Error
          ? error.message
          : String(error);
    const processOutput = extractProcessErrorText(error);
    await log(
      `RUN FAIL: ${message}` +
        (processOutput ? `\n--- process output ---\n${processOutput}\n--- end process output ---` : "")
    );
    return { status: "failed", error: message, ...(error instanceof FolderRunError ? { batch: error.result } : {}) };
  } finally {
    if (cleanup) {
      await rm(scratchDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

/**
 * Start a run: write RUN START, claim the run marker, and return once both are on disk. The work goes
 * on in the background (`done`), so video_pipeline_run answers well inside the proxy's 8 s limit.
 */
export async function startVideoRun(input: VideoRunInput, ctx: VideoRunContext): Promise<VideoRunHandle> {
  const now = ctx.now ?? (() => new Date());
  const runId = newRunId(now());
  const log = createRunLogger(ctx.logPath, runId, now);

  const unterminated = await findUnterminatedPreviousRun(ctx.logPath);
  const startedAt = now().toISOString();
  // video_pipeline_run reports the run as started once this line is written; status parses it.
  await log(`RUN START ${input.kind}=${input.source}`);
  await log("runner: Command Center built-in pipeline, inside Obsidian (videoBackend=builtin)");
  try {
    await claimCurrentRun(runId, ctx.markerPath);
  } catch (claimError) {
    await log(
      `warning: could not record this run as the current one (${
        claimError instanceof Error ? claimError.message : String(claimError)
      }); an older run will not know to stand down`
    );
  }
  if (unterminated) {
    await log(
      "warning: previous run never logged a terminal state. It was either killed, or it is still " +
        `alive and will stand down at its next check: ${unterminated.slice(25)}`
    );
  }
  return { runId, startedAt, input, done: executeRun(input, ctx, runId, log) };
}

/**
 * One built-in run at a time, owned by the plugin (not the bridge, which restarts with its settings).
 * A second dispatch while a run is going is refused rather than replacing it: replacing would throw
 * away the first video's work and race over Obsidian's active note.
 */
export class VideoPipelineController {
  private readonly contextFor: () => Omit<VideoRunContext, "signal">;
  private active: { handle: VideoRunHandle; abort: AbortController } | null = null;
  private starting = false;

  constructor(contextFor: () => Omit<VideoRunContext, "signal">) {
    this.contextFor = contextFor;
  }

  /** The run in progress, or null. */
  activeRun(): { runId: string; startedAt: string; kind: VideoRunInput["kind"]; source: string } | null {
    if (!this.active) return null;
    const { runId, startedAt, input } = this.active.handle;
    return { runId, startedAt, kind: input.kind, source: input.source };
  }

  /** Start a run, or throw VideoRunInProgressError when one is going. */
  async start(input: VideoRunInput): Promise<VideoRunHandle> {
    const current = this.activeRun();
    if (current || this.starting) {
      throw new VideoRunInProgressError(
        current
          ? `A built-in video pipeline run is in progress (run ${current.runId}, ${current.kind} ${current.source}). ` +
              "Poll video_pipeline_status and dispatch again once it has finished."
          : "A built-in video pipeline run is starting. Poll video_pipeline_status before dispatching again."
      );
    }
    this.starting = true;
    try {
      const abort = new AbortController();
      const handle = await startVideoRun(input, { ...this.contextFor(), signal: abort.signal });
      this.active = { handle, abort };
      void handle.done.finally(() => {
        if (this.active?.handle === handle) this.active = null;
      });
      return handle;
    } finally {
      this.starting = false;
    }
  }

  /** Stop the run in progress (the plugin is unloading): its transcriber is killed, and it logs RUN FAIL. */
  abort(reason: string): void {
    this.active?.abort.abort(reason);
  }
}
