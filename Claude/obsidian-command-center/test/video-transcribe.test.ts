// Unit tests for src/video/transcribe.ts. Run: npm test
// The settings and report cases are ported 2026-11-19 from the Raycast extension's
// src/tests/videoTranscribeFlow.spec.ts. The process runner is a fake: no test spawns a binary.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildExecPath,
  describeVideoError,
  isLatinScriptTranscript,
  isParakeetShimPath,
  obtainTranscript,
  parseTranscriberReport,
  resolveBinaryOrThrow,
  resolveTranscriberEngine,
  resolveTranscriptSource,
  resolveWhisperModel,
  resolveWhisperTask,
  runTranscriber,
  srtToPlainText,
  transcribeAudio,
  type ExecFn,
} from "../src/video/transcribe.ts";

const SHIM = "/fixed/bin/whisper-parakeet-shim";
const WHISPER = "/fixed/venv/bin/whisper-ctranslate2";
const BINARIES = { parakeet: [SHIM], whisper: [WHISPER] };
const SHIM_REPORT =
  "TRANSCRIBER engine=parakeet-mlx model=mlx-community/parakeet-tdt-0.6b-v3@ed2b7e8c task=transcribe " +
  "hub=offline ignored=--model=medium,--task=translate";

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "cc-video-transcribe-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** A transcriber stand-in: writes "<video base>.txt" into --output_dir, records every call. */
function fakeExec(behaviour: { failBinaries?: string[]; outputName?: string; stderr?: string } = {}) {
  const calls: Array<{ file: string; args: readonly string[]; timeout: number }> = [];
  const exec: ExecFn = async (file, args, options) => {
    calls.push({ file, args, timeout: options.timeout });
    if (behaviour.failBinaries?.includes(file)) {
      throw Object.assign(new Error(`Command failed: ${file}`), { stderr: "model snapshot missing\n" });
    }
    const video = args[0];
    const outDir = args[args.indexOf("--output_dir") + 1];
    const base = video.slice(video.lastIndexOf("/") + 1).replace(/\.[^.]+$/, "");
    await writeFile(join(outDir, behaviour.outputName ?? `${base}.txt`), `spoken words of ${base}\n`);
    return { stdout: "", stderr: behaviour.stderr ?? "" };
  };
  return { exec, calls };
}

function recorder() {
  const lines: string[] = [];
  return { lines, log: async (line: string) => void lines.push(line) };
}

test("resolveTranscriptSource: whisper-only by default and for unknown values, auto only when asked", () => {
  assert.equal(resolveTranscriptSource({}), "whisper");
  assert.equal(resolveTranscriptSource({ transcriptSource: "nonsense" }), "whisper");
  assert.equal(resolveTranscriptSource({ transcriptSource: "  auto  " }), "auto");
});

test("resolveTranscriberEngine: Parakeet first by default, Whisper only for the explicit value", () => {
  assert.equal(resolveTranscriberEngine({}), "parakeet");
  assert.equal(resolveTranscriberEngine({ transcriber: "nonsense" }), "parakeet");
  assert.equal(resolveTranscriberEngine({ transcriber: "  whisper  " }), "whisper");
});

test("model and task come from fixed lists, so a tampered setting cannot become a flag", () => {
  assert.equal(resolveWhisperModel({}), "medium");
  assert.equal(resolveWhisperModel({ whisperModel: "large-v3" }), "large-v3");
  assert.equal(resolveWhisperModel({ whisperModel: "--output_dir=/tmp/x" }), "medium");
  assert.equal(resolveWhisperTask({}), "translate");
  assert.equal(resolveWhisperTask({ whisperTask: "transcribe" }), "transcribe");
  assert.equal(resolveWhisperTask({ whisperTask: "--anything" }), "translate");
});

test("isParakeetShimPath recognises the adapter and nothing else", () => {
  assert.equal(isParakeetShimPath("/Users/myhome/.local/bin/whisper-parakeet-shim"), true);
  assert.equal(isParakeetShimPath("  ~/.local/bin/whisper-parakeet-shim  "), true);
  assert.equal(isParakeetShimPath("/Users/myhome/.local/venvs/fwhisper/bin/whisper-ctranslate2"), false);
  assert.equal(isParakeetShimPath(undefined), false);
  assert.equal(isParakeetShimPath(""), false);
});

test("resolveBinaryOrThrow never lets the shim stand in for Whisper, and names what it tried", () => {
  assert.equal(resolveBinaryOrThrow("whisper", [SHIM, WHISPER], () => true), WHISPER);
  assert.equal(resolveBinaryOrThrow("parakeet", [SHIM], () => true), SHIM);
  assert.throws(() => resolveBinaryOrThrow("whisper", [SHIM, WHISPER], () => false), {
    message: `Whisper executable not found. Tried: ${WHISPER}`,
  });
});

test("parseTranscriberReport extracts the shim's self-report, the last one, at line start only", () => {
  assert.equal(parseTranscriberReport(["library warning", SHIM_REPORT, "Transcribing 1/1"].join("\n")), SHIM_REPORT.slice(12));
  assert.equal(parseTranscriberReport("Detected language: English\n"), null);
  assert.equal(parseTranscriberReport(""), null);
  assert.equal(parseTranscriberReport("TRANSCRIBER engine=old\r\nTRANSCRIBER engine=new task=transcribe\r\n"), "engine=new task=transcribe");
  assert.equal(parseTranscriberReport("note: TRANSCRIBER engine=fake\n"), null);
});

test("srtToPlainText drops cue numbers and timings; isLatinScriptTranscript rejects a foreign script", () => {
  const srt = "1\r\n00:00:00,000 --> 00:00:02,000\r\nHello there\r\n\r\n2\r\n00:00:02.000 --> 00:00:04.000\r\nGeneral Kenobi\r\n";
  assert.equal(srtToPlainText(srt), "Hello there\nGeneral Kenobi");
  assert.equal(isLatinScriptTranscript("Hello there, General Kenobi"), true);
  assert.equal(isLatinScriptTranscript("مرحبا بكم في الدورة"), false);
  assert.equal(isLatinScriptTranscript("1234 --> 5678"), true); // no letters: not a script problem
});

test("buildExecPath adds Homebrew and the system folders that a Finder-launched Obsidian lacks", () => {
  assert.equal(buildExecPath("/usr/bin:/bin"), "/usr/bin:/bin:/opt/homebrew/bin:/usr/local/bin:/usr/sbin:/sbin");
});

test("describeVideoError keeps the last 4 lines of a process's stderr", () => {
  const error = Object.assign(new Error("Command failed"), { stderr: "a\nb\nc\nd\ne\n" });
  assert.equal(describeVideoError(error), "b | c | d | e");
  assert.equal(describeVideoError(new Error("plain")), "plain");
});

test("runTranscriber runs the fixed binary with an argv array and reads its transcript", () =>
  withTempDir(async (dir) => {
    const { exec, calls } = fakeExec({ stderr: `${SHIM_REPORT}\n` });
    const { lines, log } = recorder();
    // Shell metacharacters in the name stay one argv element: there is no shell to read them.
    const video = "/Users/me/Movies/Q&A; part $1 (draft).mp4";
    const text = await runTranscriber(video, SHIM, {}, join(dir, "out"), "parakeet", { log, exec });
    assert.equal(text, "spoken words of Q&A; part $1 (draft)");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].file, SHIM);
    assert.deepEqual(calls[0].args, [video, "--model", "medium", "--task", "translate", "--output_format", "txt", "--output_dir", join(dir, "out")]);
    assert.ok(calls[0].timeout > 0, "a hung transcriber must not hold the run forever");
    assert.deepEqual(lines, [
      "transcription requested (parakeet): binary=whisper-parakeet-shim task=translate model=medium",
      `transcription engine: ${SHIM_REPORT.slice(12)}`,
    ]);
  }));

test("runTranscriber falls back to any .txt in its own output folder", () =>
  withTempDir(async (dir) => {
    const { exec } = fakeExec({ outputName: "zz-output.txt" });
    const { log } = recorder();
    assert.equal(await runTranscriber("/v/odd-name.mp4", WHISPER, {}, join(dir, "out"), "whisper", { log, exec }), "spoken words of odd-name");
  }));

test("transcribeAudio hands a failed Parakeet lane to Whisper, and logs why", () =>
  withTempDir(async (dir) => {
    const { exec, calls } = fakeExec({ failBinaries: [SHIM] });
    const { lines, log } = recorder();
    const text = await transcribeAudio("/v/Talk.mp4", {}, dir, { log, exec, binaries: BINARIES, exists: () => true });
    assert.equal(text, "spoken words of Talk");
    assert.deepEqual(calls.map((c) => c.file), [SHIM, WHISPER]);
    assert.ok(lines.includes("parakeet lane FAILED (model snapshot missing) — falling back to Whisper"), lines.join("\n"));
  }));

test("transcribeAudio never runs Parakeet when the setting is Whisper only", () =>
  withTempDir(async (dir) => {
    const { exec, calls } = fakeExec();
    const { log } = recorder();
    await transcribeAudio("/v/Talk.mp4", { transcriber: "whisper" }, dir, { log, exec, binaries: BINARIES, exists: () => true });
    assert.deepEqual(calls.map((c) => c.file), [WHISPER]);
  }));

test("transcribeAudio does not fall back to Whisper once the run has been aborted", () =>
  withTempDir(async (dir) => {
    const abort = new AbortController();
    const { log } = recorder();
    const calls: string[] = [];
    const exec: ExecFn = async (file) => {
      calls.push(file);
      abort.abort("plugin unloading");
      throw Object.assign(new Error("The operation was aborted"), { name: "AbortError" });
    };
    await assert.rejects(
      transcribeAudio("/v/Talk.mp4", {}, dir, { log, exec, binaries: BINARIES, exists: () => true, signal: abort.signal }),
      /aborted/
    );
    assert.deepEqual(calls, [SHIM]);
  }));

test("obtainTranscript skips the subtitle probe in the default whisper mode", () =>
  withTempDir(async (dir) => {
    const video = join(dir, "Talk.mp4");
    await writeFile(join(dir, "Talk.en.srt"), "1\n00:00:00,000 --> 00:00:01,000\nfrom the subtitles\n");
    const { exec, calls } = fakeExec();
    const { lines, log } = recorder();
    const result = await obtainTranscript(video, {}, join(dir, "work"), { log, exec, binaries: BINARIES, exists: () => true });
    assert.deepEqual(result, { text: "spoken words of Talk", from: "audio" });
    assert.equal(calls.length, 1);
    assert.equal(lines[0], "transcript source=whisper — skipping subtitle sidecar probe");
    assert.ok(lines.includes("audio transcription starting (transcript source=whisper)"));
    assert.equal(lines.at(-1), "audio transcription OK");
  }));

test("obtainTranscript in auto mode uses an English subtitle file and never runs the transcriber", () =>
  withTempDir(async (dir) => {
    const video = join(dir, "Talk.mp4");
    await writeFile(join(dir, "Talk.en.srt"), "1\n00:00:00,000 --> 00:00:01,000\nfrom the subtitles\n");
    const { exec, calls } = fakeExec();
    const { lines, log } = recorder();
    const result = await obtainTranscript(video, { transcriptSource: "auto" }, join(dir, "work"), { log, exec, binaries: BINARIES, exists: () => true });
    assert.deepEqual(result, { text: "from the subtitles", from: "subtitles" });
    assert.equal(calls.length, 0);
    assert.deepEqual(lines, ["transcript from subtitles (1 sidecar(s))"]);
  }));

test("obtainTranscript in auto mode discards a non-Latin subtitle file and transcribes the audio", () =>
  withTempDir(async (dir) => {
    const video = join(dir, "Talk.mp4");
    await mkdir(join(dir, "work"), { recursive: true });
    await writeFile(join(dir, "Talk.srt"), "1\n00:00:00,000 --> 00:00:01,000\nمرحبا بكم في الدورة\n");
    const { exec } = fakeExec();
    const { lines, log } = recorder();
    const result = await obtainTranscript(video, { transcriptSource: "auto" }, join(dir, "work"), { log, exec, binaries: BINARIES, exists: () => true });
    assert.equal(result.from, "audio");
    assert.ok(lines.includes("subtitle sidecar is not Latin-script (Talk.srt) — discarding it so the audio is transcribed instead"));
    assert.ok(lines.includes("no usable subtitles — audio transcription fallback starting"));
    assert.equal((await readFile(join(dir, "Talk.srt"), "utf-8")).length > 0, true); // the subtitle file is left alone
  }));
