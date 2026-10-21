import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  assertYtDlpArgsCookieFree,
  claimCurrentRun,
  claimLateCopilotSummary,
  isParakeetShimPath,
  normalizeSummaryFrontmatter,
  parseTranscriberReport,
  resolveTranscriberEngine,
  resolveTranscriptSource,
  SupersededRunError,
  supersedingRunId,
  sweepOrphanedCopilotContractNotes,
  waitForNewStableVideo,
  withRunId,
  writeGeneratedNote,
} from "@/tools/videoTranscribeFlow";

describe("writeGeneratedNote", () => {
  const tempRoot = path.join(os.tmpdir(), `video-transcribe-flow-${Date.now()}`);

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("writes markdown content directly into the vault path", async () => {
    const notePath = "Video Downloads/test-folder/source note.md";
    const content = "# Source Note\n\nGenerated locally.";

    await writeGeneratedNote(tempRoot, notePath, content);

    const written = await fs.readFile(path.join(tempRoot, ...notePath.split("/")), "utf-8");
    expect(written).toBe(content);
  });
});

// REGRESSION (2026-08-29): a run left TWO summaries in the vault — Copilot's headless note
// landed 7s after the lane's deadline, so the pipeline had already written a fallback summary
// and nothing ever reclaimed the late note. The invariant is exactly ONE summary note per run.
describe("claimLateCopilotSummary", () => {
  const tempRoot = path.join(os.tmpdir(), `claim-late-copilot-${Date.now()}`);
  const summaryNotePath = "Copilot Summaries/Lecture summary.md";
  const contractNoteAbsolute = path.join(tempRoot, "Copilot Summaries", "Lecture transcription — Super-Summarize.md");
  const summaryAbsolute = path.join(tempRoot, ...summaryNotePath.split("/"));

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  async function seedFallbackSummary() {
    await fs.mkdir(path.dirname(summaryAbsolute), { recursive: true });
    await fs.writeFile(summaryAbsolute, "fallback summary", "utf-8");
  }

  it("claims a late Copilot note over the fallback, leaving exactly one summary", async () => {
    await seedFallbackSummary();
    await fs.writeFile(contractNoteAbsolute, "copilot summary", "utf-8");

    const claimed = await claimLateCopilotSummary({
      vaultPath: tempRoot,
      contractNoteAbsolute,
      dispatchedAtMs: Date.now() - 60_000,
      summaryNotePath,
    });

    expect(claimed).toBe(true);
    expect(await fs.readFile(summaryAbsolute, "utf-8")).toBe("copilot summary");
    const remaining = await fs.readdir(path.join(tempRoot, "Copilot Summaries"));
    expect(remaining).toEqual(["Lecture summary.md"]);
  });

  it("leaves the fallback in place when Copilot never wrote a note", async () => {
    await seedFallbackSummary();

    const claimed = await claimLateCopilotSummary({
      vaultPath: tempRoot,
      contractNoteAbsolute,
      dispatchedAtMs: Date.now() - 60_000,
      summaryNotePath,
    });

    expect(claimed).toBe(false);
    expect(await fs.readFile(summaryAbsolute, "utf-8")).toBe("fallback summary");
  });

  it("ignores a stale contract note left by an earlier run", async () => {
    await seedFallbackSummary();
    await fs.writeFile(contractNoteAbsolute, "summary from a previous run", "utf-8");
    const staleMs = Date.now() - 3_600_000;
    await fs.utimes(contractNoteAbsolute, staleMs / 1000, staleMs / 1000);

    const claimed = await claimLateCopilotSummary({
      vaultPath: tempRoot,
      contractNoteAbsolute,
      dispatchedAtMs: Date.now(),
      summaryNotePath,
    });

    expect(claimed).toBe(false);
    expect(await fs.readFile(summaryAbsolute, "utf-8")).toBe("fallback summary");
  });
});

// REGRESSION (2026-08-29): raising the Copilot deadline only made a duplicate LESS LIKELY.
// This sweep is what makes "exactly one summary note per run" structural — it runs at the end
// of every run regardless of which summary lane won. Without coverage, deleting its call site
// would leave every other test green, so these tests are the thing keeping the invariant alive.
describe("sweepOrphanedCopilotContractNotes", () => {
  const tempRoot = path.join(os.tmpdir(), `sweep-copilot-contract-${Date.now()}`);
  const summariesDir = path.join(tempRoot, "Copilot Summaries");
  const sourceNotePath = "Video Downloads/Lecture transcription.md";
  const contractNote = path.join(summariesDir, "Lecture transcription — Super-Summarize.md");
  const summaryNote = path.join(summariesDir, "Lecture summary.md");

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  async function seedSummariesFolder() {
    await fs.mkdir(summariesDir, { recursive: true });
    await fs.writeFile(summaryNote, "the one real summary", "utf-8");
  }

  it("removes a contract note this run left behind, leaving only the summary", async () => {
    await seedSummariesFolder();
    await fs.writeFile(contractNote, "duplicate from the copilot lane", "utf-8");

    await sweepOrphanedCopilotContractNotes(tempRoot, sourceNotePath, Date.now() - 60_000);

    expect(await fs.readdir(summariesDir)).toEqual(["Lecture summary.md"]);
  });

  it("never touches the canonical summary note", async () => {
    await seedSummariesFolder();

    await sweepOrphanedCopilotContractNotes(tempRoot, sourceNotePath, Date.now() - 60_000);

    expect(await fs.readFile(summaryNote, "utf-8")).toBe("the one real summary");
  });

  it("leaves a contract note from an earlier run alone", async () => {
    await seedSummariesFolder();
    await fs.writeFile(contractNote, "older run's output", "utf-8");
    const staleMs = Date.now() - 3_600_000;
    await fs.utimes(contractNote, staleMs / 1000, staleMs / 1000);

    await sweepOrphanedCopilotContractNotes(tempRoot, sourceNotePath, Date.now());

    expect(await fs.readFile(contractNote, "utf-8")).toBe("older run's output");
  });

  it("resolves without throwing when the summaries folder does not exist", async () => {
    await expect(
      sweepOrphanedCopilotContractNotes(tempRoot, sourceNotePath, Date.now() - 60_000)
    ).resolves.toBeUndefined();
  });
});

// REGRESSION (2026-09-01): the two summary lanes disagreed on frontmatter — the Copilot lane
// titled from the source note so the title kept its " transcription" suffix, and the fallback
// lane left `source`/`created` empty. Normalising from the pipeline's own facts is what makes
// the lanes indistinguishable downstream, so a fallback run still lands the correct format.
describe("normalizeSummaryFrontmatter", () => {
  const tempRoot = path.join(os.tmpdir(), `normalize-frontmatter-${Date.now()}`);
  const summaryNotePath = "Copilot Summaries/Lecture summary.md";
  const summaryAbsolute = path.join(tempRoot, ...summaryNotePath.split("/"));
  const args = {
    vaultPath: tempRoot,
    summaryNotePath,
    title: "Add social media to your marketing mix | LinkedIn Learning",
    sourceUrl: "https://www.linkedin.com/learning/x/add-social-media?u=1",
    createdIso: "2026-09-01T11:46:50.847Z",
  };

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  async function writeNote(body: string) {
    await fs.mkdir(path.dirname(summaryAbsolute), { recursive: true });
    await fs.writeFile(summaryAbsolute, body, "utf-8");
  }

  it("strips the source note's ' transcription' suffix from the Copilot lane's title", async () => {
    await writeNote(
      `---\ntitle: Add social media to your marketing mix | LinkedIn Learning transcription\nsource: ${args.sourceUrl}\ncreated: 2026-09-01\ntags:\n  - summaries\n---\n\n## Keywords\n`
    );

    await normalizeSummaryFrontmatter(args);

    const written = await fs.readFile(summaryAbsolute, "utf-8");
    expect(written).toContain(`title: ${args.title}\n`);
    expect(written).not.toContain("transcription");
  });

  it("fills the source and created the fallback lane leaves empty", async () => {
    await writeNote(`---\ntitle: Lecture\nsource:\nauthor:\npublished:\ncreated:\ntags:\n  - summaries\n---\n\nbody\n`);

    await normalizeSummaryFrontmatter(args);

    const written = await fs.readFile(summaryAbsolute, "utf-8");
    expect(written).toContain(`source: ${args.sourceUrl}\n`);
    expect(written).toContain("created: 2026-09-01\n");
  });

  it("preserves the model's other keys and the note body", async () => {
    await writeNote(
      `---\ntitle: Lecture transcription\nsource:\nauthor:\npublished:\ncreated:\ndescription: A lecture about marketing\ntags:\n  - summaries\n---\n\n## Keywords\n- [[Marketing]]\n`
    );

    await normalizeSummaryFrontmatter(args);

    const written = await fs.readFile(summaryAbsolute, "utf-8");
    expect(written).toContain("description: A lecture about marketing\n");
    expect(written).toContain("tags:\n  - summaries\n");
    expect(written).toContain("## Keywords\n- [[Marketing]]\n");
  });

  it("leaves the existing source alone in local-file mode", async () => {
    await writeNote(`---\ntitle: Lecture transcription\nsource: keep-me\ncreated:\n---\n\nbody\n`);

    await normalizeSummaryFrontmatter({ ...args, sourceUrl: "" });

    expect(await fs.readFile(summaryAbsolute, "utf-8")).toContain("source: keep-me\n");
  });

  it("aligns the body H1 with the canonical title", async () => {
    await writeNote(
      `---\ntitle: Lecture transcription\ncreated:\n---\n\n## Keywords\n- [[Marketing]]\n\n# Add social media to your marketing mix | LinkedIn Learning transcription\n\n## 🧠 Core Concept\n`
    );

    await normalizeSummaryFrontmatter(args);

    const written = await fs.readFile(summaryAbsolute, "utf-8");
    expect(written).toContain(`# ${args.title}\n`);
    expect(written).not.toContain("transcription");
    expect(written).toContain("## 🧠 Core Concept\n");
  });

  it("leaves a note with no frontmatter block untouched", async () => {
    const body = "# Lecture\n\nNo frontmatter here.\n";
    await writeNote(body);

    await normalizeSummaryFrontmatter(args);

    expect(await fs.readFile(summaryAbsolute, "utf-8")).toBe(body);
  });
});

// The operator runs LinkedIn Learning videos whose subtitle sidecar lane has proven unreliable
// (foreign-language tracks, stale exports). `transcriptSource: whisper` forces the audio lane so
// the run never consults a sidecar; the default stays whisper-only, `auto` restores the old path.
describe("resolveTranscriptSource", () => {
  it("defaults to whisper-only when unset", () => {
    expect(resolveTranscriptSource({})).toBe("whisper");
  });

  it("returns whisper for the whisper value and any unknown value", () => {
    expect(resolveTranscriptSource({ transcriptSource: "whisper" })).toBe("whisper");
    expect(resolveTranscriptSource({ transcriptSource: "nonsense" })).toBe("whisper");
  });

  it("returns auto only for the explicit auto value", () => {
    expect(resolveTranscriptSource({ transcriptSource: "auto" })).toBe("auto");
    expect(resolveTranscriptSource({ transcriptSource: "  auto  " })).toBe("auto");
  });
});

// REGRESSION (2026-10-15): a re-dispatch left the first run alive in Downie's UGE wait. Both runs
// watched ~/Downloads, the first one took the file and succeeded, and the starved second run timed
// out 12 min later into the last resort, which unsealed a cookie jar with a YubiKey PIN + touch
// the operator could not account for. The run marker names the ONE run allowed to keep waiting.
// Every test here uses its own temp marker: the live one must never be touched by a test.
describe("one run at a time (run marker)", () => {
  const tempRoot = path.join(os.tmpdir(), `single-flight-${Date.now()}`);
  const marker = path.join(tempRoot, "current-run");
  const watchDir = path.join(tempRoot, "Downloads");

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("reports nothing newer when no marker exists yet", async () => {
    expect(await supersedingRunId("run-A", marker)).toBeNull();
  });

  it("reports nothing newer while the marker still names this run", async () => {
    await claimCurrentRun("run-A", marker);
    expect(await supersedingRunId("run-A", marker)).toBeNull();
  });

  it("names the run that claimed the marker after this one", async () => {
    await claimCurrentRun("run-A", marker);
    await claimCurrentRun("run-B", marker);
    expect(await supersedingRunId("run-A", marker)).toBe("run-B");
    expect(await supersedingRunId("run-B", marker)).toBeNull();
  });

  it("leaves no temp file behind after a claim (atomic rename)", async () => {
    await claimCurrentRun("run-A", marker);
    expect(await fs.readdir(tempRoot)).toEqual(["current-run"]);
  });

  it("stands a parked run down once a newer run claims the marker", async () => {
    await fs.mkdir(watchDir, { recursive: true });
    await claimCurrentRun("run-A", marker);
    const parked = withRunId("run-A", () => waitForNewStableVideo(watchDir, Date.now(), 60_000, marker));
    await claimCurrentRun("run-B", marker);

    const error = await parked.then(
      () => null,
      (rejection: unknown) => rejection
    );
    expect(error).toBeInstanceOf(SupersededRunError);
    expect((error as SupersededRunError).currentRunId).toBe("run-B");
  }, 15_000);

  it("times out with the ordinary error, not a stand-down, when nothing replaced it", async () => {
    await fs.mkdir(watchDir, { recursive: true });
    await claimCurrentRun("run-A", marker);
    const result = withRunId("run-A", () => waitForNewStableVideo(watchDir, Date.now(), 100, marker));

    await expect(result).rejects.toThrow(/No completed video appeared/);
  }, 15_000);
});

// The yt-dlp last resort is cookie-free by operator decision (2026-10-15): no sealed jar, no
// --cookies-from-browser loop. The guard fails LOUDLY on a re-added flag rather than stripping it.
describe("assertYtDlpArgsCookieFree", () => {
  it("passes ordinary args through unchanged, including URLs that merely mention cookies", () => {
    const args = ["--no-playlist", "--no-cookies-from-browser", "https://example.com/cookies-and-cream"];
    expect(assertYtDlpArgsCookieFree(args)).toEqual(args);
  });

  it.each([
    [["--cookies", "/tmp/jar.txt"]],
    [["--cookies-from-browser", "chrome"]],
    [["--cookies=/tmp/jar.txt"]],
    [["--cookies-from-browser=safari"]],
  ])("refuses a cookie source: %j", (cookieArgs) => {
    expect(() => assertYtDlpArgsCookieFree(["--no-playlist", ...cookieArgs])).toThrow(/cookie-free by operator/);
  });
});

describe("parseTranscriberReport", () => {
  // The exact line ~/.local/bin/whisper-parakeet-shim writes (its SELF-REPORT contract).
  const shimLine =
    "TRANSCRIBER engine=parakeet-mlx model=mlx-community/parakeet-tdt-0.6b-v3@ed2b7e8c task=transcribe " +
    "hub=offline ignored=--model=medium,--task=translate";

  it("extracts the adapter's report from mixed stderr", () => {
    const stderr = ["some library warning", shimLine, "Transcribing 1/1 ..."].join("\n");
    expect(parseTranscriberReport(stderr)).toBe(shimLine.slice("TRANSCRIBER ".length));
  });

  it("returns null when the binary does not self-report (plain whisper-ctranslate2)", () => {
    expect(parseTranscriberReport("Detected language: English\n[00:00.000 --> 00:02.000] hi\n")).toBeNull();
    expect(parseTranscriberReport("")).toBeNull();
  });

  it("uses the last report when several are present, and tolerates CRLF", () => {
    const stderr = "TRANSCRIBER engine=old\r\nTRANSCRIBER engine=new task=transcribe\r\n";
    expect(parseTranscriberReport(stderr)).toBe("engine=new task=transcribe");
  });

  it("does not match the prefix mid-line", () => {
    expect(parseTranscriberReport("note: TRANSCRIBER engine=fake\n")).toBeNull();
  });
});

// 2026-10-18: the Parakeet adapter used to be smuggled in through "Whisper Path", so the Whisper
// Model and Whisper Task settings were silently discarded (the adapter only transcribes). The two
// lanes are now separate preferences: Parakeet is the default primary lane, Whisper the fallback,
// and a shim path can never masquerade as a Whisper binary.
describe("resolveTranscriberEngine", () => {
  it("defaults to the Parakeet-first chain", () => {
    expect(resolveTranscriberEngine({})).toBe("parakeet");
  });

  it("returns whisper only for the explicit whisper value", () => {
    expect(resolveTranscriberEngine({ transcriber: "whisper" })).toBe("whisper");
    expect(resolveTranscriberEngine({ transcriber: "  whisper  " })).toBe("whisper");
  });

  it("treats an unknown value as the safe default", () => {
    expect(resolveTranscriberEngine({ transcriber: "parakeet" })).toBe("parakeet");
    expect(resolveTranscriberEngine({ transcriber: "nonsense" })).toBe("parakeet");
  });
});

describe("isParakeetShimPath", () => {
  it("recognises the adapter so it is never used as the Whisper lane", () => {
    expect(isParakeetShimPath("/Users/myhome/.local/bin/whisper-parakeet-shim")).toBe(true);
    expect(isParakeetShimPath("  ~/.local/bin/whisper-parakeet-shim  ")).toBe(true);
  });

  it("does not flag a real whisper-ctranslate2 binary", () => {
    expect(isParakeetShimPath("/Users/myhome/.local/venvs/fwhisper/bin/whisper-ctranslate2")).toBe(false);
    expect(isParakeetShimPath("/opt/homebrew/bin/whisper")).toBe(false);
  });

  it("treats an unset path as not-a-shim", () => {
    expect(isParakeetShimPath(undefined)).toBe(false);
    expect(isParakeetShimPath("")).toBe(false);
  });
});
