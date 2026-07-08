/**
 * Headless custom-command runner — executes a custom prompt command with NO modal
 * and writes the completed result straight into a configurable vault folder.
 *
 * Exists so automation-style commands (e.g. "Summarize → New Note") can run end-to-end
 * without the CustomCommandChatModal's Copy/Insert/Replace confirmation step: the model
 * output is persisted via app.vault.create/modify, which needs no user press.
 */

import { Editor, Notice, TFile } from "obsidian";
import { createChatChain, createChatMemory } from "@/commands/customCommandChatEngine";
import { processCommandPrompt } from "@/commands/customCommandUtils";
import { CustomCommand } from "@/commands/type";
import { getSettings } from "@/settings/model";
import { cleanMessageForCopy, ensureFolderExists, findCustomModel } from "@/utils";
import { CustomModel } from "@/aiParams";
import { logError, logInfo } from "@/logger";

/**
 * Flatten a LangChain message content payload (string or content-part array) to plain text.
 */
function messageContentToText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === "string" ? part : ((part as { text?: string }).text ?? "")))
      .join("");
  }
  return content == null ? "" : String(content);
}

/**
 * Resolve the model for a custom command the same way the modal does: the command's own
 * modelKey first, then the global default, falling back to the first enabled model when
 * the stored key is stale (removed/renamed/disabled model).
 */
function resolveCommandModel(customCommand: CustomCommand): CustomModel | null {
  const settings = getSettings();
  const preferredKey = customCommand.modelKey || settings.defaultModelKey;
  try {
    const model = findCustomModel(preferredKey, settings.activeModels);
    if (model.enabled) {
      return model;
    }
  } catch {
    // Stale model key — fall through to the first enabled model.
  }
  return settings.activeModels.find((m) => m.enabled) ?? null;
}

/**
 * Run a custom command headlessly against the editor selection (or the whole active note
 * when nothing is selected) and write the result as a note in the configured output folder.
 *
 * The editor is optional so the command can be dispatched in the BACKGROUND (e.g. via the
 * Local REST API) with Obsidian unfocused: when no editor is passed, the selection is read
 * from the active editor if one exists, and the active file's content is the input otherwise.
 *
 * The output filename is `<source basename> — <command title>.md`; an existing note at that
 * path is overwritten so re-runs stay idempotent.
 */
export async function runCustomCommandToNote(
  customCommand: CustomCommand,
  editor?: Editor
): Promise<void> {
  const notice = new Notice(`${customCommand.title}: generating note...`, 0);
  try {
    const activeFile = app.workspace.getActiveFile();
    const effectiveEditor = editor ?? app.workspace.activeEditor?.editor;
    let inputText = effectiveEditor?.getSelection() ?? "";
    if (!inputText.trim() && activeFile) {
      inputText = await app.vault.cachedRead(activeFile);
    }
    if (!inputText.trim()) {
      throw new Error("Nothing to process: no selection and the active note is empty.");
    }

    const model = resolveCommandModel(customCommand);
    if (!model) {
      throw new Error("No active model is configured. Please configure a model in Copilot settings.");
    }

    const prompt = await processCommandPrompt(customCommand.content, inputText);
    const chain = await createChatChain(model, "", createChatMemory());
    const response = await chain.invoke({ input: prompt });
    const resultText = cleanMessageForCopy(
      messageContentToText((response as { content?: unknown }).content)
    ).trim();
    if (!resultText) {
      throw new Error("The model returned an empty result.");
    }

    const folder = getSettings().customCommandNoteFolder.trim();
    await ensureFolderExists(folder);
    const sourceBase = activeFile?.basename ?? customCommand.title;
    const notePath = `${folder}/${sourceBase} — ${customCommand.title}.md`;

    const existing = app.vault.getAbstractFileByPath(notePath);
    if (existing instanceof TFile) {
      await app.vault.modify(existing, resultText);
    } else {
      await app.vault.create(notePath, resultText);
    }

    logInfo(`Headless custom command "${customCommand.title}" wrote note: ${notePath}`);
    notice.hide();
    new Notice(`${customCommand.title}: note saved to ${notePath}`);
  } catch (error) {
    notice.hide();
    logError(`Headless custom command "${customCommand.title}" failed`, error);
    new Notice(
      `${customCommand.title} failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
