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
  // Order in which backends are tried for each operation. Since 2026-11-25 the daemon has one backend, the
  // launcher's fd-3 pipe (from 2026-05-09 it was the Local REST API), so `["launcherIpc"]` is the only sensible
  // value. The option is kept for forward compatibility and for tests of the priority-chain mechanism.
  preferredOrder?: BackendId[];
}

const DEFAULT_PREFERRED_ORDER: BackendId[] = ["launcherIpc"];

export class BackendSelector {
  private readonly backends: Partial<Record<BackendId, Backend>>;
  private snapshot: RoutingSnapshot;
  private readonly refreshIntervalMs: number;
  private readonly preferredOrder: BackendId[];

  constructor(
    backends: Partial<Record<BackendId, Backend>>,
    optionsOrRefreshInterval: BackendSelectorOptions | number = 60_000
  ) {
    if (!backends.launcherIpc) {
      throw new Error("BackendSelector: launcherIpc backend is required (the only backend since 2026-11-25)");
    }
    this.backends = backends;
    const opts: BackendSelectorOptions =
      typeof optionsOrRefreshInterval === "number"
        ? { refreshIntervalMs: optionsOrRefreshInterval }
        : optionsOrRefreshInterval;
    this.refreshIntervalMs = opts.refreshIntervalMs ?? 60_000;
    this.preferredOrder = opts.preferredOrder ?? DEFAULT_PREFERRED_ORDER;
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
        launcherIpc: { backend: "launcherIpc", available: false, supportedOps: [], reliabilityScore: 0, p95MsByOp: {}, constraints: [] },
      },
    };
  }

  async refresh(force = false): Promise<RoutingSnapshot> {
    const now = Date.now();
    if (!force && now - this.snapshot.refreshedAt < this.refreshIntervalMs) {
      return this.snapshot;
    }

    const capsByBackend: Partial<Record<BackendId, BackendCapabilities>> = {};
    for (const id of this.preferredOrder) {
      const backend = this.backends[id];
      if (backend) {
        capsByBackend[id] = await backend.probe();
      }
    }
    // Always probe launcherIpc even if it's not first in priority — required by constructor invariant.
    if (!capsByBackend.launcherIpc) {
      capsByBackend.launcherIpc = await this.backends.launcherIpc!.probe();
    }

    const operationMap = { ...this.snapshot.operationMap };
    const reasons = { ...this.snapshot.reasons };

    for (const operation of ALL_OPERATIONS) {
      let chosen: BackendId | null = null;
      let reason = "no_backend_available";
      for (const id of this.preferredOrder) {
        const cap = capsByBackend[id];
        if (cap?.available && cap.supportedOps.includes(operation)) {
          chosen = id;
          reason = `${id}_selected_via_priority`;
          break;
        }
      }
      operationMap[operation] = chosen;
      reasons[operation] = reason;
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
      const launcherCap = snapshot.capabilities.launcherIpc;
      // Retrying helps only when the probe may succeed later in this process (a launcher that did not answer
      // in time); a missing or closed pipe, an old launcher or another vault does not change until a restart.
      throw new AppError(
        ERROR_CODES.NO_CAPABLE_BACKEND,
        `Cannot serve operation '${operation}': the launcher IPC backend is unavailable. Call obsidian_health for a structured diagnostic.`,
        launcherCap?.permanent !== true,
        {
          operation,
          requestId: randomUUID(),
          backend: "launcherIpc",
          available: launcherCap?.available ?? false,
          reason: launcherCap?.constraints ?? ["unknown"],
          lastErrorAt: launcherCap?.lastErrorAt,
          probeDiagnostics: launcherCap?.diagnostics ?? null,
        }
      );
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
