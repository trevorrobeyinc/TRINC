import { logInfo, logWarn } from "@/logger";
import { getSettings } from "@/settings/model";
import type { ChatUIState } from "@/state/ChatUIState";
import type { App } from "obsidian";
import { Notice } from "obsidian";
import { McpEventClient, type McpEvent } from "./McpEventClient";
import type { McpServerConfig, McpSettings } from "./types";
import { BRIDGE_SOCKET_NAMES, resolveBridgeSocket, type BridgeSocket } from "./udsClient";

/**
 * Wires `McpEventClient` (low-level SSE consumer) into the plugin lifecycle:
 *   - Follows the vault bridge's socket only (see pickActiveServer).
 *   - Subscribes to the `research` stream.
 *   - For each `research_arrived` event, renders a system-style chat bubble
 *     and (if `autoOpenIncomingResearch` is enabled) opens the main note as
 *     a new tab.
 *
 * Can be `restart()`ed when settings change so socket/token edits take
 * effect without reloading the whole plugin; main.ts stops it on unload.
 */
export class McpEventBridge {
  private client?: McpEventClient;

  constructor(
    private readonly app: App,
    private readonly getChatUIState: () => ChatUIState | undefined
  ) {}

  start(): void {
    this.stop();

    const active = pickActiveServer();
    if (!active) {
      logInfo(
        "[McpEventBridge] No enabled vault-bridge socket server with a token; SSE not started."
      );
      return;
    }

    this.client = new McpEventClient({
      socket: active.socket,
      authToken: active.server.authToken,
      stream: "research",
    });

    this.client.subscribe((event) => this.handleEvent(event));
    this.client.start();
    logInfo(
      `[McpEventBridge] Subscribing to unix:${active.socket.socketPath} /mcp/events?stream=research`
    );
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

const VAULT_BRIDGE_SERVER_ID = "local-obsidian-mcp";

/**
 * Pick the server whose research stream to follow: only the vault bridge serves `/mcp/events`
 * (Command Center answers there with a keepalive-only stub), so this is the enabled socket entry
 * with a token and id local-obsidian-mcp, else the first such entry that resolves to
 * vault-bridge.sock. List order never matters.
 *
 * @param mcp - The MCP settings; defaults to the current ones.
 * @returns The server and its resolved socket, or undefined when no vault-bridge entry qualifies.
 */
export function pickActiveServer(
  mcp: McpSettings | undefined = getSettings().mcp
): { server: McpServerConfig; socket: BridgeSocket } | undefined {
  if (!mcp?.enabled) {
    return undefined;
  }
  const candidates = (mcp.servers ?? []).filter(
    (s) => s.enabled && s.transport === "uds" && Boolean(s.authToken)
  );
  const ordered = [
    ...candidates.filter((s) => s.id === VAULT_BRIDGE_SERVER_ID),
    ...candidates.filter((s) => s.id !== VAULT_BRIDGE_SERVER_ID),
  ];
  for (const server of ordered) {
    let socket: BridgeSocket;
    try {
      socket = resolveBridgeSocket(server);
    } catch {
      continue;
    }
    if (socket.expectedName === BRIDGE_SOCKET_NAMES.vaultBridge) {
      return { server, socket };
    }
  }
  return undefined;
}
