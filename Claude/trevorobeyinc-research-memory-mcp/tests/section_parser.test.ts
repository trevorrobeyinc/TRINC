import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { excerptOf, findSection, parseSections } from "../src/section_parser.js";

const FIX = (name: string) => readFileSync(`tests/fixtures/${name}`, "utf8");

describe("section_parser", () => {
  it("parses H2 sections from a structured pack", () => {
    const md = FIX("pack-pd1-acme.md");
    const { sections, fallbackUsed } = parseSections(md);
    expect(fallbackUsed).toBe(false);
    expect(sections.map((s) => s.title)).toEqual([
      "Background",
      "Mechanism of Action",
      "Biomarkers of Resistance",
      "Trials in Progress",
      "Safety Signals",
      "Conclusions",
    ]);
  });

  it("falls back to whole-pack section when no H2 exists", () => {
    const md = FIX("pack-flat-pack.md");
    const { sections, fallbackUsed } = parseSections(md);
    expect(fallbackUsed).toBe(true);
    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe("(whole pack)");
  });

  it("findSection is case-insensitive", () => {
    const md = FIX("pack-pd1-acme.md");
    expect(findSection(md, "background")).not.toBeNull();
    expect(findSection(md, "BACKGROUND")).not.toBeNull();
    expect(findSection(md, "nonexistent section")).toBeNull();
  });

  it("excerptOf truncates at maxChars with ellipsis", () => {
    const md = FIX("pack-pd1-acme.md");
    const sec = findSection(md, "Background")!;
    const ex = excerptOf(sec, 80);
    expect(ex.length).toBeLessThanOrEqual(81); // +1 for ellipsis
  });

  it("excerptOf stops at first paragraph break before maxChars", () => {
    const md = "## T\n\nFirst paragraph.\n\nSecond paragraph that is much longer.";
    const { sections } = parseSections(md);
    const ex = excerptOf(sections[0], 200);
    expect(ex).toBe("First paragraph.");
  });
});
