import { createHash, timingSafeEqual } from "node:crypto";
import { AppError } from "./errors";
import { ERROR_CODES } from "./errorCodes";

interface NonceRecord {
  ts: number;
  bodyHash: string;
}

export class ReplayGuard {
  private readonly replayWindowMs: number;
  private readonly nonceTtlMs: number;
  private readonly seen = new Map<string, NonceRecord>();

  constructor(replayWindowSeconds: number, nonceTtlSeconds: number) {
    this.replayWindowMs = replayWindowSeconds * 1000;
    this.nonceTtlMs = nonceTtlSeconds * 1000;
  }

  verify(timestampHeader: string | undefined, nonce: string | undefined, body: string, claimedBodyHash?: string): void {
    if (!timestampHeader || !nonce) {
      throw new AppError(ERROR_CODES.AUTH_REPLAY_DETECTED, "Missing replay-protection headers.");
    }

    const ts = Number(timestampHeader);
    if (!Number.isFinite(ts)) {
      throw new AppError(ERROR_CODES.AUTH_TIMESTAMP_INVALID, "Invalid replay timestamp header.");
    }

    const now = Date.now();
    if (Math.abs(now - ts) > this.replayWindowMs) {
      throw new AppError(ERROR_CODES.AUTH_TIMESTAMP_INVALID, "Replay timestamp is outside allowed window.");
    }

    const bodyHash = createHash("sha256").update(body, "utf8").digest("hex");
    if (claimedBodyHash && !safeHexEqual(claimedBodyHash, bodyHash)) {
      throw new AppError(ERROR_CODES.AUTH_REPLAY_DETECTED, "Body hash mismatch.");
    }

    const existing = this.seen.get(nonce);
    if (existing) {
      if (existing.bodyHash !== bodyHash || Math.abs(existing.ts - ts) <= this.nonceTtlMs) {
        throw new AppError(ERROR_CODES.AUTH_REPLAY_DETECTED, "Nonce replay detected.");
      }
    }

    this.seen.set(nonce, { ts, bodyHash });
    this.prune(now);
  }

  private prune(now: number): void {
    for (const [nonce, record] of this.seen.entries()) {
      if (now - record.ts > this.nonceTtlMs) {
        this.seen.delete(nonce);
      }
    }
  }
}

function safeHexEqual(a: string, b: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(a) || !/^[a-f0-9]{64}$/i.test(b)) {
    return false;
  }
  const left = Buffer.from(a.toLowerCase(), "hex");
  const right = Buffer.from(b.toLowerCase(), "hex");
  return timingSafeEqual(left, right);
}
