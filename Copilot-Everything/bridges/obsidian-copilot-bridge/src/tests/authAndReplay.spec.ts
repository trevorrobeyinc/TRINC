import { describe, expect, it } from "vitest";
import { verifyAuthToken } from "../server/auth";
import { ReplayGuard } from "../server/replayGuard";
import { createHash } from "node:crypto";

describe("auth and replay", () => {
  it("accepts valid auth token", () => {
    expect(() => verifyAuthToken("abc123xyz", "abc123xyz")).not.toThrow();
  });

  it("detects replay nonce", () => {
    const guard = new ReplayGuard(60, 120);
    const body = JSON.stringify({ a: 1 });
    const ts = String(Date.now());
    guard.verify(ts, "nonce-1", body);
    expect(() => guard.verify(ts, "nonce-1", body)).toThrow();
  });

  it("rejects stale timestamps", () => {
    const guard = new ReplayGuard(60, 120);
    const body = JSON.stringify({ a: 1 });
    const staleTs = String(Date.now() - 90_000);
    expect(() => guard.verify(staleTs, "nonce-2", body)).toThrow();
  });

  it("rejects body hash mismatch", () => {
    const guard = new ReplayGuard(60, 120);
    const body = JSON.stringify({ a: 1 });
    const badHash = createHash("sha256").update("different", "utf8").digest("hex");
    expect(() => guard.verify(String(Date.now()), "nonce-3", body, badHash)).toThrow();
  });
});
