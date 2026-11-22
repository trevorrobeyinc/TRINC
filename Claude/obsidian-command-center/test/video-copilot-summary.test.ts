// Unit tests for src/video/copilot-summary.ts. Run: npm test
// The orphan-sweep cases are ported 2026-11-19 from the Raycast extension's
// src/tests/videoTranscribeFlow.spec.ts; the lane itself runs against a fake Obsidian and a fake clock.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  contractNotePathFor,
  CopilotSummaryError,
  readCopilotCommandNoteFolder,
  runCopilotSummary,
  sweepOrphanedCopilotContractNotes,
  type Clock,
  type SummaryHost,
} from "../src/video/copilot-summary.ts";

const SOURCE = "Video Downloads/Lecture transcription.md";
const SUMMARY = "Copilot Summaries/Lecture summary.md";
const SUPER_CONTRACT = "Copilot Summaries/Lecture transcription — Super-Summarize.md";

/** A clock that only moves when the lane sleeps. */
function fakeClock(start = 1_000_000): Clock & { slept: number[] } {
  let now = start;
  const slept: number[] = [];
  return {
    slept,
    now: () => now,
    sleep: async (ms) => {
      slept.push(ms);
      now += ms;
    },
  };
}

interface FakeNote {
  content: string;
  mtimeMs: number;
}

/**
 * An in-memory Obsidian. `copilot` says what the Super-Summarize / Summarize commands do when run:
 * write their contract note at once, after N polls, or never.
 */
function fakeObsidian(clock: Clock, options: { registered?: string[]; writeAfterPolls?: number; activeSequence?: Array<string | null> } = {}) {
  const notes = new Map<string, FakeNote>();
  const events: string[] = [];
  let active: string | null = null;
  let pendingContract: { path: string; pollsLeft: number } | null = null;
  const activeSequence = options.activeSequence ? [...options.activeSequence] : null;
  const registered = options.registered ?? ["copilot:super-summarize-to-note", "copilot:summarize-to-note"];
  const write = (path: string, content: string) => notes.set(path, { content, mtimeMs: clock.now() });

  const host: SummaryHost = {
    readIndexedNote: async (path) => notes.get(path)?.content ?? null,
    openNoteAsActive: async (path) => {
      events.push(`open-active ${path}`);
      active = path;
    },
    activeNotePath: () => (activeSequence && activeSequence.length > 0 ? (activeSequence.shift() ?? null) : active),
    executeCommand: (id) => {
      events.push(`command ${id}`);
      if (!registered.includes(id)) return false;
      const title = id === "copilot:super-summarize-to-note" ? "Super-Summarize" : "Summarize";
      const path = contractNotePathFor("Copilot Summaries", SOURCE, title);
      if (options.writeAfterPolls === undefined) write(path, `---\ntitle: Lecture transcription\n---\nsummary by ${title}`);
      else if (Number.isFinite(options.writeAfterPolls)) pendingContract = { path, pollsLeft: options.writeAfterPolls };
      return true;
    },
    noteMtimeMs: (path) => {
      if (pendingContract && pendingContract.path === path && pendingContract.pollsLeft-- <= 0) {
        write(path, "late but in time");
        pendingContract = null;
      }
      return notes.get(path)?.mtimeMs ?? null;
    },
    replaceNote: async (from, to) => {
      events.push(`replace ${from} -> ${to}`);
      const note = notes.get(from);
      if (!note) throw new Error(`no note ${from}`);
      notes.delete(from);
      notes.set(to, note);
    },
    showNote: async (path) => void events.push(`show ${path}`),
    listFolder: (folder) =>
      [...notes.entries()]
        .filter(([path]) => path.startsWith(`${folder}/`) && !path.slice(folder.length + 1).includes("/"))
        .map(([path, note]) => ({ path, name: path.slice(folder.length + 1), mtimeMs: note.mtimeMs })),
    deleteNote: async (path) => {
      events.push(`delete ${path}`);
      notes.delete(path);
    },
  };
  return { host, notes, events, write };
}

function recorder() {
  const lines: string[] = [];
  return { lines, log: async (line: string) => void lines.push(line) };
}

test("the lane opens the note as the active one, dispatches Super-Summarize and renames its note", async () => {
  const clock = fakeClock();
  const obsidian = fakeObsidian(clock, { writeAfterPolls: 2 });
  obsidian.write(SOURCE, "# Lecture transcription\n\nwords");
  const { lines, log } = recorder();

  const result = await runCopilotSummary({ host: obsidian.host, log, sourceNotePath: SOURCE, summaryNotePath: SUMMARY, copilotFolder: "Copilot Summaries", clock });

  assert.deepEqual(result, { commandId: "copilot:super-summarize-to-note", contractNotePath: SUPER_CONTRACT });
  assert.equal(obsidian.notes.get(SUMMARY)?.content, "late but in time");
  assert.equal(obsidian.notes.has(SUPER_CONTRACT), false);
  assert.deepEqual(obsidian.events, [
    `open-active ${SOURCE}`,
    "command copilot:super-summarize-to-note",
    `replace ${SUPER_CONTRACT} -> ${SUMMARY}`,
    `show ${SUMMARY}`,
  ]);
  assert.deepEqual(lines, [
    `source note ingested by Obsidian (vault index, 0 ms): ${SOURCE}`,
    `active file confirmed: ${SOURCE}`,
    `copilot copilot:super-summarize-to-note dispatched (background) for: ${SOURCE}`,
    `copilot summary detected: ${SUPER_CONTRACT}`,
    `summary renamed to: ${SUMMARY}`,
  ]);
});

test("a missing Super-Summarize command falls back to Summarize, whose note name follows its title", async () => {
  const clock = fakeClock();
  const obsidian = fakeObsidian(clock, { registered: ["copilot:summarize-to-note"] });
  obsidian.write(SOURCE, "words");
  const { lines, log } = recorder();

  const result = await runCopilotSummary({ host: obsidian.host, log, sourceNotePath: SOURCE, summaryNotePath: SUMMARY, copilotFolder: "Copilot Summaries", clock });

  assert.equal(result.commandId, "copilot:summarize-to-note");
  assert.equal(result.contractNotePath, "Copilot Summaries/Lecture transcription — Summarize.md");
  assert.ok(lines.includes("copilot dispatch candidate copilot:super-summarize-to-note failed: no such command is registered"));
  assert.ok(obsidian.notes.get(SUMMARY)?.content.includes("summary by Summarize"));
});

test("no summarize command at all fails the lane, naming both ids", async () => {
  const clock = fakeClock();
  const obsidian = fakeObsidian(clock, { registered: [] });
  obsidian.write(SOURCE, "words");
  const { log } = recorder();
  await assert.rejects(
    runCopilotSummary({ host: obsidian.host, log, sourceNotePath: SOURCE, summaryNotePath: SUMMARY, copilotFolder: "Copilot Summaries", clock }),
    (error: unknown) => {
      assert.ok(error instanceof CopilotSummaryError);
      assert.equal(error.reason, "no_command");
      assert.match(error.message, /copilot:super-summarize-to-note, copilot:summarize-to-note/);
      return true;
    }
  );
});

test("a timeout fails the lane and stops watching: no rename, no late claim", async () => {
  const clock = fakeClock();
  const obsidian = fakeObsidian(clock, { writeAfterPolls: Number.POSITIVE_INFINITY });
  obsidian.write(SOURCE, "words");
  const { lines, log } = recorder();

  await assert.rejects(
    runCopilotSummary({ host: obsidian.host, log, sourceNotePath: SOURCE, summaryNotePath: SUMMARY, copilotFolder: "Copilot Summaries", clock }),
    (error: unknown) => {
      assert.ok(error instanceof CopilotSummaryError);
      assert.equal(error.reason, "timeout");
      assert.equal(error.message, `Copilot summary did not appear within 180s: ${SUPER_CONTRACT}`);
      return true;
    }
  );
  assert.equal(clock.slept.reduce((a, b) => a + b, 0), 180_000);
  assert.equal(obsidian.events.some((e) => e.startsWith("replace")), false);
  assert.equal(obsidian.notes.has(SUMMARY), false);
  assert.equal(lines.at(-1), `copilot copilot:super-summarize-to-note dispatched (background) for: ${SOURCE}`);
});

test("a contract note left by an earlier run does not count as this run's summary", async () => {
  const clock = fakeClock();
  const obsidian = fakeObsidian(clock, { writeAfterPolls: Number.POSITIVE_INFINITY });
  obsidian.write(SOURCE, "words");
  obsidian.notes.set(SUPER_CONTRACT, { content: "an older run's output", mtimeMs: clock.now() - 3_600_000 });
  const { log } = recorder();
  await assert.rejects(
    runCopilotSummary({ host: obsidian.host, log, sourceNotePath: SOURCE, summaryNotePath: SUMMARY, copilotFolder: "Copilot Summaries", clock }),
    /did not appear within 180s/
  );
  assert.equal(obsidian.notes.get(SUPER_CONTRACT)?.content, "an older run's output");
});

test("a note that never reaches the index fails the lane before anything is dispatched", async () => {
  const clock = fakeClock();
  const obsidian = fakeObsidian(clock);
  const { log } = recorder();
  await assert.rejects(
    runCopilotSummary({ host: obsidian.host, log, sourceNotePath: SOURCE, summaryNotePath: SUMMARY, copilotFolder: "Copilot Summaries", clock }),
    { message: `Source note was never ingested by Obsidian within 15s (not in its vault index): ${SOURCE}` }
  );
  assert.deepEqual(obsidian.events, []);
});

test("a note that will not become active is opened once more, then the lane fails naming the active note", async () => {
  const clock = fakeClock();
  const obsidian = fakeObsidian(clock, { activeSequence: Array(100).fill("Daily/Today.md") });
  obsidian.write(SOURCE, "words");
  const { lines, log } = recorder();
  await assert.rejects(
    runCopilotSummary({ host: obsidian.host, log, sourceNotePath: SOURCE, summaryNotePath: SUMMARY, copilotFolder: "Copilot Summaries", clock }),
    (error: unknown) => {
      assert.ok(error instanceof CopilotSummaryError);
      assert.equal(error.reason, "never_active");
      assert.equal(error.message, `Source note never became the active file within 10s: ${SOURCE} (active: Daily/Today.md)`);
      return true;
    }
  );
  assert.deepEqual(obsidian.events, [`open-active ${SOURCE}`, `open-active ${SOURCE}`]);
  assert.ok(lines.includes(`the note did not become the active file — opened it again as the active leaf: ${SOURCE}`));
});

test("the active note is checked again in the dispatch's own tick, and a change stops the dispatch", async () => {
  const clock = fakeClock();
  // GATE 2 sees the source note; the check right before executeCommand sees another note.
  const obsidian = fakeObsidian(clock, { activeSequence: [SOURCE, "Other.md"] });
  obsidian.write(SOURCE, "words");
  const { log } = recorder();
  await assert.rejects(
    runCopilotSummary({ host: obsidian.host, log, sourceNotePath: SOURCE, summaryNotePath: SUMMARY, copilotFolder: "Copilot Summaries", clock }),
    { message: `The active file changed just before the dispatch: Other.md, expected ${SOURCE}` }
  );
  assert.equal(obsidian.events.some((e) => e.startsWith("command")), false);
});

test("the checkpoint stops the lane while it waits (another run took over)", async () => {
  const clock = fakeClock();
  const obsidian = fakeObsidian(clock, { writeAfterPolls: Number.POSITIVE_INFINITY });
  obsidian.write(SOURCE, "words");
  const { log } = recorder();
  let checks = 0;
  const checkpoint = async () => {
    if (++checks === 4) throw new Error("superseded by run B");
  };
  await assert.rejects(
    runCopilotSummary({ host: obsidian.host, log, sourceNotePath: SOURCE, summaryNotePath: SUMMARY, copilotFolder: "Copilot Summaries", clock, checkpoint }),
    /superseded by run B/
  );
});

test("readCopilotCommandNoteFolder honours a retargeted folder and falls back to the shipped default", async () => {
  const vault = await mkdtemp(join(tmpdir(), "cc-video-copilot-folder-"));
  try {
    assert.equal(await readCopilotCommandNoteFolder(vault, ".obsidian"), "Copilot Summaries");
    await mkdir(join(vault, ".obsidian", "plugins", "copilot"), { recursive: true });
    await writeFile(join(vault, ".obsidian", "plugins", "copilot", "data.json"), JSON.stringify({ customCommandNoteFolder: "/AI/Out/" }));
    assert.equal(await readCopilotCommandNoteFolder(vault, ".obsidian"), "AI/Out");
    await writeFile(join(vault, ".obsidian", "plugins", "copilot", "data.json"), "{ not json");
    assert.equal(await readCopilotCommandNoteFolder(vault, ".obsidian"), "Copilot Summaries");
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

// REGRESSION (Raycast lane, 2026-08-29): the sweep is what makes "exactly one summary per run" structural.
test("the orphan sweep removes this run's leftover contract note and nothing else", async () => {
  const clock = fakeClock();
  const obsidian = fakeObsidian(clock);
  obsidian.write(SUMMARY, "the one real summary");
  obsidian.write(SUPER_CONTRACT, "duplicate from the copilot lane");
  obsidian.notes.set("Copilot Summaries/Lecture transcription — Summarize.md", { content: "older run", mtimeMs: clock.now() - 3_600_000 });
  obsidian.write("Copilot Summaries/Other transcription — Super-Summarize.md", "another video's");
  const { lines, log } = recorder();

  await sweepOrphanedCopilotContractNotes({ host: obsidian.host, log, copilotFolder: "Copilot Summaries", sourceNotePath: SOURCE, sinceMs: clock.now() - 60_000 });

  assert.deepEqual([...obsidian.notes.keys()].sort(), [
    "Copilot Summaries/Lecture summary.md",
    "Copilot Summaries/Lecture transcription — Summarize.md",
    "Copilot Summaries/Other transcription — Super-Summarize.md",
  ]);
  assert.deepEqual(lines, [`orphaned copilot contract note removed: ${SUPER_CONTRACT}`]);
});

test("the orphan sweep resolves without throwing when the folder cannot be read", async () => {
  const clock = fakeClock();
  const obsidian = fakeObsidian(clock);
  obsidian.host.listFolder = () => {
    throw new Error("EACCES");
  };
  const { log } = recorder();
  await sweepOrphanedCopilotContractNotes({ host: obsidian.host, log, copilotFolder: "Copilot Summaries", sourceNotePath: SOURCE, sinceMs: 0 });
});
