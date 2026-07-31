export type McpTransport = "http" | "uds" | "pipe";
export type McpConfirmationPolicy = "read_only_only" | "prompt_on_writes" | "allow_without_prompt";

export interface McpServerConfig {
  id: string;
  displayName: string;
  enabled: boolean;
  transport: McpTransport;
  httpEndpoint: string;
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
