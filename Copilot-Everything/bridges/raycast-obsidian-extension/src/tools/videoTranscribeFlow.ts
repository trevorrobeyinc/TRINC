import { open, popToRoot, showToast, Toast } from "@raycast/api";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { raycastObsidianCreateNote } from "@/api/mcp/raycastObsidianMcp";
import { getVaultsFromPreferencesOrObsidianJson } from "@/obsidian/internal/obsidian";
import { runBackendFirstTemplateSummaryFromSource } from "@/tools/aiSummarizeFlow";
import { buildDeterministicTranscriptSection, injectDeterministicTranscriptSection } from "@/tools/transcriptSection";

const execFileAsync = promisify(execFile);

export interface VideoCommandPreferences {
  vaultPath?: string;
  summarizeTemplatePath?: string;
  summaryOutputFolder?: string;
  ytDlpPath?: string;
  ytDlpCookiesFromBrowser?: string;
  ytDlpCookiesFile?: string;
  videoDownloadFolder?: string;
  whisperPath?: string;
  whisperModel?: string;
  raycastObsidianMcpEndpoint?: string;
  raycastObsidianMcpAuthToken?: string;
  raycastObsidianMcpConfigPath?: string;
  raycastObsidianMcpRequestTimeoutMs?: string;
}

export interface VideoTranscribeFormValues {
  videoUrl: string;
}

interface ProcessExecutionError extends Error {
  stdout?: string | Buffer;
  stderr?: string | Buffer;
}

const defaultExecPathEntries = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"] as const;
const videoExtensions = [".mp4", ".mkv", ".webm", ".mov"] as const;
const defaultYtDlpPathCandidates = ["/opt/homebrew/bin/yt-dlp", "/usr/local/bin/yt-dlp"] as const;
const defaultWhisperPathCandidates = ["/opt/homebrew/bin/whisper", "/usr/local/bin/whisper"] as const;
const defaultSummaryTemplateRelativePath = "copilot/copilot-custom-prompts/Summarize.md";
const defaultSummaryOutputFolder = "obsidian-copilot-summaries";
const defaultVideoDownloadFolder = "Video Downloads";
const ytDlpCookieBrowserFallbackOrder = ["chrome", "chromium", "safari", "brave", "firefox", "edge"] as const;
const tiktokDesktopUserAgent =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36";

export interface VideoTranscribeResult {
  sourceNoteRelativePath: string;
  transcriptRelativePath: string;
  summaryNotePath: string;
  sourceVideoRelativePath: string;
  usedBackend: boolean;
  usedFallbackModel: boolean;
}

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

function normalizeVaultRelativeFolder(folderPreference: string | undefined, fallback: string): string {
  const folderInput = folderPreference?.trim() || fallback;
  const normalized = toPosixPath(path.posix.normalize(folderInput.replace(/^\/+/, ""))).replace(/^\.\/+/, "");

  if (!normalized || normalized === ".") {
    return fallback;
  }

  if (normalized === ".." || normalized.startsWith("../") || path.posix.isAbsolute(normalized)) {
    throw new Error("Configured folder must stay inside the vault.");
  }

  return normalized;
}

async function resolvePrimaryVaultPath(prefs: VideoCommandPreferences): Promise<string> {
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

function resolveSummaryTemplatePath(vaultPath: string, prefs: VideoCommandPreferences): string {
  const configured = prefs.summarizeTemplatePath?.trim();
  if (configured) {
    return configured;
  }

  return path.join(vaultPath, ...defaultSummaryTemplateRelativePath.split("/"));
}

function resolveSummaryOutputFolder(prefs: VideoCommandPreferences): string {
  return normalizeVaultRelativeFolder(prefs.summaryOutputFolder, defaultSummaryOutputFolder);
}

function resolveYtDlpPath(prefs: VideoCommandPreferences): string {
  const configured = prefs.ytDlpPath?.trim();
  if (configured) {
    return configured;
  }

  for (const candidate of defaultYtDlpPathCandidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return "yt-dlp";
}

function resolveWhisperPath(prefs: VideoCommandPreferences): string {
  const configured = prefs.whisperPath?.trim();
  if (configured) {
    if (configured === "whisper" || existsSync(configured)) {
      return configured;
    }
  }

  for (const candidate of defaultWhisperPathCandidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return "whisper";
}

function configuredYtDlpCookieArgs(prefs: VideoCommandPreferences): string[] {
  const cookieFilePath = prefs.ytDlpCookiesFile?.trim();
  if (cookieFilePath) {
    return ["--cookies", cookieFilePath];
  }

  const cookiesFromBrowser = prefs.ytDlpCookiesFromBrowser?.trim().toLowerCase();
  if (cookiesFromBrowser && cookiesFromBrowser !== "none") {
    const normalizedBrowser = cookiesFromBrowser === "arc" ? "chrome" : cookiesFromBrowser;
    return ["--cookies-from-browser", normalizedBrowser];
  }

  return [];
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

function isYtDlpAuthChallengeError(error: unknown): boolean {
  const errorText = extractProcessErrorText(error).toLowerCase();
  return (
    errorText.includes("not a bot") ||
    errorText.includes("cookies-from-browser") ||
    errorText.includes("sign in to confirm") ||
    errorText.includes("login required") ||
    errorText.includes("log in") ||
    errorText.includes("verify you are human")
  );
}

function getVideoCommandErrorMessage(error: unknown): string {
  const processErrorText = extractProcessErrorText(error);
  if (processErrorText) {
    const compact = processErrorText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-4)
      .join(" | ");
    if (compact) {
      return compact;
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return String(error);
}

function isTikTokUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname.includes("tiktok.com");
  } catch {
    return false;
  }
}

function getYtDlpSubtitleArgs(): string[] {
  return [
    "--write-subs",
    "--write-auto-subs",
    "--sub-lang",
    "en,en-US,en-orig",
    "--sub-format",
    "vtt/ttml/best",
    "--convert-subs",
    "srt",
  ];
}

async function runYtDlp(ytDlpPath: string, args: string[]): Promise<string> {
  const result = await execFileAsync(ytDlpPath, args, {
    env: createExecEnv(),
    maxBuffer: 64 * 1024 * 1024,
  });
  return String(result.stdout ?? "");
}

function isVideoArtifact(filePath: string): boolean {
  const extension = path.extname(filePath).toLowerCase();
  return videoExtensions.includes(extension as (typeof videoExtensions)[number]);
}

function isYtDlpFormatVariant(filePath: string): boolean {
  const fileName = path.basename(filePath);
  return /\.f\d+\./i.test(fileName);
}

function getPrimaryVideoArtifact(filePaths: string[]): string {
  const videos = filePaths.filter(isVideoArtifact);
  if (videos.length === 0) {
    return "";
  }

  const mergedVideo = videos.find((videoPath) => !isYtDlpFormatVariant(videoPath));
  return mergedVideo || videos[0];
}

async function listDownloadedArtifacts(outputDir: string, timestamp: string): Promise<string[]> {
  const names = await fs.readdir(outputDir);
  const token = `-${timestamp}`;

  return names
    .filter((name) => name.includes(token))
    .map((name) => path.join(outputDir, name))
    .filter((filePath) => existsSync(filePath));
}

async function findSubtitleSidecars(videoFilePath: string): Promise<string[]> {
  const videoDir = path.dirname(videoFilePath);
  const videoBase = path.basename(videoFilePath, path.extname(videoFilePath));

  const preferredCandidates = [
    path.join(videoDir, `${videoBase}.en.srt`),
    path.join(videoDir, `${videoBase}.en-US.srt`),
    path.join(videoDir, `${videoBase}.en-GB.srt`),
    path.join(videoDir, `${videoBase}.en-orig.srt`),
    path.join(videoDir, `${videoBase}.srt`),
  ].filter((candidate) => existsSync(candidate));

  if (preferredCandidates.length > 0) {
    return preferredCandidates;
  }

  const siblings = await fs.readdir(videoDir);
  return siblings
    .filter((name) => name.startsWith(`${videoBase}.`) && name.toLowerCase().endsWith(".srt"))
    .map((name) => path.join(videoDir, name))
    .filter((candidate) => existsSync(candidate))
    .sort((left, right) => left.localeCompare(right));
}

function srtToPlainText(srtContent: string): string {
  const normalized = srtContent.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");

  const filtered = lines.filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    if (/^\d+$/.test(trimmed)) return false;
    if (/^\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,.]\d{3}$/.test(trimmed)) return false;
    return true;
  });

  return filtered.join("\n").trim();
}

async function extractTranscriptFromSubtitle(sidecarPath: string): Promise<string> {
  const srtContent = await fs.readFile(sidecarPath, "utf-8");
  return srtToPlainText(srtContent);
}

async function transcribeWithWhisper(videoFilePath: string, prefs: VideoCommandPreferences, tempDir: string): Promise<string> {
  const whisperPath = resolveWhisperPath(prefs);
  const whisperModel = prefs.whisperModel?.trim() || "medium";
  const outputDir = path.join(tempDir, "whisper-output");
  await fs.mkdir(outputDir, { recursive: true });

  await execFileAsync(
    whisperPath,
    [videoFilePath, "--model", whisperModel, "--output_format", "txt", "--output_dir", outputDir],
    {
      env: createExecEnv(),
      maxBuffer: 64 * 1024 * 1024,
    }
  );

  const baseName = path.basename(videoFilePath, path.extname(videoFilePath));
  const expected = path.join(outputDir, `${baseName}.txt`);
  if (existsSync(expected)) {
    const text = (await fs.readFile(expected, "utf-8")).trim();
    if (text) {
      return text;
    }
  }

  const files = (await fs.readdir(outputDir))
    .filter((name) => name.toLowerCase().endsWith(".txt"))
    .map((name) => path.join(outputDir, name));

  for (const filePath of files) {
    const text = (await fs.readFile(filePath, "utf-8")).trim();
    if (text) {
      return text;
    }
  }

  throw new Error("Whisper completed but no transcript text file was produced.");
}

async function downloadVideoAndSubtitles(
  ytDlpPath: string,
  outputDir: string,
  outputTemplate: string,
  videoUrl: string,
  prefs: VideoCommandPreferences,
  timestamp: string
): Promise<void> {
  const subtitleArgs = getYtDlpSubtitleArgs();
  const isTikTokSource = isTikTokUrl(videoUrl);
  const ytDlpSiteArgs = isTikTokSource
    ? [
        "--add-header",
        "Referer:https://www.tiktok.com/",
        "--add-header",
        "Origin:https://www.tiktok.com",
        "--user-agent",
        tiktokDesktopUserAgent,
      ]
    : [];

  const baseArgs = [
    "--print",
    "after_move:filepath",
    "--no-update",
    "--no-playlist",
    "--continue",
    "--retries",
    "10",
    "--fragment-retries",
    "10",
    "--file-access-retries",
    "10",
    "--retry-sleep",
    "1:3",
    "--paths",
    `home:${outputDir}`,
    "--paths",
    `temp:${path.join(os.tmpdir(), "raycast-obsidian", "yt-dlp", timestamp)}`,
    "-o",
    outputTemplate,
    ...ytDlpSiteArgs,
    ...subtitleArgs,
    videoUrl,
  ];

  const cookieArgs = configuredYtDlpCookieArgs(prefs);

  try {
    await runYtDlp(ytDlpPath, [...baseArgs, ...cookieArgs]);
    return;
  } catch (error) {
    if (cookieArgs.length > 0 || !isYtDlpAuthChallengeError(error)) {
      throw error;
    }
  }

  let lastError: unknown;
  for (const browser of ytDlpCookieBrowserFallbackOrder) {
    try {
      await runYtDlp(ytDlpPath, [...baseArgs, "--cookies-from-browser", browser]);
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Unable to download video with yt-dlp.");
}

function normalizeExtractedText(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

function buildVideoSourceNoteContent(params: {
  title: string;
  sourceVideoPath: string;
  sourceUrl: string;
  extractedAtIso: string;
  transcriptSection: string;
}): string {
  return `# ${params.title} transcription

## Metadata
- **Source Video**: [[${params.sourceVideoPath}]]
- **Source URL**: ${params.sourceUrl}
- **Extracted**: ${params.extractedAtIso}

${params.transcriptSection}`;
}

export async function runVideoTranscribeCommand(
  values: VideoTranscribeFormValues,
  prefs: VideoCommandPreferences
): Promise<VideoTranscribeResult> {
  const toast = await showToast({ style: Toast.Style.Animated, title: "Preparing video download..." });
  let sourceNoteRelativePath = "";
  let transcriptRelativePath = "";
  let sourceVideoRelativePath = "";

  try {
    const videoUrl = values.videoUrl.trim();
    if (!videoUrl) {
      throw new Error("Video URL is required.");
    }

    const vaultPath = await resolvePrimaryVaultPath(prefs);
    const vaultName = path.basename(vaultPath);
    const videoFolder = normalizeVaultRelativeFolder(prefs.videoDownloadFolder, defaultVideoDownloadFolder);
    const outputDir = path.join(vaultPath, ...videoFolder.split("/"));
    await fs.mkdir(outputDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const outputTemplate = path.join(outputDir, `%(title)s-${timestamp}.%(ext)s`);
    const ytDlpPath = resolveYtDlpPath(prefs);

    toast.title = "Downloading video and subtitles...";
    await downloadVideoAndSubtitles(ytDlpPath, outputDir, outputTemplate, videoUrl, prefs, timestamp);

    const artifacts = await listDownloadedArtifacts(outputDir, timestamp);
    const primaryVideoFile = getPrimaryVideoArtifact(artifacts);
    if (!primaryVideoFile) {
      throw new Error("Download finished, but no primary video artifact was produced.");
    }

    const subtitleFiles = await findSubtitleSidecars(primaryVideoFile);
    let transcriptText = "";
    if (subtitleFiles.length > 0) {
      transcriptText = normalizeExtractedText(await extractTranscriptFromSubtitle(subtitleFiles[0]));
    }

    if (!transcriptText) {
      toast.title = "Running Whisper fallback...";
      const whisperTmpDir = path.join(os.tmpdir(), "raycast-obsidian", "whisper", timestamp);
      await fs.mkdir(whisperTmpDir, { recursive: true });
      transcriptText = normalizeExtractedText(await transcribeWithWhisper(primaryVideoFile, prefs, whisperTmpDir));
    }

    const baseName = path.basename(primaryVideoFile, path.extname(primaryVideoFile));
    transcriptRelativePath = toPosixPath(path.posix.join(videoFolder, ".transcripts", `${baseName}.txt`));
    const sourceNotePath = toPosixPath(path.posix.join(videoFolder, `${baseName} transcription.md`));
    sourceNoteRelativePath = sourceNotePath;

    const transcriptAbsolutePath = path.join(vaultPath, ...transcriptRelativePath.split("/"));
    await fs.mkdir(path.dirname(transcriptAbsolutePath), { recursive: true });
    await fs.writeFile(transcriptAbsolutePath, `${transcriptText}\n`, "utf-8");

    sourceVideoRelativePath = toPosixPath(path.relative(vaultPath, primaryVideoFile));
    const transcriptSection = buildDeterministicTranscriptSection({
      sourceNoteRelativePath: sourceNotePath,
      transcriptRelativePath,
      transcriptText,
    });

    const sourceNoteContent = buildVideoSourceNoteContent({
      title: baseName,
      sourceVideoPath: sourceVideoRelativePath,
      sourceUrl: videoUrl,
      extractedAtIso: new Date().toISOString(),
      transcriptSection,
    });

    toast.title = "Saving source note...";
    await raycastObsidianCreateNote({
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
      sourceTitle: baseName,
      sourceText: transcriptText,
      sourcePath: sourceNotePath,
      sourceNoteContent,
      templatePath: resolveSummaryTemplatePath(vaultPath, prefs),
      outputFolder: resolveSummaryOutputFolder(prefs),
    });

    // Keep the source note aligned with summary-note structure while locking transcript block format.
    const finalizedSourceNoteContent = injectDeterministicTranscriptSection(summaryResult.summaryText, transcriptSection);
    await raycastObsidianCreateNote({
      vault: vaultName,
      vaultRoot: vaultPath,
      path: sourceNotePath,
      content: finalizedSourceNoteContent,
      overwrite: true,
    });

    toast.style = Toast.Style.Success;
    toast.title = "Transcribe & Save complete";
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
      sourceVideoRelativePath,
      usedBackend: summaryResult.usedBackend,
      usedFallbackModel: summaryResult.usedFallbackModel,
    };
  } catch (error) {
    if (sourceNoteRelativePath) {
      try {
        const vaultPath = await resolvePrimaryVaultPath(prefs);
        await open(`obsidian://open?path=${encodeURIComponent(path.join(vaultPath, sourceNoteRelativePath))}`);
      } catch {
        // Best-effort source-note open on summarize failure path.
      }
    }

    toast.style = Toast.Style.Failure;
    toast.title = "Transcribe & Save failed";
    toast.message = getVideoCommandErrorMessage(error);
    throw error;
  }
}
