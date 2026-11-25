import type { BridgeLauncherSettings } from "./types";

export const PLUGIN_ID = "obsidian-bridge-launcher";

export const DEFAULT_SETTINGS: BridgeLauncherSettings = {
  bridgePackagePath:
    "/Users/myhome/TRINC/Copilot-Everything/bridges/obsidian-copilot-bridge",
  nodePath: "/Users/myhome/.nvm/versions/node/v22.13.1/bin/node",
  mcpConfigPath:
    "/Users/myhome/TRINC/Copilot-Everything/bridges/obsidian-copilot-bridge/config/obsidian-cli-mcp.local.json",
  caCertPath:
    "/Users/myhome/Library/Application Support/mkcert/rootCA.pem",
  shutdownTimeoutMs: 5000,
  staleProcessKillEnabled: true,
  consoleBufferSize: 500,
  consoleErrorsBufferSize: 200,
};

export const BRIDGE_IPC_FD = 3;

/** Timeout of each readiness request (GET /healthz over vault-bridge.sock). */
export const HEALTHZ_TIMEOUT_MS = 2000;
