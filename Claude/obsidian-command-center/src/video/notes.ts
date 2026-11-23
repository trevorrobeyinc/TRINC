// The notes a video run writes, ported on 2026-11-19 from the Raycast extension: the transcription
// note's body (transcriptSection.ts buildDeterministicTranscriptSection, videoTranscribeFlow.ts
// buildVideoSourceNoteContent) and the summary's frontmatter (normalizeSummaryFrontmatter).
//
// The frontmatter rule is a pure string transform here, so Command Center applies it inside Obsidian
// with app.vault.process (atomic, and Obsidian's index sees it at once) instead of a plain file write.
//
// Pure: Node builtins only, tested by test/video-notes.test.ts.

import * as path from "node:path";

function toPosix(value: string): string {
  return value.replace(/\\/g, "/");
}

/**
 * The "Full Transcript" section of a transcription note: a link to the transcript .txt and the whole
 * transcript in a collapsed callout. Byte-identical to the Raycast runner's, so notes from either
 * backend look the same.
 */
export function buildDeterministicTranscriptSection(params: {
  sourceNoteRelativePath: string;
  transcriptRelativePath: string;
  transcriptText: string;
}): string {
  const sourcePath = toPosix(params.sourceNoteRelativePath);
  const transcriptPath = toPosix(params.transcriptRelativePath);
  const sourceDir = path.posix.dirname(sourcePath);
  const rawRelativeLink = path.posix.relative(sourceDir === "." ? "" : sourceDir, transcriptPath) || transcriptPath;

  const lines = params.transcriptText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const calloutLines =
    lines.length === 0 || (lines.length === 1 && lines[0].trim() === "")
      ? ["[Transcript extraction produced no text.]"]
      : lines;
  const calloutBody = calloutLines.map((line) => `> ${line}`).join("\n");

  return `## 📎 Full Transcript\n\n[Transcript TXT](${encodeURI(rawRelativeLink)})\n\n> [!info]- Full Transcript\n${calloutBody}\n`;
}

/** The transcription note the Copilot command summarizes. */
export function buildVideoSourceNoteContent(params: {
  title: string;
  sourceVideoRef: string;
  sourceUrl: string;
  extractedAtIso: string;
  transcriptSection: string;
}): string {
  return `# ${params.title} transcription

## Metadata
- **Source Video**: ${params.sourceVideoRef}
- **Source URL**: ${params.sourceUrl}
- **Extracted**: ${params.extractedAtIso}

${params.transcriptSection}`;
}

/**
 * How the transcription note links its video: a wikilink resolves only for a file INSIDE the vault,
 * so a video elsewhere gets a file:// markdown link instead.
 */
export function sourceVideoReference(videoFile: string, vaultPath: string): string {
  if (videoFile.startsWith(vaultPath + path.sep)) {
    return `[[${toPosix(path.relative(vaultPath, videoFile))}]]`;
  }
  return `[${path.basename(videoFile)}](file://${encodeURI(videoFile)})`;
}

/** Quote a YAML scalar only when leaving it bare would change how it parses. */
export function toYamlScalar(value: string): string {
  const needsQuoting = /^[\s>|&*!%@`{}[\]#-]|:\s|\s#|["']|^$/.test(value);
  return needsQuoting ? quoteYamlScalar(value) : value;
}

function quoteYamlScalar(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * A top-level `key: value` line whose bare value YAML cannot read, with the value quoted. The model writes
 * the other keys, and one such line ("course: Finance Foundations: Corporate Governance", 2026-11-22)
 * makes Obsidian lose EVERY property of the note, `source` included. Lists, quoted values and block
 * values are left alone.
 */
function readableYamlLine(line: string): string {
  const match = /^([A-Za-z_][\w -]*):[ \t]+(\S.*?)[ \t]*$/.exec(line);
  if (!match || /^["'[{|>&*!]/.test(match[2]) || !/:\s|:$|\s#/.test(match[2])) return line;
  return `${match[1]}: ${quoteYamlScalar(match[2])}`;
}

/** The date where the operator is, as YYYY-MM-DD. Not the UTC date, which is tomorrow every afternoon. */
export function localDate(now: Date): string {
  const two = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
}

export type FrontmatterOutcome =
  | { kind: "changed"; content: string; changed: string[] }
  | { kind: "unchanged" }
  | { kind: "no-frontmatter" };

/**
 * Force the summary note's `title`, `created` and `source` to the facts the PIPELINE knows, so every
 * run produces the same frontmatter whatever the model wrote. The Copilot command titles the note
 * after the note it summarized, so its title keeps the " transcription" suffix; asking the model to
 * drop it was rejected as the fix because it varied between runs on the same prompt.
 *
 * Other keys the model chose (description, tags, author, published) keep their values, quoted when YAML
 * could not read them bare; a note with no frontmatter block is left alone rather than guessed at, and
 * the body's H1 follows the title.
 *
 * @param sourceUrl The video's page URL; "" for a local file, where `source` is left as it is.
 */
export function normalizeSummaryFrontmatter(
  content: string,
  facts: { title: string; sourceUrl: string; createdDate: string }
): FrontmatterOutcome {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/.exec(content);
  if (!match) {
    return { kind: "no-frontmatter" };
  }

  const desired: Array<[string, string]> = [
    ["title", facts.title],
    ["created", facts.createdDate],
  ];
  if (facts.sourceUrl) {
    desired.push(["source", facts.sourceUrl]);
  }

  const lines = match[1].split(/\r?\n/);
  const changed: string[] = [];
  for (const [key, value] of desired) {
    const rendered = `${key}: ${toYamlScalar(value)}`;
    // Top-level keys only: an indented line is a nested value (a list item under `tags`).
    const index = lines.findIndex((line) => new RegExp(`^${key}:`).test(line));
    if (index === -1) {
      lines.unshift(rendered);
      changed.push(key);
    } else if (lines[index] !== rendered) {
      lines[index] = rendered;
      changed.push(key);
    }
  }
  lines.forEach((line, index) => {
    const readable = readableYamlLine(line);
    if (readable !== line) {
      lines[index] = readable;
      changed.push(line.slice(0, line.indexOf(":")));
    }
  });
  if (changed.length === 0) {
    return { kind: "unchanged" };
  }

  let body = content.slice(match[0].length);
  const h1 = /^#[ \t]+(.*)$/m.exec(body);
  if (h1 && h1[1].trim() !== facts.title) {
    body = `${body.slice(0, h1.index)}# ${facts.title}${body.slice(h1.index + h1[0].length)}`;
    changed.push("h1");
  }

  return { kind: "changed", content: `---\n${lines.join("\n")}\n---${match[2] || "\n"}${body}`, changed };
}
