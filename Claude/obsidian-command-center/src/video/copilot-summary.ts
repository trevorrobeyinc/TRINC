// The summary lane, rewritten on 2026-11-19 to run INSIDE Obsidian. It was the Raycast extension's
// runCopilotHeadlessSummary (videoTranscribeFlow.ts), which drove Obsidian from outside over the Local
// REST API and the Obsidian CLI.
//
// What it does: make the transcription note the active note, run the Copilot fork's headless
// `copilot:super-summarize-to-note` command (falling back to `copilot:summarize-to-note` when the
// Super-Summarize prompt is missing), wait for the note the fork writes in its customCommandNoteFolder
// as `<source basename> — <command title>.md`, and rename it to `<summary folder>/<title> summary.md`.
//
// What changed from the Raycast lane, on purpose:
//   - No paid fallback, and no late claim. A dispatch failure or a timeout ends the lane with a
//     CopilotSummaryError and nothing keeps watching, so a late Copilot note can never race the
//     Copilot agent, which writes the summary itself after a failed run (the plan's step 5).
//   - The active-note check happens with NO await between it and the dispatch. The fork reads
//     app.workspace.getActiveFile() synchronously inside executeCommandById (customCommandHeadless.ts,
//     before its first await), so a note confirmed active in the same tick is the note it summarizes.
//   - No 15-second "is it still active" probe while the fork works. Out of process that probe was the
//     only way to notice a dispatch that never started; in process the dispatch cannot miss, and the
//     probe would fail a healthy run whenever the operator clicked another note mid-summary.
//
// Pure: Node builtins only. Obsidian is reached through the SummaryHost interface
// (src/video/obsidian-host.ts implements it), so test/video-copilot-summary.test.ts drives it with a fake.

import { readFile } from "node:fs/promises";
import * as path from "node:path";
import type { RunLogger } from "./run-log.ts";

/**
 * Ordered dispatch candidates. Super-Summarize (vault note copilot/copilot-custom-prompts/Super-Summarize.md)
 * is the canonical summary prompt; the legacy Summarize command stays as the second candidate so a
 * deleted or renamed super note degrades to the old prompt. `commandTitle` is the fork's note-name
 * contract: `<source basename> — <command title>.md`.
 */
export const COPILOT_SUMMARIZE_CANDIDATES = [
  { commandId: "copilot:super-summarize-to-note", commandTitle: "Super-Summarize" },
  { commandId: "copilot:summarize-to-note", commandTitle: "Summarize" },
] as const;

const DEFAULT_COPILOT_COMMAND_NOTE_FOLDER = "Copilot Summaries";

/**
 * Waits, in milliseconds. `summaryMs` is 180 s: Super-Summarize was measured at 67 s on 2026-08-29,
 * and a 60 s ceiling had failed a working lane (the wiki-definitions plugin uses 180 s for the same prompt).
 */
export interface SummaryTimeouts {
  ingestionMs: number;
  ingestionPollMs: number;
  activeMs: number;
  activePollMs: number;
  /** After this long without the note becoming active, it is opened once more. */
  activeRetryAfterMs: number;
  summaryMs: number;
  summaryPollMs: number;
}

export const DEFAULT_SUMMARY_TIMEOUTS: SummaryTimeouts = {
  ingestionMs: 15_000,
  ingestionPollMs: 500,
  activeMs: 10_000,
  activePollMs: 500,
  activeRetryAfterMs: 4_000,
  summaryMs: 180_000,
  summaryPollMs: 3_000,
};

export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/** The Obsidian operations the summary lane needs. Paths are vault-relative. */
export interface SummaryHost {
  /** The note as Obsidian's vault index holds it, or null when the index has no such note. */
  readIndexedNote(notePath: string): Promise<string | null>;
  /** Open the note in a leaf and make that leaf the active one, with no text selected. */
  openNoteAsActive(notePath: string): Promise<void>;
  /** Vault path of the note Obsidian reports as active, or null. */
  activeNotePath(): string | null;
  /** Run an Obsidian command. Returns false when no command with that id is registered. */
  executeCommand(commandId: string): boolean;
  /** Modification time of a note in the vault index, or null when there is no such note. */
  noteMtimeMs(notePath: string): number | null;
  /** Move `from` to `to`; a note already at `to` goes to the system Trash first. */
  replaceNote(from: string, to: string): Promise<void>;
  /** Show a note, without insisting that it becomes the active one. */
  showNote(notePath: string): Promise<void>;
  /** The files directly inside a vault folder (empty when the folder does not exist). */
  listFolder(folderPath: string): Array<{ path: string; name: string; mtimeMs: number }>;
  /** Delete a vault file. */
  deleteNote(notePath: string): Promise<void>;
}

export type SummaryFailure = "never_indexed" | "never_active" | "no_command" | "timeout";

/** The lane failed. The message is the run log's reason, and the run then ends failed. */
export class CopilotSummaryError extends Error {
  readonly reason: SummaryFailure;
  constructor(reason: SummaryFailure, message: string) {
    super(message);
    this.name = "CopilotSummaryError";
    this.reason = reason;
  }
}

/** Compare vault paths, tolerating percent-encoding, backslashes and doubled or leading slashes. */
export function normalizeVaultRelativeNotePath(value: string): string {
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    // Not valid percent-encoding: compare the raw value.
  }
  return decoded.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+/g, "/");
}

export function isSameVaultNote(a: string, b: string): boolean {
  return normalizeVaultRelativeNotePath(a) === normalizeVaultRelativeNotePath(b);
}

/** Where the fork writes its headless output for `sourceNotePath`. */
export function contractNotePathFor(copilotFolder: string, sourceNotePath: string, commandTitle: string): string {
  return `${copilotFolder}/${path.posix.basename(sourceNotePath, ".md")} — ${commandTitle}.md`;
}

/**
 * The fork's output folder for headless "-to-note" commands, read from its data.json so a retarget in
 * Copilot's settings is honoured; the fork's shipped default when the key is absent.
 */
export async function readCopilotCommandNoteFolder(vaultPath: string, configDir: string): Promise<string> {
  try {
    const dataPath = path.join(vaultPath, configDir, "plugins", "copilot", "data.json");
    const data = JSON.parse(await readFile(dataPath, "utf-8")) as { customCommandNoteFolder?: unknown };
    const folder = typeof data.customCommandNoteFolder === "string" ? data.customCommandNoteFolder.trim() : "";
    if (folder) {
      return folder.replace(/^\/+|\/+$/g, "");
    }
  } catch {
    // Missing or unreadable plugin config: the shipped default.
  }
  return DEFAULT_COPILOT_COMMAND_NOTE_FOLDER;
}

/**
 * Summarize `sourceNotePath` with the Copilot fork's headless command and leave the result at
 * `summaryNotePath`. Throws CopilotSummaryError when the lane fails; `checkpoint` runs at every wait
 * and throws to stop the run (another run took over, or the plugin is unloading).
 */
export async function runCopilotSummary(params: {
  host: SummaryHost;
  log: RunLogger;
  sourceNotePath: string;
  summaryNotePath: string;
  copilotFolder: string;
  timeouts?: Partial<SummaryTimeouts>;
  clock?: Clock;
  checkpoint?: () => Promise<void>;
}): Promise<{ commandId: string; contractNotePath: string }> {
  const { host, log, sourceNotePath, summaryNotePath, copilotFolder } = params;
  const t: SummaryTimeouts = { ...DEFAULT_SUMMARY_TIMEOUTS, ...params.timeouts };
  const clock = params.clock ?? realClock;
  const checkpoint = params.checkpoint ?? (async () => undefined);

  // GATE 1, ingestion: the fork summarizes what Obsidian's index holds. The note was written with
  // app.vault.create, so this normally passes on the first read.
  const ingestionStartedAtMs = clock.now();
  let ingested: string | null = null;
  for (;;) {
    ingested = await host.readIndexedNote(sourceNotePath);
    if (ingested !== null && ingested.trim().length > 0) {
      await log(
        `source note ingested by Obsidian (vault index, ${clock.now() - ingestionStartedAtMs} ms): ${sourceNotePath}`
      );
      break;
    }
    if (clock.now() - ingestionStartedAtMs >= t.ingestionMs) {
      throw new CopilotSummaryError(
        "never_indexed",
        `Source note was never ingested by Obsidian within ${Math.round(t.ingestionMs / 1000)}s (${
          ingested === null ? "not in its vault index" : "indexed but empty"
        }): ${sourceNotePath}`
      );
    }
    await clock.sleep(t.ingestionPollMs);
  }

  // GATE 2, the active note.
  await checkpoint();
  await host.openNoteAsActive(sourceNotePath);
  const activeStartedAtMs = clock.now();
  let reopened = false;
  for (;;) {
    const active = host.activeNotePath();
    if (active !== null && isSameVaultNote(active, sourceNotePath)) {
      await log(`active file confirmed: ${sourceNotePath}`);
      break;
    }
    const waited = clock.now() - activeStartedAtMs;
    if (waited >= t.activeMs) {
      throw new CopilotSummaryError(
        "never_active",
        `Source note never became the active file within ${Math.round(t.activeMs / 1000)}s: ${sourceNotePath} (active: ${
          active ?? "none"
        })`
      );
    }
    if (!reopened && waited >= t.activeRetryAfterMs) {
      reopened = true;
      await host.openNoteAsActive(sourceNotePath);
      await log(`the note did not become the active file — opened it again as the active leaf: ${sourceNotePath}`);
    }
    await clock.sleep(t.activePollMs);
  }

  await checkpoint();
  const dispatchedAtMs = clock.now();
  let dispatched: (typeof COPILOT_SUMMARIZE_CANDIDATES)[number] | undefined;
  for (const candidate of COPILOT_SUMMARIZE_CANDIDATES) {
    // Same tick as the dispatch, on purpose: no await between this check and executeCommand.
    const activeNow = host.activeNotePath();
    if (activeNow === null || !isSameVaultNote(activeNow, sourceNotePath)) {
      throw new CopilotSummaryError(
        "never_active",
        `The active file changed just before the dispatch: ${activeNow ?? "none"}, expected ${sourceNotePath}`
      );
    }
    let reason = "";
    try {
      if (host.executeCommand(candidate.commandId)) {
        dispatched = candidate;
        break;
      }
      reason = "no such command is registered";
    } catch (error) {
      reason = error instanceof Error ? error.message : String(error);
    }
    await log(`copilot dispatch candidate ${candidate.commandId} failed: ${reason}`);
  }
  if (!dispatched) {
    throw new CopilotSummaryError(
      "no_command",
      `No Copilot summarize command could be dispatched (tried: ${COPILOT_SUMMARIZE_CANDIDATES.map(
        (candidate) => candidate.commandId
      ).join(", ")}).`
    );
  }
  await log(`copilot ${dispatched.commandId} dispatched (background) for: ${sourceNotePath}`);

  const contractNotePath = contractNotePathFor(copilotFolder, sourceNotePath, dispatched.commandTitle);
  const deadlineMs = dispatchedAtMs + t.summaryMs;
  for (;;) {
    await checkpoint();
    const mtimeMs = host.noteMtimeMs(contractNotePath);
    // mtime guard: a note of the same name left by an earlier run must not count as done.
    if (mtimeMs !== null && mtimeMs >= dispatchedAtMs - 1000) {
      break;
    }
    if (clock.now() >= deadlineMs) {
      throw new CopilotSummaryError(
        "timeout",
        `Copilot summary did not appear within ${Math.round(t.summaryMs / 1000)}s: ${contractNotePath}`
      );
    }
    await clock.sleep(t.summaryPollMs);
  }
  await log(`copilot summary detected: ${contractNotePath}`);

  if (!isSameVaultNote(contractNotePath, summaryNotePath)) {
    await host.replaceNote(contractNotePath, summaryNotePath);
    await log(`summary renamed to: ${summaryNotePath}`);
  }
  await host.showNote(summaryNotePath).catch(() => undefined);
  return { commandId: dispatched.commandId, contractNotePath };
}

/**
 * The one-summary-per-run guard: a contract note for this source that is still in the fork's folder
 * at the end of a successful run is a duplicate of the summary, so it goes. The mtime gate keeps
 * notes from earlier runs. Fail-soft: the summary is already written when this runs.
 */
export async function sweepOrphanedCopilotContractNotes(params: {
  host: SummaryHost;
  log: RunLogger;
  copilotFolder: string;
  sourceNotePath: string;
  sinceMs: number;
}): Promise<void> {
  const { host, log, copilotFolder, sourceNotePath, sinceMs } = params;
  const prefix = `${path.posix.basename(sourceNotePath, ".md")} — `;
  try {
    for (const entry of host.listFolder(copilotFolder)) {
      if (!entry.name.startsWith(prefix) || !entry.name.endsWith(".md") || entry.mtimeMs < sinceMs - 1000) {
        continue;
      }
      try {
        await host.deleteNote(entry.path);
        await log(`orphaned copilot contract note removed: ${copilotFolder}/${entry.name}`);
      } catch {
        // Vanished mid-sweep.
      }
    }
  } catch {
    // Folder unreadable: nothing to sweep.
  }
}
