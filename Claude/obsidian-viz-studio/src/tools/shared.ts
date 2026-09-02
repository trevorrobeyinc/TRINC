import type { ToolContext } from "../types";
import { isCanvasPath } from "../canvasWriter";
import { rasterizeSvgToPng, svgIntrinsicSize } from "../render/rasterize";
import {
  appendBlock,
  buildEmbed,
  safePath,
  slugify,
  uniquePath,
  writeBinary,
  writeText,
} from "../vaultWriter";

export function requireString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${key} is required and must be a non-empty string`);
  }
  return value;
}

export function optionalString(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new Error(`${key} must be a string`);
  return value;
}

export function optionalBoolean(input: Record<string, unknown>, key: string): boolean | undefined {
  const value = input[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "boolean") throw new Error(`${key} must be a boolean`);
  return value;
}

export function optionalNumber(input: Record<string, unknown>, key: string): number | undefined {
  const value = input[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${key} must be a finite number`);
  }
  return value;
}

/** Folder override validated against traversal; falls back to the given default. */
export function resolveFolder(
  input: Record<string, unknown>,
  fallback: string
): string {
  const override = optionalString(input, "folder");
  return override ? safePath(override.replace(/\/+$/, "")) : fallback;
}

/**
 * The placement contract shared by every "put it where I am working" tool
 * (viz_guided pioneered it): useActiveTab resolves the active tab's TYPE
 * (note vs canvas) and routes accordingly, and a canvas path handed in as
 * targetNote is still a canvas — appending markdown to it would destroy it.
 */
export function resolveTargets(
  ctx: ToolContext,
  input: Record<string, unknown>
): { targetNote?: string; targetCanvas?: string } {
  let targetNote = optionalString(input, "targetNote");
  let targetCanvas = optionalString(input, "targetCanvas");
  const useActiveTab = optionalBoolean(input, "useActiveTab") ?? false;
  if (useActiveTab) {
    const active = ctx.app.workspace.getActiveFile();
    if (!active) {
      throw new Error(
        "useActiveTab was set but nothing is open — pass targetNote or targetCanvas instead, or open a note/canvas first"
      );
    }
    if (isCanvasPath(active.path)) targetCanvas = active.path;
    else targetNote = active.path;
  }
  if (targetNote && isCanvasPath(targetNote)) {
    targetCanvas = targetNote;
    targetNote = undefined;
  }
  return { targetNote, targetCanvas };
}

/**
 * Reveal a finished artifact (viz_guided's rule): open it so the user sees the
 * result, but never yank focus off a canvas that is already open, and never
 * fail a written artifact over a focus problem. Returns whether it opened.
 */
export async function revealResult(
  ctx: ToolContext,
  input: Record<string, unknown>,
  revealPath: string | undefined
): Promise<boolean | undefined> {
  if (!revealPath || !(optionalBoolean(input, "open") ?? true)) return undefined;
  try {
    const alreadyOpen = ctx.app.workspace
      .getLeavesOfType("canvas")
      .some((l) => (l.view as unknown as { file?: { path?: string } })?.file?.path === revealPath);
    if (!alreadyOpen) await ctx.app.workspace.openLinkText(revealPath, "", false);
    return true;
  } catch {
    return false;
  }
}

export interface PersistOptions {
  /** Basename used when the caller supplied no fileName (already descriptive). */
  defaultBaseName: string;
  /** Caption written under the embed when appending to targetNote. */
  caption?: string;
  /** Background for PNG rasterization ("transparent" to keep alpha). */
  pngBackground: string;
  /** Extra fields merged into the result (e.g. nodeCount). */
  extra?: Record<string, unknown>;
}

/**
 * The one write path every SVG-producing tool shares: pick format, name the
 * file, write it under the asset folder, optionally append the embed to a
 * note, and shape the flattened result contract
 * ({path, embed, summary, width, height, warnings?, svg?}).
 */
export async function persistSvgOutput(
  ctx: ToolContext,
  input: Record<string, unknown>,
  svg: string,
  warnings: string[],
  opts: PersistOptions
): Promise<Record<string, unknown>> {
  const format = optionalString(input, "format") === "png" ? "png" : "svg";
  const folder = resolveFolder(input, ctx.settings.assetFolder);
  const overwrite = optionalBoolean(input, "overwrite") ?? false;
  const baseName = slugify(optionalString(input, "fileName") ?? opts.defaultBaseName);

  let path: string;
  let width: number;
  let height: number;
  if (format === "png") {
    const png = await rasterizeSvgToPng(svg, {
      scale: ctx.settings.pngScale,
      background: opts.pngBackground,
    });
    path = uniquePath(ctx.app, folder, baseName, "png", overwrite);
    await writeBinary(ctx.app, path, png.buf);
    width = png.width;
    height = png.height;
  } else {
    const size = svgIntrinsicSize(svg);
    path = uniquePath(ctx.app, folder, baseName, "svg", overwrite);
    await writeText(ctx.app, path, svg);
    width = size.width;
    height = size.height;
  }

  const embed = buildEmbed(path);
  const result: Record<string, unknown> = {
    path,
    embed,
    format,
    width,
    height,
    summary: `Wrote ${format.toUpperCase()} to ${path}`,
    ...opts.extra,
  };

  const targetNote = optionalString(input, "targetNote");
  if (targetNote) {
    const appended = await appendBlock(ctx.app, targetNote, embed, opts.caption);
    result.targetNote = appended.targetNote;
    result.targetNoteCreated = appended.targetNoteCreated;
    result.summary = `${result.summary}; embedded in ${appended.targetNote}`;
  }
  if (warnings.length > 0) result.warnings = warnings;
  if (optionalBoolean(input, "returnContent")) result.svg = svg;
  return result;
}
