/**
 * Markdown section parser. Splits a pack body by H{level} headings.
 * Used by pack_diff and pack_get_section.
 *
 * Plan section: Phase 3 (pack_diff section-keyed model).
 * Falls back to "whole pack as one section" if no headings at the configured level exist.
 */
import type { Section } from "./types.js";

const DEFAULT_LEVEL = Number(process.env.SECTION_HEADING_LEVEL || "2");

function headingPattern(level: number): RegExp {
  return new RegExp(`^${"#".repeat(level)} +(.+?)\\s*$`);
}

export function parseSections(
  md: string,
  level: number = DEFAULT_LEVEL,
): { sections: Section[]; fallbackUsed: boolean } {
  const lines = md.split("\n");
  const re = headingPattern(level);

  const indices: { line: number; title: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(re);
    if (m) indices.push({ line: i, title: m[1].trim() });
  }

  if (indices.length === 0) {
    return {
      sections: [
        {
          title: "(whole pack)",
          body: md.trim(),
          startLine: 0,
        },
      ],
      fallbackUsed: true,
    };
  }

  const sections: Section[] = [];
  for (let i = 0; i < indices.length; i++) {
    const start = indices[i].line;
    const end = i + 1 < indices.length ? indices[i + 1].line : lines.length;
    const body = lines.slice(start, end).join("\n").trimEnd();
    sections.push({ title: indices[i].title, body, startLine: start });
  }
  return { sections, fallbackUsed: false };
}

export function findSection(
  md: string,
  title: string,
  level: number = DEFAULT_LEVEL,
): Section | null {
  const { sections } = parseSections(md, level);
  const norm = title.trim().toLowerCase();
  return sections.find((s) => s.title.trim().toLowerCase() === norm) ?? null;
}

export function excerptOf(section: Section, maxChars: number): string {
  // Skip the heading line; an excerpt is always the first paragraph
  // (up to the first blank-line separator) capped at maxChars.
  const body = section.body.replace(/^#+ +.+\n+/, "").trim();
  const para = body.indexOf("\n\n");
  const firstPara = para > 0 ? body.slice(0, para).trim() : body;
  if (firstPara.length <= maxChars) return firstPara;
  return firstPara.slice(0, maxChars).trimEnd() + "…";
}
