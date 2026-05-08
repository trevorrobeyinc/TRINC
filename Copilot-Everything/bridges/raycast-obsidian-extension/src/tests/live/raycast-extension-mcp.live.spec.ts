import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { getPreferenceValues } from "@raycast/api";

const runLive = process.env.OBSIDIAN_LIVE_TEST === "1";

describe.skipIf(!runLive)("Raycast Extension + MCP Live Integration", () => {
  const vaultPath = process.env.OBSIDIAN_LIVE_VAULT_PATH || "";
  const mcpToken = process.env.OBSIDIAN_LIVE_MCP_TOKEN || "";
  const mcpEndpoint = process.env.OBSIDIAN_LIVE_MCP_HTTP_URL || "";
  const vaultName = path.basename(vaultPath);
  const runRoot = `cpbh-extension-demo/${new Date().toISOString().replace(/[.:]/g, "-")}-${randomUUID().slice(0, 8)}`;
  const noteName = "extension-demo-note";
  const relativeNotePath = `${runRoot}/${noteName}.md`;
  const fullNotePath = path.join(vaultPath, relativeNotePath);
  const marker = `raycast-extension-mcp-${randomUUID().slice(0, 8)}`;
  let createNoteTool: (input: {
    name?: string;
    content?: string;
    vaultName?: string;
    path?: string;
    tags?: string;
  }) => Promise<string>;
  let appendNoteTool: (input: {
    fullNotePath?: string;
    content: string;
    useDailyNote?: boolean;
    vaultName?: string;
    heading?: string;
    prepend?: boolean;
    silent?: boolean;
  }) => Promise<string>;
  let readNoteTool: (input: { fullNotePath: string }) => Promise<string>;
  let searchNoteTool: (input: { searchTerm: string; vaultName?: string }) => Promise<string>;
  let openNoteTool: (input: { fullNotePath: string; openInNewPane?: boolean }) => Promise<string>;

  beforeAll(async () => {
    if (!vaultPath || !mcpToken || !mcpEndpoint) {
      throw new Error("Missing one or more required live env vars for Raycast extension live test.");
    }

    // Configure extension preferences for MCP hybrid mode in mocked Raycast API.
    (getPreferenceValues as unknown as { mockReturnValue: (v: unknown) => void }).mockReturnValue({
      vaultPath,
      excludedFolders: "",
      configFileName: ".obsidian",
      mcpEnabled: true,
      mcpTransport: "http",
      mcpHttpEndpoint: mcpEndpoint,
      mcpAuthToken: mcpToken,
      mcpRequestTimeoutMs: "20000",
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

    // Import after preferences are injected so singleton planners read correct MCP auth.
    ({ default: createNoteTool } = await import("@/tools/createNote"));
    ({ default: appendNoteTool } = await import("@/tools/appendNote"));
    ({ default: readNoteTool } = await import("@/tools/readNote"));
    ({ default: searchNoteTool } = await import("@/tools/searchNote"));
    ({ default: openNoteTool } = await import("@/tools/openNote"));
    const { MCPClient } = await import("@/api/mcp/mcpClient.service");

    // Basic live MCP sanity check via extension MCP client.
    const client = new MCPClient();
    const health = await client.callTool<{}, { backends?: { cli?: { capabilities?: { available?: boolean } } } }>({
      tool: "obsidian_health",
      operation: "read_note",
      input: {},
    });

    if (!health.ok || !health.data?.backends?.cli?.capabilities?.available) {
      throw new Error("MCP health failed or CLI backend unavailable for extension live test.");
    }
  }, 30_000);

  it(
    "exercises extension tools against live MCP server",
    async () => {
      const createResult = await createNoteTool({
        name: noteName,
        content: `# Raycast Extension MCP Live\\n${marker}\\n`,
        vaultName,
        path: runRoot,
      });
      expect(createResult).toContain("Successfully created note");

      const readResult1 = await readNoteTool({ fullNotePath });
      expect(readResult1).toContain(marker);

      const appendResult = await appendNoteTool({
        fullNotePath,
        content: `## Extension Append\\n${marker}\\n`,
      });
      expect(appendResult).toContain("Successfully appended");

      const readResult2 = await readNoteTool({ fullNotePath });
      expect(readResult2).toContain("## Extension Append");

      const searchResult = await searchNoteTool({
        searchTerm: marker,
        vaultName,
      });
      expect(searchResult).toContain(fullNotePath);

      const openResult = await openNoteTool({ fullNotePath });
      expect(openResult).toContain("Opened note");
    },
    90_000
  );

  it(
    "cleans up extension demo directory",
    async () => {
      await fs.rm(path.join(vaultPath, runRoot), { recursive: true, force: true });
      await expect(fs.access(path.join(vaultPath, runRoot))).rejects.toThrow();
    },
    30_000
  );
});
