import type { ToolContext, ToolHandler } from "../types";
import { sanitizeSvg } from "../render/svgSanitize";
import {
  CARD_THEMES,
  autoLegend,
  composeCard,
  type CardStep,
  type LegendEntry,
} from "../render/guided/cardCompose";
import { buildGuidedMermaid, type GuidedSpec } from "../render/guided/mermaidBuilder";
import { PRESET_IDS, resolvePreset, type EdgeKind } from "../render/guided/presets";
import { appendBlock, slugify, uniquePath, writeText } from "../vaultWriter";
import { insertCanvasNode, isCanvasPath } from "../canvasWriter";
import { getMermaid, renderToSvg, validateSource } from "./mermaid";
import {
  optionalBoolean,
  optionalNumber,
  optionalString,
  persistSvgOutput,
  requireString,
  resolveFolder,
} from "./shared";

function parseSteps(input: Record<string, unknown>): CardStep[] {
  const raw = input.steps;
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new Error("steps must be an array of { title, detail? }");
  return raw.map((s, i) => {
    if (!s || typeof s !== "object") throw new Error(`steps[${i}] must be an object`);
    const step = s as Record<string, unknown>;
    if (typeof step.title !== "string" || !step.title.trim()) {
      throw new Error(`steps[${i}].title must be a non-empty string`);
    }
    if (step.detail !== undefined && typeof step.detail !== "string") {
      throw new Error(`steps[${i}].detail must be a string`);
    }
    return { title: step.title, detail: step.detail as string | undefined };
  });
}

function parseLegendOverride(input: Record<string, unknown>): LegendEntry[] | null {
  const raw = input.legend;
  if (raw === undefined || raw === null) return null;
  if (!Array.isArray(raw)) throw new Error("legend must be an array of { label, color? }");
  return raw.map((e, i) => {
    if (!e || typeof e !== "object") throw new Error(`legend[${i}] must be an object`);
    const entry = e as Record<string, unknown>;
    if (typeof entry.label !== "string" || !entry.label.trim()) {
      throw new Error(`legend[${i}].label must be a non-empty string`);
    }
    return { label: entry.label, swatch: (entry.color as string) || undefined };
  });
}

function parseSources(input: Record<string, unknown>): string[] {
  const raw = input.sources;
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new Error("sources must be an array of vault note paths or [[wikilinks]]");
  return raw.map((s, i) => {
    if (typeof s !== "string" || !s.trim()) {
      throw new Error(`sources[${i}] must be a non-empty string`);
    }
    const v = s.trim();
    // Accept "Folder/Note.md", "Folder/Note", or an already-formed [[wikilink]].
    if (v.startsWith("[[")) return v;
    return `[[${v.replace(/\.md$/i, "")}]]`;
  });
}

/**
 * The complete lesson as markdown: image, step key, sources, editable source.
 *
 * This is deliberately the WHOLE thing rather than just the embed. A guided card
 * whose teaching content lives only in the chat transcript is lost the moment the
 * conversation scrolls away — the note has to be self-sufficient.
 */
function lessonMarkdown(opts: {
  heading: boolean;
  title: string;
  subtitle?: string;
  embed: string;
  steps: CardStep[];
  sources: string[];
  mermaidSource: string;
}): string {
  const lines: string[] = [];
  if (opts.heading) lines.push(`# ${opts.title}`, "");
  if (opts.subtitle) lines.push(`> ${opts.subtitle}`, "");
  lines.push(opts.embed, "");
  if (opts.steps.length > 0) {
    lines.push("## Step-by-step breakdown", "");
    opts.steps.forEach((s, i) => {
      lines.push(`${i + 1}. **${s.title}**${s.detail ? ` — ${s.detail}` : ""}`);
    });
    lines.push("");
  }
  if (opts.sources.length > 0) {
    lines.push("## Sources from your vault", "");
    for (const src of opts.sources) lines.push(`- ${src}`);
    lines.push("");
  }
  lines.push("## Diagram source", "", "```mermaid", opts.mermaidSource, "```", "");
  return lines.join("\n");
}

export function createGuidedTool(ctx: ToolContext): ToolHandler {
  return async (input) => {
    const title = requireString(input, "title").trim();
    const subtitle = optionalString(input, "subtitle")?.trim() || undefined;
    const presetId = optionalString(input, "preset");
    const preset = resolvePreset(presetId);

    const rawMermaid = optionalString(input, "mermaid")?.trim();
    const spec = input.spec as GuidedSpec | undefined;
    if (rawMermaid && spec) {
      throw new Error("pass either spec (structured) or mermaid (raw source), not both");
    }
    if (!rawMermaid && !spec) {
      throw new Error(
        "spec is required: { nodes: [{id, label, stage?, kind?}], edges?: [...] } — or pass raw mermaid instead"
      );
    }

    const direction = optionalString(input, "direction") as "TB" | "LR" | undefined;
    if (direction && !["TB", "LR"].includes(direction)) {
      throw new Error(`direction must be TB or LR (got ${JSON.stringify(direction)})`);
    }

    const themeName = optionalString(input, "theme") ?? "contrast";
    const theme = CARD_THEMES[themeName];
    if (!theme) {
      throw new Error(`theme must be one of ${Object.keys(CARD_THEMES).join(", ")}`);
    }

    const width = Math.min(Math.max(Math.round(optionalNumber(input, "width") ?? 1200), 720), 2000);

    // Build the mermaid source (structured spec) or take the caller's own.
    let mermaidSource: string;
    let usedKinds: string[] = [];
    let usedEdgeKinds: EdgeKind[] = [];
    let groups: { id: string; label: string; note?: string }[] = [];
    let nodeCount = 0;
    let edgeCount = 0;
    if (spec) {
      const built = buildGuidedMermaid(spec, preset, direction);
      mermaidSource = built.source;
      usedKinds = built.usedKinds;
      usedEdgeKinds = built.usedEdgeKinds;
      groups = built.groups;
      nodeCount = built.nodeCount;
      edgeCount = built.edgeCount;
    } else {
      if ((rawMermaid as string).includes("```")) {
        throw new Error("mermaid must be raw source without the ```mermaid fence");
      }
      mermaidSource = rawMermaid as string;
    }

    // Validate before rendering so a bad spec yields the verbatim parser error.
    const m = await getMermaid();
    const warnings = await validateSource(mermaidSource, m);

    const rendered = await renderToSvg(mermaidSource, m);
    const diagram = sanitizeSvg(rendered);

    // Steps default to the stage list, so a spec with stages always teaches
    // something even when the caller supplies no explicit breakdown.
    let steps = parseSteps(input);
    if (steps.length === 0 && groups.length > 0) {
      steps = groups.map((g, i) => ({
        title: preset.numberStages ? `Stage ${i + 1} · ${g.label}` : g.label,
        detail: g.note,
      }));
    }

    const legend = parseLegendOverride(input) ?? autoLegend(preset, usedKinds, usedEdgeKinds);

    const svg = composeCard({
      title,
      subtitle,
      presetLabel: preset.id.replace(/_/g, " "),
      diagramSvg: diagram.svg,
      legend,
      steps,
      theme,
      accent: preset.accent,
      width,
    });

    const sanitizedCard = sanitizeSvg(svg);
    const sources = parseSources(input);

    // "Put it where I'm working" has to mean the same thing whether the open tab
    // is a note or a Canvas — a canvas is JSON, so appending markdown to one
    // would destroy it. Resolve the active tab's TYPE, then route.
    let targetNote = optionalString(input, "targetNote");
    let targetCanvas = optionalString(input, "targetCanvas");
    const useActiveTab =
      (optionalBoolean(input, "useActiveTab") ?? false) ||
      (optionalBoolean(input, "useActiveNote") ?? false);

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
      // A canvas handed in as targetNote is still a canvas.
      targetCanvas = targetNote;
      targetNote = undefined;
    }

    // A guided card writes the WHOLE lesson into its note, so `targetNote` is
    // handled here rather than by the shared writer (which appends the bare
    // embed). Without this the card, the step key, and the citations end up in
    // three different places — the defect seen live on 2026-08-16.
    const persistInput = { ...input };
    delete persistInput.targetNote;

    const result = await persistSvgOutput(
      ctx,
      persistInput,
      sanitizedCard.svg,
      [...warnings, ...diagram.warnings, ...sanitizedCard.warnings],
      {
        defaultBaseName: title,
        caption: subtitle ?? title,
        // The card paints its own themed background.
        pngBackground: "transparent",
        extra: {
          preset: preset.id,
          stageCount: groups.length,
          nodeCount,
          edgeCount,
          stepCount: steps.length,
          sourceCount: sources.length,
          mermaidSource,
        },
      }
    );

    const lesson = (heading: boolean) =>
      lessonMarkdown({
        heading,
        title,
        subtitle,
        embed: result.embed as string,
        steps,
        sources,
        mermaidSource,
      });

    if (targetCanvas) {
      // Canvas placement: the lesson still becomes a real note (canvas file
      // nodes reference notes, and the note is what stays searchable), then a
      // card for it is inserted into the canvas. `canvasNode:"image"` drops the
      // card image straight in instead, for a purely visual board.
      const folder = resolveFolder(input, ctx.settings.notesFolder);
      const baseName = slugify(optionalString(input, "fileName") ?? title);
      const overwrite = optionalBoolean(input, "overwrite") ?? false;
      const notePath = uniquePath(ctx.app, folder, baseName, "md", overwrite);
      await writeText(ctx.app, notePath, lesson(true));

      const asImage = optionalString(input, "canvasNode") === "image";
      const inserted = await insertCanvasNode(ctx.app, targetCanvas, {
        file: asImage ? (result.path as string) : notePath,
        width: asImage ? 640 : 480,
        height: asImage ? Math.round(640 * ((result.height as number) / (result.width as number))) : 620,
      });

      result.lessonNote = notePath;
      result.canvasPath = inserted.canvasPath;
      result.canvasCreated = inserted.canvasCreated;
      result.canvasNodeId = inserted.nodeId;
      result.canvasNodeCount = inserted.nodeCount;
      result.summary =
        `${result.summary}; lesson note ${notePath} added to canvas ${inserted.canvasPath}` +
        `${inserted.canvasCreated ? " (canvas created)" : ""}`;
    } else if (targetNote) {
      // One complete, self-sufficient note.
      const appended = await appendBlock(ctx.app, targetNote, lesson(false));
      result.targetNote = appended.targetNote;
      result.targetNoteCreated = appended.targetNoteCreated;
      result.lessonNote = appended.targetNote;
      result.summary = `${result.summary}; full lesson written to ${appended.targetNote}`;
    } else if (optionalBoolean(input, "stepKeyNote")) {
      const folder = resolveFolder(input, ctx.settings.notesFolder);
      const baseName = slugify(optionalString(input, "fileName") ?? title);
      const overwrite = optionalBoolean(input, "overwrite") ?? false;
      const notePath = uniquePath(ctx.app, folder, baseName, "md", overwrite);
      await writeText(ctx.app, notePath, lesson(true));
      result.stepKeyPath = notePath;
      result.lessonNote = notePath;
      result.summary = `${result.summary}; full lesson written to ${notePath}`;
    }

    if (sources.length === 0) {
      result.warnings = [
        ...((result.warnings as string[] | undefined) ?? []),
        "no `sources` passed — the lesson note has no vault citations, so a reader cannot tell a grounded card from a generic one",
      ];
    }

    // Reveal the result. When the target was a canvas the canvas IS the view the
    // user is working in — opening the note over it would yank them away, so an
    // open canvas is left focused (it reloads to show the new node by itself).
    const revealPath = targetCanvas
      ? (result.canvasPath as string | undefined)
      : (result.lessonNote as string | undefined);
    if (revealPath && (optionalBoolean(input, "open") ?? true)) {
      try {
        const alreadyOpen = ctx.app.workspace
          .getLeavesOfType("canvas")
          .some((l) => (l.view as unknown as { file?: { path?: string } })?.file?.path === revealPath);
        if (!alreadyOpen) await ctx.app.workspace.openLinkText(revealPath, "", false);
        result.opened = true;
      } catch {
        result.opened = false; // never fail a written lesson over a focus problem
      }
    }

    return result;
  };
}

export { PRESET_IDS };
