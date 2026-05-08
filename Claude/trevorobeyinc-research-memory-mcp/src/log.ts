/**
 * JSON-line log writer. Appends one JSON object per line to LOG_FILE.
 * Plan section: Phase 9 (Observability).
 * Never logs markdown content — only operational metadata.
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { homedir } from "node:os";

const LOG_FILE =
  process.env.LOG_FILE ||
  `${homedir()}/Claude/.logs/research-memory.log`;

let dirEnsured = false;

function ensureDir(): void {
  if (dirEnsured) return;
  try {
    mkdirSync(dirname(LOG_FILE), { recursive: true });
  } catch {
    // ignore — directory may already exist
  }
  dirEnsured = true;
}

export type LogLevel = "info" | "warn" | "error";

export function log(
  level: LogLevel,
  action: string,
  fields: Record<string, unknown> = {},
): void {
  ensureDir();
  const entry = {
    ts: new Date().toISOString(),
    level,
    action,
    ...fields,
  };
  try {
    appendFileSync(LOG_FILE, JSON.stringify(entry) + "\n", "utf8");
  } catch (err) {
    // last-resort stderr — never throw from the logger
    process.stderr.write(
      `research-memory log write failed: ${(err as Error).message}\n`,
    );
  }
}
