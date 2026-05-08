import { logInfo, logWarn } from "@/logger";
import { getSettings } from "@/settings/model";
import type { ChatUIState } from "@/state/ChatUIState";
import type { App } from "obsidian";
import { Notice } from "obsidian";
import { McpEventClient, type McpEvent } from "./McpEventClient";
import type { McpServerConfig } from "./types";

/**
 * Wires `McpEventClient` (low-level SSE consumer) into the plugin lifecycle:
 *   - Picks the first enabled HTTP MCP server with a non-empty endpoint+token.
 *   - Subscribes to the `research` stream.
 *   - For each `research_arrived` event, renders a system-style chat bubble
 *     and (if `autoOpenIncomingResearch` is enabled) opens the main note as
 *     a new tab.
 *
 * Can be `restart()`ed when settings change so endpoint/token edits take
 * effect without reloading the whole plugin.
 */
export class McpEventBridge {
  private client?: McpEventClient;

  constructor(
    private readonly app: App,
    private readonly getChatUIState: () => ChatUIState | undefined
  ) {}

  start(): void {
    this.stop();

    const server = pickActiveServer();
    if (!server) {
      logInfo("[McpEventBridge] No active MCP server with endpoint+token; SSE not started.");
      return;
    }

    this.client = new McpEventClient({
      endpoint: server.httpEndpoint,
      authToken: server.authToken,
      stream: "research",
    });

    this.client.subscribe((event) => this.handleEvent(event));
    this.client.start();
    logInfo(`[McpEventBridge] Subscribed to ${server.httpEndpoint}/mcp/events?stream=research`);
  }

  stop(): void {
    if (this.client) {
      this.client.stop();
      this.client = undefined;
    }
  }

  /** Restart with whatever the current settings now point at. */
  restart(): void {
    this.start();
  }

  private handleEvent(event: McpEvent): void {
    if (event.type !== "research_arrived") {
      return;
    }
    const title =
      typeof event.title === "string" && event.title
        ? event.title
        : typeof event.taskId === "string"
          ? event.taskId
          : "research result";
    const mainNotePath = typeof event.mainNotePath === "string" ? event.mainNotePath : "";
    const stubsCreated = typeof event.stubNotesCreated === "number" ? event.stubNotesCreated : 0;
    const totalLinks = typeof event.totalLinks === "number" ? event.totalLinks : 0;

    // Always show a desktop-style notice so the user sees something even if
    // the chat panel is closed.
    new Notice(`Research arrived: ${title}`, 4000);

    // Add a system-style bubble to the active chat history.
    const ui = this.getChatUIState();
    if (ui) {
      const linkLine = mainNotePath ? `\n\n[[${mainNotePath}|Open the note]]` : "";
      const linkSummary =
        totalLinks > 0
          ? `\n\n${stubsCreated} new stub note(s) created from ${totalLinks} wikilink target(s).`
          : "";
      try {
        ui.addMessage({
          message: `**Research arrived: ${title}**${linkSummary}${linkLine}`,
          sender: "SYSTEM",
          timestamp: null,
          isVisible: true,
        });
      } catch (err) {
        logWarn(
          `[McpEventBridge] addMessage failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    // Open the main note as a new tab if configured.
    const settings = getSettings();
    const autoOpen =
      (settings as unknown as { autoOpenIncomingResearch?: boolean }).autoOpenIncomingResearch !==
      false;
    if (autoOpen && mainNotePath) {
      try {
        void this.app.workspace.openLinkText(mainNotePath, "", true);
      } catch (err) {
        logWarn(
          `[McpEventBridge] openLinkText('${mainNotePath}') failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }
}

function pickActiveServer(): McpServerConfig | undefined {
  const settings = getSettings();
  if (!settings.mcp?.enabled) {
    return undefined;
  }
  const servers = settings.mcp.servers ?? [];
  return servers.find(
    (s) => s.enabled && s.transport === "http" && Boolean(s.httpEndpoint) && Boolean(s.authToken)
  );
}
