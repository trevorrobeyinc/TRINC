export interface BridgeLauncherSettings {
  bridgePackagePath: string;
  nodePath: string;
  mcpConfigPath: string;
  caCertPath: string;
  bridgePort: number;
  shutdownTimeoutMs: number;
  staleProcessKillEnabled: boolean;
}

export type BridgeStatus = "stopped" | "starting" | "running" | "exited" | "error";
