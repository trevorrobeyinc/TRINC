import path from "node:path";

function normalizePosix(value: string): string {
  return value.replace(/\\/g, "/");
}

function normalizeTranscriptLines(transcript: string): string[] {
  const normalized = transcript.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  return lines.length > 0 ? lines : [];
}

function normalizeMarkdown(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function stripCopilotCommandFrontmatter(markdown: string): string {
  const frontmatterMatch = markdown.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!frontmatterMatch) {
    return markdown;
  }

  const rawBody = frontmatterMatch[1];
  const cleanedLines = rawBody
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0 && !line.trim().startsWith("copilot-command-"));

  const contentAfterFrontmatter = markdown.slice(frontmatterMatch[0].length).replace(/^\n+/, "");
  if (cleanedLines.length === 0) {
    return contentAfterFrontmatter;
  }

  return `---\n${cleanedLines.join("\n")}\n---\n${contentAfterFrontmatter}`;
}

export function buildDeterministicTranscriptSection(params: {
  sourceNoteRelativePath: string;
  transcriptRelativePath: string;
  transcriptText: string;
}): string {
  const sourcePath = normalizePosix(params.sourceNoteRelativePath);
  const transcriptPath = normalizePosix(params.transcriptRelativePath);
  const sourceDir = path.posix.dirname(sourcePath);

  const rawRelativeLink = path.posix.relative(sourceDir === "." ? "" : sourceDir, transcriptPath) || transcriptPath;
  const markdownLinkPath = encodeURI(rawRelativeLink);

  const transcriptLines = normalizeTranscriptLines(params.transcriptText);
  const linesForCallout =
    transcriptLines.length === 0 || (transcriptLines.length === 1 && transcriptLines[0].trim() === "")
      ? ["[Transcript extraction produced no text.]"]
      : transcriptLines;

  const calloutBody = linesForCallout.map((line) => `> ${line}`).join("\n");

  return `## 📎 Full Transcript\n\n[Transcript TXT](${markdownLinkPath})\n\n> [!info]- Full Transcript\n${calloutBody}\n`;
}

export function injectDeterministicTranscriptSection(markdown: string, transcriptSection: string): string {
  const normalizedMarkdown = stripCopilotCommandFrontmatter(normalizeMarkdown(markdown)).trimEnd();
  const normalizedTranscriptSection = normalizeMarkdown(transcriptSection).trimEnd();
  const withoutExistingTranscript = normalizedMarkdown.replace(/\n*##\s+📎 Full Transcript[\s\S]*$/m, "").trimEnd();

  if (!withoutExistingTranscript) {
    return `${normalizedTranscriptSection}\n`;
  }

  return `${withoutExistingTranscript}\n\n${normalizedTranscriptSection}\n`;
}
