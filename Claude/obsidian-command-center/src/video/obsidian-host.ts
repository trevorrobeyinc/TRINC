// The built-in video pipeline's Obsidian side (2026-11-19): VideoVaultHost over the plugin's own `app`.
// This is the one src/video/ file that imports `obsidian` at runtime, so node --test never loads it;
// it stays a thin translation of each host call into one or two Obsidian API calls.
//
// Every note the pipeline writes goes through the vault API (create, modify, process, rename,
// delete), so Obsidian's index holds it the moment the call returns. The Raycast runner wrote over
// the Local REST API from outside and had to wait on the file watcher; nothing here waits on it.

import { App, FileSystemAdapter, normalizePath, Notice, TFile, TFolder } from "obsidian";
import type { VideoVaultHost } from "./pipeline.ts";

interface CommandsApi {
  findCommand?(id: string): unknown;
  executeCommandById?(id: string): boolean;
}

export function createObsidianVideoHost(app: App): VideoVaultHost {
  const adapter = app.vault.adapter;
  if (!(adapter instanceof FileSystemAdapter)) {
    throw new Error("The built-in video pipeline needs a vault on the local disk (FileSystemAdapter).");
  }

  const fileAt = (notePath: string): TFile | null => {
    const found = app.vault.getAbstractFileByPath(normalizePath(notePath));
    return found instanceof TFile ? found : null;
  };

  const ensureFolder = async (folderPath: string): Promise<void> => {
    let current = "";
    for (const part of normalizePath(folderPath).split("/").filter(Boolean)) {
      current = current ? `${current}/${part}` : part;
      if (!app.vault.getAbstractFileByPath(current)) {
        await app.vault.createFolder(current);
      }
    }
  };

  const parentOf = (notePath: string): string => {
    const normalized = normalizePath(notePath);
    return normalized.includes("/") ? normalized.slice(0, normalized.lastIndexOf("/")) : "";
  };

  // How many times each note has been asked to become active: the first attempt is gentle, a retry
  // insists (see openNoteAsActive).
  const activationAttempts = new Map<string, number>();

  return {
    vaultPath: adapter.getBasePath(),
    configDir: app.vault.configDir,

    notify(message) {
      new Notice(message, 15_000);
    },

    async writeNote(notePath, content) {
      const existing = fileAt(notePath);
      if (existing) {
        await app.vault.modify(existing, content);
        return;
      }
      const parent = parentOf(notePath);
      if (parent) await ensureFolder(parent);
      await app.vault.create(normalizePath(notePath), content);
    },

    async processNote(notePath, fn) {
      const file = fileAt(notePath);
      if (!file) return false;
      await app.vault.process(file, fn);
      return true;
    },

    async readIndexedNote(notePath) {
      const file = fileAt(notePath);
      return file ? app.vault.cachedRead(file) : null;
    },

    // The fork summarizes app.workspace.getActiveFile(), which follows the ACTIVE LEAF. The first
    // attempt makes the note's leaf active without moving keyboard focus, so whatever the operator is
    // typing (the Copilot chat, another note) keeps its cursor. The retry, 4 s later, also focuses it.
    // A TFile is opened directly, never through openLinkText, which would parse a title holding "#"
    // or "^" as a heading or block link (and create a note for a link that does not resolve).
    async openNoteAsActive(notePath) {
      const file = fileAt(notePath);
      if (!file) {
        throw new Error(`Note is not in the vault index: ${notePath}`);
      }
      const attempt = (activationAttempts.get(file.path) ?? 0) + 1;
      activationAttempts.set(file.path, attempt);
      const leaf = app.workspace.getLeaf(false);
      await leaf.openFile(file, { active: attempt > 1 });
      app.workspace.setActiveLeaf(leaf, { focus: attempt > 1 });
      // The fork summarizes the editor's selection instead of the note when one exists.
      const activeEditor = app.workspace.activeEditor;
      if (activeEditor?.file?.path === file.path && activeEditor.editor?.somethingSelected()) {
        activeEditor.editor.setCursor({ line: 0, ch: 0 });
      }
    },

    activeNotePath() {
      return app.workspace.getActiveFile()?.path ?? null;
    },

    // A fixed command id from src/video/copilot-summary.ts, never caller input.
    executeCommand(commandId) {
      const commands = (app as unknown as { commands?: CommandsApi }).commands;
      if (!commands || typeof commands.executeCommandById !== "function") {
        throw new Error("Obsidian's commands API is not available");
      }
      if (typeof commands.findCommand === "function" && !commands.findCommand(commandId)) {
        return false;
      }
      return commands.executeCommandById(commandId) !== false;
    },

    noteMtimeMs(notePath) {
      return fileAt(notePath)?.stat.mtime ?? null;
    },

    // An existing summary at `to` (a re-run of a single video) goes to the system Trash, not oblivion:
    // the operator may have edited it.
    async replaceNote(from, to) {
      const source = fileAt(from);
      if (!source) {
        throw new Error(`Copilot's note vanished before it could be renamed: ${from}`);
      }
      const existing = fileAt(to);
      if (existing && existing !== source) {
        await app.vault.trash(existing, true);
      }
      const parent = parentOf(to);
      if (parent) await ensureFolder(parent);
      await app.vault.rename(source, normalizePath(to));
    },

    async showNote(notePath) {
      const file = fileAt(notePath);
      if (file) {
        await app.workspace.getLeaf(false).openFile(file, { active: false });
      }
    },

    listFolder(folderPath) {
      const folder = app.vault.getAbstractFileByPath(normalizePath(folderPath));
      if (!(folder instanceof TFolder)) return [];
      return folder.children
        .filter((child): child is TFile => child instanceof TFile)
        .map((file) => ({ path: file.path, name: file.name, mtimeMs: file.stat.mtime }));
    },

    async deleteNote(notePath) {
      const file = fileAt(notePath);
      if (file) {
        await app.vault.delete(file);
      }
    },
  };
}
