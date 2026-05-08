import type { BridgeLauncherSettings } from "./types";

export const PLUGIN_ID = "obsidian-bridge-launcher";

export const DEFAULT_SETTINGS: BridgeLauncherSettings = {
  bridgePackagePath:
    "/Users/trevorrobey/Code/THE Copilot in Obsidian Everything/bridges/obsidian-copilot-bridge",
  nodePath: "/Users/trevorrobey/.nvm/versions/node/v22.13.1/bin/node",
  mcpConfigPath:
    "/Users/trevorrobey/Code/THE Copilot in Obsidian Everything/bridges/obsidian-copilot-bridge/config/obsidian-cli-mcp.local.json",
  caCertPath:
    "/Users/trevorrobey/Library/Application Support/mkcert/rootCA.pem",
  bridgePort: 8798,
  shutdownTimeoutMs: 5000,
  staleProcessKillEnabled: true,
};

export const HEALTHZ_TIMEOUT_MS = 4000;
