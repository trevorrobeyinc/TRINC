export type McpTransport = "http" | "uds" | "pipe";
export type McpConfirmationPolicy = "read_only_only" | "prompt_on_writes" | "allow_without_prompt";

export interface McpServerConfig {
  id: string;
  displayName: string;
  enabled: boolean;
  /** Only "uds" is dialled. "http" entries are reported in Diagnostics; "pipe" is not implemented. */
  transport: McpTransport;
  /**
   * The bridge socket. "" (or absent) means the socket bound to this server's id, resolved at run
   * time; otherwise `~/.local/state/trinc/run/<name>` or that path spelled absolutely. See
   * resolveBridgeSocket in ./udsClient.
   */
  socketPath?: string;
  /** Legacy loopback TCP endpoint, kept only as a record after the socket migration; never dialled. */
  httpEndpoint?: string;
  authToken: string;
  timeoutMs: number;
  vaultName: string;
  vaultRoot: string;
  enabledToolNames: string[];
}

export interface McpSettings {
  enabled: boolean;
  confirmationPolicy: McpConfirmationPolicy;
  redactLogs: boolean;
  allowlist: string[];
  denylist: string[];
  servers: McpServerConfig[];
}
