import { createHash } from "node:crypto";

export type IdempotencyState = "STARTED" | "COMMITTED" | "AMBIGUOUS" | "RECONCILED";

export function payloadHash(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export function buildAppendMarker(key: string, payload: string): string {
  const hash = payloadHash(payload);
  const ts = new Date().toISOString();
  return `<!-- cpbh-idem:v1 key=${key} op=append_note sha256=${hash} ts=${ts} -->`;
}

export function markerRegexForKey(key: string): RegExp {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`<!--\\s*cpbh-idem:v1\\s+key=${escaped}\\s+op=append_note\\s+sha256=[a-f0-9]{64}\\s+ts=[^>]+-->`, "g");
}
