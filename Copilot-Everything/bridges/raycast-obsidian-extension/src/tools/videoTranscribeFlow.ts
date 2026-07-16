import { open, popToRoot, showToast, Toast } from "@raycast/api";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { raycastObsidianCreateNote } from "@/api/mcp/raycastObsidianMcp";
import { getVaultsFromPreferencesOrObsidianJson } from "@/obsidian/internal/obsidian";
import { generateTemplateSummaryText } from "@/tools/aiSummarizeFlow";
import { buildDeterministicTranscriptSection } from "@/tools/transcriptSection";
import { executeCommand, openFile } from "@/utils/restApiClient";

const execFileAsync = promisify(execFile);

export interface VideoCommandPreferences {
  vaultPath?: string;
  summarizeTemplatePath?: string;
  summaryOutputFolder?: string;
  anthropicApiKey?: string;
  anthropicModel?: string;
  cleanupAfterSummary?: boolean;
  ytDlpPath?: string;
  ytDlpCookiesFromBrowser?: string;
  ytDlpCookiesFile?: string;
  ytDlpCookiesGpgFile?: string;
  ytDlpImpersonate?: string;
  videoDownloadFolder?: string;
  downieDownloadFolder?: string;
  whisperPath?: string;
  whisperModel?: string;
  raycastObsidianMcpEndpoint?: string;
  raycastObsidianMcpAuthToken?: string;
  raycastObsidianMcpConfigPath?: string;
  raycastObsidianMcpRequestTimeoutMs?: string;
}

export interface VideoTranscribeFormValues {
  videoUrl: string;
  videoFile?: string[];
}

interface ProcessExecutionError extends Error {
  stdout?: string | Buffer;
  stderr?: string | Buffer;
}

const defaultExecPathEntries = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"] as const;
const videoExtensions = [".mp4", ".mkv", ".webm", ".mov", ".m4v"] as const;
const defaultYtDlpPathCandidates = ["/opt/homebrew/bin/yt-dlp", "/usr/local/bin/yt-dlp"] as const;
// Fallback binaries when the Whisper Path preference is empty. Lead with the faster-whisper
// (whisper-ctranslate2) venv — the current engine and the command-pref default. The legacy
// openai-whisper paths remain last-ditch (harmless if reinstalled; openai-whisper was retired
// 2026-07-15 since whisper-ctranslate2 supersedes it and dropped the ffmpeg dependency).
const defaultWhisperPathCandidates = [
  "/Users/myhome/.local/venvs/fwhisper/bin/whisper-ctranslate2",
  "/opt/homebrew/bin/whisper-ctranslate2",
  "/opt/homebrew/bin/whisper",
  "/usr/local/bin/whisper",
] as const;
const defaultGpgPathCandidates = ["/opt/homebrew/bin/gpg", "/usr/local/bin/gpg"] as const;
// Well-known drop location for the sealed jar written by scripts/seal-yt-cookies.sh — internal
// volume so it survives an external-volume unmount, outside every git worktree.
const defaultSealedCookiesPath = path.join(os.homedir(), ".local", "share", "raycast-obsidian", "sealed-cookies.txt.gpg");
// Durable per-run log — failures otherwise vanish with the Raycast toast. Append-only plain text,
// safe to delete anytime. Logging is fail-soft and must never interfere with a run.
const runLogPath = path.join(os.homedir(), ".local", "share", "raycast-obsidian", "video-transcribe.log");

async function appendRunLog(line: string): Promise<void> {
  try {
    await fs.mkdir(path.dirname(runLogPath), { recursive: true });
    await fs.appendFile(runLogPath, `${new Date().toISOString()} ${line}\n`, "utf-8");
  } catch {
    // Never let logging break the run.
  }
}
const defaultVideoDownloadFolder = "Video Downloads";
const defaultSummaryOutputFolder = "obsidian-copilot-summaries";
// Downie 4 downloads URL-mode videos here. Downie is sandboxed — it can only write to a folder the
// user has granted it (via Downie Settings → File, which security-scoped-bookmarks the folder), so
// this default matches the one-time-configured destination. Absolute path (not vault-relative).
const defaultDownieDownloadFolder = path.join(os.homedir(), "Save Video & Download Downie");
// A signed-in browser session is what lets Downie fetch enterprise LinkedIn Learning that yt-dlp
// cannot; extraction + download of a lecture can take a while, so poll patiently.
const dowaniePollIntervalMs = 4000;
const downieStableConfirmations = 2; // consecutive equal-size polls before a file counts as done
// Downie downloads to its own temp then MOVES the finished file into the destination, so the dest
// stays empty until completion — there is no early "download started" signal to watch. Keep the
// window generous enough for a real lecture download+extraction, but short enough that a failed
// direct extraction falls through to UGE / yt-dlp without a long stall.
const downieDownloadTimeoutMs = 3 * 60 * 1000;
// UGE (User-Guided Extraction) needs the operator to click the detected stream in Downie's window,
// so allow much longer for that human step + the subsequent download.
const downieUgeTimeoutMs = 12 * 60 * 1000;
// Hosts whose video stream is only exposed while the video PLAYS in an authenticated browser —
// Downie's direct scheme download returns "Cannot find download URL" for these, so route them
// straight to UGE. Matched against the URL hostname (exact or subdomain).
const loginGatedHosts = ["linkedin.com"] as const;
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

async function resolveWhisperPathOrThrow(prefs: VideoCommandPreferences): Promise<string> {
  const configured = prefs.whisperPath?.trim();
  if (configured) {
    if (configured === "whisper" || existsSync(configured)) {
      return configured;
    }
    // A set-but-missing path (typo / moved binary) is NOT swallowed silently — it self-heals to a
    // known candidate below, but the ignored value is logged so the mistake stays visible.
    await appendRunLog(`WARNING: configured Whisper Path does not exist, ignoring it: ${configured}`);
  }

  for (const candidate of defaultWhisperPathCandidates) {
    if (existsSync(candidate)) {
      if (configured) {
        await appendRunLog(`Whisper Path fell back to a known binary: ${candidate}`);
      }
      return candidate;
    }
  }

  throw new Error(
    `Whisper executable not found. Set "Whisper Path" in the Video Pipeline Runner command ` +
      `preferences to your whisper-ctranslate2 binary ` +
      `(e.g. /Users/myhome/.local/venvs/fwhisper/bin/whisper-ctranslate2). ` +
      `Tried: ${[configured, ...defaultWhisperPathCandidates].filter(Boolean).join(", ")}`
  );
}

function resolveGpgPath(): string {
  for (const candidate of defaultGpgPathCandidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return "gpg";
}

function resolveSealedCookiesPath(prefs: VideoCommandPreferences): string {
  const configured = prefs.ytDlpCookiesGpgFile?.trim();
  if (configured) {
    return configured;
  }
  return existsSync(defaultSealedCookiesPath) ? defaultSealedCookiesPath : "";
}

/**
 * Decrypt the GPG-sealed cookies jar via the YubiKey OpenPGP [E] subkey. gpg-agent's pinentry-mac
 * dialog collects the card PIN and the YubiKey demands a physical touch — this ceremony deliberately
 * REPLACES the macOS login-keychain password prompt that --cookies-from-browser otherwise triggers
 * (yt-dlp reading "Chrome Safe Storage"). The plaintext jar lands in a 0700 per-run temp dir and the
 * caller removes it in a finally block, so it never outlives the run. No decrypt timeout: the touch
 * window is human-paced and cancelling pinentry surfaces as a normal command failure.
 */
async function unsealGpgCookies(sealedPath: string, timestamp: string): Promise<string> {
  if (!existsSync(sealedPath)) {
    throw new Error(`Sealed cookies file not found: ${sealedPath}`);
  }

  const outDir = path.join(os.tmpdir(), "raycast-obsidian", "cookies", timestamp);
  await fs.mkdir(outDir, { recursive: true, mode: 0o700 });
  const outFile = path.join(outDir, "cookies.txt");

  try {
    await execFileAsync(resolveGpgPath(), ["--batch", "--yes", "--quiet", "--output", outFile, "--decrypt", sealedPath], {
      env: createExecEnv(),
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch (error) {
    const detail = extractProcessErrorText(error)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-2)
      .join(" | ");
    throw new Error(`YubiKey unseal failed or was declined${detail ? `: ${detail}` : "."}`);
  }

  await fs.chmod(outFile, 0o600);
  return outFile;
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

// Cloudflare-fronted sites (e.g. Wiley course media) reject yt-dlp's default TLS
// fingerprint with a 403 even when the logged-in session cookie is present. yt-dlp's
// --impersonate (curl_cffi) makes the request mimic a real browser's TLS handshake so
// the WAF lets it through. Defaults to "chrome"; "none"/"off"/"disabled" turns it off.
// Requires curl_cffi in yt-dlp's runtime — downloadVideoAndSubtitles degrades gracefully
// (retries without it) if this yt-dlp build lacks impersonation support.
function configuredYtDlpImpersonateArgs(prefs: VideoCommandPreferences): string[] {
  const target = prefs.ytDlpImpersonate?.trim();
  if (target && ["none", "off", "disable", "disabled", "false"].includes(target.toLowerCase())) {
    return [];
  }
  return ["--impersonate", target || "chrome"];
}

function isYtDlpImpersonateUnavailableError(error: unknown): boolean {
  const errorText = extractProcessErrorText(error).toLowerCase();
  return (
    (errorText.includes("impersonate target") && errorText.includes("not available")) ||
    errorText.includes("list-impersonate-targets")
  );
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
    errorText.includes("verify you are human") ||
    // A bare HTTP 401/403 from a login-gated page is an auth challenge too. yt-dlp's
    // generic extractor reports it as "Unable to download webpage: HTTP Error 403:
    // Forbidden" with none of the phrases above, so match the status text directly and
    // let the browser-cookie fallback (chrome first) retry with the logged-in session.
    errorText.includes("http error 401") ||
    errorText.includes("http error 403") ||
    errorText.includes("403: forbidden") ||
    errorText.includes("401: unauthorized")
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

/**
 * Local-file mode: resolve a pre-downloaded video from the form's file picker, or from a filesystem
 * path / file:// URL pasted into the URL field. Exists for sources yt-dlp cannot fetch at all —
 * e.g. enterprise LinkedIn Learning, whose streams 403 outside a real browser session ("No video
 * formats found" even with valid cookies) but download fine via Downie. Local mode skips the cookie
 * unseal (no YubiKey ceremony — there is no secret to protect) and the download entirely; the
 * pipeline picks up at transcription. Returns "" when the input is a normal remote URL.
 */
function resolveLocalVideoInput(values: VideoTranscribeFormValues): string {
  const picked = values.videoFile?.[0]?.trim();
  if (picked) {
    return picked;
  }

  const raw = values.videoUrl.trim();
  if (raw.startsWith("file://")) {
    try {
      return decodeURIComponent(new URL(raw).pathname);
    } catch {
      return "";
    }
  }
  if (raw.startsWith("~/")) {
    return path.join(os.homedir(), raw.slice(2));
  }
  if (path.isAbsolute(raw)) {
    return raw;
  }
  return "";
}

// Strip the trailing -<ISO run timestamp> that the yt-dlp output template appends (see
// `outputTemplate`). The timestamp keeps the per-run mp4/transcript/source-note names unique, but the
// surviving summary note should be titled with just the clean video title from the URL — not "<title>-<ts>".
export function stripRunTimestamp(baseName: string): string {
  return baseName.replace(/-\d{4}-\d{2}-\d{2}T[0-9-]+Z$/, "");
}

/**
 * Build the base name used for the transcript/transcription/summary notes. yt-dlp returns a generic
 * title for some hosts (e.g. Wiley course pages → "Videoplayer"), which would name every note
 * "Videoplayer (1)-<timestamp>". When the title looks generic, derive a readable base name from the
 * source URL's filename instead. Preserves the trailing -<ISO timestamp> the output template appended
 * (keeps notes unique per run). The downloaded mp4 keeps its own yt-dlp filename.
 */
function deriveNoteBaseName(rawBaseName: string, url: string): string {
  const tsSuffix = rawBaseName.match(/-\d{4}-\d{2}-\d{2}T[0-9-]+Z$/)?.[0] ?? "";
  const rawTitle = tsSuffix ? rawBaseName.slice(0, rawBaseName.length - tsSuffix.length) : rawBaseName;
  const looksGeneric =
    !rawTitle.replace(/\s*\(\d+\)\s*$/, "").trim() ||
    !/[a-z]/i.test(rawTitle) ||
    /^(videoplayer|video|media|player|untitled|clip|movie|stream|index|default)(\s*\(\d+\))?$/i.test(
      rawTitle.trim()
    );
  if (!looksGeneric) {
    return rawBaseName;
  }
  let derived = "";
  try {
    derived = decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).pop() ?? "")
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[_+]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    derived = "";
  }
  return derived ? `${derived}${tsSuffix}` : rawBaseName;
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

async function transcribeWithWhisper(videoFilePath: string, whisperPath: string, prefs: VideoCommandPreferences, tempDir: string): Promise<string> {
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
  const impersonateArgs = configuredYtDlpImpersonateArgs(prefs);

  // Run yt-dlp with browser TLS-fingerprint impersonation, but degrade gracefully: if
  // this yt-dlp build lacks curl_cffi, retry the same args without --impersonate so that
  // ordinary (non-Cloudflare) downloads keep working on installs without impersonation.
  const runYtDlpWithImpersonate = async (args: string[]): Promise<void> => {
    if (impersonateArgs.length === 0) {
      await runYtDlp(ytDlpPath, args);
      return;
    }
    try {
      await runYtDlp(ytDlpPath, [...args, ...impersonateArgs]);
    } catch (error) {
      if (isYtDlpImpersonateUnavailableError(error)) {
        await runYtDlp(ytDlpPath, args);
        return;
      }
      throw error;
    }
  };

  try {
    await runYtDlpWithImpersonate([...baseArgs, ...cookieArgs]);
    return;
  } catch (error) {
    if (cookieArgs.length > 0 || !isYtDlpAuthChallengeError(error)) {
      throw error;
    }
  }

  // Cloudflare + login-gated media (e.g. Wiley) needs BOTH the logged-in browser session
  // cookie AND a real-browser TLS fingerprint, so each fallback attempt pairs
  // --cookies-from-browser with --impersonate.
  let lastError: unknown;
  for (const browser of ytDlpCookieBrowserFallbackOrder) {
    try {
      await runYtDlpWithImpersonate([...baseArgs, "--cookies-from-browser", browser]);
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

const copilotSummarizeToNoteCommandId = "copilot:summarize-to-note";
const copilotSummaryPollIntervalMs = 3000;
const copilotSummaryTimeoutMs = 240_000;
const defaultCopilotCommandNoteFolder = "obsidian-copilot-summaries";

/**
 * Copilot's own output folder for headless "-to-note" commands, read from the plugin's
 * data.json so a retarget in Copilot settings is honored. Falls back to the plugin's
 * shipped default when the key is absent (fresh installs never persist defaults).
 */
async function readCopilotCommandNoteFolder(vaultPath: string): Promise<string> {
  try {
    const dataPath = path.join(vaultPath, ".obsidian", "plugins", "copilot", "data.json");
    const data = JSON.parse(await fs.readFile(dataPath, "utf-8")) as {
      customCommandNoteFolder?: string;
    };
    const folder = data.customCommandNoteFolder?.trim();
    if (folder) {
      return folder.replace(/^\/+|\/+$/g, "");
    }
  } catch {
    // Missing/unreadable plugin config — use the shipped default.
  }
  return defaultCopilotCommandNoteFolder;
}

/**
 * PRIMARY summary lane: have the Obsidian Copilot plugin summarize the transcription note
 * entirely in the background — no modal, no focus change. Opens the note via the Local REST
 * API's /open endpoint (which does NOT activate the Obsidian app), dispatches the fork's
 * headless "Summarize → New Note" command, polls for the note Copilot writes, then renames
 * it to the pipeline's "<title> summary.md" convention and leaves Obsidian (still in the
 * background) showing the finished summary. Throws on dispatch failure or timeout so the
 * caller can invoke the extension-side summarizer as a last resort.
 */
async function runCopilotHeadlessSummary(params: {
  vaultPath: string;
  sourceNotePath: string;
  summaryNotePath: string;
}): Promise<void> {
  const { vaultPath, sourceNotePath, summaryNotePath } = params;

  await openFile(sourceNotePath);
  // Give the background leaf a moment to become the active file before the dispatch.
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const dispatchedAtMs = Date.now();
  await executeCommand(copilotSummarizeToNoteCommandId);
  await appendRunLog(`copilot summarize dispatched (background) for: ${sourceNotePath}`);

  const copilotFolder = await readCopilotCommandNoteFolder(vaultPath);
  const sourceBase = path.posix.basename(sourceNotePath, ".md");
  const copilotNoteRelative = `${copilotFolder}/${sourceBase} — Summarize.md`;
  const copilotNoteAbsolute = path.join(vaultPath, ...copilotNoteRelative.split("/"));

  const deadlineMs = dispatchedAtMs + copilotSummaryTimeoutMs;
  let detected = false;
  while (Date.now() < deadlineMs) {
    try {
      const stat = await fs.stat(copilotNoteAbsolute);
      // mtime guard: an older note with the same name (prior run) must not count as done.
      if (stat.mtimeMs >= dispatchedAtMs - 1000) {
        detected = true;
        break;
      }
    } catch {
      // Not written yet.
    }
    await new Promise((resolve) => setTimeout(resolve, copilotSummaryPollIntervalMs));
  }
  if (!detected) {
    throw new Error(
      `Copilot summary did not appear within ${Math.round(copilotSummaryTimeoutMs / 1000)}s: ${copilotNoteRelative}`
    );
  }
  await appendRunLog(`copilot summary detected: ${copilotNoteRelative}`);

  const summaryAbsolute = path.join(vaultPath, ...summaryNotePath.split("/"));
  if (copilotNoteAbsolute !== summaryAbsolute) {
    await fs.mkdir(path.dirname(summaryAbsolute), { recursive: true });
    await fs.rm(summaryAbsolute, { force: true }).catch(() => undefined);
    await fs.rename(copilotNoteAbsolute, summaryAbsolute);
    await appendRunLog(`summary renamed to: ${summaryNotePath}`);
  }

  await openFile(summaryNotePath).catch(() => undefined);
}

/**
 * Remove every leftover artifact from a run once the summary note is safely written — the downloaded
 * video + subtitle/format-variant sidecars, the transcript .txt, the transcription note, and the temp
 * dirs — leaving ONLY the summary note in obsidian-copilot-summaries. The summary note is never in the
 * target list, so it is never touched; missing/locked files are tolerated.
 */
async function cleanupRunArtifacts(targets: { files: string[]; tempDirs: string[] }): Promise<void> {
  await Promise.all([
    ...targets.files.map((file) => fs.rm(file, { force: true }).catch(() => undefined)),
    ...targets.tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true }).catch(() => undefined)),
  ]);
}

function resolveDownieDownloadFolder(prefs: VideoCommandPreferences): string {
  const configured = prefs.downieDownloadFolder?.trim();
  if (configured) {
    return configured.startsWith("~/") ? path.join(os.homedir(), configured.slice(2)) : configured;
  }
  return defaultDownieDownloadFolder;
}

/**
 * Percent-encode a value for a `downie://XUOpenURL` query parameter. Downie's own extension escapes
 * `&` and `#` on top of encodeURI; encodeURIComponent already covers those plus `?`, so it is the
 * safe single call for both the target URL and the destination path (which contains spaces + `&`).
 */
function encodeDownieParam(value: string): string {
  return encodeURIComponent(value);
}

/**
 * True for hosts whose video stream is only exposed while the video plays in an authenticated
 * browser (e.g. LinkedIn Learning). Downie's direct scheme download returns "Cannot find download
 * URL" for these, so they are routed straight to UGE.
 */
function isLoginGatedHost(videoUrl: string): boolean {
  try {
    const host = new URL(videoUrl).hostname.toLowerCase();
    return loginGatedHosts.some((gated) => host === gated || host.endsWith(`.${gated}`));
  } catch {
    return false;
  }
}

/**
 * Watch a folder for the newest COMPLETED video file that appears after a dispatch time. Downie
 * writes the finished file into the folder in one move (its `.download`/`.part` temps live
 * elsewhere), so a file counts as done once its size holds steady across a couple of polls. Only
 * files with mtime ≥ dispatch are considered, so a pre-existing video in the folder is never
 * claimed. Throws on timeout.
 */
async function waitForNewStableVideo(
  watchDir: string,
  dispatchedAtMs: number,
  timeoutMs: number
): Promise<string> {
  const sizeHistory = new Map<string, { size: number; stableCount: number }>();
  const deadlineMs = dispatchedAtMs + timeoutMs;

  while (Date.now() < deadlineMs) {
    await new Promise((resolve) => setTimeout(resolve, dowaniePollIntervalMs));

    let entries: string[];
    try {
      entries = await fs.readdir(watchDir);
    } catch {
      continue;
    }

    const candidates: { filePath: string; size: number }[] = [];
    for (const name of entries) {
      if (!isVideoArtifact(name)) {
        continue;
      }
      const filePath = path.join(watchDir, name);
      try {
        const stat = await fs.stat(filePath);
        if (stat.isFile() && stat.mtimeMs >= dispatchedAtMs - 1000) {
          candidates.push({ filePath, size: stat.size });
        }
      } catch {
        // File vanished mid-scan (Downie rename) — ignore.
      }
    }

    for (const candidate of candidates) {
      const prev = sizeHistory.get(candidate.filePath);
      if (prev && prev.size === candidate.size && candidate.size > 0) {
        const stableCount = prev.stableCount + 1;
        sizeHistory.set(candidate.filePath, { size: candidate.size, stableCount });
        if (stableCount >= downieStableConfirmations) {
          return candidate.filePath;
        }
      } else {
        sizeHistory.set(candidate.filePath, { size: candidate.size, stableCount: 0 });
      }
    }
  }

  throw new Error(
    `No completed video appeared in ${watchDir} within ${Math.round(timeoutMs / 60000)} min.`
  );
}

/**
 * DIRECT (zero-click) Downie download: hand the page URL to Downie via `downie://XUOpenURL` with a
 * per-call `destination`, and wait for the finished file to land there. Works for sites Downie can
 * extract without playback (YouTube, etc.). Throws for login-gated streams (Downie reports "Cannot
 * find download URL"), so the caller can fall through to UGE.
 */
async function downloadViaDownie(
  videoUrl: string,
  destinationDir: string,
  dispatchedAtMs: number
): Promise<string> {
  await fs.mkdir(destinationDir, { recursive: true });
  const schemeUrl =
    `downie://XUOpenURL?url=${encodeDownieParam(videoUrl)}` +
    `&destination=${encodeDownieParam(destinationDir)}`;
  // Plain `open <scheme-url>` routes through LaunchServices to Downie's registered downie:// handler
  // (launching Downie if needed). NOT `open -a 'Downie 4' <scheme-url>` — the -a form passes the URL
  // as a document argument and Downie silently ignores it.
  await execFileAsync("open", [schemeUrl], { env: createExecEnv() });
  await appendRunLog(`downie dispatched (direct) → ${destinationDir}`);
  const file = await waitForNewStableVideo(destinationDir, dispatchedAtMs, downieDownloadTimeoutMs);
  await appendRunLog(`downie file detected: ${file}`);
  return file;
}

/**
 * UGE (User-Guided Extraction) Downie download for login-gated streams (e.g. LinkedIn Learning).
 * `action=open_in_uge` opens the page in Downie's own logged-in browser, autoplays it, and detects
 * the stream — the operator then clicks the detected stream ONCE to start the download. UGE ignores
 * the `destination` param and saves to Downie's default `~/Downloads`, so we watch there and move
 * the claimed file into the pipeline folder afterward. This is the ONE unavoidable manual step;
 * everything before and after it is automatic.
 */
async function downloadViaDownieUGE(
  videoUrl: string,
  downloadsDir: string,
  dispatchedAtMs: number
): Promise<string> {
  const schemeUrl = `downie://XUOpenURL?url=${encodeDownieParam(videoUrl)}&action=open_in_uge`;
  await execFileAsync("open", [schemeUrl], { env: createExecEnv() });
  await appendRunLog("downie UGE opened — SELECT the detected stream in Downie's window to start the download");
  const file = await waitForNewStableVideo(downloadsDir, dispatchedAtMs, downieUgeTimeoutMs);
  await appendRunLog(`downie UGE file detected: ${file}`);
  return file;
}

/**
 * Move a UGE download out of `~/Downloads` into the pipeline's dedicated Downie folder, so it is
 * pipeline-owned (cleaned up after the summary like every other downloaded video) and `~/Downloads`
 * stays uncluttered. Falls back to copy+remove across filesystems.
 */
async function moveIntoDownieFolder(sourceFile: string, downieFolder: string): Promise<string> {
  await fs.mkdir(downieFolder, { recursive: true });
  const dest = path.join(downieFolder, path.basename(sourceFile));
  await fs.rm(dest, { force: true }).catch(() => undefined);
  try {
    await fs.rename(sourceFile, dest);
  } catch {
    await fs.copyFile(sourceFile, dest);
    await fs.rm(sourceFile, { force: true }).catch(() => undefined);
  }
  await appendRunLog(`moved UGE download into pipeline folder: ${dest}`);
  return dest;
}

export async function runVideoTranscribeCommand(
  values: VideoTranscribeFormValues,
  prefs: VideoCommandPreferences
): Promise<VideoTranscribeResult> {
  const toast = await showToast({ style: Toast.Style.Animated, title: "Preparing video download..." });
  let sourceNoteRelativePath = "";
  let transcriptRelativePath = "";
  let sourceVideoRelativePath = "";
  let unsealedCookiesFile = "";
  // A Downie-downloaded video lives in the pipeline's own dedicated folder, so (unlike a user's
  // file-picker selection) it IS ours to clean up after the summary lands.
  let downieDownloadedFile = "";

  try {
    const videoUrl = values.videoUrl.trim();
    const localVideoPath = resolveLocalVideoInput(values);
    if (!videoUrl && !localVideoPath) {
      throw new Error("Provide a video URL or pick a local video file.");
    }

    const vaultPath = await resolvePrimaryVaultPath(prefs);
    const vaultName = path.basename(vaultPath);
    const videoFolder = normalizeVaultRelativeFolder(prefs.videoDownloadFolder, defaultVideoDownloadFolder);
    const outputDir = path.join(vaultPath, ...videoFolder.split("/"));
    await fs.mkdir(outputDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    // %(title).150B byte-truncates the title so hosts with URL-blob titles (e.g. LinkedIn
    // demuxed-hls links, whose "title" is a 400+ char path segment) stay under macOS's
    // 255-byte filename limit once the timestamp + extension are appended.
    const outputTemplate = path.join(outputDir, `%(title).150B-${timestamp}.%(ext)s`);
    const ytDlpPath = resolveYtDlpPath(prefs);

    await appendRunLog(`RUN START ${localVideoPath ? `file=${localVideoPath}` : `url=${videoUrl}`}`);
    // Fail fast — verify a usable Whisper binary BEFORE the (slow) download, so a misconfigured
    // Whisper Path errors in ~1s with an actionable message instead of failing cryptically after
    // the video has already downloaded. Whisper is this command's transcription engine.
    const whisperBinary = await resolveWhisperPathOrThrow(prefs);

    let artifacts: string[];
    let primaryVideoFile: string;

    if (localVideoPath) {
      // Pre-downloaded video (e.g. Downie for enterprise LinkedIn Learning, whose streams yt-dlp
      // cannot fetch even with valid cookies): no cookies are needed, so no YubiKey ceremony fires;
      // the pipeline starts at transcription.
      toast.title = "Using local video file...";
      if (!existsSync(localVideoPath)) {
        throw new Error(`Local video file not found: ${localVideoPath}`);
      }
      if (!isVideoArtifact(localVideoPath)) {
        throw new Error(`Unsupported video type (expected ${videoExtensions.join(", ")}): ${localVideoPath}`);
      }
      artifacts = [localVideoPath];
      primaryVideoFile = localVideoPath;
      await appendRunLog("local file mode — skipping cookie unseal and download");
    } else {
      // PRIMARY URL lane: Downie 4. It extracts inside the user's logged-in browser session, so it
      // fetches sources yt-dlp can't (enterprise LinkedIn Learning) with NO cookies and NO YubiKey
      // ceremony. Two Downie modes: DIRECT (zero-click, for sites Downie extracts headlessly) and
      // UGE (one click on the detected stream, for login-gated streams like LinkedIn). yt-dlp + the
      // sealed-cookies unseal survive ONLY as a last resort below.
      const downieFolder = resolveDownieDownloadFolder(prefs);
      const downloadsFolder = path.join(os.homedir(), "Downloads");
      try {
        if (isLoginGatedHost(videoUrl)) {
          // Login-gated (LinkedIn): direct download always fails, so go straight to UGE.
          toast.title = "Opening Downie — select the detected stream to download...";
          const ugeFile = await downloadViaDownieUGE(videoUrl, downloadsFolder, Date.now());
          primaryVideoFile = await moveIntoDownieFolder(ugeFile, downieFolder);
        } else {
          // Public site: try the zero-click direct download first; if Downie can't extract it
          // headlessly, fall through to UGE (one click).
          try {
            toast.title = "Downloading via Downie...";
            primaryVideoFile = await downloadViaDownie(videoUrl, downieFolder, Date.now());
          } catch (directError) {
            const dreason = directError instanceof Error ? directError.message : String(directError);
            await appendRunLog(`downie direct failed (${dreason}) — opening UGE`);
            toast.title = "Opening Downie — select the detected stream to download...";
            const ugeFile = await downloadViaDownieUGE(videoUrl, downloadsFolder, Date.now());
            primaryVideoFile = await moveIntoDownieFolder(ugeFile, downieFolder);
          }
        }
        downieDownloadedFile = primaryVideoFile;
        artifacts = [primaryVideoFile];
      } catch (downieError) {
        const reason = downieError instanceof Error ? downieError.message : String(downieError);
        await appendRunLog(`LAST-RESORT: Downie (direct + UGE) failed (${reason}) — falling back to yt-dlp`);

        // YubiKey-sealed cookies replace the macOS keychain prompt entirely. Routing the unsealed jar
        // through the ytDlpCookiesFile pref ALSO short-circuits the --cookies-from-browser fallback loop
        // (cookieArgs.length > 0 disables it), so no code path can reopen the Chrome Safe Storage /
        // login-keychain dialog once a sealed jar is configured.
        let effectivePrefs = prefs;
        const sealedCookiesPath = resolveSealedCookiesPath(prefs);
        if (sealedCookiesPath) {
          toast.title = "Downie failed — unsealing cookies (YubiKey PIN + touch)...";
          await appendRunLog(`unseal starting: ${sealedCookiesPath}`);
          unsealedCookiesFile = await unsealGpgCookies(sealedCookiesPath, timestamp);
          await appendRunLog("unseal OK");
          effectivePrefs = { ...prefs, ytDlpCookiesFile: unsealedCookiesFile, ytDlpCookiesFromBrowser: "none" };
        }

        toast.title = "Downie failed — downloading with yt-dlp...";
        await appendRunLog("yt-dlp download starting");
        await downloadVideoAndSubtitles(ytDlpPath, outputDir, outputTemplate, videoUrl, effectivePrefs, timestamp);
        await appendRunLog("yt-dlp download OK");

        artifacts = await listDownloadedArtifacts(outputDir, timestamp);
        primaryVideoFile = getPrimaryVideoArtifact(artifacts);
        if (!primaryVideoFile) {
          throw new Error("Download finished, but no primary video artifact was produced.");
        }
      }
    }

    const subtitleFiles = await findSubtitleSidecars(primaryVideoFile);
    let transcriptText = "";
    if (subtitleFiles.length > 0) {
      transcriptText = normalizeExtractedText(await extractTranscriptFromSubtitle(subtitleFiles[0]));
    }

    if (!transcriptText) {
      toast.title = "Running Whisper fallback...";
      await appendRunLog("no usable subtitles — whisper fallback starting");
      const whisperTmpDir = path.join(os.tmpdir(), "raycast-obsidian", "whisper", timestamp);
      await fs.mkdir(whisperTmpDir, { recursive: true });
      transcriptText = normalizeExtractedText(await transcribeWithWhisper(primaryVideoFile, whisperBinary, prefs, whisperTmpDir));
      await appendRunLog("whisper transcription OK");
    } else {
      await appendRunLog(`transcript from subtitles (${subtitleFiles.length} sidecar(s))`);
    }

    const rawBaseName = path.basename(primaryVideoFile, path.extname(primaryVideoFile));
    // Name notes from a readable title (derived from the URL) when yt-dlp's title is generic
    // (e.g. Wiley → "Videoplayer"); the mp4 keeps its own yt-dlp filename. In local mode the URL
    // field may hold an unrelated leftover URL — the filename is the only trustworthy title source.
    const baseName = deriveNoteBaseName(rawBaseName, localVideoPath ? "" : videoUrl);
    // The transient transcript/source note keep the timestamped baseName for per-run uniqueness, but
    // the surviving summary note is titled with the clean video title (yt-dlp %(title)s from the URL).
    const noteTitle = stripRunTimestamp(baseName).trim() || baseName;
    transcriptRelativePath = toPosixPath(path.posix.join(videoFolder, ".transcripts", `${baseName}.txt`));
    const sourceNotePath = toPosixPath(path.posix.join(videoFolder, `${baseName} transcription.md`));
    sourceNoteRelativePath = sourceNotePath;

    const transcriptAbsolutePath = path.join(vaultPath, ...transcriptRelativePath.split("/"));
    await fs.mkdir(path.dirname(transcriptAbsolutePath), { recursive: true });
    await fs.writeFile(transcriptAbsolutePath, `${transcriptText}\n`, "utf-8");

    // A wikilink only resolves for files INSIDE the vault; an out-of-vault local file would render
    // as a dead [[../../..]] link, so it gets a file:// markdown link instead.
    const videoInsideVault = primaryVideoFile.startsWith(vaultPath + path.sep);
    sourceVideoRelativePath = videoInsideVault
      ? toPosixPath(path.relative(vaultPath, primaryVideoFile))
      : primaryVideoFile;
    const transcriptSection = buildDeterministicTranscriptSection({
      sourceNoteRelativePath: sourceNotePath,
      transcriptRelativePath,
      transcriptText,
    });

    const sourceNoteContent = buildVideoSourceNoteContent({
      title: baseName,
      sourceVideoRef: videoInsideVault
        ? `[[${sourceVideoRelativePath}]]`
        : `[${path.basename(primaryVideoFile)}](file://${encodeURI(primaryVideoFile)})`,
      sourceUrl: localVideoPath ? `file://${localVideoPath}` : videoUrl,
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
    await appendRunLog(`source note written: ${sourceNotePath}`);

    // PRIMARY summary lane: the Obsidian Copilot plugin summarizes the transcription note in
    // the BACKGROUND (fork command copilot:summarize-to-note — no modal, no focus change; see
    // runCopilotHeadlessSummary). The extension-side template summarizer below survives ONLY
    // as a last resort when the Copilot lane genuinely fails (dispatch error or timeout).
    const summaryFolder = normalizeVaultRelativeFolder(prefs.summaryOutputFolder, defaultSummaryOutputFolder);
    const summaryNotePath = toPosixPath(path.posix.join(summaryFolder, `${noteTitle} summary.md`));

    let summaryModelLabel = "obsidian-copilot";
    let usedFallbackSummarizer = false;
    try {
      toast.title = "Summarizing via Obsidian Copilot (background)...";
      await runCopilotHeadlessSummary({ vaultPath, sourceNotePath, summaryNotePath });
      await appendRunLog(`summary written via obsidian-copilot: ${summaryNotePath}`);
    } catch (copilotError) {
      const reason = copilotError instanceof Error ? copilotError.message : String(copilotError);
      await appendRunLog(
        `copilot summary lane FAILED (${reason}) — LAST-RESORT fallback to the extension-side summarizer`
      );

      const summarizeTemplatePath =
        prefs.summarizeTemplatePath?.trim() ||
        path.join(vaultPath, "copilot", "copilot-custom-prompts", "Summarize.md");

      toast.title = prefs.anthropicApiKey?.trim()
        ? "Copilot lane failed — falling back to Claude (Summarize template)..."
        : "Copilot lane failed — falling back to the Summarize template...";
      const summary = await generateTemplateSummaryText({
        templatePath: summarizeTemplatePath,
        sourceTitle: noteTitle,
        sourceText: transcriptText,
        sourceNoteContent,
        sourcePath: sourceNotePath,
        anthropicApiKey: prefs.anthropicApiKey,
        anthropicModel: prefs.anthropicModel,
      });

      await raycastObsidianCreateNote({
        vault: vaultName,
        vaultRoot: vaultPath,
        path: summaryNotePath,
        content: summary.summaryText,
        overwrite: true,
      });
      summaryModelLabel = summary.model;
      usedFallbackSummarizer = true;
      await appendRunLog(`summary written via ${summary.model} (fallback): ${summaryNotePath}`);
    }

    // Summary is safely written — remove every leftover (mp4 + subtitle/variants, transcript .txt,
    // transcription note, temp dirs), leaving ONLY the summary note. Toggle via the cleanup pref.
    if (prefs.cleanupAfterSummary !== false) {
      toast.title = "Cleaning up leftover files...";
      // Provenance-aware cleanup: only files the PIPELINE created are disposable. Files inside the
      // vault's video folder qualify; a user-picked local source video never does (not outside the
      // vault, e.g. ~/Downloads, and not when it happens to sit in Video Downloads). A Downie-
      // downloaded video lives in the pipeline's dedicated folder and IS ours, so it is added explicitly.
      await cleanupRunArtifacts({
        files: [
          ...artifacts.filter(
            (artifactPath) => artifactPath.startsWith(outputDir + path.sep) && artifactPath !== localVideoPath
          ),
          ...(downieDownloadedFile ? [downieDownloadedFile] : []),
          transcriptAbsolutePath,
          path.join(vaultPath, ...sourceNotePath.split("/")),
        ],
        tempDirs: [
          path.join(os.tmpdir(), "raycast-obsidian", "yt-dlp", timestamp),
          path.join(os.tmpdir(), "raycast-obsidian", "whisper", timestamp),
        ],
      });
    }

    toast.style = Toast.Style.Success;
    toast.title = "Transcribe & Save complete";
    toast.message = `Summarized via ${summaryModelLabel} -> ${summaryNotePath}`;
    await appendRunLog("RUN SUCCESS");
    await popToRoot();

    return {
      sourceNoteRelativePath,
      transcriptRelativePath,
      summaryNotePath,
      sourceVideoRelativePath,
      usedBackend: false,
      usedFallbackModel: usedFallbackSummarizer,
    };
  } catch (error) {
    const fullProcessOutput = extractProcessErrorText(error);
    await appendRunLog(
      `RUN FAIL: ${error instanceof Error ? error.message : String(error)}` +
        (fullProcessOutput ? `\n--- process output ---\n${fullProcessOutput}\n--- end process output ---` : "")
    );

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
  } finally {
    // The unsealed plaintext jar must never outlive the run — success or failure.
    if (unsealedCookiesFile) {
      await fs.rm(path.dirname(unsealedCookiesFile), { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
