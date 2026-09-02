import { loadMermaid } from "obsidian";
import type { ToolContext, ToolHandler } from "../types";
import { ensureBackgroundRect, sanitizeSvg } from "../render/svgSanitize";
import { slugify, uniquePath, writeText, appendBlock, buildEmbed } from "../vaultWriter";
import {
  optionalBoolean,
  optionalString,
  persistSvgOutput,
  requireString,
  resolveFolder,
} from "./shared";

/**
 * Minimal surface of the mermaid instance this plugin relies on.
 * `loadMermaid()` is typed `Promise<any>` by Obsidian, and the bundled mermaid
 * version is not contractual — every use is capability-probed and wrapped so a
 * sync-throwing older API and the modern promise API behave identically.
 */
interface MermaidApi {
  initialize?: (config: Record<string, unknown>) => void;
  parse?: (source: string) => unknown;
  render?: (id: string, source: string) => unknown;
}

let mermaidPromise: Promise<MermaidApi | null> | null = null;

/** Shared with the guided-learning composer, which renders through the same singleton. */
export async function getMermaid(): Promise<MermaidApi | null> {
  if (!mermaidPromise) {
    mermaidPromise = (async () => {
      try {
        const m = (await loadMermaid()) as MermaidApi | null;
        try {
          // htmlLabels:false is load-bearing twice over: mermaid otherwise emits
          // <foreignObject> labels, which the sanitizer strips and <img>-based
          // rasterization cannot draw.
          m?.initialize?.({
            startOnLoad: false,
            securityLevel: "strict",
            theme: "neutral",
            htmlLabels: false,
            flowchart: { htmlLabels: false },
          });
        } catch {
          /* initialize is best-effort; parse/render failures surface per call */
        }
        return m ?? null;
      } catch {
        return null;
      }
    })();
  }
  return mermaidPromise;
}

export interface MermaidProbe {
  probed: boolean;
  available: boolean;
  canExportSvg: boolean;
}

export async function probeMermaid(): Promise<MermaidProbe> {
  const m = await getMermaid();
  return {
    probed: true,
    available: !!m && typeof m.parse === "function",
    canExportSvg: !!m && typeof m.render === "function",
  };
}

const DIAGRAM_KEYWORDS =
  /^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|gantt|pie|mindmap|timeline|journey|quadrantChart|gitGraph|requirementDiagram|sankey-beta|block-beta|xychart-beta|C4Context)\b/;

function firstDirectiveLine(source: string): string {
  for (const line of source.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("%%")) continue;
    return trimmed;
  }
  return "";
}

export async function validateSource(source: string, m: MermaidApi | null): Promise<string[]> {
  if (m && typeof m.parse === "function") {
    try {
      await Promise.resolve(m.parse(source));
      return [];
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(`Mermaid syntax error: ${detail}`);
    }
  }
  // Degraded mode: mermaid unavailable — a keyword check still catches the
  // dominant failure (prose instead of a diagram) before writing the note.
  if (!DIAGRAM_KEYWORDS.test(firstDirectiveLine(source))) {
    throw new Error(
      "Mermaid validation unavailable and the source does not start with a known diagram " +
        "keyword (graph, flowchart, sequenceDiagram, …) — refusing to write a fence that cannot render"
    );
  }
  return ["mermaid parser unavailable in this Obsidian build — source not fully validated"];
}

export async function renderToSvg(source: string, m: MermaidApi | null): Promise<string> {
  if (!m || typeof m.render !== "function") {
    throw new Error(
      "Mermaid SVG export unavailable in this Obsidian build — use format:'note' (Obsidian renders the fence natively)"
    );
  }
  const out = await Promise.resolve(m.render("vz-mermaid-export", source));
  const svg =
    typeof out === "string" ? out : (out as { svg?: string } | null | undefined)?.svg;
  if (!svg || typeof svg !== "string") {
    throw new Error("Mermaid render returned no SVG — use format:'note' instead");
  }
  return svg;
}

export function createMermaidTool(ctx: ToolContext): ToolHandler {
  return async (input) => {
    const source = requireString(input, "source").trim();
    if (source.includes("```")) {
      throw new Error("source must be raw mermaid text without the ```mermaid fence");
    }
    const title = optionalString(input, "title")?.trim() || "";
    const format = optionalString(input, "format") ?? "note";
    if (!["note", "svg", "png"].includes(format)) {
      throw new Error(`format must be note, svg, or png (got ${JSON.stringify(format)})`);
    }

    const m = await getMermaid();
    const warnings = await validateSource(source, m);

    if (format === "note") {
      const fence = `\`\`\`mermaid\n${source}\n\`\`\``;
      const targetNote = optionalString(input, "targetNote");
      if (targetNote) {
        const appended = await appendBlock(ctx.app, targetNote, fence, title || undefined);
        const result: Record<string, unknown> = {
          targetNote: appended.targetNote,
          targetNoteCreated: appended.targetNoteCreated,
          embed: buildEmbed(appended.targetNote),
          summary: `Appended mermaid diagram to ${appended.targetNote} (Obsidian renders it natively)`,
        };
        if (warnings.length > 0) result.warnings = warnings;
        if (optionalBoolean(input, "returnContent")) result.mermaid = source;
        return result;
      }

      const folder = resolveFolder(input, ctx.settings.notesFolder);
      const baseName = slugify(
        optionalString(input, "fileName") ?? (title || "mermaid-diagram")
      );
      const overwrite = optionalBoolean(input, "overwrite") ?? false;
      const path = uniquePath(ctx.app, folder, baseName, "md", overwrite);
      const heading = title || baseName;
      await writeText(ctx.app, path, `# ${heading}\n\n${fence}\n`);
      // Deliberately a LINK, not an ![[embed]]: transcluding a note whose body is a
      // mermaid fence renders inconsistently (it depends on view mode and on the embed
      // finishing its lazy load), which reads to the user as "the diagram didn't render".
      // To put a diagram INSIDE another note, pass targetNote (the fence goes in inline)
      // or use format:"svg" (a real image embed, which renders in every view mode).
      const result: Record<string, unknown> = {
        path,
        link: `[[${path.replace(/\.md$/i, "")}]]`,
        summary: `Wrote mermaid diagram note ${path} (Obsidian renders it natively when the note is open)`,
        hint:
          "To place this diagram inside another note, do NOT embed this note — either call " +
          "viz_mermaid again with targetNote (appends the fence inline) or with format:'svg' " +
          "(returns an image embed that renders anywhere).",
      };
      if (warnings.length > 0) result.warnings = warnings;
      if (optionalBoolean(input, "returnContent")) result.mermaid = source;
      return result;
    }

    // svg / png export
    const rendered = await renderToSvg(source, m);
    const sanitized = sanitizeSvg(rendered);
    const withBackground = ensureBackgroundRect(sanitized.svg, ctx.settings.chartBackground);
    return persistSvgOutput(ctx, input, withBackground, [...warnings, ...sanitized.warnings], {
      defaultBaseName: title || "mermaid-diagram",
      caption: title || undefined,
      pngBackground: ctx.settings.chartBackground,
    });
  };
}
