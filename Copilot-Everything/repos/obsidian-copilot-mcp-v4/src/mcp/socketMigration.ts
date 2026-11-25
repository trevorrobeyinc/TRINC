import { logInfo, logWarn } from "@/logger";
import { getSettings, setSettings } from "@/settings/model";
import type { McpServerConfig } from "./types";
import { boundSocketName, legacyEndpointSocketName } from "./udsClient";

/**
 * Settings migration for bridges-uds (2026-11-24): the TRINC bridges left loopback TCP for Unix
 * sockets, so `mcp.servers` entries that pointed at them move to transport "uds". It runs on every
 * load and is idempotent: a converted entry is "uds" and is never touched again, and an entry it
 * cannot convert stays as it is, is never dialled, and is listed in Diagnostics. Only transport and
 * socketPath change; the token, the httpEndpoint record and every other field are kept.
 */

/** An entry the migration moved to a socket. */
export interface McpSocketMigrationEntry {
  serverId: string;
  displayName: string;
  socketName: string;
}

/** An entry that is not on a socket, so it is never dialled, and why. */
export interface McpUnconvertedServer {
  serverId: string;
  displayName: string;
  reason: string;
}

/** What one migration run did (or, from the planner, would do). */
export interface McpSocketMigrationReport {
  migrated: readonly McpSocketMigrationEntry[];
  unconverted: readonly McpUnconvertedServer[];
}

/** The planner's result. */
export interface McpSocketMigrationPlan extends McpSocketMigrationReport {
  /** The converted server list, or null when nothing converts (no write). */
  servers: McpServerConfig[] | null;
}

type Classification =
  | { kind: "socket" }
  | { kind: "convert"; socketName: string; socketPath: string }
  | { kind: "unconverted"; reason: string };

/** Written for ids that are not bound by name; resolveBridgeSocket expands it from os.homedir(). */
const TILDE_RUN_DIR = "~/.local/state/trinc/run";
const HTTP_REMOVED = "HTTP transport was removed on 2026-11-24 (bridges-uds)";
/** See AGENTS.md: "Referential stability". */
const EMPTY_REPORT: McpSocketMigrationReport = Object.freeze({
  migrated: Object.freeze([]),
  unconverted: Object.freeze([]),
});

let lastReport: McpSocketMigrationReport = EMPTY_REPORT;

function isServerRecord(value: unknown): value is McpServerConfig {
  return typeof value === "object" && value !== null;
}

/**
 * A server converts when its id is one of the three known ids or its endpoint record names a bridge
 * (loopback host, port 8798, 8799 or 8800); the socket name comes from the port. A known id whose
 * endpoint record names anything else is left for the operator to fix.
 */
function classify(server: McpServerConfig): Classification {
  if (server.transport === "uds") return { kind: "socket" };
  if (server.transport !== "http") {
    return {
      kind: "unconverted",
      reason: `transport '${String(server.transport)}' is not implemented; only 'uds' is dialled`,
    };
  }
  const boundName = boundSocketName(server.id);
  const endpointName = legacyEndpointSocketName(server.httpEndpoint);
  const hasEndpoint = typeof server.httpEndpoint === "string" && server.httpEndpoint.trim() !== "";
  if (boundName !== null) {
    if (!hasEndpoint || endpointName === boundName) {
      return { kind: "convert", socketName: boundName, socketPath: "" };
    }
    return {
      kind: "unconverted",
      reason: `${HTTP_REMOVED}; id '${server.id}' is bound to ${boundName}, but its endpoint record names ${endpointName ?? "no TRINC bridge"}, so it was left unconverted`,
    };
  }
  if (endpointName !== null) {
    return {
      kind: "convert",
      socketName: endpointName,
      socketPath: `${TILDE_RUN_DIR}/${endpointName}`,
    };
  }
  return {
    kind: "unconverted",
    reason: `${HTTP_REMOVED}; its endpoint record names no TRINC bridge (loopback port 8798, 8799 or 8800)`,
  };
}

/**
 * Plan the migration without touching settings.
 *
 * @param servers - The persisted `mcp.servers`.
 * @returns The converted list (null when nothing converts) and the entries converted and left.
 */
export function planMcpSocketMigration(servers: readonly unknown[]): McpSocketMigrationPlan {
  const migrated: McpSocketMigrationEntry[] = [];
  const unconverted: McpUnconvertedServer[] = [];
  const next = servers.map((server) => {
    if (!isServerRecord(server)) return server as McpServerConfig;
    const result = classify(server);
    if (result.kind === "convert") {
      migrated.push({
        serverId: server.id,
        displayName: server.displayName,
        socketName: result.socketName,
      });
      return { ...server, transport: "uds" as const, socketPath: result.socketPath };
    }
    if (result.kind === "unconverted") {
      unconverted.push({
        serverId: server.id,
        displayName: server.displayName,
        reason: result.reason,
      });
    }
    return server;
  });
  return { servers: migrated.length > 0 ? next : null, migrated, unconverted };
}

/**
 * Run the migration on the loaded settings. A change goes through setSettings, so the settings
 * subscriber persists it with the normal save. Logs ids and socket names only, never a token or
 * an endpoint.
 */
export function migrateMcpServersToSockets(): void {
  const mcp = getSettings().mcp;
  if (!mcp || !Array.isArray(mcp.servers)) return;
  const plan = planMcpSocketMigration(mcp.servers);
  lastReport =
    plan.migrated.length > 0 || plan.unconverted.length > 0
      ? { migrated: plan.migrated, unconverted: plan.unconverted }
      : EMPTY_REPORT;
  if (plan.servers) {
    setSettings({ mcp: { ...mcp, servers: plan.servers } });
    logInfo(
      `[MCP] Moved ${plan.migrated.length} MCP server(s) to Unix sockets: ${plan.migrated
        .map((entry) => `${entry.serverId} -> ${entry.socketName}`)
        .join(", ")}`
    );
  }
  if (plan.unconverted.length > 0) {
    logWarn(
      `[MCP] ${plan.unconverted.length} MCP server(s) are not on a socket and are never dialled: ${plan.unconverted
        .map((entry) => entry.serverId)
        .join(", ")} (see Settings > MCP > Diagnostics)`
    );
  }
}

/** What this plugin load's migration converted and left, for Diagnostics. */
export function getMcpSocketMigrationReport(): McpSocketMigrationReport {
  return lastReport;
}

/**
 * Why a server that is not on a socket is never dialled; null for a socket entry.
 *
 * @param server - A configured server.
 */
export function describeUnconvertedServer(server: McpServerConfig): string | null {
  const result = classify(server);
  if (result.kind === "socket") return null;
  if (result.kind === "convert") {
    return `${HTTP_REMOVED}; it moves to ${result.socketName} on the next plugin load`;
  }
  return result.reason;
}
