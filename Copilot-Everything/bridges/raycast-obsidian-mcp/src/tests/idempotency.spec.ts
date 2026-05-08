import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { IdempotencyLedger } from "../idempotency/ledger";

describe("IdempotencyLedger", () => {
  it("stores and retrieves records", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cpbh-ledger-"));
    const ledger = new IdempotencyLedger(path.join(dir, "idem.sqlite"));
    ledger.start("append_note", "key-1");
    ledger.commit("append_note", "key-1", '{"ok":true}');
    const row = ledger.get("append_note", "key-1");
    expect(row?.state).toBe("COMMITTED");
  });

  it("supports ambiguous then reconciled state transitions", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cpbh-ledger-"));
    const ledger = new IdempotencyLedger(path.join(dir, "idem.sqlite"));
    ledger.start("append_note", "key-2");
    ledger.ambiguous("append_note", "key-2", "timeout");
    expect(ledger.get("append_note", "key-2")?.state).toBe("AMBIGUOUS");
    ledger.reconcile("append_note", "key-2", '{"ok":true}');
    expect(ledger.get("append_note", "key-2")?.state).toBe("RECONCILED");
  });
});
