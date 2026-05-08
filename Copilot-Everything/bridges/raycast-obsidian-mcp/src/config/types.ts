import type { Operation } from "../types";

export type TransportMode = "http" | "https" | "uds" | "pipe";

export interface ServerConfig {
  transport: {
    mode: TransportMode;
    host: string;
    port: number;
    udsPath: string;
    pipeName: string;
    tls: {
      certPath: string;
      keyPath: string;
    };
  };
  obsidianCliBinary: string;
  cliStability: {
    probeTimeoutMs: number;
    launchTimeoutMs: number;
    readinessPollIntervalMs: number;
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
  };
  logging: {
    level: "error" | "warn" | "info" | "debug" | "trace";
    file: string;
    slowThresholdMs: Record<Operation, number>;
  };
  readOnlyMode: boolean;
}
