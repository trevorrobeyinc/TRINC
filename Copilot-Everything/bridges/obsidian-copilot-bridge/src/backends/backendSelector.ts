import { randomUUID } from "node:crypto";
import type { Backend, BackendCapabilities } from "./backend";
import type { BackendId, Operation } from "../types";
import { AppError } from "../server/errors";
import { ERROR_CODES } from "../server/errorCodes";

const ALL_OPERATIONS: Operation[] = [
  "open_vault",
  "create_note",
  "append_note",
  "read_note",
  "search_notes",
  "execute_command",
];

export interface RoutingSnapshot {
  epochId: number;
  refreshedAt: number;
  operationMap: Record<Operation, BackendId | null>;
  reasons: Record<Operation, string>;
  capabilities: Partial<Record<BackendId, BackendCapabilities>>;
}

export interface BackendSelectorOptions {
  refreshIntervalMs?: number;
  // When true (default), prefer the in-process plugin backend over the CLI when
  // the plugin is available for an operation. Set false to keep CLI as primary
  // even if the plugin is loaded — useful for forcing legacy behavior or
  // testing. Reads from config.dispatch.preferPluginBackend at startup.
  preferPlugin?: boolean;
}

export class BackendSelector {
  private readonly backends: Partial<Record<BackendId, Backend>>;
  private snapshot: RoutingSnapshot;
  private readonly refreshIntervalMs: number;
  private readonly preferPlugin: boolean;

  constructor(
    backends: Partial<Record<BackendId, Backend>>,
    optionsOrRefreshInterval: BackendSelectorOptions | number = 60_000
  ) {
    if (!backends.cli) {
      throw new Error("BackendSelector: cli backend is required");
    }
    this.backends = backends;
    const opts: BackendSelectorOptions =
      typeof optionsOrRefreshInterval === "number"
        ? { refreshIntervalMs: optionsOrRefreshInterval }
        : optionsOrRefreshInterval;
    this.refreshIntervalMs = opts.refreshIntervalMs ?? 60_000;
    this.preferPlugin = opts.preferPlugin !== false;
    this.snapshot = {
      epochId: Date.now(),
      refreshedAt: 0,
      operationMap: {
        open_vault: null,
        create_note: null,
        append_note: null,
        read_note: null,
        search_notes: null,
        execute_command: null,
      },
      reasons: {
        open_vault: "uninitialized",
        create_note: "uninitialized",
        append_note: "uninitialized",
        read_note: "uninitialized",
        search_notes: "uninitialized",
        execute_command: "uninitialized",
      },
      capabilities: {
        cli: { backend: "cli", available: false, supportedOps: [], reliabilityScore: 0, p95MsByOp: {}, constraints: [] },
      },
    };
  }

  async refresh(force = false): Promise<RoutingSnapshot> {
    const now = Date.now();
    if (!force && now - this.snapshot.refreshedAt < this.refreshIntervalMs) {
      return this.snapshot;
    }

    const cliCapabilities = await this.backends.cli!.probe();
    const pluginCapabilities = this.backends.plugin ? await this.backends.plugin.probe() : null;

    const operationMap = { ...this.snapshot.operationMap };
    const reasons = { ...this.snapshot.reasons };
    const capsByBackend: Partial<Record<BackendId, BackendCapabilities>> = {
      cli: cliCapabilities,
    };
    if (pluginCapabilities) {
      capsByBackend.plugin = pluginCapabilities;
    }

    for (const operation of ALL_OPERATIONS) {
      const pluginCan =
        !!pluginCapabilities && pluginCapabilities.available && pluginCapabilities.supportedOps.includes(operation);
      const cliCan = cliCapabilities.available && cliCapabilities.supportedOps.includes(operation);

      if (pluginCan && this.preferPlugin) {
        operationMap[operation] = "plugin";
        reasons[operation] = "plugin_preferred_hmac_uds";
      } else if (cliCan) {
        operationMap[operation] = "cli";
        reasons[operation] = pluginCan ? "cli_forced_pluginPref_off" : "cli_fallback";
      } else if (pluginCan) {
        // CLI unavailable but plugin available — use plugin even if pref is off.
        operationMap[operation] = "plugin";
        reasons[operation] = "plugin_only_cli_unavailable";
      } else {
        operationMap[operation] = null;
        reasons[operation] = "no_backend_available";
      }
    }

    this.snapshot = {
      epochId: Date.now(),
      refreshedAt: now,
      operationMap,
      reasons,
      capabilities: capsByBackend,
    };

    return this.snapshot;
  }

  async select(operation: Operation, requestedEpochId?: number, backendHint?: BackendId): Promise<Backend> {
    const snapshot = await this.refresh();

    if (requestedEpochId && requestedEpochId !== snapshot.epochId) {
      throw new AppError(ERROR_CODES.BACKEND_SELECTION_STALE, "Backend routing epoch is stale.", true, {
        requestedEpochId,
        currentEpochId: snapshot.epochId,
      });
    }

    const routedBackendId = snapshot.operationMap[operation];
    if (!routedBackendId) {
      throw new AppError(ERROR_CODES.NO_CAPABLE_BACKEND, `No backend can serve operation ${operation}.`, true, {
        operation,
        requestId: randomUUID(),
      });
    }

    if (backendHint && backendHint !== routedBackendId) {
      throw new AppError(ERROR_CODES.NO_CAPABLE_BACKEND, "Requested backend hint does not match selected backend.", true, {
        operation,
        backendHint,
        selected: routedBackendId,
      });
    }

    const backend = this.backends[routedBackendId];
    if (!backend) {
      throw new AppError(ERROR_CODES.NO_CAPABLE_BACKEND, `Backend "${routedBackendId}" is not registered.`, true, {
        operation,
        routedBackendId,
      });
    }
    return backend;
  }

  async selectSpecific(operation: Operation, backendId: BackendId, requestedEpochId?: number): Promise<Backend> {
    const snapshot = await this.refresh();

    if (requestedEpochId && requestedEpochId !== snapshot.epochId) {
      throw new AppError(ERROR_CODES.BACKEND_SELECTION_STALE, "Backend routing epoch is stale.", true, {
        requestedEpochId,
        currentEpochId: snapshot.epochId,
      });
    }

    const cap = snapshot.capabilities[backendId];
    if (!cap?.available || !cap.supportedOps.includes(operation)) {
      throw new AppError(ERROR_CODES.NO_CAPABLE_BACKEND, "Pinned backend cannot satisfy the requested operation.", true, {
        operation,
        backendId,
      });
    }

    const backend = this.backends[backendId];
    if (!backend) {
      throw new AppError(ERROR_CODES.NO_CAPABLE_BACKEND, `Backend "${backendId}" is not registered.`, true, {
        operation,
        backendId,
      });
    }
    return backend;
  }

  currentSnapshot(): RoutingSnapshot {
    return this.snapshot;
  }
}
