import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { claimLateCopilotSummary, writeGeneratedNote } from "@/tools/videoTranscribeFlow";

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
