import type { BackendCapabilities, SelectionPolicy } from "./backend";
import type { BackendId, Operation } from "../types";

const policies: Record<Operation, SelectionPolicy> = {
  open_vault: {
    operation: "open_vault",
    preferLowerLatency: false,
    requirePostWriteVerification: false,
    requireIdempotencyDurability: false,
  },
  create_note: {
    operation: "create_note",
    preferLowerLatency: true,
    requirePostWriteVerification: true,
    requireIdempotencyDurability: false,
  },
  append_note: {
    operation: "append_note",
    preferLowerLatency: true,
    requirePostWriteVerification: true,
    requireIdempotencyDurability: true,
  },
  read_note: {
    operation: "read_note",
    preferLowerLatency: true,
    requirePostWriteVerification: false,
    requireIdempotencyDurability: false,
  },
  search_notes: {
    operation: "search_notes",
    preferLowerLatency: true,
    requirePostWriteVerification: false,
    requireIdempotencyDurability: false,
  },
  execute_command: {
    operation: "execute_command",
    preferLowerLatency: false,
    requirePostWriteVerification: false,
    requireIdempotencyDurability: false,
  },
};

export function scoreBackend(cap: BackendCapabilities, operation: Operation): number {
  const reliability = cap.reliabilityScore;
  const p95 = cap.p95MsByOp[operation] ?? 5_000;
  const latencyScore = Math.max(0, 1 - p95 / 10_000);
  return reliability * 0.7 + latencyScore * 0.3;
}

export function getOperationPolicy(operation: Operation): SelectionPolicy {
  return policies[operation];
}

export function selectBestBackend(
  operation: Operation,
  capabilities: BackendCapabilities[]
): { backend: BackendId; reason: string } | null {
  const policy = getOperationPolicy(operation);
  const candidates = capabilities.filter((cap) => cap.available && cap.supportedOps.includes(operation));
  if (candidates.length === 0) {
    return null;
  }

  if (policy.requiredBackend) {
    const required = candidates.find((cap) => cap.backend === policy.requiredBackend);
    return required ? { backend: required.backend, reason: `required:${policy.requiredBackend}` } : null;
  }

  const sorted = [...candidates].sort((a, b) => scoreBackend(b, operation) - scoreBackend(a, operation));
  const bestScore = scoreBackend(sorted[0], operation);
  return {
    backend: sorted[0].backend,
    reason: `score:${bestScore.toFixed(3)}`,
  };
}
