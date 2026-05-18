export interface BridgeLauncherSettings {
  bridgePackagePath: string;
  nodePath: string;
  mcpConfigPath: string;
  caCertPath: string;
  bridgePort: number;
  shutdownTimeoutMs: number;
  staleProcessKillEnabled: boolean;
  /**
   * If true, the bridge tool `obsidian_dev_console_eval` will execute caller-supplied
   * JS in renderer scope. Default OFF — arbitrary eval is a powerful capability,
   * even on loopback HTTPS with auth. Logs/errors capture (read-only) is always on.
   */
  devConsoleEvalEnabled: boolean;
  /** Maximum log entries kept in the in-renderer ring buffer for console.logs. */
  consoleBufferSize: number;
  /** Maximum error entries kept in the in-renderer ring buffer for console.errors. */
  consoleErrorsBufferSize: number;
}

export type BridgeStatus = "stopped" | "starting" | "running" | "exited" | "error";

export type ConsoleLevel = "log" | "info" | "warn" | "error" | "debug";

export interface ConsoleEntry {
  level: ConsoleLevel;
  ts: number;
  message: string;
  origin?: string;
}

export interface ErrorEntry {
  ts: number;
  message: string;
  stack?: string;
  source?: string;
  lineno?: number;
  colno?: number;
  kind: "error" | "unhandledrejection";
}
