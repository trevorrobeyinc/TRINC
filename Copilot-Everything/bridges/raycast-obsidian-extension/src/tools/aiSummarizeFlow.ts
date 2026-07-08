import { AI } from "@raycast/api";
import fs from "node:fs/promises";

import { BackendEmulatorService } from "@/api/backend-emulator/backendEmulator.service";
import { hybridCreateNote } from "@/api/mcp/hybridObsidian.service";

const defaultSummaryFolder = "obsidian-copilot-summaries";

function sanitizeFilename(rawValue: string): string {
  const invalidCharacterSet = /[<>:"/\\|?*\u0000-\u001F]/g;
  const sanitized = rawValue.replace(invalidCharacterSet, " ").replace(/\s+/g, " ").trim();
  return sanitized || "Untitled Summary";
}

function isCapOrRateLimitError(error: unknown): boolean {
  const text = String(error).toLowerCase();
  return (
    text.includes("429") ||
    text.includes("rate limit") ||
    text.includes("quota") ||
    text.includes("cap reached") ||
    text.includes("too many requests")
  );
}

function buildSummaryPrompt(params: {
  templateContent: string;
  sourceTitle: string;
  sourceText: string;
  sourcePath?: string;
  sourceNoteContent?: string;
}): string {
  const blocks = [
    "You are an expert knowledge curator for an Obsidian vault.",
    "Fill the markdown template by replacing every {{...}} placeholder with concrete values.",
    "Return only the completed markdown. Do not include commentary or code fences.",
    `Summary title: ${params.sourceTitle}`,
    `Template:\n${params.templateContent.trim()}`,
    `Primary source text:\n${params.sourceText.trim()}`,
  ];

  if (params.sourceNoteContent && params.sourceNoteContent.trim()) {
    blocks.push(`Full source note context:\n${params.sourceNoteContent.trim()}`);
  }

  if (params.sourcePath) {
    blocks.push(`Source note path: ${params.sourcePath}`);
  }

  return blocks.join("\n\n");
}

function buildOutputPath(title: string, outputFolder: string): string {
  const safeTitle = sanitizeFilename(title);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${outputFolder}/${safeTitle} summary ${timestamp}.md`;
}

async function askRaycastAIWithFallback(prompt: string): Promise<{ summaryText: string; usedFallbackModel: boolean }> {
  try {
    const content = await AI.ask(prompt, { creativity: "low" });
    return { summaryText: content.trim(), usedFallbackModel: false };
  } catch (error) {
    if (!isCapOrRateLimitError(error)) {
      throw error;
    }

    const fallbackContent = await AI.ask(prompt);
    return { summaryText: fallbackContent.trim(), usedFallbackModel: true };
  }
}

function stripFrontmatter(markdown: string): string {
  const match = markdown.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return match ? markdown.slice(match[0].length) : markdown;
}

/**
 * Build the prompt the SAME way Copilot's "Summarize" custom command does: take the template's own
 * instruction body (YAML frontmatter stripped) and substitute the source content for its `{}`
 * placeholder. This reproduces the reference-note format exactly, instead of re-wrapping the template
 * in a different "fill the {{placeholders}}" framing (which is what made the output drift).
 *
 * When a `noteTitle` is known (e.g. the video title from the source URL), pin it up front: the faithful
 * prompt otherwise carries ONLY the transcript, so the template's `# <Original Note Title>` heading —
 * which it tells the model to take from "its H1 or filename" — gets invented from the transcript. One
 * leading directive line keeps that heading equal to the real title without re-framing the fill.
 */
function buildFaithfulTemplatePrompt(templateContent: string, sourceText: string, noteTitle?: string): string {
  const body = stripFrontmatter(templateContent).trim();
  const source = sourceText.trim();
  const filled = body.includes("{}") ? body.replace("{}", source) : `${body}\n\nSource content:\n${source}`;

  const title = noteTitle?.trim();
  if (!title) {
    return filled;
  }
  const titleDirective = `The source note's title is exactly: ${title}\nUse this EXACT text for the "# <Original Note Title>" heading required by the template below — do not add a timestamp, append "Summary", or invent a different title.`;
  return `${titleDirective}\n\n${filled}`;
}

const defaultAnthropicModel = "claude-sonnet-4-6";

async function askClaude(prompt: string, apiKey: string, model: string): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({ model, max_tokens: 4096, messages: [{ role: "user", content: prompt }] }),
  });
  if (!response.ok) {
    throw new Error(`Anthropic API ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
  const data = (await response.json()) as { content?: Array<{ type: string; text?: string }> };
  const text = (data.content ?? [])
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("")
    .trim();
  if (!text) {
    throw new Error("Anthropic API returned no text content.");
  }
  return text;
}

/**
 * Generate the structured summary by filling the Copilot "Summarize" template, WITHOUT writing it.
 * Claude (Anthropic API) is the intended model — used whenever an API key is provided; Raycast AI is
 * only a fallback when no key is set. Returns the completed markdown for the caller to persist (e.g.
 * write the summary note over the Local REST API) — no Obsidian command, plugin, or modal involved.
 */
export async function generateTemplateSummaryText(params: {
  templatePath: string;
  sourceTitle: string;
  sourceText: string;
  sourceNoteContent?: string;
  sourcePath?: string;
  anthropicApiKey?: string;
  anthropicModel?: string;
}): Promise<{ summaryText: string; usedFallbackModel: boolean; model: string }> {
  const templateContent = await fs.readFile(params.templatePath, "utf-8");
  if (!templateContent.trim()) {
    throw new Error(`Summary template is empty: ${params.templatePath}`);
  }

  const prompt = buildFaithfulTemplatePrompt(templateContent, params.sourceText, params.sourceTitle);

  const apiKey = params.anthropicApiKey?.trim();
  if (apiKey) {
    const model = params.anthropicModel?.trim() || defaultAnthropicModel;
    const summaryText = await askClaude(prompt, apiKey, model);
    return { summaryText, usedFallbackModel: false, model };
  }

  // No Anthropic key set — fall back to Raycast AI so the pipeline still completes.
  const aiResult = await askRaycastAIWithFallback(prompt);
  if (!aiResult.summaryText.trim()) {
    throw new Error("Summary model returned empty text (set the Anthropic API Key pref to use Claude).");
  }
  return { summaryText: aiResult.summaryText, usedFallbackModel: true, model: "raycast-ai" };
}

export async function runTemplateSummaryFromSource(params: {
  vaultName: string;
  vaultPath: string;
  sourceTitle: string;
  sourceText: string;
  sourcePath?: string;
  sourceNoteContent?: string;
  templatePath: string;
  outputFolder?: string;
}): Promise<{ summaryNotePath: string; summaryText: string; usedFallbackModel: boolean }> {
  const templateContent = await fs.readFile(params.templatePath, "utf-8");
  if (!templateContent.trim()) {
    throw new Error(`Summary template is empty: ${params.templatePath}`);
  }

  const outputFolder = params.outputFolder?.trim() || defaultSummaryFolder;
  const prompt = buildSummaryPrompt({
    templateContent,
    sourceTitle: params.sourceTitle,
    sourceText: params.sourceText,
    sourcePath: params.sourcePath,
    sourceNoteContent: params.sourceNoteContent,
  });

  const aiResult = await askRaycastAIWithFallback(prompt);
  if (!aiResult.summaryText.trim()) {
    throw new Error("Raycast AI returned an empty summary.");
  }

  const summaryNotePath = buildOutputPath(params.sourceTitle, outputFolder);
  await hybridCreateNote({
    vault: params.vaultName,
    vaultRoot: params.vaultPath,
    path: summaryNotePath,
    content: aiResult.summaryText,
    overwrite: true,
    open: true,
  });

  return {
    summaryNotePath,
    summaryText: aiResult.summaryText,
    usedFallbackModel: aiResult.usedFallbackModel,
  };
}

export async function runBackendFirstTemplateSummaryFromSource(params: {
  vaultName: string;
  vaultPath: string;
  sourceTitle: string;
  sourceText: string;
  sourcePath?: string;
  sourceNoteContent?: string;
  templatePath: string;
  outputFolder?: string;
}): Promise<{
  summaryNotePath: string;
  summaryText: string;
  usedFallbackModel: boolean;
  usedBackend: boolean;
}> {
  const templateContent = await fs.readFile(params.templatePath, "utf-8");
  if (!templateContent.trim()) {
    throw new Error(`Summary template is empty: ${params.templatePath}`);
  }

  const outputFolder = params.outputFolder?.trim() || defaultSummaryFolder;
  const prompt = buildSummaryPrompt({
    templateContent,
    sourceTitle: params.sourceTitle,
    sourceText: params.sourceText,
    sourcePath: params.sourcePath,
    sourceNoteContent: params.sourceNoteContent,
  });

  let summaryText = "";
  let usedBackend = false;
  let usedFallbackModel = false;

  try {
    const backend = new BackendEmulatorService();
    summaryText = (
      await backend.runAgentTurn({
        userMessage: prompt,
        systemMessage:
          "You are an expert knowledge curator for an Obsidian vault. Return only completed markdown by filling template placeholders.",
        includeReasoning: true,
      })
    ).trim();
    usedBackend = true;
  } catch {
    const aiResult = await askRaycastAIWithFallback(prompt);
    summaryText = aiResult.summaryText;
    usedFallbackModel = aiResult.usedFallbackModel;
  }

  if (!summaryText.trim()) {
    throw new Error("No summary text was produced by backend or local fallback.");
  }

  const summaryNotePath = buildOutputPath(params.sourceTitle, outputFolder);
  await hybridCreateNote({
    vault: params.vaultName,
    vaultRoot: params.vaultPath,
    path: summaryNotePath,
    content: summaryText,
    overwrite: true,
    open: true,
  });

  return {
    summaryNotePath,
    summaryText,
    usedFallbackModel,
    usedBackend,
  };
}
