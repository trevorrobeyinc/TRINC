import fs from "node:fs";
import path from "node:path";
import { AppError } from "../server/errors";
import { ERROR_CODES } from "../server/errorCodes";
import type { IdempotencyState } from "./marker";

interface LedgerRecord {
  operation: string;
  key: string;
  state: IdempotencyState;
  responseJson?: string;
  lastError?: string;
  updatedAt: string;
}

type SQLiteDatabase = {
  exec: (sql: string) => void;
  prepare: (sql: string) => {
    run: (...args: unknown[]) => unknown;
    get: (...args: unknown[]) => unknown;
  };
  close?: () => void;
};

function openDatabase(filename: string): SQLiteDatabase {
  let sqliteModule: unknown;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    sqliteModule = require("node:sqlite");
  } catch (error) {
    throw new AppError(
      ERROR_CODES.INTERNAL_ERROR,
      `node:sqlite is required for durable idempotency ledger: ${String(error)}`
    );
  }

  const DatabaseSync = (sqliteModule as { DatabaseSync: new (p: string) => SQLiteDatabase }).DatabaseSync;
  if (!DatabaseSync) {
    throw new AppError(ERROR_CODES.INTERNAL_ERROR, "node:sqlite DatabaseSync is unavailable.");
  }
  return new DatabaseSync(filename);
}

export class IdempotencyLedger {
  private readonly db: SQLiteDatabase;
  private closed = false;

  constructor(filePath: string) {
    const resolved = path.resolve(filePath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    this.db = openDatabase(resolved);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS idempotency_ledger (
        operation TEXT NOT NULL,
        key TEXT NOT NULL,
        state TEXT NOT NULL,
        response_json TEXT,
        last_error TEXT,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(operation, key)
      );
    `);
  }

  get(operation: string, key: string): LedgerRecord | null {
    const row = this.db
      .prepare(
        "SELECT operation, key, state, response_json as responseJson, last_error as lastError, updated_at as updatedAt FROM idempotency_ledger WHERE operation=? AND key=?"
      )
      .get(operation, key) as LedgerRecord | undefined;
    return row ?? null;
  }

  start(operation: string, key: string): LedgerRecord {
    const existing = this.get(operation, key);
    if (existing) {
      return existing;
    }

    const updatedAt = new Date().toISOString();
    this.db
      .prepare("INSERT INTO idempotency_ledger(operation, key, state, updated_at) VALUES (?, ?, ?, ?)")
      .run(operation, key, "STARTED", updatedAt);

    return {
      operation,
      key,
      state: "STARTED",
      updatedAt,
    };
  }

  commit(operation: string, key: string, responseJson?: string): void {
    this.update(operation, key, "COMMITTED", responseJson);
  }

  reconcile(operation: string, key: string, responseJson?: string): void {
    this.update(operation, key, "RECONCILED", responseJson);
  }

  ambiguous(operation: string, key: string, lastError?: string): void {
    const updatedAt = new Date().toISOString();
    this.db
      .prepare("UPDATE idempotency_ledger SET state=?, last_error=?, updated_at=? WHERE operation=? AND key=?")
      .run("AMBIGUOUS", lastError ?? null, updatedAt, operation, key);
  }

  private update(operation: string, key: string, state: IdempotencyState, responseJson?: string): void {
    const updatedAt = new Date().toISOString();
    this.db
      .prepare("UPDATE idempotency_ledger SET state=?, response_json=?, updated_at=? WHERE operation=? AND key=?")
      .run(state, responseJson ?? null, updatedAt, operation, key);
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    try {
      this.db.close?.();
    } catch {
      // best-effort close during shutdown — never throw
    }
  }
}
