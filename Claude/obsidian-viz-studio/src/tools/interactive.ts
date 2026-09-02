import type { ToolContext, ToolHandler } from "../types";
import { buildInteractiveDoc } from "../render/interactiveDoc";
import { appendBlock, slugify, uniquePath, writeText } from "../vaultWriter";
import { optionalBoolean, optionalString, resolveFolder } from "./shared";

/**
 * viz_interactive — a self-contained interactive HTML explainer written into
 * the vault. Obsidian cannot execute scripts in embeds, so the display
 * surface is the system browser: the note gets a [[link]], and open:true
 * launches the default browser. The document is network-inert by CSP.
 */
export function createInteractiveTool(ctx: ToolContext): ToolHandler {
  return async (input) => {
    const title = optionalString(input, "title")?.trim();
    const body = optionalString(input, "body");
    if (!title) throw new Error("title must be a non-empty string");
    if (!body) throw new Error("body must be a non-empty HTML fragment (bare pre-styled tags welcome)");
    const { html, warnings } = buildInteractiveDoc({
      title,
      body,
      script: optionalString(input, "script"),
      css: optionalString(input, "css"),
    });

    const folder = resolveFolder(input, ctx.settings.notesFolder);
    const baseName = slugify(optionalString(input, "fileName") ?? title);
    const overwrite = optionalBoolean(input, "overwrite") ?? false;
    const path = uniquePath(ctx.app, folder, baseName, "html", overwrite);
    await writeText(ctx.app, path, html);

    const link = `[[${path}]]`;
    const result: Record<string, unknown> = {
      path,
      link,
      embed: link,
      format: "html",
      bytes: html.length,
      summary: `Wrote interactive HTML ${path} — opens in the system browser (Obsidian does not run scripts in embeds); network-inert by CSP`,
    };
    const targetNote = optionalString(input, "targetNote");
    if (targetNote) {
      const appended = await appendBlock(ctx.app, targetNote, link, title);
      result.targetNote = appended.targetNote;
      result.targetNoteCreated = appended.targetNoteCreated;
    }
    if (warnings.length > 0) result.warnings = warnings;
    if (optionalBoolean(input, "returnContent")) result.html = html;

    if (optionalBoolean(input, "open") ?? true) {
      try {
        await (
          ctx.app as unknown as { openWithDefaultApp: (p: string) => Promise<void> }
        ).openWithDefaultApp(path);
        result.opened = true;
      } catch {
        result.opened = false; // file is written either way
      }
    }
    return result;
  };
}
