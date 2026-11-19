// Unit tests for src/bridge/video-pipeline-status.ts. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeVideoPipelineLog } from "../src/bridge/video-pipeline-status.ts";

const ENGINE =
  "engine=parakeet-mlx model=mlx-community/parakeet-tdt-0.6b-v3@ed2b7e8c task=transcribe " +
  "hub=offline ignored=--model=medium,--task=translate";
const REQUESTED = "binary=whisper-parakeet-shim task=translate model=medium";

// A full post-2026-10-15 run: the engine line sits well above the last 8 lines by the end.
function engineRun(id: string, title = "The activation bias | LinkedIn Learning"): string[] {
  const p = (t: string, msg: string) => `2026-10-15T12:${t}Z [run ${id}] ${msg}`;
  return [
    p("00:00.000", "RUN START url=https://www.linkedin.com/learning/x/the-activation-bias"),
    p("00:01.000", "downie UGE opened — SELECT the detected stream in Downie's window to start the download"),
    p("00:30.000", `downie UGE file detected: /Users/me/Downloads/${title}.mp4`),
    p("00:30.100", "audio transcription starting (transcript source=whisper)"),
    p("00:30.200", `transcription requested: ${REQUESTED}`),
    p("00:40.000", `transcription engine: ${ENGINE}`),
    p("00:40.100", "audio transcription OK"),
    p("00:40.200", `source note written: Video Downloads/${title} transcription.md`),
    p("00:40.300", `source note ingested by Obsidian: Video Downloads/${title} transcription.md`),
    p("00:40.400", `active file confirmed: Video Downloads/${title} transcription.md`),
    p("00:40.500", `copilot copilot:super-summarize-to-note dispatched (background) for: Video Downloads/${title} transcription.md`),
    p("01:00.000", `copilot summary detected: Copilot Summaries/${title} transcription — Super-Summarize.md`),
    p("01:00.100", `summary renamed to: Copilot Summaries/${title} summary.md`),
    p("01:00.200", `summary written via obsidian-copilot: Copilot Summaries/${title} summary.md`),
    p("01:00.300", "RUN SUCCESS"),
  ];
}

// A pre-2026-10-15 run: no run id, and only the old request line.
const legacyRun = [
  "2026-10-15T11:01:14.239Z RUN START url=https://www.linkedin.com/learning/x/weighing-the-connections",
  "2026-10-15T11:01:50.377Z whisper transcription starting (transcript source=whisper)",
  "2026-10-15T11:01:50.379Z whisper task=translate model=medium",
  "2026-10-15T11:02:00.407Z whisper transcription OK",
  "2026-10-15T11:02:21.694Z summary written via obsidian-copilot: Copilot Summaries/W summary.md",
  "2026-10-15T11:02:21.709Z RUN SUCCESS",
];

test("transcriber and transcriptionRequested come from the whole run, after the engine line has left recentLines", () => {
  const out = summarizeVideoPipelineLog(engineRun("r1").join("\n") + "\n") as any;
  assert.equal(out.status, "success");
  assert.equal(out.transcriber, ENGINE);
  assert.match(out.transcriber, /^engine=parakeet-mlx /);
  assert.equal(out.transcriptionRequested, REQUESTED);
  assert.equal(out.recentLines.length, 8);
  assert.ok(
    !out.recentLines.some((l: string) => l.includes("transcription engine:")),
    "the fixture must reproduce the scrolled-out engine line"
  );
  assert.match(out.summary, /summary written via obsidian-copilot/);
});

test("a run without either line omits both keys and keeps every other field", () => {
  const out = summarizeVideoPipelineLog(legacyRun.join("\n")) as any;
  assert.equal("transcriber" in out, false);
  assert.equal("transcriptionRequested" in out, false);
  assert.equal(out.status, "success");
  assert.equal(out.startedAt, "2026-10-15T11:01:14.239Z");
  assert.equal(out.videoUrl, "https://www.linkedin.com/learning/x/weighing-the-connections");
  assert.equal(out.latest, legacyRun[legacyRun.length - 1]);
  assert.deepEqual(out.recentLines, legacyRun);
});

test("only the latest run counts: an earlier run's engine line is not inherited", () => {
  const out = summarizeVideoPipelineLog([...engineRun("r1"), ...legacyRun].join("\n")) as any;
  assert.equal("transcriber" in out, false);
  assert.equal(out.startedAt, "2026-10-15T11:01:14.239Z");
});

test("a video title containing the marker is not mistaken for the engine", () => {
  const run = engineRun("r2", "Why the transcription engine: matters").filter(
    (l) => !l.includes("] transcription engine: ")
  );
  const out = summarizeVideoPipelineLog(run.join("\n")) as any;
  assert.equal("transcriber" in out, false);
  assert.equal(out.transcriptionRequested, REQUESTED);
});

test("an interleaved line from another live run is not attributed to the latest run", () => {
  const latest = engineRun("new").filter((l) => !l.includes("transcription "));
  const stray = "2026-10-15T12:00:35.000Z [run old] transcription engine: engine=other-run";
  latest.splice(4, 0, stray);
  const out = summarizeVideoPipelineLog(latest.join("\n")) as any;
  assert.equal("transcriber" in out, false);
});

test("the no-self-report form passes through verbatim, and a running run reports it before RUN SUCCESS", () => {
  const silent = "whisper-ctranslate2 (no self-report; ran with the requested settings above)";
  const run = engineRun("r3")
    .slice(0, 7)
    .map((l) => (l.includes("transcription engine: ") ? l.replace(ENGINE, silent) : l));
  const out = summarizeVideoPipelineLog(run.join("\n")) as any;
  assert.equal(out.status, "running");
  assert.equal(out.transcriber, silent);
});

test("a log with no RUN START is unknown", () => {
  const out = summarizeVideoPipelineLog("2026-10-15T12:00:00.000Z something\n") as any;
  assert.deepEqual(out, { status: "unknown", message: "Run log exists but contains no RUN START entry." });
});

// A folder run (2026-11-16) as the Raycast runner logs it, cut off after `upTo` lines.
const FOLDER = "/Users/me/Downloads/Course";
function folderRun(id: string, upTo?: number): string[] {
  const p = (t: string, msg: string) => `2026-11-16T10:${t}Z [run ${id}] ${msg}`;
  const lines = [
    p("00:00.000", `RUN START folder=${FOLDER}`),
    p("00:00.100", "folder mode: 4 video(s), 3 to transcribe, 1 skipped; one at a time, and the folder's own files are never moved or deleted"),
    p("00:00.200", `VIDEO 2/4 SKIPPED (summary already in the vault): ${FOLDER}/Talk (1).mp4`),
    p("00:00.300", `VIDEO 1/4 START: ${FOLDER}/Lesson 1.mp4`),
    p("00:20.000", `transcription engine: ${ENGINE}`),
    p("01:00.000", "summary written via obsidian-copilot: Copilot Summaries/Lesson 1 summary.md"),
    p("01:00.100", "VIDEO 1/4 DONE: Copilot Summaries/Lesson 1 summary.md"),
    p("01:00.200", `VIDEO 3/4 START: ${FOLDER}/Lesson 2.mp4`),
    "--- process output (video 3/4) ---",
    "fake-whisper: cannot decode",
    "--- end process output ---",
    p("01:10.000", "VIDEO 3/4 FAILED: fake-whisper: cannot decode"),
    p("01:10.100", `VIDEO 4/4 START: ${FOLDER}/Lesson 10 (RUN SUCCESS edition).mp4`),
    p("02:00.000", "VIDEO 4/4 DONE: Copilot Summaries/Lesson 10 (RUN SUCCESS edition) summary.md"),
    p("02:00.100", "RUN FAIL: folder run finished with failures (2 summarized, 1 failed, 1 skipped); first failure: Lesson 2.mp4: fake-whisper: cannot decode"),
  ];
  return upTo === undefined ? lines : lines.slice(0, upTo);
}

test("a folder run in progress reports its folder, its counts and the video being worked on", () => {
  const out = summarizeVideoPipelineLog(folderRun("f1", 8).join("\n")) as any;
  assert.equal(out.status, "running");
  assert.equal(out.folder, FOLDER);
  assert.equal("videoUrl" in out, false);
  assert.equal("summary" in out, false, "a folder has one summary per video, listed in batch.summaries");
  assert.deepEqual(out.batch, {
    total: 4,
    summarized: 1,
    failed: 0,
    skipped: 1,
    remaining: 2,
    current: { position: 3, video: `${FOLDER}/Lesson 2.mp4` },
    summaries: ["Copilot Summaries/Lesson 1 summary.md"],
    failures: [],
  });
  assert.equal(out.transcriber, ENGINE);
});

test("a finished folder run with one failure is failed, and names the video and the reason", () => {
  const out = summarizeVideoPipelineLog(folderRun("f2").join("\n")) as any;
  assert.equal(out.status, "failed");
  assert.deepEqual(out.batch, {
    total: 4,
    summarized: 2,
    failed: 1,
    skipped: 1,
    remaining: 0,
    summaries: [
      "Copilot Summaries/Lesson 1 summary.md",
      "Copilot Summaries/Lesson 10 (RUN SUCCESS edition) summary.md",
    ],
    failures: [{ video: `${FOLDER}/Lesson 2.mp4`, reason: "fake-whisper: cannot decode" }],
  });
});

test("a video title containing RUN SUCCESS does not end a folder run early", () => {
  const out = summarizeVideoPipelineLog(folderRun("f3", 13).join("\n")) as any;
  assert.equal(out.status, "running");
  assert.equal(out.batch.current.position, 4);
});

test("another live run's terminal line does not end the latest run", () => {
  const latest = folderRun("new", 8);
  latest.splice(5, 0, "2026-11-16T10:00:30.000Z [run old] RUN SUCCESS");
  const out = summarizeVideoPipelineLog(latest.join("\n")) as any;
  assert.equal(out.status, "running");
});

test("a local file run names its file and keeps the single-run fields", () => {
  const p = (t: string, msg: string) => `2026-11-16T11:${t}Z [run s1] ${msg}`;
  const run = [
    p("00:00.000", "RUN START file=/Users/me/Downloads/Talk.mp4"),
    p("00:00.100", "local file mode — skipping download"),
    p("01:00.000", "summary written via obsidian-copilot: Copilot Summaries/Talk summary.md"),
    p("01:00.100", "RUN SUCCESS"),
  ];
  const out = summarizeVideoPipelineLog(run.join("\n")) as any;
  assert.equal(out.status, "success");
  assert.equal(out.file, "/Users/me/Downloads/Talk.mp4");
  assert.equal("batch" in out, false);
  assert.match(out.summary, /Copilot Summaries\/Talk summary\.md$/);
});
