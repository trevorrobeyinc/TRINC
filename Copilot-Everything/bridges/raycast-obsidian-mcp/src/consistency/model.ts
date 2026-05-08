import fs from "node:fs";
import { AppError } from "../server/errors";
import { ERROR_CODES } from "../server/errorCodes";

export const CONSISTENCY_WINDOW_MS = 2_000;

export interface ConsistencyHint {
  mode: "strict-fifo-per-note" | "eventual-cross-backend";
  readAfterWritePinnedUntil?: number;
}

export function buildConsistencyHint(readAfterWritePinnedUntil?: number): ConsistencyHint {
  return {
    mode: "strict-fifo-per-note",
    readAfterWritePinnedUntil,
  };
}

export function formatRevision(stat: fs.Stats): string {
  return `${stat.size}:${Math.trunc(stat.mtimeMs)}`;
}

export function readRevision(filePath: string): string | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const stat = fs.statSync(filePath);
  return formatRevision(stat);
}

export function assertExpectedRevision(filePath: string, expectedRevision?: string): void {
  if (!expectedRevision) {
    return;
  }
  const current = readRevision(filePath);
  if (current !== expectedRevision) {
    throw new AppError(ERROR_CODES.REVISION_CONFLICT, "Revision mismatch.", false, {
      expectedRevision,
      currentRevision: current,
      filePath,
    });
  }
}
