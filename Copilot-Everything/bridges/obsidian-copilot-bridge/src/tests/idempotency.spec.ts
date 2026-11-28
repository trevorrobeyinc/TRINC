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

  it("forgets a STARTED or AMBIGUOUS key so the next start is a first attempt, and only that key", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cpbh-ledger-"));
    const ledger = new IdempotencyLedger(path.join(dir, "idem.sqlite"));
    ledger.start("append_note", "started");
    ledger.start("append_note", "ambiguous");
    ledger.ambiguous("append_note", "ambiguous", "timeout");
    ledger.start("append_note", "neighbour");
    ledger.start("create_note", "started");

    ledger.forgetUnwritten("append_note", "started");
    ledger.forgetUnwritten("append_note", "ambiguous");

    expect(ledger.get("append_note", "started")).toBeNull();
    expect(ledger.get("append_note", "ambiguous")).toBeNull();
    expect(ledger.get("append_note", "neighbour")?.state).toBe("STARTED");
    expect(ledger.get("create_note", "started")?.state).toBe("STARTED");
    expect(ledger.start("append_note", "started").state).toBe("STARTED");
    expect(ledger.get("append_note", "started")?.state).toBe("STARTED");
  });

  it("never forgets a COMMITTED or RECONCILED key: its write is confirmed", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cpbh-ledger-"));
    const ledger = new IdempotencyLedger(path.join(dir, "idem.sqlite"));
    ledger.start("append_note", "committed");
    ledger.commit("append_note", "committed", '{"ok":true}');
    ledger.start("append_note", "reconciled");
    ledger.reconcile("append_note", "reconciled", '{"ok":true}');

    ledger.forgetUnwritten("append_note", "committed");
    ledger.forgetUnwritten("append_note", "reconciled");

    expect(ledger.get("append_note", "committed")?.state).toBe("COMMITTED");
    expect(ledger.get("append_note", "reconciled")?.state).toBe("RECONCILED");
  });
});
