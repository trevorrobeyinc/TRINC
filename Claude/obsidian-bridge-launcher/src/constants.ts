import type { BridgeLauncherSettings } from "./types";

export const PLUGIN_ID = "obsidian-bridge-launcher";

export const DEFAULT_SETTINGS: BridgeLauncherSettings = {
  bridgePackagePath:
    "/Users/trevorrobey/TrevClaw-Obsidianodus/Copilot-Everything/bridges/obsidian-copilot-bridge",
  nodePath: "/Users/trevorrobey/.nvm/versions/node/v22.13.1/bin/node",
  mcpConfigPath:
    "/Users/trevorrobey/TrevClaw-Obsidianodus/Copilot-Everything/bridges/obsidian-copilot-bridge/config/obsidian-cli-mcp.local.json",
  caCertPath:
    "/Users/trevorrobey/Library/Application Support/mkcert/rootCA.pem",
  bridgePort: 8798,
  shutdownTimeoutMs: 5000,
  staleProcessKillEnabled: true,
  devConsoleEvalEnabled: false,
  consoleBufferSize: 500,
  consoleErrorsBufferSize: 200,
};

export const BRIDGE_IPC_FD = 3;

export const HEALTHZ_TIMEOUT_MS = 4000;
