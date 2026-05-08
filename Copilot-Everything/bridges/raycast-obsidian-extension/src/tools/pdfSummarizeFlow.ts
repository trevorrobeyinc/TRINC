import { open, popToRoot, showToast, Toast } from "@raycast/api";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { BackendEmulatorService } from "@/api/backend-emulator/backendEmulator.service";
import { hybridCreateNote } from "@/api/mcp/hybridObsidian.service";
import { getVaultsFromPreferencesOrObsidianJson } from "@/obsidian/internal/obsidian";
import { runBackendFirstTemplateSummaryFromSource } from "@/tools/aiSummarizeFlow";
import { buildDeterministicTranscriptSection, injectDeterministicTranscriptSection } from "@/tools/transcriptSection";

const execFileAsync = promisify(execFile);

export interface PdfCommandPreferences {
  vaultPath?: string;
  summarizeTemplatePath?: string;
  summaryOutputFolder?: string;
  pdfTextExtractorPath?: string;
  pdfDownloadFolder?: string;
  pdfOcrFallbackEnabled?: boolean;
  pdfOcrLanguage?: string;
  pdfOcrDpi?: string;
  pdfOcrMaxPages?: string;
}

export interface PdfSummarizeFormValues {
  pdfPath: string;
}

interface ProcessExecutionError extends Error {
  stdout?: string | Buffer;
  stderr?: string | Buffer;
}

interface PdfPaths {
  absolutePdfPath: string;
  relativePdfPath: string;
  relativeFolderPath: string;
  baseName: string;
}

interface ExtractorCandidate {
  command: string;
  label: string;
  args: (pdfPath: string) => string[];
}

interface ResolvedPdfSource {
  pdfPaths: PdfPaths;
  sourceUrl?: string;
}

export interface PdfSummarizeResult {
  sourceNoteRelativePath: string;
  transcriptRelativePath: string;
  summaryNotePath: string;
  usedBackend: boolean;
  usedFallbackModel: boolean;
}

const defaultExecPathEntries = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"] as const;
const defaultSummaryTemplateRelativePath = "copilot/copilot-custom-prompts/Summarize.md";
const defaultSummaryOutputFolder = "obsidian-copilot-summaries";
const defaultPdfDownloadFolder = "PDF Downloads";
const defaultPdfOcrLanguage = "eng";
const defaultPdfOcrDpi = 220;
const defaultPdfOcrMaxPages = 0;
const defaultTesseractCommands = ["tesseract", "/opt/homebrew/bin/tesseract", "/usr/local/bin/tesseract"] as const;
const defaultPdfToPpmCommands = ["pdftoppm", "/opt/homebrew/bin/pdftoppm", "/usr/local/bin/pdftoppm"] as const;

function toPosixPath(value: string): string {
  return value.replace(/\\/g, "/");
}

function buildExecPath(value: string | undefined): string {
  const entries = (value || "")
    .split(":")
    .map((entry) => entry.trim())
    .filter(Boolean);

  for (const requiredEntry of defaultExecPathEntries) {
    if (!entries.includes(requiredEntry)) {
      entries.push(requiredEntry);
    }
  }

  return entries.join(":");
}

function createExecEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PATH: buildExecPath(process.env.PATH),
  };
}

function toErrorOutputText(value: string | Buffer | undefined): string {
  if (typeof value === "string") {
    return value;
  }
  if (Buffer.isBuffer(value)) {
    return value.toString("utf-8");
  }
  return "";
}

function extractProcessErrorText(error: unknown): string {
  if (!error || typeof error !== "object") {
    return "";
  }

  const processError = error as ProcessExecutionError;
  const stderrText = toErrorOutputText(processError.stderr).trim();
  if (stderrText) {
    return stderrText;
  }

  const stdoutText = toErrorOutputText(processError.stdout).trim();
  if (stdoutText) {
    return stdoutText;
  }

  return "";
}

function normalizeVaultRelativeFolder(folderPreference: string | undefined): string {
  const folderInput = folderPreference?.trim() || defaultPdfDownloadFolder;
  const normalized = toPosixPath(path.posix.normalize(folderInput.replace(/^\/+/, ""))).replace(/^\.\/+/, "");

  if (!normalized || normalized === ".") {
    return defaultPdfDownloadFolder;
  }

  if (normalized === ".." || normalized.startsWith("../") || path.posix.isAbsolute(normalized)) {
    throw new Error("PDF download folder must be inside the configured vault.");
  }

  return normalized;
}

async function resolvePrimaryVaultPath(prefs: PdfCommandPreferences): Promise<string> {
  const fromPrefs = prefs.vaultPath
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .find((value) => existsSync(value));

  if (fromPrefs) {
    return fromPrefs;
  }

  const vaults = await getVaultsFromPreferencesOrObsidianJson();
  if (vaults.length > 0) {
    return vaults[0].path;
  }

  throw new Error("No Obsidian vault path configured. Set Path to Vault in extension preferences.");
}

function resolveSummaryTemplatePath(vaultPath: string, prefs: PdfCommandPreferences): string {
  const configured = prefs.summarizeTemplatePath?.trim();
  if (configured) {
    return configured;
  }

  return path.join(vaultPath, ...defaultSummaryTemplateRelativePath.split("/"));
}

function resolveSummaryOutputFolder(prefs: PdfCommandPreferences): string {
  const configured = prefs.summaryOutputFolder?.trim() || defaultSummaryOutputFolder;
  const normalized = toPosixPath(path.posix.normalize(configured.replace(/^\/+/, ""))).replace(/^\.\/+/, "");
  if (!normalized || normalized === ".") {
    return defaultSummaryOutputFolder;
  }
  if (normalized === ".." || normalized.startsWith("../") || path.posix.isAbsolute(normalized)) {
    throw new Error("Summary output folder must be inside the configured vault.");
  }
  return normalized;
}

function normalizeUserPathInput(inputPath: string): string {
  let normalized = inputPath.trim();

  const quotePairs: Array<[string, string]> = [
    ["'", "'"],
    ['"', '"'],
    ["`", "`"],
    ["“", "”"],
    ["‘", "’"],
  ];

  for (const [open, close] of quotePairs) {
    if (normalized.startsWith(open) && normalized.endsWith(close) && normalized.length >= open.length + close.length) {
      normalized = normalized.slice(open.length, normalized.length - close.length).trim();
      break;
    }
  }

  if (normalized.toLowerCase().startsWith("file://")) {
    const withoutScheme = normalized.replace(/^file:\/\//i, "");
    try {
      normalized = decodeURIComponent(withoutScheme);
    } catch {
      normalized = withoutScheme;
    }
    if (process.platform === "win32" && /^\/[A-Za-z]:/.test(normalized)) {
      normalized = normalized.slice(1);
    }
  }

  return normalized;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function sanitizePdfFilename(rawFilename: string): string {
  const invalidCharacterSet = new Set(["<", ">", ":", '"', "/", "\\", "|", "?", "*"]);
  let cleaned = "";

  for (const char of rawFilename) {
    const code = char.charCodeAt(0);
    if (code < 32 || code === 127 || invalidCharacterSet.has(char)) {
      cleaned += " ";
    } else {
      cleaned += char;
    }
  }

  const compact = cleaned.replace(/\s+/g, " ").trim();
  let filename = compact || `downloaded-pdf-${Date.now()}`;
  if (!filename.toLowerCase().endsWith(".pdf")) {
    filename = `${filename}.pdf`;
  }
  return filename;
}

function derivePdfFilenameFromUrl(sourceUrl: string): string {
  try {
    const parsed = new URL(sourceUrl);
    const basename = path.posix.basename(parsed.pathname || "");
    const decoded = basename ? decodeURIComponent(basename) : "";
    return sanitizePdfFilename(decoded || "downloaded-pdf.pdf");
  } catch {
    return sanitizePdfFilename("downloaded-pdf.pdf");
  }
}

function makeUniqueFilename(absoluteDirectoryPath: string, desiredFilename: string): string {
  if (!existsSync(path.join(absoluteDirectoryPath, desiredFilename))) {
    return desiredFilename;
  }

  const extension = path.extname(desiredFilename) || ".pdf";
  const basename = path.basename(desiredFilename, extension);
  let index = 2;
  while (index < 1000) {
    const candidate = `${basename} ${index}${extension}`;
    if (!existsSync(path.join(absoluteDirectoryPath, candidate))) {
      return candidate;
    }
    index += 1;
  }

  return `${basename}-${Date.now()}${extension}`;
}

async function downloadUrlToBuffer(sourceUrl: string, redirectDepth = 0): Promise<Buffer> {
  const maxRedirects = 6;
  const maxBytes = 200 * 1024 * 1024;
  if (redirectDepth > maxRedirects) {
    throw new Error("Too many redirects while downloading PDF.");
  }

  return new Promise<Buffer>((resolve, reject) => {
    const parsed = new URL(sourceUrl);
    const client = parsed.protocol === "http:" ? http : https;

    const request = client.get(
      sourceUrl,
      {
        timeout: 30000,
        headers: {
          "User-Agent": "Raycast-Obsidian-PDF/1.0",
          Accept: "application/pdf,*/*",
        },
      },
      (response) => {
        const statusCode = response.statusCode || 0;

        if ([301, 302, 303, 307, 308].includes(statusCode)) {
          const location = response.headers.location;
          response.resume();
          if (!location) {
            reject(new Error("PDF download redirected without a location header."));
            return;
          }

          try {
            const nextUrl = new URL(location, sourceUrl).toString();
            resolve(downloadUrlToBuffer(nextUrl, redirectDepth + 1));
          } catch {
            reject(new Error("Failed to resolve redirected PDF URL."));
          }
          return;
        }

        if (statusCode < 200 || statusCode >= 300) {
          response.resume();
          reject(new Error(`PDF download failed with HTTP ${statusCode}.`));
          return;
        }

        const chunks: Buffer[] = [];
        let totalBytes = 0;

        response.on("data", (chunk: Buffer) => {
          const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          totalBytes += value.length;
          if (totalBytes > maxBytes) {
            request.destroy(new Error("PDF download exceeded 200 MB limit."));
            return;
          }
          chunks.push(value);
        });

        response.on("end", () => {
          const payload = Buffer.concat(chunks);
          if (payload.length < 5 || payload.slice(0, 5).toString("utf-8") !== "%PDF-") {
            reject(new Error("Downloaded file is not a valid PDF (missing %PDF- signature)."));
            return;
          }
          resolve(payload);
        });
      }
    );

    request.on("timeout", () => {
      request.destroy(new Error("Timed out while downloading PDF."));
    });

    request.on("error", (error) => {
      reject(error);
    });
  });
}

async function resolvePdfSource(vaultPath: string, pdfInput: string, pdfDownloadFolderPreference: string | undefined): Promise<ResolvedPdfSource> {
  const trimmedInput = normalizeUserPathInput(pdfInput);
  if (!trimmedInput) {
    throw new Error("PDF path or URL is required.");
  }

  if (isHttpUrl(trimmedInput)) {
    const relativeFolder = normalizeVaultRelativeFolder(pdfDownloadFolderPreference);
    const absoluteFolder = path.join(vaultPath, ...relativeFolder.split("/"));
    await fs.mkdir(absoluteFolder, { recursive: true });

    const suggestedFilename = derivePdfFilenameFromUrl(trimmedInput);
    const filename = makeUniqueFilename(absoluteFolder, suggestedFilename);
    const absolutePdfPath = path.join(absoluteFolder, filename);

    const payload = await downloadUrlToBuffer(trimmedInput);
    await fs.writeFile(absolutePdfPath, payload);

    const relativePdfPath = toPosixPath(path.relative(vaultPath, absolutePdfPath));
    const relativeFolderPath = toPosixPath(path.posix.dirname(relativePdfPath));
    const baseName = path.basename(relativePdfPath, path.extname(relativePdfPath));

    return {
      sourceUrl: trimmedInput,
      pdfPaths: {
        absolutePdfPath,
        relativePdfPath,
        relativeFolderPath,
        baseName,
      },
    };
  }

  const expanded = trimmedInput.startsWith("~") ? path.join(os.homedir(), trimmedInput.slice(1)) : trimmedInput;
  const absolutePdfPath = path.resolve(expanded);

  if (!existsSync(absolutePdfPath)) {
    throw new Error(`PDF file does not exist: ${absolutePdfPath}`);
  }

  const stat = await fs.stat(absolutePdfPath);
  if (!stat.isFile()) {
    throw new Error(`PDF path is not a file: ${absolutePdfPath}`);
  }

  const relativePdfPath = toPosixPath(path.relative(vaultPath, absolutePdfPath));
  if (relativePdfPath.startsWith("../") || path.isAbsolute(relativePdfPath)) {
    throw new Error("PDF path must be inside the configured vault, or provide an HTTP/HTTPS URL.");
  }

  const relativeFolderPath = toPosixPath(path.posix.dirname(relativePdfPath));
  const baseName = path.basename(relativePdfPath, path.extname(relativePdfPath));

  return {
    pdfPaths: {
      absolutePdfPath,
      relativePdfPath,
      relativeFolderPath,
      baseName,
    },
  };
}

function normalizeExtractedText(rawText: string): string {
  return rawText
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\t/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildExtractorCandidates(preferredExtractorPath?: string): ExtractorCandidate[] {
  const candidates: ExtractorCandidate[] = [];
  const normalizedPreferred = preferredExtractorPath?.trim();

  if (normalizedPreferred) {
    candidates.push({
      command: normalizedPreferred,
      label: `Preferred extractor (${normalizedPreferred})`,
      args: (pdfPath) => [pdfPath, "-"],
    });
  }

  candidates.push(
    {
      command: "pdftotext",
      label: "pdftotext",
      args: (pdfPath) => [pdfPath, "-"],
    },
    {
      command: "/opt/homebrew/bin/pdftotext",
      label: "pdftotext (homebrew)",
      args: (pdfPath) => [pdfPath, "-"],
    },
    {
      command: "/usr/local/bin/pdftotext",
      label: "pdftotext (usr-local)",
      args: (pdfPath) => [pdfPath, "-"],
    },
    {
      command: "mutool",
      label: "mutool draw",
      args: (pdfPath) => ["draw", "-F", "txt", pdfPath],
    }
  );

  const unique = new Map<string, ExtractorCandidate>();
  for (const candidate of candidates) {
    if (!unique.has(candidate.command)) {
      unique.set(candidate.command, candidate);
    }
  }

  return [...unique.values()];
}

function parseIntegerPreference(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value?.trim() || "", 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

async function getPdfPageCount(absolutePdfPath: string): Promise<number> {
  const candidates = ["pdfinfo", "/opt/homebrew/bin/pdfinfo", "/usr/local/bin/pdfinfo"];

  for (const candidate of candidates) {
    try {
      const result = await execFileAsync(candidate, [absolutePdfPath], {
        env: createExecEnv(),
        maxBuffer: 16 * 1024 * 1024,
      });
      const output = String(result.stdout || "");
      const match = output.match(/^Pages:\s*(\d+)/im);
      if (match) {
        return Number.parseInt(match[1], 10);
      }
    } catch {
      // continue
    }
  }

  return 0;
}

function isSparseExtractedText(text: string, pageCount: number): boolean {
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) {
    return true;
  }

  if (pageCount <= 0) {
    return compact.length < 120;
  }

  const charsPerPage = compact.length / pageCount;
  return charsPerPage < 100;
}

async function findAvailableCommand(candidates: readonly string[]): Promise<string> {
  for (const command of candidates) {
    try {
      await execFileAsync(command, ["--version"], { env: createExecEnv(), maxBuffer: 2 * 1024 * 1024 });
      return command;
    } catch {
      // continue
    }
  }

  throw new Error(`Required command not found. Tried: ${candidates.join(", ")}`);
}

async function extractTextFromPdfWithOcr(options: {
  absolutePdfPath: string;
  language: string;
  dpi: number;
  maxPages: number;
}): Promise<{ text: string; extractorLabel: string }> {
  const pdftoppmCommand = await findAvailableCommand(defaultPdfToPpmCommands);
  const tesseractCommand = await findAvailableCommand(defaultTesseractCommands);

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "raycast-obsidian-pdf-ocr-"));
  const imagePrefix = path.join(tempRoot, "page");

  try {
    const pdftoppmArgs = ["-r", String(options.dpi), "-png"];
    if (options.maxPages > 0) {
      pdftoppmArgs.push("-f", "1", "-l", String(options.maxPages));
    }
    pdftoppmArgs.push(options.absolutePdfPath, imagePrefix);

    await execFileAsync(pdftoppmCommand, pdftoppmArgs, {
      env: createExecEnv(),
      maxBuffer: 64 * 1024 * 1024,
    });

    const renderedImages = (await fs.readdir(tempRoot))
      .filter((name) => name.startsWith("page-") && name.toLowerCase().endsWith(".png"))
      .sort((left, right) => left.localeCompare(right));

    if (renderedImages.length === 0) {
      throw new Error("OCR fallback rendered no pages.");
    }

    const pageTexts: string[] = [];
    for (const imageName of renderedImages) {
      const imagePath = path.join(tempRoot, imageName);
      const outputBase = path.join(tempRoot, `${imageName}.ocr`);

      await execFileAsync(
        tesseractCommand,
        [imagePath, outputBase, "-l", options.language, "--dpi", String(options.dpi)],
        {
          env: createExecEnv(),
          maxBuffer: 64 * 1024 * 1024,
        }
      );

      const textPath = `${outputBase}.txt`;
      if (!existsSync(textPath)) {
        continue;
      }

      const text = normalizeExtractedText(await fs.readFile(textPath, "utf-8"));
      if (text) {
        pageTexts.push(text);
      }
    }

    const combined = normalizeExtractedText(pageTexts.join("\n\n"));
    if (!combined) {
      throw new Error("OCR fallback produced no readable text.");
    }

    const pageLimitSuffix = options.maxPages > 0 ? `, first ${options.maxPages} pages` : "";
    return {
      text: combined,
      extractorLabel: `OCR fallback (pdftoppm + tesseract${pageLimitSuffix})`,
    };
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

function resolveOcrSettings(prefs: PdfCommandPreferences): {
  enabled: boolean;
  language: string;
  dpi: number;
  maxPages: number;
} {
  return {
    enabled: prefs.pdfOcrFallbackEnabled ?? true,
    language: prefs.pdfOcrLanguage?.trim() || defaultPdfOcrLanguage,
    dpi: parseIntegerPreference(prefs.pdfOcrDpi, defaultPdfOcrDpi),
    maxPages: parseIntegerPreference(prefs.pdfOcrMaxPages, defaultPdfOcrMaxPages),
  };
}

async function extractTextFromPdf(
  absolutePdfPath: string,
  options: {
    preferredExtractorPath?: string;
    ocrSettings: ReturnType<typeof resolveOcrSettings>;
  }
): Promise<{ text: string; extractorLabel: string }> {
  const candidates = buildExtractorCandidates(options.preferredExtractorPath);
  const errors: string[] = [];
  let bestExtraction: { text: string; extractorLabel: string } | null = null;

  for (const candidate of candidates) {
    try {
      const result = await execFileAsync(candidate.command, candidate.args(absolutePdfPath), {
        env: createExecEnv(),
        maxBuffer: 128 * 1024 * 1024,
      });
      const extractedText = normalizeExtractedText(String(result.stdout ?? ""));
      if (extractedText) {
        if (!bestExtraction || extractedText.length > bestExtraction.text.length) {
          bestExtraction = {
            text: extractedText,
            extractorLabel: candidate.label,
          };
        }
      } else {
        errors.push(`${candidate.label}: extractor returned empty output`);
      }
    } catch (error) {
      const processMessage = extractProcessErrorText(error);
      if (processMessage) {
        errors.push(`${candidate.label}: ${processMessage}`);
      } else if (error instanceof Error) {
        errors.push(`${candidate.label}: ${error.message}`);
      } else {
        errors.push(`${candidate.label}: ${String(error)}`);
      }
    }
  }

  if (options.ocrSettings.enabled) {
    const pageCount = await getPdfPageCount(absolutePdfPath);
    const shouldTryOcr = !bestExtraction || isSparseExtractedText(bestExtraction.text, pageCount);

    if (shouldTryOcr) {
      try {
        const ocrExtraction = await extractTextFromPdfWithOcr({
          absolutePdfPath,
          language: options.ocrSettings.language,
          dpi: options.ocrSettings.dpi,
          maxPages: options.ocrSettings.maxPages,
        });

        if (!bestExtraction || ocrExtraction.text.length >= bestExtraction.text.length) {
          return ocrExtraction;
        }
      } catch (error) {
        const processMessage = extractProcessErrorText(error);
        errors.push(
          processMessage
            ? `OCR fallback: ${processMessage}`
            : `OCR fallback: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  if (bestExtraction) {
    return bestExtraction;
  }

  throw new Error(
    `No PDF text extractor succeeded. Tried ${candidates.length} options. Last errors: ${errors.slice(-3).join(" | ")}`
  );
}

function buildPdfSourceNoteContent(params: {
  title: string;
  sourcePdfPath: string;
  sourceUrl?: string;
  extractorLabel: string;
  extractedAtIso: string;
  transcriptSection: string;
}): string {
  const sourceUrlLine = params.sourceUrl ? `- **Source URL**: ${params.sourceUrl}\n` : "";

  return `# ${params.title} transcription

## Metadata
- **Source PDF**: [[${params.sourcePdfPath}]]
${sourceUrlLine}- **Extracted**: ${params.extractedAtIso}
- **Extractor**: ${params.extractorLabel}

${params.transcriptSection}`;
}

export async function runPdfSummarizeCommand(
  values: PdfSummarizeFormValues,
  prefs: PdfCommandPreferences
): Promise<PdfSummarizeResult> {
  const toast = await showToast({ style: Toast.Style.Animated, title: "Preparing PDF source..." });
  let sourceNoteRelativePath = "";

  try {
    const vaultPath = await resolvePrimaryVaultPath(prefs);
    const vaultName = path.basename(vaultPath);
    const resolvedSource = await resolvePdfSource(vaultPath, values.pdfPath, prefs.pdfDownloadFolder);
    const pdfPaths = resolvedSource.pdfPaths;

    toast.title = "Extracting PDF text...";
    const backendService = new BackendEmulatorService();
    let extraction:
      | {
          text: string;
          extractorLabel: string;
        }
      | null = null;

    try {
      const backendParse = await backendService.parseDoc(pdfPaths.absolutePdfPath);
      const parsedText = (backendParse.text || "").trim();
      if (parsedText) {
        extraction = {
          text: normalizeExtractedText(parsedText),
          extractorLabel: "Backend Emulator /v0/parse-doc",
        };
      }
    } catch {
      extraction = null;
    }

    if (!extraction) {
      extraction = await extractTextFromPdf(pdfPaths.absolutePdfPath, {
        preferredExtractorPath: prefs.pdfTextExtractorPath,
        ocrSettings: resolveOcrSettings(prefs),
      });
    }

    const transcriptFolderPath =
      pdfPaths.relativeFolderPath === "."
        ? ".transcripts"
        : toPosixPath(path.posix.join(pdfPaths.relativeFolderPath, ".transcripts"));
    const transcriptRelativePath = toPosixPath(path.posix.join(transcriptFolderPath, `${pdfPaths.baseName}.txt`));
    const sourceNotePath =
      pdfPaths.relativeFolderPath === "."
        ? `${pdfPaths.baseName} transcription.md`
        : toPosixPath(path.posix.join(pdfPaths.relativeFolderPath, `${pdfPaths.baseName} transcription.md`));
    sourceNoteRelativePath = sourceNotePath;

    const transcriptAbsolutePath = path.join(vaultPath, ...transcriptRelativePath.split("/"));
    await fs.mkdir(path.dirname(transcriptAbsolutePath), { recursive: true });
    await fs.writeFile(transcriptAbsolutePath, `${extraction.text}\n`, "utf-8");

    const transcriptSection = buildDeterministicTranscriptSection({
      sourceNoteRelativePath: sourceNotePath,
      transcriptRelativePath,
      transcriptText: extraction.text,
    });

    const sourceNoteContent = buildPdfSourceNoteContent({
      title: pdfPaths.baseName,
      sourcePdfPath: pdfPaths.relativePdfPath,
      sourceUrl: resolvedSource.sourceUrl,
      extractorLabel: extraction.extractorLabel,
      extractedAtIso: new Date().toISOString(),
      transcriptSection,
    });

    toast.title = "Saving source note...";
    await hybridCreateNote({
      vault: vaultName,
      vaultRoot: vaultPath,
      path: sourceNotePath,
      content: sourceNoteContent,
      overwrite: true,
    });

    toast.title = "Generating summary with Backend Emulator...";
    const summaryResult = await runBackendFirstTemplateSummaryFromSource({
      vaultName,
      vaultPath,
      sourceTitle: pdfPaths.baseName,
      sourceText: extraction.text,
      sourcePath: sourceNotePath,
      sourceNoteContent,
      templatePath: resolveSummaryTemplatePath(vaultPath, prefs),
      outputFolder: resolveSummaryOutputFolder(prefs),
    });

    // Keep the source note in the same structured style as summary notes while enforcing deterministic transcript rendering.
    const finalizedSourceNoteContent = injectDeterministicTranscriptSection(summaryResult.summaryText, transcriptSection);
    await hybridCreateNote({
      vault: vaultName,
      vaultRoot: vaultPath,
      path: sourceNotePath,
      content: finalizedSourceNoteContent,
      overwrite: true,
    });

    toast.style = Toast.Style.Success;
    toast.title = "PDF Extract & Summarize complete";
    toast.message = summaryResult.usedBackend
      ? `${summaryResult.summaryNotePath} (backend)`
      : summaryResult.usedFallbackModel
        ? `${summaryResult.summaryNotePath} (fallback model)`
        : summaryResult.summaryNotePath;
    await popToRoot();

    return {
      sourceNoteRelativePath,
      transcriptRelativePath,
      summaryNotePath: summaryResult.summaryNotePath,
      usedBackend: summaryResult.usedBackend,
      usedFallbackModel: summaryResult.usedFallbackModel,
    };
  } catch (error) {
    if (sourceNoteRelativePath) {
      try {
        const vaultPath = await resolvePrimaryVaultPath(prefs);
        await open(`obsidian://open?path=${encodeURIComponent(path.join(vaultPath, sourceNoteRelativePath))}`);
      } catch {
        // Best-effort open for created source note.
      }
    }

    toast.style = Toast.Style.Failure;
    toast.title = "PDF summarize failed";
    toast.message = error instanceof Error ? error.message : String(error);
    throw error;
  }
}
