/**
 * Headless custom-command runner — executes a custom prompt command with NO modal
 * and writes the completed result straight into a configurable vault folder.
 *
 * FORK ADDITION (ported from the 3.3.3 fork to upstream 4.0.0 on 2026-08-12).
 *
 * Exists so automation-style commands (e.g. "Summarize → New Note") can run end-to-end
 * without the CustomCommandChatModal's Copy/Insert/Replace confirmation step: the model
 * output is persisted via vault.create/modify, which needs no user press.
 *
 * Command Center's built-in video pipeline depends on this
 * (Claude/obsidian-command-center/src/video/copilot-summary.ts, since 2026-11-19; the Raycast
 * "Video Pipeline Runner" did before it). It runs `copilot:super-summarize-to-note`, or
 * `copilot:summarize-to-note` when the Super-Summarize prompt is missing, through
 * `app.commands.executeCommandById`, then polls for `<source basename> — <command title>.md`
 * in `customCommandNoteFolder`. The output path below is therefore a CONTRACT, not an
 * implementation detail: changing it makes that pipeline's summary step fail, and the run then
 * ends failed for the Copilot agent to write the summary itself.
 *
 * PORT NOTE: 3.3.3 resolved the model from the legacy `settings.activeModels`. Upstream
 * 4.0.0 replaced that with the model-management registry, so model resolution now goes
 * through `resolveChatBackendModel` — the same entry point every other chat surface uses.
 * `app` is threaded in rather than read from the global, per the repo's no-global-app rule.
 */

import { App, Editor, Notice, TFile } from "obsidian";
import { createChatChain, createChatMemory } from "@/commands/customCommandChatEngine";
import { processCommandPrompt } from "@/commands/customCommandUtils";
import { CustomCommand } from "@/commands/type";
import { getSettings } from "@/settings/model";
import { cleanMessageForCopy, ensureFolderExists } from "@/utils";
import { logError, logInfo } from "@/logger";
import { resolveChatBackendModel, type ModelManagementApi } from "@/modelManagement";

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
  if (content == null) {
    return "";
  }
  // Primitives stringify meaningfully; anything else would become "[object Object]",
  // so serialise it instead of silently writing that into the user's note.
  if (typeof content === "number" || typeof content === "boolean") {
    return String(content);
  }
  try {
    return JSON.stringify(content) ?? "";
  } catch {
    return "";
  }
}

/**
 * Run a custom command headlessly against the editor selection (or the whole active note
 * when nothing is selected) and write the result as a note in the configured output folder.
 *
 * The editor is optional so the command can be dispatched in the BACKGROUND (e.g. via the
 * Local REST API with Obsidian unfocused): when no editor is passed, the selection is read
 * from the active editor if one exists, and the active file's content is the input otherwise.
 *
 * The output filename is `<source basename> — <command title>.md`; an existing note at that
 * path is overwritten so re-runs stay idempotent.
 *
 * @param app Obsidian app handle, threaded in rather than taken from the global.
 * @param modelManagement Registry used to resolve which chat model to run the prompt on.
 * @param customCommand The custom command whose prompt should be executed.
 * @param editor Optional editor whose selection is preferred as the input text.
 */
export async function runCustomCommandToNote(
  app: App,
  modelManagement: ModelManagementApi,
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

    const resolution = await resolveChatBackendModel(
      modelManagement,
      customCommand.modelKey || undefined
    );
    if (!resolution.ok) {
      throw new Error(
        "No chat model enabled. Enable a model under Settings → Basic → Agents → Quick Chat, " +
          "or add one on the Models (BYOK) tab."
      );
    }

    // PORT NOTE: 4.0.0 threads `app` through these helpers; 3.3.3 read the global.
    const prompt = await processCommandPrompt(app, customCommand.content, inputText);
    const chain = await createChatChain(resolution.customModel, "", createChatMemory());
    const response = await chain.invoke({ input: prompt });
    const resultText = cleanMessageForCopy(
      messageContentToText((response as { content?: unknown }).content)
    ).trim();
    if (!resultText) {
      throw new Error("The model returned an empty result.");
    }

    const folder = getSettings().customCommandNoteFolder.trim();
    await ensureFolderExists(app.vault, folder);
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
