// Unit tests for src/video/notes.ts. Run: npm test
// The frontmatter cases are ported 2026-11-19 from the Raycast extension's
// src/tests/videoTranscribeFlow.spec.ts (normalizeSummaryFrontmatter), as a pure string transform.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildDeterministicTranscriptSection,
  buildVideoSourceNoteContent,
  localDate,
  normalizeSummaryFrontmatter,
  sourceVideoReference,
  toYamlScalar,
} from "../src/video/notes.ts";

const facts = {
  title: "Add social media to your marketing mix | LinkedIn Learning",
  sourceUrl: "https://www.linkedin.com/learning/x/add-social-media?u=1",
  createdDate: "2026-09-01",
};

function changedContent(content: string, overrides: Partial<typeof facts> = {}): string {
  const outcome = normalizeSummaryFrontmatter(content, { ...facts, ...overrides });
  assert.equal(outcome.kind, "changed");
  return outcome.kind === "changed" ? outcome.content : "";
}

test("strips the transcription note's ' transcription' suffix from the Copilot command's title", () => {
  const written = changedContent(
    `---\ntitle: ${facts.title} transcription\nsource: ${facts.sourceUrl}\ncreated: 2026-09-01\ntags:\n  - summaries\n---\n\n## Keywords\n`
  );
  assert.ok(written.includes(`title: ${facts.title}\n`));
  assert.ok(!written.includes("transcription"));
});

test("fills the source and created that a model left empty", () => {
  const written = changedContent(`---\ntitle: Lecture\nsource:\nauthor:\npublished:\ncreated:\ntags:\n  - summaries\n---\n\nbody\n`);
  assert.ok(written.includes(`source: ${facts.sourceUrl}\n`));
  assert.ok(written.includes("created: 2026-09-01\n"));
});

test("keeps the model's other keys and the note body", () => {
  const written = changedContent(
    `---\ntitle: Lecture transcription\nsource:\nauthor:\npublished:\ncreated:\ndescription: A lecture about marketing\ntags:\n  - summaries\n---\n\n## Keywords\n- [[Marketing]]\n`
  );
  assert.ok(written.includes("description: A lecture about marketing\n"));
  assert.ok(written.includes("tags:\n  - summaries\n"));
  assert.ok(written.includes("## Keywords\n- [[Marketing]]\n"));
});

test("leaves the existing source alone for a local file (no URL)", () => {
  const written = changedContent(`---\ntitle: Lecture transcription\nsource: keep-me\ncreated:\n---\n\nbody\n`, { sourceUrl: "" });
  assert.ok(written.includes("source: keep-me\n"));
});

test("aligns the body's H1 with the canonical title", () => {
  const written = changedContent(
    `---\ntitle: Lecture transcription\ncreated:\n---\n\n## Keywords\n- [[Marketing]]\n\n# ${facts.title} transcription\n\n## 🧠 Core Concept\n`
  );
  assert.ok(written.includes(`# ${facts.title}\n`));
  assert.ok(!written.includes("transcription"));
  assert.ok(written.includes("## 🧠 Core Concept\n"));
});

test("leaves a note with no frontmatter block alone, and reports a note that is already right", () => {
  assert.deepEqual(normalizeSummaryFrontmatter("# Lecture\n\nNo frontmatter here.\n", facts), { kind: "no-frontmatter" });
  const right = `---\ntitle: "${facts.title}"\ncreated: 2026-09-01\nsource: ${facts.sourceUrl}\n---\n\n# ${facts.title}\n`;
  assert.equal(toYamlScalar(facts.title), facts.title); // " | " needs no quotes...
  const settled = changedContent(right); // ...so the quoted form is rewritten once,
  assert.deepEqual(normalizeSummaryFrontmatter(settled, facts), { kind: "unchanged" }); // and then stays.
});

test("toYamlScalar quotes only what would otherwise parse differently", () => {
  assert.equal(toYamlScalar("Lesson 2 - Basics"), "Lesson 2 - Basics");
  assert.equal(toYamlScalar("Part 1: Intro"), '"Part 1: Intro"');
  assert.equal(toYamlScalar("#hashtag"), '"#hashtag"');
  assert.equal(toYamlScalar('say "hi"'), '"say \\"hi\\""');
});

test("the transcript section links the .txt relative to the note and carries the whole transcript", () => {
  const section = buildDeterministicTranscriptSection({
    sourceNoteRelativePath: "Video Downloads/Solo talk transcription.md",
    transcriptRelativePath: "Video Downloads/.transcripts/Solo talk.txt",
    transcriptText: "line one\nline two",
  });
  assert.equal(
    section,
    "## 📎 Full Transcript\n\n[Transcript TXT](.transcripts/Solo%20talk.txt)\n\n> [!info]- Full Transcript\n> line one\n> line two\n"
  );
  assert.ok(
    buildDeterministicTranscriptSection({ sourceNoteRelativePath: "a.md", transcriptRelativePath: "b.txt", transcriptText: "" }).includes(
      "> [Transcript extraction produced no text.]"
    )
  );
});

test("the transcription note links a vault video by wikilink and any other video by file:// link", () => {
  assert.equal(sourceVideoReference("/vault/Video Downloads/Talk.mp4", "/vault"), "[[Video Downloads/Talk.mp4]]");
  assert.equal(sourceVideoReference("/Users/me/Movies/My Talk.mp4", "/vault"), "[My Talk.mp4](file:///Users/me/Movies/My%20Talk.mp4)");
  assert.equal(sourceVideoReference("/vault-other/Talk.mp4", "/vault"), "[Talk.mp4](file:///vault-other/Talk.mp4)");
  const note = buildVideoSourceNoteContent({
    title: "Talk",
    sourceVideoRef: "[[Video Downloads/Talk.mp4]]",
    sourceUrl: "file:///vault/Video Downloads/Talk.mp4",
    extractedAtIso: "2026-11-19T00:00:00.000Z",
    transcriptSection: "## 📎 Full Transcript\n",
  });
  assert.ok(note.startsWith("# Talk transcription\n\n## Metadata\n- **Source Video**: [[Video Downloads/Talk.mp4]]\n"));
  assert.ok(note.endsWith("- **Extracted**: 2026-11-19T00:00:00.000Z\n\n## 📎 Full Transcript\n"));
});

// 2026-11-22, the first live link run: one bare colon in a line the model wrote, and Obsidian read no
// property of the note at all.
test("a value YAML could not read bare is quoted, and every other line is left as it was", () => {
  const kept = [
    'transcript: "[[Scandals: part 1 transcription]]"',
    "type: video-summary",
    "author:",
    "ratio: 16:9",
    "link: https://example.com/a#b",
    "tags: [a: b, c]",
    "note: 'quoted: already'",
    "block: |",
    "  text: inside: a block",
    "list:",
    "  - item: nested",
  ];
  const written = changedContent(
    [
      "---",
      `title: ${facts.title}`,
      "created: 2026-09-01",
      `source: ${facts.sourceUrl}`,
      "course: Finance Foundations: Corporate Governance",
      'description: What "fraud" means: a walk # through',
      "series: Law:",
      "remark: before # after",
      ...kept,
      "---",
      "",
      "## Keywords",
      "course: a line in the body: untouched",
      "",
    ].join("\n")
  );
  assert.ok(written.includes('\ncourse: "Finance Foundations: Corporate Governance"\n'), written);
  assert.ok(written.includes('\ndescription: "What \\"fraud\\" means: a walk # through"\n'), written);
  assert.ok(written.includes('\nseries: "Law:"\n'), written);
  assert.ok(written.includes('\nremark: "before # after"\n'), written);
  for (const line of kept) assert.ok(written.includes(`\n${line}\n`), `${line} was changed:\n${written}`);
  assert.ok(written.includes("\ncourse: a line in the body: untouched\n"));
  // Running it again changes nothing.
  assert.deepEqual(normalizeSummaryFrontmatter(written, facts), { kind: "unchanged" });
});

test("the keys it quoted are named, so the run log says what was changed", () => {
  const outcome = normalizeSummaryFrontmatter(
    `---\ntitle: ${facts.title}\ncreated: 2026-09-01\nsource: ${facts.sourceUrl}\ncourse: A: B\n---\n`,
    facts
  );
  assert.deepEqual(outcome.kind === "changed" ? outcome.changed : null, ["course"]);
});

test("created is the date where the operator is, at any hour", () => {
  assert.equal(localDate(new Date(2026, 10, 22, 16, 31)), "2026-11-22");
  assert.equal(localDate(new Date(2026, 10, 22, 23, 59, 59)), "2026-11-22");
  assert.equal(localDate(new Date(2026, 0, 5, 0, 0, 0)), "2026-01-05");
});
