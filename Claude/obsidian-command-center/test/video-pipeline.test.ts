// Whole runs of src/video/pipeline.ts. Run: npm test
//
// Ported 2026-11-19 from the Raycast extension's src/tests/videoFolderRun.spec.ts (folder mode end to
// end), plus what the built-in pipeline adds: a failed summary ends the run and keeps the transcription
// note (no paid fallback), a downloaded video inside the vault's video download folder is deleted after
// its summary (operator decision 2026-11-19), one run at a time, abort on unload, and standing down.
//
// Obsidian is a fake over a temp folder: notes are real files, Copilot's headless command writes its
// contract note from the active note's text. The transcriber is a fake process runner and the clock is
// virtual, so a 180 s summary timeout takes no time. Every run gets its own log and marker files.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { summarizeVideoPipelineLog } from "../src/bridge/video-pipeline-status.ts";
import type { Clock } from "../src/video/copilot-summary.ts";
import {
  previewVideoRun,
  startVideoRun,
  VideoPipelineController,
  VideoRunInProgressError,
  type VideoPipelineSettings,
  type VideoRunContext,
  type VideoRunInput,
  type VideoRunOutcome,
  type VideoVaultHost,
} from "../src/video/pipeline.ts";
import { claimCurrentRun } from "../src/video/run-log.ts";
import type { ExecFn } from "../src/video/transcribe.ts";

const SUPER = "copilot:super-summarize-to-note";

interface World {
  root: string;
  vault: string;
  /** A folder of videos outside the vault, like a course in ~/Movies. */
  outside: string;
  /** The vault's video download folder, where the download script saves. */
  downloads: string;
  logPath: string;
  markerPath: string;
  /** Every video the fake transcriber was handed, in order. */
  calls: string[];
  copilot: { mode: "write" | "silent" };
  host: VideoVaultHost;
  clock: Clock;
  exec: ExecFn;
  ctx(settings?: VideoPipelineSettings, extra?: Partial<VideoRunContext>): VideoRunContext;
}

async function makeWorld(): Promise<World> {
  // Canonical, as the bridge's realpathSync makes every source (on macOS the temp folder is a symlink).
  const root = realpathSync(await mkdtemp(join(tmpdir(), "cc-video-pipeline-")));
  const vault = join(root, "vault");
  await mkdir(join(vault, "Video Downloads"), { recursive: true });
  await mkdir(join(root, "outside batch"), { recursive: true });
  let now = Date.now();
  const clock: Clock = { now: () => now, sleep: async (ms) => void (now += ms) };
  const mtimes = new Map<string, number>();
  const inVault = (notePath: string) => join(vault, ...notePath.split("/"));
  const calls: string[] = [];
  const copilot = { mode: "write" as "write" | "silent" };
  let active: string | null = null;

  const host: VideoVaultHost = {
    vaultPath: vault,
    configDir: ".obsidian",
    writeNote: async (notePath, content) => {
      await mkdir(dirname(inVault(notePath)), { recursive: true });
      await writeFile(inVault(notePath), content, "utf-8");
      mtimes.set(notePath, clock.now());
    },
    processNote: async (notePath, fn) => {
      if (!existsSync(inVault(notePath))) return false;
      await writeFile(inVault(notePath), fn(await readFile(inVault(notePath), "utf-8")), "utf-8");
      mtimes.set(notePath, clock.now());
      return true;
    },
    readIndexedNote: async (notePath) => readFile(inVault(notePath), "utf-8").catch(() => null),
    openNoteAsActive: async (notePath) => {
      if (!existsSync(inVault(notePath))) throw new Error(`not in the index: ${notePath}`);
      active = notePath;
    },
    activeNotePath: () => active,
    // Copilot's headless Super-Summarize: summarizes the ACTIVE note into its contract note.
    executeCommand: (commandId) => {
      if (commandId !== SUPER) return false;
      if (copilot.mode === "silent" || !active) return true;
      const source = active;
      const base = basename(source, ".md");
      const contract = `Copilot Summaries/${base} — Super-Summarize.md`;
      const transcript = readFileSync(inVault(source), "utf-8");
      const spokenBy = transcript.match(/spoken words of ([^\n]+)\./)?.[1] ?? "(no transcript)";
      mkdirSync(dirname(inVault(contract)), { recursive: true });
      writeFileSync(inVault(contract), `---\ntitle: ${base}\n---\n# ${base}\n\nSummary of the words of ${spokenBy}.\n`);
      mtimes.set(contract, clock.now());
      return true;
    },
    noteMtimeMs: (notePath) => (existsSync(inVault(notePath)) ? (mtimes.get(notePath) ?? statSync(inVault(notePath)).mtimeMs) : null),
    replaceNote: async (from, to) => {
      if (existsSync(inVault(to))) {
        await mkdir(join(root, "trash"), { recursive: true });
        await rename(inVault(to), join(root, "trash", `${Date.now()}-${basename(to)}`));
      }
      await mkdir(dirname(inVault(to)), { recursive: true });
      await rename(inVault(from), inVault(to));
      mtimes.set(to, mtimes.get(from) ?? clock.now());
      mtimes.delete(from);
    },
    showNote: async () => undefined,
    listFolder: (folderPath) => {
      const dir = inVault(folderPath);
      if (!existsSync(dir)) return [];
      return readdirSync(dir)
        .filter((name) => statSync(join(dir, name)).isFile())
        .map((name) => {
          const notePath = `${folderPath}/${name}`;
          return { path: notePath, name, mtimeMs: mtimes.get(notePath) ?? statSync(join(dir, name)).mtimeMs };
        });
    },
    deleteNote: async (notePath) => {
      await rm(inVault(notePath), { force: true });
      mtimes.delete(notePath);
    },
  };

  // Stands in for the transcriber: writes "<video name>.txt" into --output_dir and fails like a real
  // decoder on any video with "broken" in its name. "odd-name" gets its text under another file name,
  // which sends the pipeline to its any-.txt-in-the-folder fallback.
  const exec: ExecFn = async (_file, args) => {
    const video = args[0];
    const out = args[args.indexOf("--output_dir") + 1];
    const base = basename(video).replace(/\.[^.]+$/, "");
    calls.push(video);
    if (base.includes("broken")) {
      throw Object.assign(new Error(`Command failed: ${video}`), { stderr: `fake-whisper: cannot decode ${video}\n` });
    }
    const name = base.includes("odd-name") ? "zz-output.txt" : `${base}.txt`;
    await writeFile(join(out, name), `These are the spoken words of ${base}.\n`);
    return { stdout: "", stderr: "" };
  };

  const world: World = {
    root,
    vault,
    outside: join(root, "outside batch"),
    downloads: join(vault, "Video Downloads"),
    logPath: join(root, "video-transcribe.log"),
    markerPath: join(root, "current-run"),
    calls,
    copilot,
    host,
    clock,
    exec,
    ctx: (settings = {}, extra = {}) => ({
      host,
      settings: { transcriber: "whisper", ...settings },
      logPath: world.logPath,
      markerPath: world.markerPath,
      scratchRoot: join(root, "scratch"),
      exec,
      binaries: { parakeet: ["/fake/bin/whisper-parakeet-shim"], whisper: ["/fake/bin/whisper-ctranslate2"] },
      binaryExists: () => true,
      clock,
      ...extra,
    }),
  };
  return world;
}

async function inWorld(fn: (world: World) => Promise<void>): Promise<void> {
  const world = await makeWorld();
  try {
    await fn(world);
  } finally {
    await rm(world.root, { recursive: true, force: true });
  }
}

async function addFile(dir: string, name: string): Promise<string> {
  const full = join(dir, name);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, "not really a video");
  return full;
}

async function run(world: World, input: VideoRunInput, settings?: VideoPipelineSettings, extra?: Partial<VideoRunContext>): Promise<VideoRunOutcome> {
  return (await startVideoRun(input, world.ctx(settings, extra))).done;
}

/** The run log's messages, without the "<time> [run <id>] " prefix. */
async function logMessages(world: World): Promise<string[]> {
  const text = await readFile(world.logPath, "utf-8").catch(() => "");
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => line.match(/^\S+ \[run [^\]]+\] (.*)$/)?.[1] ?? line);
}

const inVault = (world: World, notePath: string) => join(world.vault, ...notePath.split("/"));

test("folder mode transcribes every video directly inside the folder, in order, and keeps the folder's own files", () =>
  inWorld(async (world) => {
    const lesson2 = await addFile(world.outside, "Lesson 2 - Basics.mkv");
    const lesson10 = await addFile(world.outside, "Lesson 10 - Wrap up.mp4");
    const leftAlone = [
      await addFile(world.outside, "._Lesson 2 - Basics.mkv"),
      await addFile(world.outside, ".hidden.mp4"),
      await addFile(world.outside, "notes.txt"),
      await addFile(world.outside, "half.mp4.part"),
      await addFile(world.outside, "subfolder/Lesson 3.mp4"),
    ];

    const outcome = await run(world, { kind: "folder", source: world.outside });

    assert.equal(outcome.status, "success");
    assert.deepEqual(
      outcome.status === "success" && outcome.kind === "folder" ? outcome.batch.outcomes.map((o) => [basename(o.video), o.status]) : null,
      [["Lesson 2 - Basics.mkv", "summarized"], ["Lesson 10 - Wrap up.mp4", "summarized"]]
    );
    assert.deepEqual(world.calls, [lesson2, lesson10]);
    for (const title of ["Lesson 2 - Basics", "Lesson 10 - Wrap up"]) {
      const summary = await readFile(inVault(world, `Copilot Summaries/${title} summary.md`), "utf-8");
      assert.ok(summary.includes(`title: ${title}\n`), summary);
      assert.ok(summary.includes(`# ${title}\n`), summary);
      assert.equal(existsSync(inVault(world, `Video Downloads/${title} transcription.md`)), false);
      assert.equal(existsSync(inVault(world, `Video Downloads/.transcripts/${title}.txt`)), false);
    }
    for (const kept of [lesson2, lesson10, ...leftAlone]) {
      assert.equal(existsSync(kept), true, kept);
    }
    assert.deepEqual(await readdir(join(world.vault, "Copilot Summaries")), ["Lesson 10 - Wrap up summary.md", "Lesson 2 - Basics summary.md"]);

    const messages = await logMessages(world);
    assert.equal(messages[0], `RUN START folder=${world.outside}`);
    assert.ok(messages.includes("folder mode: 2 video(s), 2 to transcribe, 0 skipped; one at a time, and the folder's own files are never moved or deleted"));
    assert.deepEqual(messages.filter((m) => /^(VIDEO|RUN SUCCESS)/.test(m)), [
      `VIDEO 1/2 START: ${lesson2}`,
      "VIDEO 1/2 DONE: Copilot Summaries/Lesson 2 - Basics summary.md",
      `VIDEO 2/2 START: ${lesson10}`,
      "VIDEO 2/2 DONE: Copilot Summaries/Lesson 10 - Wrap up summary.md",
      "RUN SUCCESS folder: 2 summarized, 0 failed, 0 skipped",
    ]);
    // The status tool reads a built-in run exactly as it reads a Raycast one.
    const status = summarizeVideoPipelineLog(await readFile(world.logPath, "utf-8"));
    assert.equal(status.status, "success");
    assert.deepEqual((status.batch as { summarized: number; remaining: number }).summarized, 2);
    assert.equal(status.summaryError, undefined);
  }));

test("running the same folder again skips what is already summarized", () =>
  inWorld(async (world) => {
    await addFile(world.outside, "Lesson 1.mp4");
    await run(world, { kind: "folder", source: world.outside });
    const added = await addFile(world.outside, "Lesson 2.mp4");
    world.calls.length = 0;

    await run(world, { kind: "folder", source: world.outside });

    assert.deepEqual(world.calls, [added]);
    const messages = await logMessages(world);
    assert.ok(messages.includes(`VIDEO 1/2 SKIPPED (summary already in the vault): ${join(world.outside, "Lesson 1.mp4")}`));
    assert.equal(messages.at(-1), "RUN SUCCESS folder: 1 summarized, 0 failed, 1 skipped");
  }));

test("one failed video does not stop the others, and the run ends failed naming it", () =>
  inWorld(async (world) => {
    const intro = await addFile(world.outside, "Intro.mp4");
    const broken = await addFile(world.outside, "zz broken take.mp4");

    const outcome = await run(world, { kind: "folder", source: world.outside });

    assert.equal(outcome.status, "failed");
    assert.match(
      outcome.status === "failed" ? outcome.error : "",
      /^folder run finished with failures \(1 summarized, 1 failed, 0 skipped\); first failure: zz broken take\.mp4: fake-whisper: cannot decode /
    );
    assert.equal(existsSync(inVault(world, "Copilot Summaries/Intro summary.md")), true);
    assert.equal(existsSync(intro), true);
    assert.equal(existsSync(broken), true);
    const messages = await logMessages(world);
    assert.ok(messages.includes(`VIDEO 2/2 FAILED: fake-whisper: cannot decode ${broken}`));
    assert.ok(messages.some((m) => m.startsWith("RUN FAIL: folder run")));
  }));

test("every video gets its own transcriber folder, so none is summarized from another's transcript", () =>
  inWorld(async (world) => {
    await addFile(world.outside, "A first.mp4");
    await addFile(world.outside, "B odd-name.mp4");
    // With cleanup off, video A's transcript is still in its scratch folder when video B runs.
    await run(world, { kind: "folder", source: world.outside }, { cleanupAfterSummary: false });
    const summary = await readFile(inVault(world, "Copilot Summaries/B odd-name summary.md"), "utf-8");
    assert.ok(summary.includes("Summary of the words of B odd-name."), summary);
    // Cleanup off: the transcription notes stay, and the log says so.
    assert.equal(existsSync(inVault(world, "Video Downloads/A first transcription.md")), true);
    assert.ok((await logMessages(world)).includes("transcript note kept: Video Downloads/A first transcription.md"));
  }));

test("a folder with no videos directly inside it is refused", () =>
  inWorld(async (world) => {
    await addFile(world.outside, "notes.txt");
    await addFile(world.outside, "subfolder/deeper.mp4");
    const outcome = await run(world, { kind: "folder", source: world.outside });
    assert.deepEqual(outcome, {
      status: "failed",
      error: `No videos (.mp4, .mkv, .webm, .mov, .m4v) directly inside ${world.outside}. Subfolders are not searched.`,
    });
    assert.deepEqual(world.calls, []);
    assert.match((await logMessages(world)).at(-1) ?? "", /^RUN FAIL: No videos/);
  }));

test("a single local file gives one summary, and a video outside the download folder stays", () =>
  inWorld(async (world) => {
    const solo = await addFile(world.outside, "Solo talk.mp4");
    const outcome = await run(world, { kind: "file", source: solo });
    assert.deepEqual(outcome, { status: "success", kind: "file", summaryNotePath: "Copilot Summaries/Solo talk summary.md" });
    assert.equal(existsSync(inVault(world, "Copilot Summaries/Solo talk summary.md")), true);
    assert.equal(existsSync(inVault(world, "Video Downloads/Solo talk transcription.md")), false); // cleaned up
    assert.equal(existsSync(solo), true);
    const messages = await logMessages(world);
    assert.equal(messages[0], `RUN START file=${solo}`);
    assert.ok(messages.includes("local file mode — skipping download"));
    assert.ok(messages.includes("summary written via obsidian-copilot: Copilot Summaries/Solo talk summary.md"));
    assert.equal(messages.at(-1), "RUN SUCCESS");
    assert.equal(existsSync(join(world.root, "scratch", "command-center-video")) ? (await readdir(join(world.root, "scratch", "command-center-video"))).length : 0, 0);
  }));

test("a failed summary ends the run, keeps the transcription note and the video, and runs no fallback", () =>
  inWorld(async (world) => {
    world.copilot.mode = "silent"; // Copilot never writes its note
    const video = await addFile(world.downloads, "Solo talk.mp4");

    const outcome = await run(world, { kind: "file", source: video });

    const contract = "Copilot Summaries/Solo talk transcription — Super-Summarize.md";
    const kept = "Video Downloads/Solo talk transcription.md";
    assert.equal(outcome.status, "failed");
    assert.equal(
      outcome.status === "failed" ? outcome.error : "",
      `Copilot summary lane failed (Copilot summary did not appear within 180s: ${contract}); the transcription note is kept for the agent: ${kept}`
    );
    assert.equal(existsSync(inVault(world, kept)), true);
    assert.equal(existsSync(inVault(world, "Video Downloads/.transcripts/Solo talk.txt")), true);
    assert.equal(existsSync(inVault(world, "Copilot Summaries/Solo talk summary.md")), false);
    assert.equal(existsSync(video), true, "nothing is deleted after a failure");

    const status = summarizeVideoPipelineLog(await readFile(world.logPath, "utf-8"));
    assert.equal(status.status, "failed");
    assert.equal(status.summaryError, `Copilot summary did not appear within 180s: ${contract}`);
    assert.equal(status.transcriptNote, kept);
    assert.equal(status.summary, undefined);
  }));

test("a downloaded video inside the video download folder is deleted with its companions after its summary", () =>
  inWorld(async (world) => {
    const video = await addFile(world.downloads, "Talk 1.mp4");
    const companions = [await addFile(world.downloads, "Talk 1.en.vtt"), await addFile(world.downloads, "Talk 1.info.json")];
    const unrelated = [await addFile(world.downloads, "Talk 10.mp4"), await addFile(world.downloads, "Talk 1 notes.txt")];

    const outcome = await run(world, { kind: "file", source: video });

    assert.equal(outcome.status, "success");
    for (const gone of [video, ...companions]) assert.equal(existsSync(gone), false, gone);
    for (const kept of unrelated) assert.equal(existsSync(kept), true, kept);
    const removal = (await logMessages(world)).find((m) => m.startsWith("downloaded video removed after its summary"));
    assert.match(removal ?? "", /^downloaded video removed after its summary \(3 file\(s\)\): /);
  }));

test("with cleanup off, a downloaded video stays even inside the video download folder", () =>
  inWorld(async (world) => {
    const video = await addFile(world.downloads, "Talk 1.mp4");
    const outcome = await run(world, { kind: "file", source: video }, { cleanupAfterSummary: false });
    assert.equal(outcome.status, "success");
    assert.equal(existsSync(video), true);
  }));

test("a course folder inside the video download folder loses each video once its summary lands", () =>
  inWorld(async (world) => {
    const course = join(world.downloads, "Course");
    const lesson1 = await addFile(course, "Lesson 1.mp4");
    const broken = await addFile(course, "Lesson 2 broken.mp4");

    const outcome = await run(world, { kind: "folder", source: course });

    assert.equal(outcome.status, "failed");
    assert.equal(existsSync(lesson1), false);
    assert.equal(existsSync(broken), true, "a failed video is kept");
    assert.ok(
      (await logMessages(world)).includes(
        "folder mode: 2 video(s), 2 to transcribe, 0 skipped; one at a time, and each summarized video is deleted afterwards (the folder is inside Video Downloads)"
      )
    );
  }));

test("a run another run replaces stands down before its summary, and says so", () =>
  inWorld(async (world) => {
    const solo = await addFile(world.outside, "Solo talk.mp4");
    const exec: ExecFn = async (file, args, options) => {
      await claimCurrentRun("run-other", world.markerPath); // a Raycast run took over mid-transcription
      return world.exec(file, args, options);
    };
    const outcome = await run(world, { kind: "file", source: solo }, {}, { exec });
    assert.deepEqual(outcome, { status: "superseded", by: "run-other" });
    assert.equal(existsSync(inVault(world, "Video Downloads/Solo talk transcription.md")), false);
    assert.equal((await logMessages(world)).at(-1), "RUN SUPERSEDED: superseded by run run-other; standing down, that run owns the pipeline");
  }));

// A stand-down is not a summary failure: reporting summaryError would have the agent write a summary
// for a video another run now owns.
test("a run replaced while its summary is pending stands down without reporting a summary error", () =>
  inWorld(async (world) => {
    world.copilot.mode = "silent";
    const solo = await addFile(world.outside, "Solo talk.mp4");
    // The first sleep of this run is the summary wait's first poll: a Raycast run claims the marker then.
    const clock: Clock = {
      now: world.clock.now,
      sleep: async (ms) => {
        await claimCurrentRun("run-raycast", world.markerPath);
        await world.clock.sleep(ms);
      },
    };
    const outcome = await run(world, { kind: "file", source: solo }, {}, { clock });
    assert.deepEqual(outcome, { status: "superseded", by: "run-raycast" });
    const messages = await logMessages(world);
    assert.ok(messages.some((m) => m.startsWith("copilot copilot:super-summarize-to-note dispatched")));
    assert.equal(messages.some((m) => m.startsWith("summary error:") || m.startsWith("transcript note kept:")), false);
    assert.equal(summarizeVideoPipelineLog(await readFile(world.logPath, "utf-8")).summaryError, undefined);
  }));

test("an abort while the summary is pending ends the run failed with the reason, not a summary error", () =>
  inWorld(async (world) => {
    world.copilot.mode = "silent";
    const solo = await addFile(world.outside, "Solo talk.mp4");
    let controller: VideoPipelineController | null = null;
    const clock: Clock = {
      now: world.clock.now,
      sleep: async (ms) => {
        controller?.abort("Command Center was unloaded");
        await world.clock.sleep(ms);
      },
    };
    controller = new VideoPipelineController(() => world.ctx({}, { clock }));
    const handle = await controller.start({ kind: "file", source: solo });
    assert.deepEqual(await handle.done, { status: "failed", error: "Command Center was unloaded" });
    const messages = await logMessages(world);
    assert.equal(messages.some((m) => m.startsWith("summary error:")), false);
    assert.equal(messages.at(-1), "RUN FAIL: Command Center was unloaded");
  }));

test("a missing transcriber fails the run at once, before any work", () =>
  inWorld(async (world) => {
    const solo = await addFile(world.outside, "Solo talk.mp4");
    const outcome = await run(world, { kind: "file", source: solo }, {}, { binaryExists: () => false });
    assert.deepEqual(outcome, { status: "failed", error: "Whisper executable not found. Tried: /fake/bin/whisper-ctranslate2" });
    assert.deepEqual(world.calls, []);
  }));

test("a run leaves a breadcrumb about a previous run that never ended", () =>
  inWorld(async (world) => {
    await writeFile(world.logPath, "2026-11-19T00:00:00.000Z [run old] RUN START url=https://example.com/v\n");
    const solo = await addFile(world.outside, "Solo talk.mp4");
    await run(world, { kind: "file", source: solo });
    const messages = await logMessages(world);
    assert.ok(
      messages.includes(
        "warning: previous run never logged a terminal state. It was either killed, or it is still alive and will stand down at its next check: [run old] RUN START url=https://example.com/v"
      ),
      messages.join("\n")
    );
  }));

test("the controller refuses a second run while one is going, and takes one again afterwards", () =>
  inWorld(async (world) => {
    const first = await addFile(world.outside, "First.mp4");
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const exec: ExecFn = async (file, args, options) => {
      await gate;
      return world.exec(file, args, options);
    };
    const controller = new VideoPipelineController(() => world.ctx({}, { exec }));

    const handle = await controller.start({ kind: "file", source: first });
    assert.equal(controller.activeRun()?.runId, handle.runId);
    await assert.rejects(controller.start({ kind: "folder", source: world.outside }), VideoRunInProgressError);

    release();
    assert.equal((await handle.done).status, "success");
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(controller.activeRun(), null);
    const again = await controller.start({ kind: "file", source: first });
    assert.equal((await again.done).status, "success");
  }));

test("aborting (the plugin unloading) kills the transcriber and ends the run failed with the reason", () =>
  inWorld(async (world) => {
    const solo = await addFile(world.outside, "Solo talk.mp4");
    let signalled: AbortSignal | undefined;
    const exec: ExecFn = (_file, _args, options) =>
      new Promise((_resolve, reject) => {
        signalled = options.signal;
        options.signal?.addEventListener("abort", () =>
          reject(Object.assign(new Error("The operation was aborted"), { name: "AbortError" }))
        );
      });
    const controller = new VideoPipelineController(() => world.ctx({}, { exec }));
    const handle = await controller.start({ kind: "file", source: solo });
    while (!signalled) await new Promise((resolve) => setImmediate(resolve));

    controller.abort("Command Center was unloaded");

    assert.deepEqual(await handle.done, { status: "failed", error: "Command Center was unloaded" });
    assert.equal(signalled.aborted, true);
    assert.equal((await logMessages(world)).at(-1), "RUN FAIL: Command Center was unloaded");
  }));

// Phase 4 (2026-11-20): the download script writes `<base>.url` beside each video it saves, and the
// pipeline uses that URL where the Raycast runner used the link it downloaded.
const LESSON_URL = "https://www.linkedin.com/learning/networking-foundations/what-is-a-network";
const shortcut = (url: string) => `[InternetShortcut]\r\nURL=${url}\r\n`;

test("previewVideoRun says what a run would do without doing any of it, source URLs included", () =>
  inWorld(async (world) => {
    await addFile(world.outside, "Lesson 1.mp4");
    await addFile(world.outside, "Lesson 2.mp4");
    await writeFile(join(world.outside, "Lesson 2.url"), shortcut(LESSON_URL));
    await mkdir(join(world.vault, "Copilot Summaries"), { recursive: true });
    await writeFile(join(world.vault, "Copilot Summaries", "Lesson 1 summary.md"), "done before");
    assert.deepEqual(await previewVideoRun({ kind: "folder", source: world.outside }, {}, world.vault), {
      toTranscribe: 1,
      videos: [{ video: "Lesson 2.mp4", summaryNote: "Copilot Summaries/Lesson 2 summary.md", sourceUrl: LESSON_URL }],
      skipped: [{ video: "Lesson 1.mp4", reason: "summary already in the vault" }],
      deletesVideosAfterSummary: false,
    });
    const download = await addFile(world.downloads, "Talk: part 1.mp4");
    assert.deepEqual(await previewVideoRun({ kind: "file", source: download }, {}, world.vault), {
      summaryNote: "Copilot Summaries/Talk - part 1 summary.md",
      sourceUrl: null,
      deletesVideoAfterSummary: true,
    });
    // A single file's dry run proves the .url read, without a live run.
    const lesson = await addFile(world.downloads, "What is a network.mp4");
    await writeFile(join(world.downloads, "What is a network.url"), shortcut(LESSON_URL));
    assert.deepEqual(await previewVideoRun({ kind: "file", source: lesson }, {}, world.vault), {
      summaryNote: "Copilot Summaries/What is a network summary.md",
      sourceUrl: LESSON_URL,
      deletesVideoAfterSummary: true,
    });
    assert.deepEqual(world.calls, []);
    assert.equal(existsSync(world.logPath), false);
  }));

test("a downloaded video's .url becomes the summary's source and goes with the video", () =>
  inWorld(async (world) => {
    const video = await addFile(world.downloads, "What is a network.mp4");
    await writeFile(join(world.downloads, "What is a network.url"), shortcut(LESSON_URL));

    const outcome = await run(world, { kind: "file", source: video });

    assert.equal(outcome.status, "success");
    const summary = await readFile(inVault(world, "Copilot Summaries/What is a network summary.md"), "utf-8");
    assert.ok(summary.includes(`\nsource: ${LESSON_URL}\n`), summary);
    assert.equal(existsSync(video), false);
    assert.equal(existsSync(join(world.downloads, "What is a network.url")), false, "the .url goes with the video");
    const messages = await logMessages(world);
    assert.ok(messages.includes(`source URL from What is a network.url: ${LESSON_URL}`));
    assert.match(messages.find((m) => m.startsWith("downloaded video removed")) ?? "", /\(2 file\(s\)\)/);
  }));

test("the transcription note names the page as its Source URL and still links the file", () =>
  inWorld(async (world) => {
    const video = await addFile(world.outside, "Talk.mp4");
    await writeFile(join(world.outside, "Talk.url"), shortcut(LESSON_URL));
    await run(world, { kind: "file", source: video }, { cleanupAfterSummary: false });
    const note = await readFile(inVault(world, "Video Downloads/Talk transcription.md"), "utf-8");
    assert.ok(note.includes(`- **Source URL**: ${LESSON_URL}\n`), note);
    assert.ok(note.includes(`- **Source Video**: [Talk.mp4](file://${encodeURI(video)})\n`), note);
  }));

test("a generic title is named from the .url, and folder mode then skips that video on the next run", () =>
  inWorld(async (world) => {
    const video = await addFile(world.outside, "Videoplayer-2026-11-20T10-12-29-703Z.mp4");
    await writeFile(join(world.outside, "Videoplayer-2026-11-20T10-12-29-703Z.url"), shortcut("https://www.example.com/course/organizational_behavior"));

    await run(world, { kind: "folder", source: world.outside });
    assert.equal(existsSync(inVault(world, "Copilot Summaries/organizational behavior summary.md")), true);

    world.calls.length = 0;
    await run(world, { kind: "folder", source: world.outside });
    assert.deepEqual(world.calls, [], "the planner must name the summary from the same .url the run used");
    assert.ok((await logMessages(world)).includes(`VIDEO 1/1 SKIPPED (summary already in the vault): ${video}`));
  }));

test("a symlinked .url is ignored in a run: no source, one log line, and the run still succeeds", () =>
  inWorld(async (world) => {
    const video = await addFile(world.outside, "Talk.mp4");
    await writeFile(join(world.root, "planted.url"), shortcut("https://evil.example/"));
    await symlink(join(world.root, "planted.url"), join(world.outside, "Talk.url"));
    const outcome = await run(world, { kind: "file", source: video });
    assert.equal(outcome.status, "success");
    const summary = await readFile(inVault(world, "Copilot Summaries/Talk summary.md"), "utf-8");
    assert.equal(summary.includes("evil.example"), false);
    assert.ok((await logMessages(world)).includes("no source URL: Talk.url is a symbolic link, which is ignored"));
  }));

test("the download script's run stamp stays out of the summary's name and title", () =>
  inWorld(async (world) => {
    const video = await addFile(world.downloads, "Subnetting basics-2026-11-20T10-12-29-703Z.mp4");
    const outcome = await run(world, { kind: "file", source: video });
    assert.deepEqual(outcome, { status: "success", kind: "file", summaryNotePath: "Copilot Summaries/Subnetting basics summary.md" });
    const summary = await readFile(inVault(world, "Copilot Summaries/Subnetting basics summary.md"), "utf-8");
    assert.ok(summary.includes("title: Subnetting basics\n"), summary);
  }));
