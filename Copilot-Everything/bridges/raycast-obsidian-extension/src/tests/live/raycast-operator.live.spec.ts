import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import http from "node:http";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPreferenceValues, open } from "@raycast/api";

const runLive = process.env.OBSIDIAN_LIVE_TEST === "1";

const defaultVaultPath = "/Users/myhome/My Digital Garden";
const defaultPdfFixture = "/Users/myhome/My Digital Garden/Learning/Strayer Classes/BUS499/Week 2/SWOT Worksheet.pdf";
const defaultVideoFixture =
  "/Users/myhome/My Digital Garden/Learning/Strayer Classes/BUS520 Leadership and Organizational Behavior/Week 2/Organizational Behavior in Context Part 1 Lecture.mp4";

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function createStaticFileServer(filePath: string): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const stat = await fs.stat(filePath);
      const range = req.headers.range;
      const contentType = filePath.toLowerCase().endsWith(".mp4") ? "video/mp4" : "application/octet-stream";

      if (range) {
        const match = /^bytes=(\d+)-(\d*)$/.exec(range);
        if (!match) {
          res.writeHead(416);
          res.end();
          return;
        }

        const start = Number.parseInt(match[1], 10);
        const requestedEnd = match[2] ? Number.parseInt(match[2], 10) : stat.size - 1;
        const end = Math.min(requestedEnd, stat.size - 1);

        res.writeHead(206, {
          "Content-Type": contentType,
          "Content-Length": String(end - start + 1),
          "Content-Range": `bytes ${start}-${end}/${stat.size}`,
          "Accept-Ranges": "bytes",
        });

        if (req.method === "HEAD") {
          res.end();
          return;
        }

        createReadStream(filePath, { start, end }).pipe(res);
        return;
      }

      res.writeHead(200, {
        "Content-Type": contentType,
        "Content-Length": String(stat.size),
        "Accept-Ranges": "bytes",
      });

      if (req.method === "HEAD") {
        res.end();
        return;
      }

      createReadStream(filePath).pipe(res);
    });

    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to resolve localhost server address."));
        return;
      }

      resolve({
        baseUrl: `http://127.0.0.1:${address.port}`,
        close: async () =>
          await new Promise<void>((closeResolve, closeReject) => {
            server.close((error) => {
              if (error) {
                closeReject(error);
                return;
              }
              closeResolve();
            });
          }),
      });
    });
  });
}

describe.skipIf(!runLive)("Raycast Operator Live Smoke", () => {
  const vaultPath = process.env.OBSIDIAN_LIVE_VAULT_PATH || defaultVaultPath;
  const vaultName = process.env.OBSIDIAN_LIVE_VAULT_NAME || path.basename(vaultPath);
  const mcpToken = process.env.OBSIDIAN_LIVE_MCP_TOKEN || "";
  const mcpEndpoint = process.env.OBSIDIAN_LIVE_MCP_HTTP_URL || "";
  const pdfFixturePath = process.env.OBSIDIAN_LIVE_PDF_PATH || defaultPdfFixture;
  const videoFixturePath = process.env.OBSIDIAN_LIVE_VIDEO_PATH || defaultVideoFixture;
  const templatePath = path.join(vaultPath, "copilot", "copilot-custom-prompts", "Summarize.md");
  const runRoot = `obsidian-cli-only-smoke/${new Date().toISOString().replace(/[.:]/g, "-")}-${randomUUID().slice(
    0,
    8
  )}`;
  const preparedNoteRelativePath = `${runRoot}/prepared-note.md`;
  const tempPromptSlug = `cli-only-smoke-${randomUUID().slice(0, 8)}`;
  const tempPromptAbsolutePath = path.join(vaultPath, "copilot", "copilot-custom-prompts", `${tempPromptSlug}.md`);
  const copiedPdfRelativePath = `${runRoot}/fixtures/${path.basename(pdfFixturePath)}`;
  const copiedPdfAbsolutePath = path.join(vaultPath, copiedPdfRelativePath);
  let serverCloser: (() => Promise<void>) | null = null;
  let servedVideoUrl = "";
  let copyPdfSource: (() => Promise<void>) | null = null;
  let hybridCreateNote: typeof import("@/api/mcp/hybridObsidian.service").hybridCreateNote;
  let loadPromptItems: typeof import("@/tools/copilotPromptsFlow").loadPromptItems;
  let refreshPromptRegistry: typeof import("@/tools/copilotPromptsFlow").refreshPromptRegistry;
  let runPrompt: typeof import("@/tools/copilotPromptsFlow").runPrompt;
  let runAiSummarizeCommand: typeof import("@/tools/aiSummarizeCommandFlow").runAiSummarizeCommand;
  let runPdfSummarizeCommand: typeof import("@/tools/pdfSummarizeFlow").runPdfSummarizeCommand;
  let runVideoTranscribeCommand: typeof import("@/tools/videoTranscribeFlow").runVideoTranscribeCommand;

  beforeAll(async () => {
    if (!vaultPath || !mcpToken || !mcpEndpoint) {
      throw new Error("Missing one or more required live env vars for Raycast operator smoke.");
    }

    if (!(await fileExists(pdfFixturePath))) {
      throw new Error(`Missing PDF fixture: ${pdfFixturePath}`);
    }

    if (!(await fileExists(videoFixturePath))) {
      throw new Error(`Missing video fixture: ${videoFixturePath}`);
    }

    process.env.OBSIDIAN_LIVE_RAYCAST_OPEN_REAL = "1";

    (getPreferenceValues as unknown as { mockReturnValue: (value: unknown) => void }).mockReturnValue({
      vaultPath,
      excludedFolders: "",
      configFileName: ".obsidian",
      mcpEnabled: true,
      mcpTransport: "http",
      mcpHttpEndpoint: mcpEndpoint,
      mcpAuthToken: mcpToken,
      mcpRequestTimeoutMs: "20000",
      backendEmulatorUrl: "http://127.0.0.1:8789",
      backendRequestTimeoutMs: "30000",
      backendRuntimeLane: "raycast",
      summarizeTemplatePath: templatePath,
      summaryOutputFolder: `${runRoot}/summaries`,
      pdfDownloadFolder: `${runRoot}/pdf-downloads`,
      videoDownloadFolder: `${runRoot}/video-downloads`,
      ytDlpPath: "/Users/myhome/Library/Python/3.9/bin/yt-dlp",
      whisperPath: "/Users/myhome/Library/Python/3.9/bin/whisper",
      ytDlpCookiesFromBrowser: "none",
      ytDlpCookiesFile: "",
      whisperModel: "medium",
      openOnCreate: false,
      fillFormWithDefaults: false,
      prefNoteName: "Untitled",
      prefNoteContent: "",
      prefPath: "",
      prefTag: "",
      tags: "",
      blankNote: false,
      folderActions: "",
      focusContentArea: false,
      removeYAML: false,
      removeLinks: false,
      removeLatex: false,
    });

    ({ hybridCreateNote } = await import("@/api/mcp/hybridObsidian.service"));
    ({ loadPromptItems, refreshPromptRegistry, runPrompt } = await import("@/tools/copilotPromptsFlow"));
    ({ runAiSummarizeCommand } = await import("@/tools/aiSummarizeCommandFlow"));
    ({ runPdfSummarizeCommand } = await import("@/tools/pdfSummarizeFlow"));
    ({ runVideoTranscribeCommand } = await import("@/tools/videoTranscribeFlow"));
    const { MCPClient } = await import("@/api/mcp/mcpClient.service");

    const client = new MCPClient();
    const health = await client.callTool<
      Record<string, never>,
      { backends?: { cli?: { capabilities?: { available?: boolean } } } }
    >({
      tool: "obsidian_health",
      operation: "read_note",
      input: {},
    });

    if (!health.ok || !health.data?.backends?.cli?.capabilities?.available) {
      throw new Error("MCP health failed or CLI backend unavailable for operator live smoke.");
    }

    await fs.mkdir(path.dirname(copiedPdfAbsolutePath), { recursive: true });
    await fs.copyFile(pdfFixturePath, copiedPdfAbsolutePath);
    await fs.writeFile(
      tempPromptAbsolutePath,
      `# ${tempPromptSlug}\n\nPlease summarize the current active note in one sentence.\n`,
      "utf-8"
    );
    copyPdfSource = async () => {
      await fs.rm(tempPromptAbsolutePath, { force: true });
      await fs.rm(path.join(vaultPath, runRoot), { recursive: true, force: true });
    };

    await hybridCreateNote({
      vault: vaultName,
      vaultRoot: vaultPath,
      path: preparedNoteRelativePath,
      content: `# CLI Only Smoke\n\nMarker: ${randomUUID()}\n`,
      overwrite: true,
    });

    const staticServer = await createStaticFileServer(videoFixturePath);
    servedVideoUrl = `${staticServer.baseUrl}/fixture.mp4`;
    serverCloser = staticServer.close;
  }, 45_000);

  afterAll(async () => {
    if (serverCloser) {
      await serverCloser();
    }
    if (copyPdfSource) {
      await copyPdfSource();
    }
  });

  it("refreshes prompts and runs the summarize prompt against the active note", async () => {
    const vault = { name: vaultName, path: vaultPath, key: vaultPath };

    const refreshResult = await refreshPromptRegistry(vault);
    expect(refreshResult.commandId).toMatch(/^copilot:/);

    const promptItems = await loadPromptItems(vault);
    const tempPrompt = promptItems.find((item) => item.title === tempPromptSlug);
    expect(tempPrompt).toBeDefined();
    const summarizePrompt = promptItems.find((item) => item.title.toLowerCase() === "summarize");
    expect(summarizePrompt).toBeDefined();

    await open(`obsidian://open?path=${encodeURIComponent(path.join(vaultPath, preparedNoteRelativePath))}`);
    await wait(1_000);

    const tempResult = await runPrompt(vault, tempPrompt!);
    expect(tempResult.commandId).toBe(`copilot:${tempPromptSlug}`);

    const result = await runPrompt(vault, summarizePrompt!);
    expect(result.commandId).toBe("copilot:summarize");
  }, 90_000);

  it("runs the installed AI summarize flow against the prepared note", async () => {
    await open(`obsidian://open?path=${encodeURIComponent(path.join(vaultPath, preparedNoteRelativePath))}`);
    await wait(1_000);

    const result = await runAiSummarizeCommand();

    expect(result.normalizedPath).toBe("");
    expect(result.openedUri).toBe("");
    expect(result.usedCommandId).toBe("copilot:summarize");
  }, 90_000);

  it("creates PDF source and summary notes through the installed extension flow", async () => {
    const result = await runPdfSummarizeCommand(
      {
        pdfPath: copiedPdfAbsolutePath,
      },
      (getPreferenceValues as unknown as () => Record<string, string>)() as never
    );

    expect(await fileExists(path.join(vaultPath, result.sourceNoteRelativePath))).toBe(true);
    expect(await fileExists(path.join(vaultPath, result.transcriptRelativePath))).toBe(true);
    expect(await fileExists(path.join(vaultPath, result.summaryNotePath))).toBe(true);
  }, 240_000);

  it("creates video transcript and summary notes through the installed extension flow", async () => {
    const result = await runVideoTranscribeCommand(
      {
        videoUrl: servedVideoUrl,
      },
      (getPreferenceValues as unknown as () => Record<string, string>)() as never
    );

    expect(await fileExists(path.join(vaultPath, result.sourceNoteRelativePath))).toBe(true);
    expect(await fileExists(path.join(vaultPath, result.transcriptRelativePath))).toBe(true);
    expect(await fileExists(path.join(vaultPath, result.summaryNotePath))).toBe(true);
    expect(await fileExists(path.join(vaultPath, result.sourceVideoRelativePath))).toBe(true);
  }, 420_000);
});
