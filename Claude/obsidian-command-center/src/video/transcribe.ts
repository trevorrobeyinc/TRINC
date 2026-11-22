// Subtitles first, then the transcriber: how a video becomes transcript text. Ported on 2026-11-19
// from the Raycast extension's videoTranscribeFlow.ts (findSubtitleSidecars, srtToPlainText,
// isLatinScriptTranscript, parseTranscriberReport, runTranscriber, transcribeAudio and the
// subtitle-or-audio choice at the top of transcribeAndSummarize).
//
// Security posture ("not an exec primitive", the same stance as video_pipeline_run): the binaries are
// FIXED, absolute candidate paths in this file, never a setting, because a setting lives in the
// vault's data.json and the vault is writable by agents. Arguments are an argv array (execFile, no
// shell), and the only caller-derived argument is the video path, which the bridge has already
// canonicalized to an absolute path of an existing video file (src/bridge/video-pipeline-source.ts).
// The model and task settings are checked against fixed lists, so a tampered setting cannot become a
// flag either.
//
// Pure: Node builtins only (the process runner is injectable), tested by test/video-transcribe.test.ts.

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile } from "node:fs/promises";
import * as path from "node:path";
import type { RunLogger } from "./run-log.ts";

// ─── Settings ────────────────────────────────────────────────────────────────────────────────────

/** The transcription settings, as stored (data.json values are untrusted strings). */
export interface TranscriberSettings {
  /** "parakeet" (default: Parakeet first, Whisper as fallback) or "whisper" (Whisper only). */
  transcriber?: string;
  /** Whisper's --model; one of WHISPER_MODELS. */
  whisperModel?: string;
  /** Whisper's --task; "translate" (default) or "transcribe". */
  whisperTask?: string;
  /** "whisper" (default: always transcribe the audio) or "auto" (a usable subtitle file first). */
  transcriptSource?: string;
}

// Parakeet MLX is the primary lane (about 4x faster than whisper-ctranslate2 on this host at equivalent
// accuracy). It is reached through ~/.local/bin/whisper-parakeet-shim, which also pins the model to a
// local snapshot and forces HF_HUB_OFFLINE, keeping a run egress-free.
export const PARAKEET_PATH_CANDIDATES = ["/Users/myhome/.local/bin/whisper-parakeet-shim"] as const;
// Whisper fallback, faster-whisper's venv first (the Raycast runner's default). openai-whisper was
// retired 2026-07-15; its paths stay as last-ditch candidates, harmless when absent.
export const WHISPER_PATH_CANDIDATES = [
  "/Users/myhome/.local/venvs/fwhisper/bin/whisper-ctranslate2",
  "/opt/homebrew/bin/whisper-ctranslate2",
  "/opt/homebrew/bin/whisper",
  "/usr/local/bin/whisper",
] as const;
// The shim accepts whisper-ctranslate2's flags and then DISCARDS --model and --task, so it must never
// stand in for the Whisper lane (the Raycast runner's 2026-10-18 fix).
const PARAKEET_SHIM_BASENAME = "whisper-parakeet-shim";

export const WHISPER_MODELS = ["tiny", "base", "small", "medium", "large-v3"] as const;
const DEFAULT_WHISPER_MODEL = "medium";

/**
 * Whisper's task: `translate` (X→English) by default, because the Whisper lane is what a run falls
 * back to when a subtitle file is rejected for its language, and the point of that rejection is an
 * English transcript. `transcribe` keeps the audio's own language.
 */
export function resolveWhisperTask(settings: TranscriberSettings): "translate" | "transcribe" {
  return settings.whisperTask?.trim() === "transcribe" ? "transcribe" : "translate";
}

/** Whisper's model, from the fixed list; anything else is the default ("medium"). */
export function resolveWhisperModel(settings: TranscriberSettings): string {
  const wanted = settings.whisperModel?.trim() ?? "";
  return (WHISPER_MODELS as readonly string[]).includes(wanted) ? wanted : DEFAULT_WHISPER_MODEL;
}

/** `whisper` (the default) never consults a subtitle file; `auto` prefers a usable one. */
export function resolveTranscriptSource(settings: TranscriberSettings): "whisper" | "auto" {
  return settings.transcriptSource?.trim() === "auto" ? "auto" : "whisper";
}

/** Which chain runs: Parakeet first (the default), or Whisper alone. */
export function resolveTranscriberEngine(settings: TranscriberSettings): "parakeet" | "whisper" {
  return settings.transcriber?.trim() === "whisper" ? "whisper" : "parakeet";
}

/** True when a path is the Parakeet adapter rather than a real Whisper binary. */
export function isParakeetShimPath(candidate: string | undefined): boolean {
  if (!candidate) return false;
  return path.basename(candidate.trim()) === PARAKEET_SHIM_BASENAME;
}

/** The first candidate that exists, or a clear error naming every path that was tried. */
export function resolveBinaryOrThrow(
  lane: "parakeet" | "whisper",
  candidates: readonly string[],
  exists: (candidate: string) => boolean = existsSync
): string {
  const usable = candidates.filter((candidate) => lane === "parakeet" || !isParakeetShimPath(candidate));
  const found = usable.find((candidate) => exists(candidate));
  if (found) {
    return found;
  }
  throw new Error(
    `${lane === "parakeet" ? "Parakeet adapter" : "Whisper executable"} not found. Tried: ${usable.join(", ")}`
  );
}

// ─── Process plumbing ────────────────────────────────────────────────────────────────────────────

/** Runs one binary with an argv array. Rejects like execFile: with `stdout`/`stderr` on the error. */
export type ExecFn = (
  file: string,
  args: readonly string[],
  options: { env: Record<string, string | undefined>; maxBuffer: number; timeout: number; signal?: AbortSignal }
) => Promise<{ stdout: string; stderr: string }>;

export const execFileAsync: ExecFn = (file, args, options) =>
  new Promise((resolve, reject) => {
    execFile(file, [...args], options, (error, stdout, stderr) => {
      if (error) {
        Object.assign(error, { stdout: String(stdout ?? ""), stderr: String(stderr ?? "") });
        reject(error);
      } else {
        resolve({ stdout: String(stdout ?? ""), stderr: String(stderr ?? "") });
      }
    });
  });

// Obsidian launched from Finder inherits a minimal PATH; the shim needs Homebrew's tools.
const DEFAULT_EXEC_PATH_ENTRIES = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"];

export function buildExecPath(value: string | undefined): string {
  const entries = (value || "")
    .split(":")
    .map((entry) => entry.trim())
    .filter(Boolean);
  for (const required of DEFAULT_EXEC_PATH_ENTRIES) {
    if (!entries.includes(required)) entries.push(required);
  }
  return entries.join(":");
}

function createExecEnv(): Record<string, string | undefined> {
  return { ...process.env, PATH: buildExecPath(process.env.PATH) };
}

// A transcriber that hangs would hold the single built-in run forever. Four hours covers Whisper
// medium on a long lecture; Parakeet takes minutes.
export const TRANSCRIBER_TIMEOUT_MS = 4 * 60 * 60 * 1000;

interface ProcessError extends Error {
  stdout?: string | Buffer;
  stderr?: string | Buffer;
}

function toText(value: string | Buffer | undefined): string {
  if (typeof value === "string") return value;
  if (Buffer.isBuffer(value)) return value.toString("utf-8");
  return "";
}

/** A failed process's stderr, else its stdout, else "". */
export function extractProcessErrorText(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const processError = error as ProcessError;
  return toText(processError.stderr).trim() || toText(processError.stdout).trim();
}

/** One line for the run log: the last 4 lines of a process's output, else the error message. */
export function describeVideoError(error: unknown): string {
  const processText = extractProcessErrorText(error);
  if (processText) {
    const compact = processText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-4)
      .join(" | ");
    if (compact) return compact;
  }
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

// ─── Subtitles ───────────────────────────────────────────────────────────────────────────────────

/** Subtitle files next to the video: English-tagged ones first, then any `<base>.*.srt`. */
export async function findSubtitleSidecars(videoFilePath: string): Promise<string[]> {
  const videoDir = path.dirname(videoFilePath);
  const videoBase = path.basename(videoFilePath, path.extname(videoFilePath));
  const preferred = [
    `${videoBase}.en.srt`,
    `${videoBase}.en-US.srt`,
    `${videoBase}.en-GB.srt`,
    `${videoBase}.en-orig.srt`,
    `${videoBase}.srt`,
  ]
    .map((name) => path.join(videoDir, name))
    .filter((candidate) => existsSync(candidate));
  if (preferred.length > 0) {
    return preferred;
  }
  const siblings = await readdir(videoDir);
  return siblings
    .filter((name) => name.startsWith(`${videoBase}.`) && name.toLowerCase().endsWith(".srt"))
    .map((name) => path.join(videoDir, name))
    .sort((left, right) => left.localeCompare(right));
}

/** SRT to plain text: cue numbers and timing lines dropped. */
export function srtToPlainText(srtContent: string): string {
  return srtContent
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      if (/^\d+$/.test(trimmed)) return false;
      if (/^\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,.]\d{3}$/.test(trimmed)) return false;
      return true;
    })
    .join("\n")
    .trim();
}

export function normalizeExtractedText(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

/**
 * Minimum share of a transcript's letters that must be Latin-script for a subtitle file to be
 * accepted. Nothing pins a subtitle file's LANGUAGE, and a foreign-language track once produced an
 * English summary whose quotes stayed Arabic (2026-08-17); rejecting it sends the run to the audio.
 */
const MIN_LATIN_LETTER_RATIO = 0.6;

export function isLatinScriptTranscript(value: string): boolean {
  let latinLetters = 0;
  let totalLetters = 0;
  for (const character of value) {
    if (!/\p{L}/u.test(character)) continue;
    totalLetters += 1;
    if (/\p{Script=Latin}/u.test(character)) latinLetters += 1;
  }
  // No letters at all is not a script problem; the empty-transcript check handles it.
  if (totalLetters === 0) return true;
  return latinLetters / totalLetters >= MIN_LATIN_LETTER_RATIO;
}

// ─── The transcriber ─────────────────────────────────────────────────────────────────────────────

const TRANSCRIBER_REPORT_PREFIX = "TRANSCRIBER ";

/**
 * The transcriber's own account of what it ran, from its stderr: the shim writes one
 * `TRANSCRIBER key=value ...` line (the last one wins). Null when the binary is silent, as a real
 * whisper-ctranslate2 is.
 */
export function parseTranscriberReport(stderr: string): string | null {
  const line = stderr
    .split(/\r?\n/)
    .reverse()
    .find((candidate) => candidate.startsWith(TRANSCRIBER_REPORT_PREFIX));
  const report = line?.slice(TRANSCRIBER_REPORT_PREFIX.length).trim();
  return report ? report : null;
}

/** What the transcriber functions need besides the video and the settings. */
export interface TranscribeContext {
  log: RunLogger;
  exec?: ExecFn;
  exists?: (candidate: string) => boolean;
  /** Candidate overrides, for tests only; production always uses the fixed lists above. */
  binaries?: { parakeet: readonly string[]; whisper: readonly string[] };
  signal?: AbortSignal;
}

/**
 * Run ONE transcription binary and return its text. Both lanes take whisper-ctranslate2's CLI
 * surface (the shim translates it), so the same argv drives either engine.
 */
export async function runTranscriber(
  videoFilePath: string,
  binaryPath: string,
  settings: TranscriberSettings,
  outputDir: string,
  lane: "parakeet" | "whisper",
  ctx: TranscribeContext
): Promise<string> {
  const model = resolveWhisperModel(settings);
  const task = resolveWhisperTask(settings);
  const exec = ctx.exec ?? execFileAsync;
  await mkdir(outputDir, { recursive: true });

  // "requested", not "ran": the shim discards --model and --task. Anything reading the run log must
  // report the engine from the "transcription engine:" line.
  await ctx.log(
    `transcription requested (${lane}): binary=${path.basename(binaryPath)} task=${task} model=${model}`
  );
  const { stderr } = await exec(
    binaryPath,
    [videoFilePath, "--model", model, "--task", task, "--output_format", "txt", "--output_dir", outputDir],
    { env: createExecEnv(), maxBuffer: 64 * 1024 * 1024, timeout: TRANSCRIBER_TIMEOUT_MS, signal: ctx.signal }
  );
  const report = parseTranscriberReport(String(stderr ?? ""));
  await ctx.log(
    report
      ? `transcription engine: ${report}`
      : `transcription engine: ${path.basename(binaryPath)} (no self-report; ran with the requested settings above)`
  );

  const expected = path.join(outputDir, `${path.basename(videoFilePath, path.extname(videoFilePath))}.txt`);
  if (existsSync(expected)) {
    const text = (await readFile(expected, "utf-8")).trim();
    if (text) return text;
  }
  // Any .txt in the output folder. Safe only because every video gets its own folder.
  for (const name of (await readdir(outputDir)).filter((n) => n.toLowerCase().endsWith(".txt"))) {
    const text = (await readFile(path.join(outputDir, name), "utf-8")).trim();
    if (text) return text;
  }
  throw new Error(
    `${lane === "parakeet" ? "Parakeet" : "Whisper"} completed but no transcript text file was produced.`
  );
}

/**
 * The audio chain: Parakeet first, Whisper as the fallback. A Parakeet failure (missing snapshot,
 * adapter error, empty output) is logged and handed to Whisper instead of failing the run; an abort
 * (the plugin unloading) is not, and ends the run.
 */
export async function transcribeAudio(
  videoFilePath: string,
  settings: TranscriberSettings,
  tempDir: string,
  ctx: TranscribeContext
): Promise<string> {
  const candidates = ctx.binaries ?? { parakeet: PARAKEET_PATH_CANDIDATES, whisper: WHISPER_PATH_CANDIDATES };
  if (resolveTranscriberEngine(settings) === "parakeet") {
    try {
      const binary = resolveBinaryOrThrow("parakeet", candidates.parakeet, ctx.exists);
      return await runTranscriber(videoFilePath, binary, settings, path.join(tempDir, "parakeet-output"), "parakeet", ctx);
    } catch (error) {
      if (ctx.signal?.aborted) throw error;
      await ctx.log(`parakeet lane FAILED (${describeVideoError(error)}) — falling back to Whisper`);
    }
  }
  const binary = resolveBinaryOrThrow("whisper", candidates.whisper, ctx.exists);
  return await runTranscriber(videoFilePath, binary, settings, path.join(tempDir, "whisper-output"), "whisper", ctx);
}

/** Fail fast, before any work: the primary lane's binary must exist. */
export function assertPrimaryTranscriberPresent(settings: TranscriberSettings, ctx: TranscribeContext): void {
  const candidates = ctx.binaries ?? { parakeet: PARAKEET_PATH_CANDIDATES, whisper: WHISPER_PATH_CANDIDATES };
  const lane = resolveTranscriberEngine(settings);
  resolveBinaryOrThrow(lane, lane === "parakeet" ? candidates.parakeet : candidates.whisper, ctx.exists);
}

/**
 * A video's transcript: a usable English subtitle file when the source setting is `auto`, otherwise
 * (or when there is none) the audio through the transcriber chain.
 *
 * @param workDir This video's own scratch folder. The transcriber falls back to ANY .txt in its
 *   output folder, so a shared folder could hand a video the transcript of the one before it.
 */
export async function obtainTranscript(
  videoFile: string,
  settings: TranscriberSettings,
  workDir: string,
  ctx: TranscribeContext
): Promise<{ text: string; from: "subtitles" | "audio" }> {
  const source = resolveTranscriptSource(settings);
  let text = "";
  if (source === "whisper") {
    await ctx.log("transcript source=whisper — skipping subtitle sidecar probe");
  } else {
    const subtitleFiles = await findSubtitleSidecars(videoFile);
    if (subtitleFiles.length > 0) {
      const subtitleText = normalizeExtractedText(srtToPlainText(await readFile(subtitleFiles[0], "utf-8")));
      if (subtitleText && !isLatinScriptTranscript(subtitleText)) {
        await ctx.log(
          `subtitle sidecar is not Latin-script (${path.basename(subtitleFiles[0])}) — ` +
            `discarding it so the audio is transcribed instead`
        );
      } else if (subtitleText) {
        text = subtitleText;
        await ctx.log(`transcript from subtitles (${subtitleFiles.length} sidecar(s))`);
        return { text, from: "subtitles" };
      }
    }
  }

  await ctx.log(
    source === "whisper"
      ? "audio transcription starting (transcript source=whisper)"
      : "no usable subtitles — audio transcription fallback starting"
  );
  await mkdir(workDir, { recursive: true });
  text = normalizeExtractedText(await transcribeAudio(videoFile, settings, workDir, ctx));
  await ctx.log("audio transcription OK");
  return { text, from: "audio" };
}
