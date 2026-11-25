import type { Operation } from "../types";

/**
 * The transports the bridge serves on: its Unix socket on macOS/Linux, a named pipe on Windows.
 * The TCP transport ("http", alias "https") was removed on 2026-11-24 (bridges-uds); the loader
 * refuses it as the effective mode.
 */
export type TransportMode = "uds" | "pipe";

export interface ServerConfig {
  transport: {
    mode: TransportMode;
    host: string;
    port: number;
    /** Always socketPathFor("vault-bridge.sock"), set by the loader; a configured value is ignored. */
    udsPath: string;
    pipeName: string;
  };
  cliStability: {
    requiredVaultNames: string[];
  };
  timeouts: {
    openVaultMs: number;
    createNoteMs: number;
    appendNoteMs: number;
    readNoteMs: number;
    searchNotesMs: number;
  };
  queue: {
    capacity: number;
    workerConcurrency: number;
  };
  allowedVaultRoots: string[];
  security: {
    authToken: string;
    replayWindowSeconds: number;
    nonceTtlSeconds: number;
    rateLimitPerMinute: number;
    globalRateLimitPerMinute: number;
    /**
     * Optional narrowing of the launcher's command allow-list (obsidian-bridge-launcher src/commandPolicy.ts,
     * the authority since 2026-11-25). Empty = the launcher's list as is. Non-empty = only these ids; an id the
     * launcher refuses still never runs.
     */
    executeCommandAllowlist: string[];
  };
  logging: {
    level: "error" | "warn" | "info" | "debug" | "trace";
    file: string;
    slowThresholdMs: Record<Operation, number>;
  };
  readOnlyMode: boolean;
}
