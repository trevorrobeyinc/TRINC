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
  capabilities: Record<BackendId, BackendCapabilities>;
}

export class BackendSelector {
  private readonly backends: Record<"cli", Backend>;
  private snapshot: RoutingSnapshot;
  private readonly refreshIntervalMs: number;

  constructor(backends: Record<"cli", Backend>, refreshIntervalMs = 60_000) {
    this.backends = backends;
    this.refreshIntervalMs = refreshIntervalMs;
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

    const cliCapabilities = await this.backends.cli.probe();
    const operationMap = { ...this.snapshot.operationMap };
    const reasons = { ...this.snapshot.reasons };
    const capsByBackend: Record<BackendId, BackendCapabilities> = {
      cli: cliCapabilities,
    };

    for (const operation of ALL_OPERATIONS) {
      const available = cliCapabilities.available && cliCapabilities.supportedOps.includes(operation);
      operationMap[operation] = available ? "cli" : null;
      reasons[operation] = available ? "cli_only_production_route" : "cli_unavailable";
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

    return this.backends[routedBackendId];
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

    return this.backends[backendId];
  }

  currentSnapshot(): RoutingSnapshot {
    return this.snapshot;
  }
}
